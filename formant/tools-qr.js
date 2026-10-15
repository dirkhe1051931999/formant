import { decodeQrBlob } from "./tools-qr-decode.js";
import {
  bindDropZone,
  blobToImage,
  copyText,
  debounce,
  downloadBlob,
  fetchImageBlob,
  loadScript,
  must,
  pickPasted,
  toast,
} from "./tools-dom.js";

const QR_PATH = "tools/vendor/qrcode.js";
const MARGIN = 3;

/**
 * 把文本绘成二维码 canvas（UTF-8，保证中文可扫）。
 * @param {string} text
 * @param {{ size: number, fg: string, bg: string, level: "L" | "M" | "Q" | "H", logo: HTMLImageElement | null }} opt
 */
export function drawQr(text, opt) {
  const qrcode = /** @type {any} */ (globalThis).qrcode;
  qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
  const qr = qrcode(0, opt.logo ? "H" : opt.level);
  qr.addData(text, "Byte");
  qr.make();
  const count = qr.getModuleCount();
  const cell = Math.max(2, Math.round(opt.size / (count + MARGIN * 2)));
  const side = cell * (count + MARGIN * 2);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  ctx.fillStyle = opt.bg;
  ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = opt.fg;
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (qr.isDark(r, c)) ctx.fillRect((c + MARGIN) * cell, (r + MARGIN) * cell, cell, cell);
    }
  }
  if (opt.logo) {
    const box = Math.round(side * 0.2);
    const x = Math.round((side - box) / 2);
    ctx.fillStyle = opt.bg;
    ctx.fillRect(x - 4, x - 4, box + 8, box + 8);
    ctx.drawImage(opt.logo, x, x, box, box);
  }
  return canvas;
}

