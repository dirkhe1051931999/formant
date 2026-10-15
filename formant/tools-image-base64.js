import {
  bindDropZone,
  blobToDataUrl,
  copyText,
  debounce,
  downloadBlob,
  escapeHtml,
  fetchImageBlob,
  formatBytes,
  must,
  pickPasted,
  toast,
} from "./tools-dom.js";

const SNIFF = [
  ["iVBOR", "image/png"],
  ["/9j/", "image/jpeg"],
  ["R0lGOD", "image/gif"],
  ["UklGR", "image/webp"],
  ["PHN2Zy", "image/svg+xml"],
  ["PD94bW", "image/svg+xml"],
  ["Qk", "image/bmp"],
  ["AAABAA", "image/x-icon"],
];

const EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
};

/**
 * 把 DataURI 或纯 Base64 规整成 `{ mime, base64, src }`；无效返回 null。
 * @param {string} input
 */
export function normalizeBase64Image(input) {
  const text = String(input || "").trim();
  if (!text) return null;
  const m = text.match(/^data:([^;,]*)(?:;[^,]*)?;base64,([\s\S]*)$/i);
  let mime = m ? m[1].toLowerCase() : "";
  const base64 = (m ? m[2] : text).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(base64)) return null;
  if (!mime || !mime.startsWith("image/")) {
    mime = SNIFF.find(([head]) => base64.startsWith(head))?.[1] || "";
    if (!mime) return null;
  }
  return { mime, base64, src: `data:${mime};base64,${base64}` };
}

