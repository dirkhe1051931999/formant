(() => {
  let alpha48 = null;
  let alpha96 = null;

  /**
   * @param {48 | 96} size
   */
  async function loadAlpha(size) {
    const url = chrome.runtime.getURL(`gemini/alpha-${size}.bin`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`无法读取水印蒙版 ${size}`);
    const view = new Float32Array(await res.arrayBuffer());
    const expected = size === 96 ? 9216 : 2304;
    if (view.length !== expected) throw new Error(`水印蒙版 ${size} 长度不对`);
    return view;
  }

  async function alphas() {
    if (!alpha48) alpha48 = await loadAlpha(48);
    if (!alpha96) alpha96 = await loadAlpha(96);
    return { alpha48, alpha96 };
  }

  /**
   * @param {number} width
   * @param {number} height
   */
  function canvasOf(width, height) {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  /**
   * @param {OffscreenCanvas | HTMLCanvasElement} canvas
   */
  function blobFromCanvas(canvas) {
    if (typeof canvas.convertToBlob === "function") {
      return canvas.convertToBlob({ type: "image/png" });
    }
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("PNG 编码失败"));
      }, "image/png");
    });
  }

  /**
   * @param {Blob} blob
   * @returns {Promise<Blob>}
   */
  async function removeFromBlob(blob) {
    const maps = await alphas();
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = canvasOf(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return blob;
      ctx.drawImage(bitmap, 0, 0);
      const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const box = globalThis.FormantGeminiMath.boxFor(
        image.width,
        image.height,
        globalThis.FORMANT_GEMINI_SIZES
      );
      if (!box) return blob;
      const alpha = box.logoSize === 96 ? maps.alpha96 : maps.alpha48;
      globalThis.FormantGeminiMath.unblend(image, alpha, box, 1);
      ctx.putImageData(image, 0, 0);
      return await blobFromCanvas(canvas);
    } finally {
      if (typeof bitmap.close === "function") bitmap.close();
    }
  }

  globalThis.FormantGeminiRemove = { removeFromBlob };
})();
