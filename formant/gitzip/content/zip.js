(() => {
  "use strict";

  const encoder = new TextEncoder();
  const ZIP32_MAX = 0xffffffff;
  const ZIP16_MAX = 0xffff;

  /** @type {Uint32Array | null} */
  let crcTable = null;

  function getCrcTable() {
    if (crcTable) return crcTable;
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let value = n;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[n] = value >>> 0;
    }
    return crcTable;
  }

  /**
   * @param {Uint8Array} bytes
   */
  function crc32(bytes) {
    const table = getCrcTable();
    let value = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) {
      value = table[(value ^ bytes[index]) & 0xff] ^ (value >>> 8);
    }
    return (value ^ 0xffffffff) >>> 0;
  }

  /**
   * ZIP paths must never escape the archive root.
   * @param {string} raw
   * @param {boolean} directory
   */
  function safePath(raw, directory) {
    const clean = String(raw || "")
      .replace(/\\/g, "/")
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .map((part) => part.replace(/\0/g, ""))
      .join("/");
    if (!clean) throw new Error("GitZip 文件路径无效");
    return directory ? `${clean.replace(/\/+$/, "")}/` : clean;
  }

  /**
   * @param {Date} date
   */
  function getDosTime(date) {
    const year = Math.max(1980, Math.min(2107, date.getFullYear())) - 1980;
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      date: (year << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
  }

  /**
   * @param {number} length
   */
  function bytes(length) {
    return new Uint8Array(length);
  }

  /**
   * @param {Uint8Array} input
   */
  async function deflateRaw(input) {
    if (!("CompressionStream" in globalThis) || !input.length) {
      return { method: 0, data: input };
    }
    try {
      const stream = new Blob([input]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
      return compressed.length < input.length ? { method: 8, data: compressed } : { method: 0, data: input };
    } catch {
      return { method: 0, data: input };
    }
  }

  /**
   * @param {Uint8Array} name
   * @param {{ method: number, crc: number, compressedSize: number, size: number, time: number, date: number }} entry
   */
  function localHeader(name, entry) {
    const header = bytes(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(8, entry.method, true);
    view.setUint16(10, entry.time, true);
    view.setUint16(12, entry.date, true);
    view.setUint32(14, entry.crc, true);
    view.setUint32(18, entry.compressedSize, true);
    view.setUint32(22, entry.size, true);
    view.setUint16(26, name.length, true);
    view.setUint16(28, 0, true);
    return header;
  }

  /**
   * @param {Uint8Array} name
   * @param {{ method: number, crc: number, compressedSize: number, size: number, time: number, date: number, offset: number, directory: boolean }} entry
   */
  function centralHeader(name, entry) {
    const header = bytes(46);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 0x0314, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(10, entry.method, true);
    view.setUint16(12, entry.time, true);
    view.setUint16(14, entry.date, true);
    view.setUint32(16, entry.crc, true);
    view.setUint32(20, entry.compressedSize, true);
    view.setUint32(24, entry.size, true);
    view.setUint16(28, name.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, entry.directory ? 0x10 : 0, true);
    view.setUint32(42, entry.offset, true);
    return header;
  }

  /**
   * @param {number} count
   * @param {number} centralSize
   * @param {number} centralOffset
   */
  function endOfCentralDirectory(count, centralSize, centralOffset) {
    const record = bytes(22);
    const view = new DataView(record.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, count, true);
    view.setUint16(10, count, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, centralOffset, true);
    view.setUint16(20, 0, true);
    return record;
  }

  /**
   * @typedef {{ path: string, blob?: Blob, data?: Uint8Array, directory?: boolean }} ZipInput
   * @param {ZipInput[]} files
   * @param {{ onProgress?: (done: number, total: number, path: string) => void }} [options]
   */
  async function makeZip(files, options = {}) {
    if (!Array.isArray(files) || !files.length) throw new Error("没有可压缩的文件");
    if (files.length > ZIP16_MAX) throw new Error("文件数量超过 ZIP 格式上限");

    /** @type {(BlobPart | Uint8Array)[]} */
    const chunks = [];
    /** @type {Array<{ name: Uint8Array, entry: ReturnType<typeof Object.assign> }>} */
    const records = [];
    let offset = 0;

    for (let index = 0; index < files.length; index += 1) {
      const item = files[index];
      const directory = Boolean(item.directory);
      const path = safePath(item.path, directory);
      const name = encoder.encode(path);
      if (name.length > ZIP16_MAX) throw new Error(`文件名过长：${path}`);

      let input;
      if (directory) {
        input = new Uint8Array(0);
      } else if (item.data instanceof Uint8Array) {
        input = item.data;
      } else if (item.blob instanceof Blob) {
        input = new Uint8Array(await item.blob.arrayBuffer());
      } else {
        throw new Error(`缺少 ${path} 的 ZIP 文件内容`);
      }
      const compressed = directory ? { method: 0, data: input } : await deflateRaw(input);
      const size = input.byteLength;
      const compressedSize = compressed.data.byteLength;
      if (size > ZIP32_MAX || compressedSize > ZIP32_MAX || offset > ZIP32_MAX) {
        throw new Error("此公开下载超过 ZIP32 大小上限");
      }
      const dos = getDosTime(new Date());
      const entry = {
        method: compressed.method,
        crc: crc32(input),
        compressedSize,
        size,
        time: dos.time,
        date: dos.date,
        offset,
        directory,
      };
      const header = localHeader(name, entry);
      chunks.push(header, name, compressed.data);
      offset += header.byteLength + name.byteLength + compressedSize;
      records.push({ name, entry });
      options.onProgress?.(index + 1, files.length, path);
    }

    const centralOffset = offset;
    for (const record of records) {
      const header = centralHeader(record.name, record.entry);
      chunks.push(header, record.name);
      offset += header.byteLength + record.name.byteLength;
    }
    const centralSize = offset - centralOffset;
    if (offset > ZIP32_MAX) throw new Error("此公开下载超过 ZIP32 大小上限");
    chunks.push(endOfCentralDirectory(records.length, centralSize, centralOffset));
    return new Blob(chunks, { type: "application/zip" });
  }

  /**
   * @param {Blob} blob
   * @param {string} filename
   */
  function triggerDownload(blob, filename) {
    const anchor = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    anchor.href = objectUrl;
    anchor.download = String(filename || "github-download.zip").replace(/[\\/:*?"<>|]/g, "-");
    anchor.hidden = true;
    document.documentElement.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  }

  globalThis.FormantGitzipZip = { makeZip, triggerDownload };
})();
