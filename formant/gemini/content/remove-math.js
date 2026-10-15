/**
 * Reverse the Gemini corner watermark.
 * Alpha maps and the blend (white logo, alpha composite) follow
 * GargantuaX gemini-watermark-remover 1.0.2 (MIT). The maps live in
 * gemini/alpha-48.bin and gemini/alpha-96.bin.
 */
(() => {
  const ALPHA_BIAS = 0.011764705882352941;
  const ALPHA_SKIP = 0.002;
  const ALPHA_CAP = 0.99;

  const FALLBACK_LARGE = { logoSize: 96, marginRight: 64, marginBottom: 64 };
  const FALLBACK_SMALL = { logoSize: 48, marginRight: 32, marginBottom: 32 };

  /**
   * @param {number} width
   * @param {number} height
   * @param {Record<string, { logoSize: number, marginRight: number, marginBottom: number }> | null | undefined} sizes
   */
  function boxFor(width, height, sizes) {
    const known = sizes && sizes[`${width}x${height}`];
    const cfg =
      known || (width > 1024 && height > 1024 ? FALLBACK_LARGE : FALLBACK_SMALL);
    const x = width - cfg.marginRight - cfg.logoSize;
    const y = height - cfg.marginBottom - cfg.logoSize;
    if (x < 0 || y < 0 || cfg.logoSize <= 0) return null;
    return {
      x,
      y,
      width: cfg.logoSize,
      height: cfg.logoSize,
      logoSize: cfg.logoSize,
    };
  }

  /**
   * @param {{ width: number, height: number, data: Uint8ClampedArray }} image
   * @param {Float32Array} alpha
   * @param {{ x: number, y: number, width: number, height: number }} box
   * @param {number} [gain]
   */
  function unblend(image, alpha, box, gain = 1) {
    const scale = Number.isFinite(gain) && gain > 0 ? gain : 1;
    const { x, y, width, height } = box;
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const raw = alpha[row * width + col];
        if (Math.max(0, raw - ALPHA_BIAS) * scale < ALPHA_SKIP) continue;
        const a = Math.min(raw * scale, ALPHA_CAP);
        const inv = 1 - a;
        const index = ((y + row) * image.width + (x + col)) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          const value = (image.data[index + channel] - a * 255) / inv;
          image.data[index + channel] = Math.max(0, Math.min(255, Math.round(value)));
        }
      }
    }
  }

  globalThis.FormantGeminiMath = {
    ALPHA_BIAS,
    ALPHA_SKIP,
    ALPHA_CAP,
    boxFor,
    unblend,
  };
})();
