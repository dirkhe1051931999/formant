/**
 * 工具箱共用 DOM / 剪贴板 / 文件小函数。
 * 不引入 jQuery：`$` 即 querySelector，`$$` 即 querySelectorAll（转数组）。
 */

/**
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {HTMLElement | null}
 */
export const $ = (selector, root = document) => /** @type {HTMLElement | null} */ (root.querySelector(selector));

/**
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {HTMLElement[]}
 */
export const $$ = (selector, root = document) =>
  /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll(selector)));

/**
 * 找不到时抛错，避免静默失败。
 * @param {string} selector
 * @param {ParentNode} root
 * @returns {HTMLElement}
 */
export function must(selector, root = document) {
  const el = $(selector, root);
  if (!el) throw new Error(`缺少元素 ${selector}`);
  return el;
}

/**
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let toastTimer = 0;

/**
 * @param {string} text
 * @param {boolean} [isError]
 */
export function toast(text, isError = false) {
  let el = $("#toolsToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toolsToast";
    el.className = "tl-toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.toggle("is-error", isError);
  el.classList.add("is-show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el?.classList.remove("is-show"), 1600);
}

/**
 * @param {string} text
 * @param {string} [okText]
 */
export async function copyText(text, okText = "已复制") {
  const value = String(text ?? "");
  if (!value) {
    toast("没有可复制的内容", true);
    return false;
  }
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (!ok) {
      toast("复制失败", true);
      return false;
    }
  }
  toast(okText);
  return true;
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(2)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * @template {(...args: any[]) => void} F
 * @param {F} fn
 * @param {number} ms
 * @returns {F}
 */
export function debounce(fn, ms) {
  let timer = 0;
  return /** @type {F} */ (
    (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), ms);
    }
  );
}

/** @type {Map<string, Promise<void>>} */
const scriptCache = new Map();

/**
 * 按需加载随扩展打包的经典脚本（vendor 库，设置全局变量）。
 * @param {string} path 相对扩展根目录
 * @returns {Promise<void>}
 */
export function loadScript(path) {
  const cached = scriptCache.get(path);
  if (cached) return cached;
  const task = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = chrome.runtime.getURL(path);
    el.onload = () => resolve();
    el.onerror = () => {
      scriptCache.delete(path);
      reject(new Error(`脚本加载失败：${path}`));
    };
    document.head.appendChild(el);
  });
  scriptCache.set(path, task);
  return task;
}

/**
 * @param {Blob} blob
 * @returns {Promise<HTMLImageElement>}
 */
export function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取该图片"));
    };
    img.src = url;
  });
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取失败"));
    reader.readAsDataURL(blob);
  });
}

/**
 * 抓取图片 URL（扩展页拥有 http/https host 权限）。
 * @param {string} url
 * @returns {Promise<Blob>}
 */
export async function fetchImageBlob(url) {
  const target = String(url || "").trim();
  if (!/^https?:\/\//i.test(target)) throw new Error("请填写 http(s) 图片地址");
  const res = await fetch(target, { credentials: "omit" });
  if (!res.ok) throw new Error(`图片获取失败（${res.status}）`);
  const blob = await res.blob();
  if (!blob.type.startsWith("image/")) throw new Error("该地址返回的不是图片");
  return blob;
}

/**
 * 粘贴事件里取第一张图片或图片 URL。
 * @param {ClipboardEvent} event
 * @returns {{ file: File | null, url: string }}
 */
export function pickPasted(event) {
  const data = event.clipboardData;
  if (!data) return { file: null, url: "" };
  for (const item of Array.from(data.items || [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      return { file: item.getAsFile(), url: "" };
    }
  }
  const text = (data.getData("text/plain") || "").trim();
  return { file: null, url: /^https?:\/\/\S+$/i.test(text) ? text : "" };
}

/**
 * 拖拽 / 点击选择区：拖入图片文件时回调。
 * @param {HTMLElement} zone
 * @param {(file: File) => void} onFile
 */
export function bindDropZone(zone, onFile) {
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("is-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("is-over");
    const file = Array.from(event.dataTransfer?.files || []).find((f) => f.type.startsWith("image/"));
    if (file) onFile(file);
    else toast("请拖入图片文件", true);
  });
}
