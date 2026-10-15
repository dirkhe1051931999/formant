import { blobToImage, loadScript } from "./tools-dom.js";

const ZXING_PATH = "tools/vendor/zxing.min.js";

/**
 * @param {HTMLImageElement} img
 * @param {number} scale
 * @param {number} pad 白边像素
 */
function drawCandidate(img, scale, pad) {
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w + pad * 2;
  canvas.height = h + pad * 2;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d", { willReadFrequently: true }));
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, pad, pad, w, h);
  return canvas;
}

/** @param {HTMLImageElement} img */
function makeCandidates(img) {
  const longSide = Math.max(img.naturalWidth, img.naturalHeight);
  const scales = new Set([1]);
  if (longSide > 1200) scales.add(1200 / longSide);
  if (longSide > 2400) scales.add(700 / longSide);
  if (longSide < 500) scales.add(2);
  return [...scales].flatMap((s) => [drawCandidate(img, s, 0), drawCandidate(img, s, 40)]);
}

/**
 * 识别图片中的二维码文本；失败抛错。
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export async function decodeQrBlob(blob) {
  const img = await blobToImage(blob);
  const canvases = makeCandidates(img);

  if ("BarcodeDetector" in globalThis) {
    try {
      const detector = new /** @type {any} */ (globalThis).BarcodeDetector({ formats: ["qr_code"] });
      for (const canvas of canvases) {
        const found = await detector.detect(canvas);
        if (found?.[0]?.rawValue) return String(found[0].rawValue);
      }
    } catch {
      /* 浏览器不支持时回退 zxing */
    }
  }

  await loadScript(ZXING_PATH);
  const ZXing = /** @type {any} */ (globalThis).ZXing;
  if (!ZXing?.BrowserQRCodeReader) throw new Error("识别库加载失败");
  for (const canvas of canvases) {
    try {
      const reader = new ZXing.BrowserQRCodeReader();
      const result = await reader.decodeFromImageUrl(canvas.toDataURL("image/png"));
      const text = result?.getText?.() ?? result?.text;
      if (text) return String(text);
    } catch {
      /* 换下一个候选图 */
    }
  }
  throw new Error("未识别到二维码，请换一张更清晰的图片");
}
