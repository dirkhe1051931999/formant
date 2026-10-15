/**
 * Save an HLS playlist as one MP4.
 * MPEG-TS segments are remuxed with mux.js. fMP4 segments are concatenated with the init map.
 * AES-128 is decrypted in the page. SAMPLE-AES is not supported.
 */
(function () {
  const WORKERS = 4;

  /**
   * @param {string} base
   * @param {string} rel
   */
  function resolveUrl(base, rel) {
    return new URL(rel, base).href;
  }

  /**
   * @param {string} text
   * @param {string} baseUrl
   */
  function parsePlaylist(text, baseUrl) {
    const lines = String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length || !lines[0].startsWith("#EXTM3U")) {
      throw new Error("不是 m3u8 播放列表");
    }

    /** @type {{ bandwidth: number, url: string, separateAudio: boolean }[]} */
    const variants = [];
    /** @type {{ url: string, sn: number, map: string, key: { method: string, uri: string, iv: Uint8Array | null } | null, range: { start: number, end: number } | null }[]} */
    const segments = [];
    let nextSn = 0;
    /** @type {{ method: string, uri: string, iv: Uint8Array | null } | null} */
    let key = null;
    let map = "";
    let rangeCursor = 0;
    let ended = false;
    /** @type {{ duration?: number, range?: { start: number, end: number } }} */
    let pending = {};

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.startsWith("#EXT-X-STREAM-INF")) {
        const bandwidth = Number((/BANDWIDTH=(\d+)/.exec(line) || [])[1] || 0);
        const separateAudio = /AUDIO="[^"]+"/.test(line);
        let uri = "";
        while (i + 1 < lines.length) {
          i += 1;
          if (!lines[i].startsWith("#")) {
            uri = lines[i];
            break;
          }
        }
        if (uri) variants.push({ bandwidth, url: resolveUrl(baseUrl, uri), separateAudio });
        continue;
      }
      if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
        nextSn = Number(line.slice(line.indexOf(":") + 1)) || 0;
        continue;
      }
      if (line.startsWith("#EXT-X-ENDLIST")) {
        ended = true;
        continue;
      }
      if (line.startsWith("#EXT-X-KEY:")) {
        key = parseKey(line, baseUrl);
        continue;
      }
      if (line.startsWith("#EXT-X-MAP:")) {
        const uri = (/URI="([^"]+)"/.exec(line) || [])[1] || "";
        map = uri ? resolveUrl(baseUrl, uri) : "";
        rangeCursor = 0;
        continue;
      }
      if (line.startsWith("#EXT-X-BYTERANGE:")) {
        const body = line.slice(line.indexOf(":") + 1);
        const [lenRaw, offRaw] = body.split("@");
        const length = Number(lenRaw);
        const start = offRaw != null && offRaw !== "" ? Number(offRaw) : rangeCursor;
        pending.range = { start, end: start + length - 1 };
        rangeCursor = start + length;
        continue;
      }
      if (line.startsWith("#EXTINF:")) {
        pending.duration = Number.parseFloat(line.slice(8));
        continue;
      }
      if (line.startsWith("#")) continue;

      segments.push({
        url: resolveUrl(baseUrl, line),
        sn: nextSn,
        map,
        key,
        range: pending.range || null,
      });
      nextSn += 1;
      if (!pending.range) rangeCursor = 0;
      pending = {};
    }

    return { variants, segments, ended };
  }

  /**
   * @param {string} line
   * @param {string} baseUrl
   */
  function parseKey(line, baseUrl) {
    const method = ((/METHOD=([^,\s]+)/.exec(line) || [])[1] || "NONE").toUpperCase();
    if (method === "NONE") return null;
    const uri = (/URI="([^"]+)"/.exec(line) || [])[1] || "";
    const ivHex = (/IV=0x([0-9A-Fa-f]+)/.exec(line) || [])[1] || "";
    /** @type {Uint8Array | null} */
    let iv = null;
    if (ivHex) {
      const hex = ivHex.padStart(32, "0").slice(-32);
      iv = new Uint8Array(16);
      for (let i = 0; i < 16; i += 1) iv[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return { method, uri: uri ? resolveUrl(baseUrl, uri) : "", iv };
  }

  /**
   * @param {number} sn
   */
  function ivFromSequence(sn) {
    const iv = new Uint8Array(16);
    const view = new DataView(iv.buffer);
    const value = sn >>> 0;
    view.setUint32(12, value);
    return iv;
  }

  /**
   * @param {AbortSignal | undefined} signal
   */
  function throwIfAborted(signal) {
    if (signal && signal.aborted) {
      const error = new Error("已取消");
      error.name = "AbortError";
      throw error;
    }
  }

  /**
   * @param {string} url
   * @param {AbortSignal | undefined} signal
   * @param {string} [range]
   */
  async function fetchBytes(url, signal, range) {
    /** @type {RequestInit} */
    const init = { credentials: "include", signal };
    if (range) init.headers = { Range: range };
    const response = await fetch(url, init);
    if (!response.ok && response.status !== 206) {
      throw new Error(`下载失败 ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  /**
   * @param {Uint8Array} bytes
   * @param {{ method: string, uri: string, iv: Uint8Array | null }} key
   * @param {number} sn
   * @param {Map<string, Uint8Array>} keyCache
   * @param {AbortSignal | undefined} signal
   */
  async function decryptSegment(bytes, key, sn, keyCache, signal) {
    if (key.method !== "AES-128") {
      throw new Error(`不支持 ${key.method} 加密`);
    }
    if (!key.uri) throw new Error("缺少解密密钥地址");
    let raw = keyCache.get(key.uri);
    if (!raw) {
      raw = await fetchBytes(key.uri, signal);
      keyCache.set(key.uri, raw);
    }
    const cryptoKey = await crypto.subtle.importKey("raw", raw, "AES-CBC", false, ["decrypt"]);
    const iv = key.iv || ivFromSequence(sn);
    const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, bytes);
    return new Uint8Array(plain);
  }

  /**
   * @param {Uint8Array} bytes
   */
  function sniff(bytes) {
    const limit = Math.min(bytes.length, 2000);
    for (let i = 0; i + 188 < limit; i += 1) {
      if (bytes[i] === 0x47 && bytes[i + 188] === 0x47) return "ts";
    }
    if (bytes.length > 8) {
      const box = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
      if (box === "ftyp" || box === "styp" || box === "moof" || box === "moov") return "fmp4";
    }
    return "";
  }

  /**
   * @param {Uint8Array[]} chunks
   */
  function transmuxTs(chunks) {
    const Transmuxer = globalThis.muxjs && globalThis.muxjs.mp4 && globalThis.muxjs.mp4.Transmuxer;
    if (!Transmuxer) return Promise.reject(new Error("缺少 MP4 封装库"));
    return new Promise((resolve, reject) => {
      const transmuxer = new Transmuxer();
      /** @type {Uint8Array[]} */
      const pieces = [];
      /** @type {Uint8Array | null} */
      let init = null;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (!init || !pieces.length) {
          reject(new Error("无法封装成 MP4"));
          return;
        }
        resolve(new Blob([init, ...pieces], { type: "video/mp4" }));
      };
      transmuxer.on("data", (segment) => {
        if (segment && segment.initSegment && segment.initSegment.byteLength && !init) {
          init = segment.initSegment;
        }
        if (segment && segment.data && segment.data.byteLength) pieces.push(segment.data);
      });
      transmuxer.on("done", finish);
      try {
        for (const chunk of chunks) transmuxer.push(chunk);
        transmuxer.flush();
        if (!settled) finish();
      } catch (error) {
        if (!settled) {
          settled = true;
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });
  }

  /**
   * @param {string} sourceUrl
   */
  function mp4Name(sourceUrl) {
    let base = "hls";
    try {
      const part = new URL(sourceUrl).pathname.split("/").filter(Boolean).pop() || "hls";
      base = decodeURIComponent(part).replace(/\.m3u8$/i, "");
    } catch {
      base = "hls";
    }
    base = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().slice(0, 80) || "hls";
    return `${base}.mp4`;
  }

  /**
   * @param {Blob} blob
   * @param {string} filename
   */
  async function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const id = await chrome.downloads.download({
      url,
      filename,
      saveAs: true,
      conflictAction: "uniquify",
    });
    const revoke = () => URL.revokeObjectURL(url);
    if (!chrome.downloads.onChanged) {
      setTimeout(revoke, 60_000);
      return;
    }
    const onChanged = (delta) => {
      if (!delta || delta.id !== id || !delta.state) return;
      const state = delta.state.current;
      if (state === "complete" || state === "interrupted") {
        chrome.downloads.onChanged.removeListener(onChanged);
        revoke();
      }
    };
    chrome.downloads.onChanged.addListener(onChanged);
  }

  /**
   * @param {string} sourceUrl
   * @param {{ signal?: AbortSignal, onProgress?: (text: string) => void }} [hooks]
   */
  async function saveHlsAsMp4(sourceUrl, hooks) {
    const signal = hooks && hooks.signal;
    const onProgress = hooks && hooks.onProgress ? hooks.onProgress : () => {};
    throwIfAborted(signal);
    onProgress("正在读取播放列表…");
    const rootResponse = await fetch(sourceUrl, { credentials: "include", signal });
    if (!rootResponse.ok) throw new Error(`播放列表加载失败 ${rootResponse.status}`);
    const rootText = await rootResponse.text();
    let parsed = parsePlaylist(rootText, sourceUrl);
    let separateAudio = false;
    if (parsed.variants.length) {
      const best = parsed.variants.slice().sort((a, b) => b.bandwidth - a.bandwidth)[0];
      separateAudio = best.separateAudio;
      onProgress("正在读取码率列表…");
      const variantResponse = await fetch(best.url, { credentials: "include", signal });
      if (!variantResponse.ok) throw new Error(`播放列表加载失败 ${variantResponse.status}`);
      const variantText = await variantResponse.text();
      parsed = parsePlaylist(variantText, best.url);
    }
    if (!parsed.segments.length) throw new Error("播放列表里没有分片");
    if (!parsed.ended) onProgress("这是直播或未结束的列表，只保存当前已列出的分片…");

    const maps = [...new Set(parsed.segments.map((segment) => segment.map).filter(Boolean))];
    if (maps.length > 1) throw new Error("多段初始化的流暂不能存成一个 MP4");

    /** @type {Uint8Array | null} */
    let init = null;
    if (maps.length === 1) {
      onProgress("正在下载初始化片段…");
      init = await fetchBytes(maps[0], signal);
    }

    const chunks = new Array(parsed.segments.length);
    const keyCache = new Map();
    let cursor = 0;
    let finished = 0;
    const worker = async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= parsed.segments.length) return;
        throwIfAborted(signal);
        const segment = parsed.segments[index];
        const range = segment.range ? `bytes=${segment.range.start}-${segment.range.end}` : "";
        let bytes = await fetchBytes(segment.url, signal, range);
        if (segment.key) bytes = await decryptSegment(bytes, segment.key, segment.sn, keyCache, signal);
        chunks[index] = bytes;
        finished += 1;
        onProgress(`正在下载 ${finished}/${parsed.segments.length}`);
      }
    };
    const pool = Math.min(WORKERS, parsed.segments.length);
    await Promise.all(Array.from({ length: pool }, () => worker()));
    throwIfAborted(signal);

    onProgress("正在封装 MP4…");
    const kind = sniff(chunks[0]);
    /** @type {Blob} */
    let blob;
    if (kind === "fmp4" || init) {
      blob = new Blob(init ? [init, ...chunks] : chunks, { type: "video/mp4" });
    } else {
      blob = await transmuxTs(chunks);
    }
    await downloadBlob(blob, mp4Name(sourceUrl));
    if (separateAudio) return "已开始下载。这条流的音视频是分开的，MP4 里可能没有声音";
    if (!parsed.ended) return "已开始下载当前列出的分片";
    return "已开始下载 MP4";
  }

  globalThis.formantSaveHlsMp4 = saveHlsAsMp4;
})();