/** @param {string} base64 */
function base64ToBlob(base64, mime) {
  const std = base64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** @param {HTMLElement} root */
export function mount(root) {
  root.innerHTML = `
    <header class="tl-head">
      <div>
        <h2>图片 Base64</h2>
      </div>
      <div class="tl-seg" data-tabs>
        <button type="button" class="is-active" data-tab="img">图片 → Base64</button>
        <button type="button" data-tab="b64">Base64 → 图片</button>
      </div>
    </header>

    <div data-view="img">
      <div class="tl-grid">
        <section class="tl-card">
          <span class="tl-label">图片</span>
          <label class="tl-drop" data-drop>
            <input type="file" accept="image/*" hidden data-file />
            <img alt="" data-preview hidden />
            <span data-drop-text>点击选择，或把图片拖到这里；也可直接 Ctrl+V 粘贴</span>
          </label>
          <div class="tl-row">
            <input class="tl-input tl-input--grow" data-url placeholder="或粘贴图片 URL（http/https）" spellcheck="false" />
            <button type="button" class="tl-btn" data-url-run>获取</button>
          </div>
        </section>
        <section class="tl-card ib-result">
          <span class="tl-label">转换结果（DataURI）</span>
          <textarea class="tl-textarea" data-out readonly placeholder="选择图片后自动生成"></textarea>
          <div class="tl-row">
            <button type="button" class="tl-btn" data-copy="uri">复制 DataURI</button>
            <button type="button" class="tl-btn tl-btn--ghost" data-copy="raw">纯 Base64</button>
            <button type="button" class="tl-btn tl-btn--ghost" data-copy="css">CSS url()</button>
            <button type="button" class="tl-btn tl-btn--ghost" data-copy="img">&lt;img&gt;</button>
          </div>
          <p class="tl-meta" data-size></p>
        </section>
      </div>
    </div>

    <div data-view="b64" hidden>
      <div class="tl-grid">
        <section class="tl-card">
          <span class="tl-label">Base64 / DataURI</span>
          <textarea class="tl-textarea" data-in placeholder="粘贴 DataURI（data:image/png;base64,…）或纯 Base64"></textarea>
        </section>
        <section class="tl-card">
          <span class="tl-label">预览</span>
          <div class="ib-preview"><img alt="" data-b64-preview hidden /><span class="tl-meta" data-b64-empty>等待输入</span></div>
          <div class="tl-row">
            <button type="button" class="tl-btn" data-download disabled>下载图片</button>
            <span class="tl-meta" data-b64-info></span>
          </div>
        </section>
      </div>
    </div>`;

  const tabs = must("[data-tabs]", root);
  const drop = must("[data-drop]", root);
  const file = /** @type {HTMLInputElement} */ (must("[data-file]", root));
  const preview = /** @type {HTMLImageElement} */ (must("[data-preview]", root));
  const dropText = must("[data-drop-text]", root);
  const urlInput = /** @type {HTMLInputElement} */ (must("[data-url]", root));
  const out = /** @type {HTMLTextAreaElement} */ (must("[data-out]", root));
  const sizeEl = must("[data-size]", root);
  const input = /** @type {HTMLTextAreaElement} */ (must("[data-in]", root));
  const b64Preview = /** @type {HTMLImageElement} */ (must("[data-b64-preview]", root));
  const b64Empty = must("[data-b64-empty]", root);
  const b64Info = must("[data-b64-info]", root);
  const downloadBtn = /** @type {HTMLButtonElement} */ (must("[data-download]", root));

  /** @type {{ mime: string, base64: string, src: string } | null} */
  let decoded = null;
  let tab = "img";

  function setTab(next) {
    tab = next;
    for (const btn of tabs.querySelectorAll("button")) btn.classList.toggle("is-active", btn.dataset.tab === next);
    for (const view of root.querySelectorAll("[data-view]")) /** @type {HTMLElement} */ (view).hidden = view.getAttribute("data-view") !== next;
  }
  tabs.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest("button[data-tab]");
    if (btn) setTab(/** @type {HTMLElement} */ (btn).dataset.tab);
  });

  /** @param {Blob} blob */
  async function convertBlob(blob) {
    try {
      const uri = await blobToDataUrl(blob);
      out.value = uri;
      preview.src = uri;
      preview.hidden = false;
      dropText.hidden = true;
      sizeEl.innerHTML = `原图 <b>${formatBytes(blob.size)}</b> → DataURI <b>${formatBytes(uri.length)}</b>（约 ${(uri.length / Math.max(blob.size, 1)).toFixed(2)} 倍）`;
    } catch (error) {
      toast(error instanceof Error ? error.message : "读取失败", true);
    }
  }

  async function fromUrl(url) {
    try {
      urlInput.value = url;
      await convertBlob(await fetchImageBlob(url));
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), true);
    }
  }

  file.addEventListener("change", () => {
    const f = file.files?.[0];
    if (f) void convertBlob(f);
    file.value = "";
  });
  bindDropZone(drop, (f) => void convertBlob(f));
  must("[data-url-run]", root).addEventListener("click", () => void fromUrl(urlInput.value));
  urlInput.addEventListener("keydown", (e) => e.key === "Enter" && void fromUrl(urlInput.value));

  document.addEventListener("paste", (event) => {
    if (root.hidden || tab !== "img") return;
    const t = /** @type {HTMLElement} */ (event.target);
    if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
    const { file: f, url } = pickPasted(event);
    if (f) {
      event.preventDefault();
      void convertBlob(f);
    } else if (url) {
      event.preventDefault();
      void fromUrl(url);
    }
  });

  for (const btn of root.querySelectorAll("[data-copy]")) {
    btn.addEventListener("click", () => {
      const uri = out.value;
      if (!uri) return void toast("请先选择图片", true);
      const kind = /** @type {HTMLElement} */ (btn).dataset.copy;
      const raw = uri.slice(uri.indexOf(",") + 1);
      const text =
        kind === "raw" ? raw : kind === "css" ? `url("${uri}")` : kind === "img" ? `<img src="${escapeHtml(uri)}" alt="" />` : uri;
      void copyText(text);
    });
  }

  const renderB64 = debounce(() => {
    decoded = normalizeBase64Image(input.value);
    downloadBtn.disabled = !decoded;
    if (!decoded) {
      b64Preview.hidden = true;
      b64Empty.hidden = false;
      b64Empty.textContent = input.value.trim() ? "无法识别为图片的 Base64" : "等待输入";
      b64Info.textContent = "";
      return;
    }
    b64Preview.src = decoded.src;
    b64Preview.hidden = false;
    b64Empty.hidden = true;
    b64Info.textContent = `${decoded.mime} · 约 ${formatBytes(Math.floor((decoded.base64.length * 3) / 4))}`;
  }, 200);
  input.addEventListener("input", renderB64);
  b64Preview.addEventListener("error", () => {
    if (!decoded) return;
    b64Preview.hidden = true;
    b64Empty.hidden = false;
    b64Empty.textContent = "数据无法渲染为图片，可能已损坏";
  });
  downloadBtn.addEventListener("click", () => {
    if (!decoded) return;
    try {
      const ext = EXT[/** @type {keyof typeof EXT} */ (decoded.mime)] || "png";
      downloadBlob(base64ToBlob(decoded.base64, decoded.mime), `image.${ext}`);
    } catch {
      toast("Base64 解码失败", true);
    }
  });
}
