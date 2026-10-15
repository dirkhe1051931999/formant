(() => {
  "use strict";

  const CMD = "formant-telegram-cmd";
  const PROG = "formant-telegram-progress";
  const RANGE_RE = /^bytes (\d+)-(\d+)\/(\d+)$/;
  let enabled = false;

  /**
   * @param {unknown} value
   */
  function asText(value) {
    return String(value || "").trim();
  }

  /**
   * @param {string} url
   */
  function isSafeUrl(url) {
    return /^(blob:|https?:|\/|stream\/)/i.test(url);
  }

  /**
   * @param {string} raw
   * @param {string} fallbackExt
   */
  function fileNameFromUrl(raw, fallbackExt) {
    const url = asText(raw);
    try {
      const last = decodeURIComponent(url.split("/").pop() || "");
      const meta = JSON.parse(last);
      if (meta && typeof meta.fileName === "string" && meta.fileName.trim()) {
        return meta.fileName.trim();
      }
    } catch {
      /* not Telegram stream metadata */
    }
    try {
      const path = new URL(url, location.href).pathname;
      const base = path.split("/").pop() || "";
      if (base && /\.[a-z0-9]{2,5}$/i.test(base) && !base.includes("{")) return base;
    } catch {
      /* ignore */
    }
    return `telegram-${Date.now()}.${fallbackExt}`;
  }

  /**
   * @param {string} name
   */
  function safeName(name) {
    const cleaned = asText(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
    return cleaned.slice(0, 180) || `telegram-${Date.now()}`;
  }

  /**
   * @param {Record<string, unknown>} detail
   */
  function emit(detail) {
    window.dispatchEvent(new CustomEvent(PROG, { detail }));
  }

  /**
   * @param {Blob} blob
   * @param {string} filename
   */
  function saveBlob(blob, filename) {
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.rel = "noopener";
    document.documentElement.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 4_000);
  }

  /**
   * @param {string} url
   * @param {(pct: number) => void} onProgress
   */
  async function fetchImage(url, onProgress) {
    onProgress(10);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`图片请求失败 ${response.status}`);
    onProgress(80);
    return response.blob();
  }

  /**
   * @param {string} url
   * @param {(pct: number) => void} onProgress
   */
  async function fetchVideo(url, onProgress) {
    if (url.startsWith("blob:")) {
      onProgress(30);
      const response = await fetch(url);
      if (!response.ok) throw new Error("无法读取已缓冲的视频");
      onProgress(90);
      return response.blob();
    }

    const chunks = [];
    let next = 0;
    let total = 0;
    let mime = "video/mp4";

    while (true) {
      const response = await fetch(url, {
        method: "GET",
        headers: { Range: `bytes=${next}-` },
      });
      if (![200, 206].includes(response.status)) {
        throw new Error(`视频请求失败 ${response.status}`);
      }
      const type = (response.headers.get("Content-Type") || "").split(";")[0].trim();
      if (type) mime = type;
      if (type && !type.startsWith("video/") && !type.startsWith("application/octet-stream") && next === 0) {
        throw new Error(`非视频类型 ${type}`);
      }

      const range = response.headers.get("Content-Range");
      const blob = await response.blob();
      if (!range || response.status === 200) {
        chunks.push(blob);
        onProgress(100);
        break;
      }
      const match = RANGE_RE.exec(range);
      if (!match) throw new Error("无法解析视频分片");
      const start = Number(match[1]);
      const end = Number(match[2]);
      const size = Number(match[3]);
      if (start !== next) throw new Error("视频分片不连续");
      if (total && size !== total) throw new Error("视频总大小变化");
      total = size;
      next = end + 1;
      chunks.push(blob);
      onProgress(total ? Math.min(99, Math.round((next * 100) / total)) : 50);
      if (next >= total) break;
    }

    return new Blob(chunks, { type: mime.startsWith("video/") ? mime : "video/mp4" });
  }

  /**
   * @param {Record<string, unknown>} detail
   */
  async function download(detail) {
    const jobId = asText(detail.jobId) || `job-${Date.now()}`;
    const kind = detail.kind === "video" ? "video" : "image";
    const url = asText(detail.url);
    if (!isSafeUrl(url)) throw new Error("媒体地址无效");
    const abs = /^(blob:|https?:)/i.test(url) ? url : new URL(url, location.href).href;
    const filename = safeName(asText(detail.filename) || fileNameFromUrl(abs, kind === "video" ? "mp4" : "jpg"));
    emit({ jobId, name: filename, pct: 1, status: "running" });
    const blob =
      kind === "video"
        ? await fetchVideo(abs, (pct) => emit({ jobId, name: filename, pct, status: "running" }))
        : await fetchImage(abs, (pct) => emit({ jobId, name: filename, pct, status: "running" }));
    saveBlob(blob, filename);
    emit({ jobId, name: filename, pct: 100, status: "done" });
  }

  window.addEventListener(CMD, (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (!detail || typeof detail !== "object") return;
    const type = asText(detail.type);
    if (type === "SET_ENABLED") {
      enabled = detail.enabled === true;
      return;
    }
    if (!enabled || type !== "DOWNLOAD") return;
    void download(detail).catch((error) => {
      emit({
        jobId: asText(detail.jobId) || "job",
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    });
  });
})();
