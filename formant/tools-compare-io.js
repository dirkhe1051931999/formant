/** 从拖拽、文件选择或目录选择读入一侧。 */

import { MAX_FILES, hashBytes } from "./tools-compare-core.js";

/**
 * @typedef {import("./tools-compare-core.js").CmpFile} CmpFile
 * @typedef {{ kind: "file", name: string, file: File, handle: FileSystemFileHandle | null }
 *   | { kind: "dir", name: string, files: CmpFile[], truncated: boolean, handle: FileSystemDirectoryHandle | null }} SidePayload
 * @typedef {SidePayload
 *   | { kind: "files", items: Array<{ file: File, handle: FileSystemFileHandle | null }> }
 *   | { kind: "error", message: string }
 *   | { kind: "empty" }} DropPayload
 */

const EXCLUDE_KEY = "formantCompareExclude";
const SKIP_DIRS = [
  ["node_modules", "node_modules"],
  ["git", ".git"],
  ["dist", "dist"],
];

/** @type {Record<string, boolean>} */
let skipOn = { node_modules: true, git: true, dist: true };
let extraRaw = "";
/** @type {string[]} */
let extraPatterns = [];

/** @param {string} text */
export function parseExcludeExtra(text) {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const part of String(text || "").split(/[\s,，;；]+/)) {
    const pattern = part.trim();
    if (!pattern || pattern.length > 80) continue;
    const key = pattern.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pattern);
    if (out.length >= 30) break;
  }
  return out;
}

/** @param {{ node_modules?: boolean, git?: boolean, dist?: boolean, extra?: string }} rules */
export function setExcludeRules(rules) {
  for (const key of /** @type {const} */ (["node_modules", "git", "dist"])) {
    if (typeof rules?.[key] === "boolean") skipOn[key] = rules[key];
  }
  if (typeof rules?.extra === "string") {
    extraRaw = rules.extra.slice(0, 400);
    extraPatterns = parseExcludeExtra(extraRaw);
  }
}

export function getExcludeRules() {
  return { node_modules: skipOn.node_modules, git: skipOn.git, dist: skipOn.dist, extra: extraRaw };
}

