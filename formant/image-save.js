/**
 * Convert a remote/page image to PNG or JPEG and trigger a download.
 */

/**
 * @param {string} srcUrl
 * @param {"png" | "jpg"} format
 */
function filenameFromUrl(srcUrl, format) {
  const ext = format === "png" ? "png" : "jpg";
  try {
    const url = new URL(srcUrl);
    const base = decodeURIComponent(url.pathname.split("/").pop() || "")
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/[<>:"/\\|?*\x00-\x1f]+/g, "_")
      .trim();
    if (base && base !== "." && base !== "..") return `${base}.${ext}`;
  } catch {
    // ignore
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `image-${stamp}.${ext}`;
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取图片失败"));
    reader.readAsDataURL(blob);
  });
}

/**
 * @param {string} srcUrl
 * @param {"png" | "jpg"} format
 */
export async function saveImageAs(srcUrl, format) {
  const src = String(srcUrl || "").trim();
  if (!src) throw new Error("未获取到图片地址");

  let blob;
  if (src.startsWith("data:")) {
    const res = await fetch(src);
    blob = await res.blob();
  } else {
    const res = await fetch(src, { credentials: "omit", cache: "no-store" });
    if (!res.ok) throw new Error(`下载图片失败：HTTP ${res.status}`);
    blob = await res.blob();
  }

  if (!blob.size) throw new Error("图片内容为空");

  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建画布");

    if (format === "jpg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    }
    ctx.drawImage(bitmap, 0, 0);

    const mime = format === "png" ? "image/png" : "image/jpeg";
    const out = await canvas.convertToBlob({
      type: mime,
      quality: format === "jpg" ? 0.92 : undefined,
    });
    const dataUrl = await blobToDataUrl(out);
    const filename = filenameFromUrl(src, format);

    await new Promise((resolve, reject) => {
      chrome.downloads.download(
        {
          url: dataUrl,
          filename,
          saveAs: true,
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
  } finally {
    bitmap.close();
  }
}
