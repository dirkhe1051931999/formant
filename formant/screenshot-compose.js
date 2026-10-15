/**
 * Stitch viewport captures and save as a PNG download.
 */

const MAX_SIDE = 16384;
const MAX_PIXELS = 16384 * 8192;

/**
 * @param {string} title
 * @returns {string}
 */
export function screenshotFilename(title) {
  const base = String(title || "page")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `screenshot-${base || "page"}-${stamp}.png`;
}

/**
 * Service workers cannot use URL.createObjectURL. FileReader data URLs work
 * the same way as image-save.js.
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取截屏失败"));
    reader.readAsDataURL(blob);
  });
}

/**
 * @param {string} dataUrl
 * @returns {Promise<ImageBitmap>}
 */
async function bitmapFromDataUrl(dataUrl) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  if (!blob.size) throw new Error("截屏帧为空");
  return createImageBitmap(blob);
}

/**
 * @param {number} width
 * @param {number} height
 * @returns {{ width: number, height: number, scale: number }}
 */
function fitCanvas(width, height) {
  let w = Math.max(1, Math.round(width));
  let h = Math.max(1, Math.round(height));
  let scale = 1;
  if (w > MAX_SIDE || h > MAX_SIDE) {
    scale = Math.min(MAX_SIDE / w, MAX_SIDE / h);
  }
  if (w * h * scale * scale > MAX_PIXELS) {
    scale = Math.min(scale, Math.sqrt(MAX_PIXELS / (w * h)));
  }
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  };
}

/**
 * @typedef {{
 *   dataUrl: string,
 *   top: number,
 * }} ScreenshotSlice
 */

/**
 * @typedef {{
 *   innerWidth: number,
 *   innerHeight: number,
 *   viewportHeight: number,
 *   scrollHeight: number,
 *   crop: { x: number, y: number, w: number, h: number } | null,
 * }} ScreenshotMetrics
 */

/**
 * @param {ScreenshotSlice[]} slices
 * @param {ScreenshotMetrics} metrics
 * @returns {Promise<Blob>}
 */
export async function stitchSlices(slices, metrics) {
  if (!slices.length) throw new Error("没有截到任何画面");

  const first = await bitmapFromDataUrl(slices[0].dataUrl);
  const scaleX = first.width / Math.max(1, metrics.innerWidth);
  const scaleY = first.height / Math.max(1, metrics.innerHeight);
  const crop = metrics.crop;
  const srcX = crop ? crop.x * scaleX : 0;
  const srcY = crop ? crop.y * scaleY : 0;
  const srcW = crop ? crop.w * scaleX : first.width;
  const srcSliceH = crop ? crop.h * scaleY : first.height;
  const pageH = Math.max(metrics.scrollHeight, metrics.viewportHeight);
  const rawW = srcW;
  const rawH = pageH * (srcSliceH / Math.max(1, metrics.viewportHeight));
  const fitted = fitCanvas(rawW, rawH);

  const canvas = new OffscreenCanvas(fitted.width, fitted.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    first.close();
    throw new Error("无法创建画布");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, fitted.width, fitted.height);

  for (let i = 0; i < slices.length; i += 1) {
    const bitmap = i === 0 ? first : await bitmapFromDataUrl(slices[i].dataUrl);
    try {
      const destY = Math.round(slices[i].top * (srcSliceH / Math.max(1, metrics.viewportHeight)) * fitted.scale);
      if (destY >= fitted.height) continue;
      const destH = Math.min(Math.round(srcSliceH * fitted.scale), fitted.height - destY);
      const takeH = destH / fitted.scale;
      ctx.drawImage(
        bitmap,
        srcX,
        srcY,
        srcW,
        Math.min(takeH, bitmap.height - srcY),
        0,
        destY,
        fitted.width,
        destH,
      );
    } finally {
      bitmap.close();
    }
  }

  return canvas.convertToBlob({ type: "image/png" });
}

/**
 * @param {string} dataUrl
 * @returns {Promise<Blob>}
 */
export async function visibleToBlob(dataUrl) {
  const bitmap = await bitmapFromDataUrl(dataUrl);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建画布");
    ctx.drawImage(bitmap, 0, 0);
    return canvas.convertToBlob({ type: "image/png" });
  } finally {
    bitmap.close();
  }
}

/**
 * @param {string} url
 * @param {string} filename
 * @param {boolean} saveAs
 */
function downloadUrl(url, filename, saveAs) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url,
        filename,
        saveAs,
        conflictAction: "uniquify",
      },
      (downloadId) => {
        if (chrome.runtime.lastError || downloadId == null) {
          reject(new Error(chrome.runtime.lastError?.message || "下载失败"));
          return;
        }
        resolve(downloadId);
      },
    );
  });
}

/**
 * @param {Blob} blob
 * @param {string} filename
 */
export async function downloadScreenshot(blob, filename) {
  if (!blob.size) throw new Error("截屏结果为空");
  const dataUrl = await blobToDataUrl(blob);
  try {
    await downloadUrl(dataUrl, filename, true);
  } catch (error) {
    const retry = error instanceof Error ? error.message : String(error);
    if (/invalid url|too long|quota|failed/i.test(retry)) {
      await downloadUrl(dataUrl, filename, false);
      return;
    }
    throw error;
  }
}

/**
 * Last-resort save from the page (isolated world still has document).
 * @param {number} tabId
 * @param {Blob} blob
 * @param {string} filename
 */
export async function downloadViaPage(tabId, blob, filename) {
  const dataUrl = await blobToDataUrl(blob);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (href, name) => {
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      a.rel = "noopener";
      document.documentElement.append(a);
      a.click();
      a.remove();
      return true;
    },
    args: [dataUrl, filename],
  });
  if (!results?.[0]?.result) throw new Error("页面下载未触发");
}