/** @param {string} pattern @param {string} text */
function globMatch(pattern, text) {
  let body = "";
  for (const ch of pattern) {
    if (ch === "*") body += "[^/]*";
    else if (ch === "?") body += "[^/]";
    else body += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${body}$`, "i").test(text);
}

/** @param {string} path @param {string} base */
function extraHit(path, base) {
  for (const pattern of extraPatterns) {
    const wild = pattern.includes("*") || pattern.includes("?");
    if (!wild) {
      const name = pattern.toLowerCase();
      if (path.split("/").some((part) => part.toLowerCase() === name)) return true;
      continue;
    }
    if (globMatch(pattern, pattern.includes("/") ? path : base)) return true;
  }
  return false;
}

/** @param {string} name */
function dirSkipped(name) {
  if (SKIP_DIRS.some(([key, dir]) => skipOn[key] && name === dir)) return true;
  return extraHit(name, name);
}

/** @param {string} path */
export function pathExcluded(path) {
  const parts = String(path || "").split("/");
  const base = parts[parts.length - 1] || "";
  if (parts.slice(0, -1).some((part) => dirSkipped(part))) return true;
  return extraHit(String(path || ""), base);
}

export async function loadExcludeRules() {
  const rules = { node_modules: true, git: true, dist: true, extra: "" };
  try {
    const store = globalThis.chrome?.storage?.local;
    if (store) {
      const got = await store.get(EXCLUDE_KEY);
      const saved = got?.[EXCLUDE_KEY];
      if (saved && typeof saved === "object") {
        for (const key of /** @type {const} */ (["node_modules", "git", "dist"])) {
          if (typeof saved[key] === "boolean") rules[key] = saved[key];
        }
        if (typeof saved.extra === "string") rules.extra = saved.extra;
      }
    }
  } catch {
    /* 预览页没有扩展存储 */
  }
  setExcludeRules(rules);
  return rules;
}

/** @param {{ node_modules?: boolean, git?: boolean, dist?: boolean, extra?: string }} rules */
export function saveExcludeRules(rules) {
  setExcludeRules(rules);
  const store = globalThis.chrome?.storage?.local;
  if (store) void store.set({ [EXCLUDE_KEY]: getExcludeRules() });
}

const HASH_FULL = 8 * 1024 * 1024;
const HASH_SAMPLE = 64 * 1024;
const BINARY_EXT = /\.(zip|7z|rar|gz|exe|dll|wasm|pdf|docx|xlsx|pptx|mp[34]|woff2?)$/i;

/** @param {DataTransfer | null} dataTransfer */
export async function readDrop(dataTransfer) {
  const items = [...(dataTransfer?.items || [])].filter((item) => item.kind === "file");
  /** @type {FileSystemHandle[]} */
  const handles = [];
  for (const item of items) {
    const handle = await itemHandle(item);
    if (handle) handles.push(handle);
  }
  if (handles.length) return payloadFromHandles(handles);
  /** @type {FileSystemEntry[]} */
  const entries = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  if (entries.length === 1 && entries[0].isDirectory) return filesFromDirectoryEntry(entries[0]);
  if (entries.length === 1 && entries[0].isFile) {
    const file = await entryFile(entries[0]);
    return { kind: "file", name: file.name, file, handle: null };
  }
  if (entries.length > 1) {
    if (entries.some((entry) => entry.isDirectory)) {
      return { kind: "error", message: "一次把一个文件夹拖到一侧" };
    }
    /** @type {Array<{ file: File, handle: null }>} */
    const picked = [];
    for (const entry of entries) picked.push({ file: await entryFile(entry), handle: null });
    return { kind: "files", items: picked };
  }
  const files = [...(dataTransfer?.files || [])];
  if (!files.length) return { kind: "empty" };
  if (files.some((file) => (file.webkitRelativePath || "").includes("/"))) return fromRelativeFiles(files);
  if (files.length === 1) return { kind: "file", name: files[0].name, file: files[0], handle: null };
  return { kind: "files", items: files.map((file) => ({ file, handle: null })) };
}

/** @param {boolean} directory @returns {Promise<SidePayload | null>} */
export async function pickSide(directory) {
  try {
    if (directory && typeof showDirectoryPicker === "function") {
      return filesFromDirectoryHandle(await showDirectoryPicker({ mode: "read" }));
    }
    if (!directory && typeof showOpenFilePicker === "function") {
      const [handle] = await showOpenFilePicker({ multiple: false });
      return materializeHandle(handle);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
  const files = await pickLocal(directory);
  if (!files.length) return null;
  if (directory) return fromRelativeFiles(files);
  return { kind: "file", name: files[0].name, file: files[0], handle: null };
}

/** @param {FileSystemHandle} handle @returns {Promise<SidePayload>} */
export async function materializeHandle(handle) {
  if (handle.kind === "directory") return filesFromDirectoryHandle(/** @type {FileSystemDirectoryHandle} */ (handle));
  const fileHandle = /** @type {FileSystemFileHandle} */ (handle);
  const file = await fileHandle.getFile();
  return { kind: "file", name: file.name, file, handle: fileHandle };
}

/** @param {boolean} directory */
export function pickLocal(directory) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (directory) input.setAttribute("webkitdirectory", "");
    input.onchange = () => resolve([...input.files || []]);
    input.click();
  });
}

/** @param {File[]} files */
export function fromRelativeFiles(files) {
  const rels = files.map((file) => (file.webkitRelativePath || file.name).replace(/\\/g, "/"));
  const roots = new Set(rels.map((rel) => rel.split("/")[0]));
  const strip = roots.size === 1 && rels.some((rel) => rel.includes("/"));
  /** @type {CmpFile[]} */
  const out = [];
  for (const file of files) {
    if (out.length >= MAX_FILES) break;
    let path = (file.webkitRelativePath || file.name).replace(/\\/g, "/");
    if (strip) path = path.split("/").slice(1).join("/");
    if (!path || path.endsWith("/") || pathExcluded(path)) continue;
    out.push(toCmpFile(path, file));
  }
  return {
    kind: "dir",
    name: strip ? [...roots][0] : "文件夹",
    files: out,
    truncated: files.length > MAX_FILES,
    handle: null,
  };
}

/** @param {FileSystemEntry} entry */
async function filesFromDirectoryEntry(entry) {
  /** @type {CmpFile[]} */
  const out = [];
  const reader = /** @type {FileSystemDirectoryEntry} */ (entry).createReader();
  for (;;) {
    const batch = await readEntries(reader);
    if (!batch.length) break;
    for (const child of batch) {
      await walkEntry(child, "", out);
      if (out.length >= MAX_FILES) break;
    }
    if (out.length >= MAX_FILES) break;
  }
  return { kind: "dir", name: entry.name, files: out, truncated: out.length >= MAX_FILES, handle: null };
}

/** @param {FileSystemDirectoryHandle} handle */
async function filesFromDirectoryHandle(handle) {
  /** @type {CmpFile[]} */
  const out = [];
  await walkHandle(handle, "", out);
  return { kind: "dir", name: handle.name, files: out, truncated: out.length >= MAX_FILES, handle };
}

/**
 * @param {FileSystemDirectoryHandle} dir
 * @param {string} prefix
 * @param {CmpFile[]} out
 */
async function walkHandle(dir, prefix, out) {
  for await (const [name, child] of dir.entries()) {
    if (out.length >= MAX_FILES) return;
    if (child.kind !== "file" && dirSkipped(name)) continue;
    if (child.kind === "file") {
      const path = prefix ? `${prefix}/${name}` : name;
      if (pathExcluded(path)) continue;
      const file = await child.getFile();
      out.push(toCmpFile(path, file));
      continue;
    }
    await walkHandle(child, prefix ? `${prefix}/${name}` : name, out);
  }
}

/** @param {FileSystemHandle[]} handles */
async function payloadFromHandles(handles) {
  if (handles.some((handle) => handle.kind === "directory") && handles.length > 1) {
    return { kind: "error", message: "一次把一个文件夹拖到一侧" };
  }
  if (handles.length === 1) return materializeHandle(handles[0]);
  /** @type {Array<{ file: File, handle: FileSystemFileHandle | null }>} */
  const items = [];
  for (const handle of handles) {
    const side = await materializeHandle(handle);
    if (side.kind !== "file") continue;
    items.push({ file: side.file, handle: side.handle });
  }
  return { kind: "files", items };
}

/** @param {DataTransferItem} item */
async function itemHandle(item) {
  if (typeof item.getAsFileSystemHandle !== "function") return null;
  try {
    return await item.getAsFileSystemHandle();
  } catch {
    return null;
  }
}

/**
 * @param {FileSystemEntry} entry
 * @param {string} prefix
 * @param {CmpFile[]} out
 */
async function walkEntry(entry, prefix, out) {
  if (out.length >= MAX_FILES) return;
  if (entry.isDirectory && dirSkipped(entry.name)) return;
  if (entry.isFile) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (pathExcluded(path)) return;
    const file = await entryFile(entry);
    out.push(toCmpFile(path, file));
    return;
  }
  if (!entry.isDirectory) return;
  const reader = /** @type {FileSystemDirectoryEntry} */ (entry).createReader();
  const base = prefix ? `${prefix}/${entry.name}` : entry.name;
  for (;;) {
    const batch = await readEntries(reader);
    if (!batch.length) break;
    for (const child of batch) {
      await walkEntry(child, base, out);
      if (out.length >= MAX_FILES) return;
    }
  }
}

/** @param {FileSystemDirectoryReader} reader */
function readEntries(reader) {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

/** @param {FileSystemEntry} entry */
function entryFile(entry) {
  return new Promise((resolve, reject) => {
    /** @type {FileSystemFileEntry} */ (entry).file(resolve, reject);
  });
}

/** @param {string} path @param {File} file */
function toCmpFile(path, file) {
  const name = path.split("/").pop() || file.name;
  return { path, name, size: file.size, mtime: file.lastModified, file };
}

/** @param {File} file */
export async function hashFile(file) {
  const size = file.size;
  /** @type {Uint8Array} */
  let bytes;
  if (size <= HASH_FULL) {
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    const head = new Uint8Array(await file.slice(0, HASH_SAMPLE).arrayBuffer());
    const tail = new Uint8Array(await file.slice(Math.max(0, size - HASH_SAMPLE)).arrayBuffer());
    bytes = new Uint8Array(head.length + tail.length + 8);
    bytes.set(head, 0);
    bytes.set(tail, head.length);
    const view = new DataView(bytes.buffer);
    view.setUint32(bytes.length - 8, size >>> 0);
    view.setUint32(bytes.length - 4, Math.floor(size / 2 ** 32));
  }
  return hashBytes(bytes);
}

/**
 * @param {File} file
 * @param {"auto" | "utf-8" | "gbk"} [encoding]
 */
export async function readTextFile(file, encoding = "auto") {
  if (BINARY_EXT.test(file.name)) throw new Error("这是二进制文件，只对比了大小");
  if (encoding === "gbk") return new TextDecoder("gbk").decode(new Uint8Array(await file.arrayBuffer()));
  const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
  if (encoding !== "utf-8" && isUtf16(head)) return decodeText(new Uint8Array(await file.arrayBuffer()));
  if (head.includes(0)) throw new Error("这是二进制文件，只对比了大小");
  if (encoding === "utf-8") {
    const text = new TextDecoder("utf-8").decode(new Uint8Array(await file.arrayBuffer()));
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  }
  const text = await file.text();
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * @param {File | null} file
 * @param {"auto" | "utf-8" | "gbk"} [encoding]
 */
export async function loadSideText(file, encoding = "auto") {
  if (!file) return { ok: false, text: "", message: "" };
  try {
    return { ok: true, text: await readTextFile(file, encoding), message: "" };
  } catch (error) {
    return { ok: false, text: "", message: error instanceof Error ? error.message : "读取失败" };
  }
}

/** @param {Uint8Array} bytes */
function isUtf16(bytes) {
  return bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff));
}

/** @param {Uint8Array} bytes */
function decodeText(bytes) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(start));
}