/** @param {HTMLElement} root */
export function mount(root) {
  root.innerHTML = `
    <header class="tl-head">
      <div>
        <h2>二维码</h2>
      </div>
      <div class="tl-seg" data-tabs>
        <button type="button" class="is-active" data-tab="gen">生成</button>
        <button type="button" data-tab="scan">识别</button>
      </div>
    </header>

    <div data-view="gen">
      <div class="qr-layout">
        <section class="tl-card">
          <span class="tl-label">内容（链接 / 文本）</span>
          <textarea class="tl-textarea" data-text placeholder="输入要生成二维码的内容" style="min-height:180px"></textarea>
          <div class="tl-row">
            <label class="tl-meta">尺寸 <input class="tl-input" type="number" min="100" max="1000" step="10" value="280" data-size style="width:80px" /></label>
            <label class="tl-meta">前景 <input class="qr-color" type="color" value="#000000" data-fg /></label>
            <label class="tl-meta">背景 <input class="qr-color" type="color" value="#ffffff" data-bg /></label>
            <label class="tl-meta">纠错
              <select class="tl-select" data-level>
                <option value="L">L 7%</option>
                <option value="M" selected>M 15%</option>
                <option value="Q">Q 25%</option>
                <option value="H">H 30%</option>
              </select>
            </label>
          </div>
          <div class="tl-row">
            <label class="tl-btn tl-btn--ghost" style="cursor:pointer">
              中心 logo
              <input type="file" accept="image/*" hidden data-logo />
            </label>
            <button type="button" class="tl-btn tl-btn--ghost" data-logo-clear hidden>移除 logo</button>
            <span class="tl-meta">加 logo 时自动使用 H 级纠错</span>
          </div>
        </section>
        <section class="tl-card">
          <span class="tl-label">预览</span>
          <div class="qr-stage" data-stage><span class="tl-meta">输入内容后自动生成</span></div>
          <p class="tl-meta tl-error" data-gen-error></p>
          <div class="tl-row">
            <button type="button" class="tl-btn" data-copy-img disabled>复制图片</button>
            <button type="button" class="tl-btn tl-btn--ghost" data-download disabled>下载 PNG</button>
          </div>
        </section>
      </div>
    </div>

    <div data-view="scan" hidden>
      <div class="tl-grid">
        <section class="tl-card">
          <span class="tl-label">图片</span>
          <label class="tl-drop" data-drop>
            <input type="file" accept="image/*" hidden data-scan-file />
            <img alt="" data-scan-preview hidden />
            <span data-drop-text>点击选择，或把图片拖到这里；也可直接 Ctrl+V 粘贴截图</span>
          </label>
          <div class="tl-row">
            <input class="tl-input tl-input--grow" data-scan-url placeholder="或粘贴图片 URL（http/https）" spellcheck="false" />
            <button type="button" class="tl-btn" data-scan-url-run>识别</button>
          </div>
        </section>
        <section class="tl-card">
          <span class="tl-label">识别结果</span>
          <textarea class="tl-textarea" data-scan-out readonly placeholder="识别出的内容会显示在这里"></textarea>
          <div class="tl-row">
            <button type="button" class="tl-btn" data-scan-copy>复制</button>
            <button type="button" class="tl-btn tl-btn--ghost" data-scan-open hidden>打开链接</button>
            <span class="tl-meta" data-scan-status></span>
          </div>
        </section>
      </div>
    </div>`;

  const tabs = must("[data-tabs]", root);
  const text = /** @type {HTMLTextAreaElement} */ (must("[data-text]", root));
  const sizeIn = /** @type {HTMLInputElement} */ (must("[data-size]", root));
  const fgIn = /** @type {HTMLInputElement} */ (must("[data-fg]", root));
  const bgIn = /** @type {HTMLInputElement} */ (must("[data-bg]", root));
  const levelIn = /** @type {HTMLSelectElement} */ (must("[data-level]", root));
  const logoIn = /** @type {HTMLInputElement} */ (must("[data-logo]", root));
  const logoClear = must("[data-logo-clear]", root);
  const stage = must("[data-stage]", root);
  const genError = must("[data-gen-error]", root);
  const copyImg = /** @type {HTMLButtonElement} */ (must("[data-copy-img]", root));
  const downloadBtn = /** @type {HTMLButtonElement} */ (must("[data-download]", root));

  /** @type {HTMLCanvasElement | null} */
  let canvas = null;
  /** @type {HTMLImageElement | null} */
  let logo = null;
  let tab = "gen";

  function setTab(next) {
    tab = next;
    for (const btn of tabs.querySelectorAll("button")) btn.classList.toggle("is-active", btn.dataset.tab === next);
    for (const view of root.querySelectorAll("[data-view]")) /** @type {HTMLElement} */ (view).hidden = view.getAttribute("data-view") !== next;
  }
  tabs.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest("button[data-tab]");
    if (btn) setTab(/** @type {HTMLElement} */ (btn).dataset.tab);
  });

  const render = debounce(async () => {
    genError.textContent = "";
    const value = text.value;
    canvas = null;
    copyImg.disabled = true;
    downloadBtn.disabled = true;
    if (!value) {
      stage.innerHTML = '<span class="tl-meta">输入内容后自动生成</span>';
      return;
    }
    try {
      await loadScript(QR_PATH);
      const size = Math.min(1000, Math.max(100, Number(sizeIn.value) || 280));
      canvas = drawQr(value, { size, fg: fgIn.value, bg: bgIn.value, level: /** @type {any} */ (levelIn.value), logo });
      stage.textContent = "";
      stage.appendChild(canvas);
      copyImg.disabled = false;
      downloadBtn.disabled = false;
    } catch (error) {
      stage.innerHTML = '<span class="tl-meta">无法生成</span>';
      genError.textContent = /overflow|too long/i.test(String(error)) ? "内容太长，请减少字数或降低纠错等级" : `生成失败：${error instanceof Error ? error.message : error}`;
    }
  }, 200);

  for (const el of [text, sizeIn, fgIn, bgIn, levelIn]) el.addEventListener("input", render);
  logoIn.addEventListener("change", async () => {
    const f = logoIn.files?.[0];
    logoIn.value = "";
    if (!f) return;
    try {
      logo = await blobToImage(f);
      logoClear.hidden = false;
      void render();
    } catch (error) {
      toast(error instanceof Error ? error.message : "logo 读取失败", true);
    }
  });
  logoClear.addEventListener("click", () => {
    logo = null;
    logoClear.hidden = true;
    void render();
  });

  /** @returns {Promise<Blob | null>} */
  const canvasBlob = () => new Promise((resolve) => (canvas ? canvas.toBlob(resolve, "image/png") : resolve(null)));

  copyImg.addEventListener("click", async () => {
    const blob = await canvasBlob();
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("图片已复制");
    } catch {
      toast("浏览器不允许复制图片，请改用下载", true);
    }
  });
  downloadBtn.addEventListener("click", async () => {
    const blob = await canvasBlob();
    if (blob) downloadBlob(blob, "qrcode.png");
  });

  /* ---- 识别 ---- */
  const drop = must("[data-drop]", root);
  const scanFile = /** @type {HTMLInputElement} */ (must("[data-scan-file]", root));
  const scanPreview = /** @type {HTMLImageElement} */ (must("[data-scan-preview]", root));
  const dropText = must("[data-drop-text]", root);
  const scanUrl = /** @type {HTMLInputElement} */ (must("[data-scan-url]", root));
  const scanOut = /** @type {HTMLTextAreaElement} */ (must("[data-scan-out]", root));
  const scanStatus = must("[data-scan-status]", root);
  const scanOpen = must("[data-scan-open]", root);

  /** @param {Blob} blob */
  async function scan(blob) {
    scanStatus.textContent = "识别中…";
    scanStatus.classList.remove("tl-error");
    scanOut.value = "";
    scanOpen.hidden = true;
    scanPreview.src = URL.createObjectURL(blob);
    scanPreview.hidden = false;
    dropText.hidden = true;
    try {
      const result = await decodeQrBlob(blob);
      scanOut.value = result;
      scanStatus.textContent = "识别成功";
      scanOpen.hidden = !/^https?:\/\//i.test(result.trim());
    } catch (error) {
      scanStatus.textContent = error instanceof Error ? error.message : String(error);
      scanStatus.classList.add("tl-error");
    }
  }

  async function scanFromUrl(url) {
    try {
      scanUrl.value = url;
      await scan(await fetchImageBlob(url));
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), true);
    }
  }

  scanFile.addEventListener("change", () => {
    const f = scanFile.files?.[0];
    scanFile.value = "";
    if (f) void scan(f);
  });
  bindDropZone(drop, (f) => void scan(f));
  must("[data-scan-url-run]", root).addEventListener("click", () => void scanFromUrl(scanUrl.value));
  scanUrl.addEventListener("keydown", (e) => e.key === "Enter" && void scanFromUrl(scanUrl.value));
  must("[data-scan-copy]", root).addEventListener("click", () => void copyText(scanOut.value));
  scanOpen.addEventListener("click", () => {
    const url = scanOut.value.trim();
    if (/^https?:\/\//i.test(url)) void chrome.tabs.create({ url });
  });

  document.addEventListener("paste", (event) => {
    if (root.hidden || tab !== "scan") return;
    const t = /** @type {HTMLElement} */ (event.target);
    if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
    const { file, url } = pickPasted(event);
    if (file) {
      event.preventDefault();
      void scan(file);
    } else if (url) {
      event.preventDefault();
      void scanFromUrl(url);
    }
  });
}
