import {
  FEATURES_KEY,
  isImagePromptEnabled,
  normalizeFeatures,
} from "./features.js";
import {
  IMAGE_PROMPT_KEY,
  analyzeImageDataUrl,
  assertImageFile,
  fetchImageBlob,
  imageBlobToDataUrl,
  isImagePromptConfigured,
  loadImagePromptSettings,
  normalizeImagePromptSettings,
} from "./image-prompt.js";
import { bindDropZone, copyText, escapeHtml, must, pickPasted } from "./tools-dom.js";

const STEPS = ["读取图片", "提取风格", "生成提示词"];

/** @param {HTMLElement} root */
export function mount(root) {
  root.innerHTML = `
    <header class="tl-head">
      <div>
        <h2>识图</h2>
      </div>
      <div class="tl-row">
        <span class="tl-meta" data-meta></span>
        <button type="button" class="tl-btn tl-btn--ghost" data-settings>模型设置</button>
      </div>
    </header>
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
          <button type="button" class="tl-btn" data-run>识别</button>
        </div>
      </section>
      <section class="tl-card ip-result">
        <span class="tl-label">提示词</span>
        <div data-result></div>
      </section>
    </div>`;

  const meta = must("[data-meta]", root);
  const drop = must("[data-drop]", root);
  const fileInput = /** @type {HTMLInputElement} */ (must("[data-file]", root));
  const preview = /** @type {HTMLImageElement} */ (must("[data-preview]", root));
  const dropText = must("[data-drop-text]", root);
  const urlInput = /** @type {HTMLInputElement} */ (must("[data-url]", root));
  const runBtn = /** @type {HTMLButtonElement} */ (must("[data-run]", root));
  const result = must("[data-result]", root);

  /** @type {import("./image-prompt.js").ImagePromptSettings | null} */
  let settings = null;
  /** @type {Blob | null} */
  let currentBlob = null;
  /** @type {import("./image-prompt.js").ImagePromptResult | null} */
  let currentResult = null;
  let enabled = true;
  let tab = "zh";
  let busy = false;
  let stepTimer = 0;
  let requestId = 0;

  const openSettings = () => void chrome.tabs.create({ url: chrome.runtime.getURL("option.html#image-prompt") });
  must("[data-settings]", root).addEventListener("click", openSettings);

  function setBusy(next) {
    busy = next;
    runBtn.disabled = next || !enabled;
    fileInput.disabled = next || !enabled;
    urlInput.disabled = next || !enabled;
    drop.classList.toggle("is-busy", next);
  }

  function stopSteps() {
    window.clearInterval(stepTimer);
    stepTimer = 0;
  }

  /**
   * @param {string} text
   * @param {{ error?: boolean, button?: [string, () => void, boolean?] }} [opt]
   */
  function paintNote(text, opt = {}) {
    result.innerHTML = `<p class="tl-note${opt.error ? " tl-note--error" : ""}">${escapeHtml(text)}</p>`;
    if (opt.button) {
      const [label, handler, ghost] = opt.button;
      const button = document.createElement("button");
      button.type = "button";
      button.className = ghost ? "tl-btn tl-btn--ghost" : "tl-btn";
      button.textContent = label;
      button.addEventListener("click", handler);
      result.append(button);
    }
  }

  const configured = () => isImagePromptConfigured(settings || { baseUrl: "", apiKey: "", model: "" });

  function paintIdle() {
    if (!configured()) {
      paintNote("请先在设置里填写 Base URL、API Key 和 Model。", { button: ["打开设置", openSettings] });
      meta.textContent = "未配置";
      return;
    }
    paintNote("上传图片或填写 URL 后开始识别，结果显示在这里。");
    meta.textContent = "就绪";
  }

  /** @param {string} message */
  function paintError(message) {
    paintNote(message, {
      error: true,
      button: currentBlob ? ["重试", () => currentBlob && void runBlob(currentBlob), true] : undefined,
    });
    meta.textContent = "失败";
  }

  function paintLoading() {
    result.innerHTML = '<div class="ip-loading__bar"><span></span></div><p class="ip-loading__step"></p>';
    const step = must(".ip-loading__step", result);
    step.textContent = STEPS[0];
    meta.textContent = "识别中";
    let index = 0;
    stopSteps();
    stepTimer = window.setInterval(() => {
      index = (index + 1) % STEPS.length;
      step.textContent = STEPS[index];
    }, 1400);
  }

  const currentText = () => (tab === "en" ? currentResult?.en : tab === "json" ? currentResult?.jsonText : currentResult?.zh) || "";

  function paintResult() {
    if (!currentResult) return;
    result.innerHTML = `
      <div class="tl-row">
        <div class="tl-seg">
          <button type="button" data-tab="zh">中文</button>
          <button type="button" data-tab="en">English</button>
          <button type="button" data-tab="json">JSON</button>
        </div>
        <button type="button" class="tl-btn tl-btn--ghost" data-copy>复制</button>
      </div>
      <pre class="ip-body"></pre>`;
    const body = must(".ip-body", result);
    body.textContent = currentText();
    body.classList.toggle("ip-body--json", tab === "json");
    for (const btn of result.querySelectorAll("[data-tab]")) {
      btn.classList.toggle("is-active", /** @type {HTMLElement} */ (btn).dataset.tab === tab);
      btn.addEventListener("click", () => {
        tab = /** @type {HTMLElement} */ (btn).dataset.tab || "zh";
        paintResult();
      });
    }
    must("[data-copy]", result).addEventListener("click", () => void copyText(currentText()));
    meta.textContent = "完成";
  }

  /** @param {Blob} blob */
  async function runBlob(blob) {
    const ticket = (requestId += 1);
    currentBlob = blob;
    currentResult = null;
    setBusy(true);
    paintLoading();
    try {
      const stored = settings || (await loadImagePromptSettings());
      settings = stored;
      if (!isImagePromptConfigured(stored)) {
        stopSteps();
        paintIdle();
        return;
      }
      const dataUrl = await imageBlobToDataUrl(blob);
      if (ticket !== requestId) return;
      const analyzed = await analyzeImageDataUrl(dataUrl, stored);
      if (ticket !== requestId) return;
      currentResult = analyzed;
      tab = "zh";
      stopSteps();
      paintResult();
    } catch (error) {
      if (ticket !== requestId) return;
      stopSteps();
      paintError(error instanceof Error ? error.message : String(error));
    } finally {
      if (ticket === requestId) setBusy(false);
    }
  }

  /**
   * @param {Blob} blob
   * @param {string} label
   */
  function showPreview(blob, label) {
    if (preview.src.startsWith("blob:")) URL.revokeObjectURL(preview.src);
    preview.src = URL.createObjectURL(blob);
    preview.hidden = false;
    dropText.textContent = label;
  }

  /** @param {File} file */
  function takeFile(file) {
    try {
      assertImageFile(file);
    } catch (error) {
      paintError(error instanceof Error ? error.message : String(error));
      return;
    }
    showPreview(file, file.name || "已选择图片");
    void runBlob(file);
  }

  /** @param {string} url */
  async function takeUrl(url) {
    setBusy(true);
    paintLoading();
    try {
      const blob = await fetchImageBlob(url);
      showPreview(blob, "来自 URL");
      await runBlob(blob);
    } catch (error) {
      stopSteps();
      setBusy(false);
      paintError(error instanceof Error ? error.message : String(error));
    }
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file && enabled && !busy) takeFile(file);
  });
  bindDropZone(drop, (file) => {
    if (enabled && !busy) takeFile(file);
  });
  document.addEventListener("paste", (event) => {
    if (root.hidden || !enabled || busy) return;
    const { file, url } = pickPasted(event);
    if (file) takeFile(file);
    else if (url && document.activeElement !== urlInput) {
      urlInput.value = url;
      void takeUrl(url);
    }
  });

  runBtn.addEventListener("click", () => {
    if (!enabled) return;
    const url = urlInput.value.trim();
    if (url) return void takeUrl(url);
    if (currentBlob) void runBlob(currentBlob);
    else paintError("请先上传图片或填写 URL");
  });

  /** @param {boolean} next */
  function applyEnabled(next) {
    enabled = next;
    if (!next) {
      stopSteps();
      requestId += 1;
      setBusy(false);
      meta.textContent = "已关闭";
    }
  }

  const idleRefresh = () => {
    if (enabled && !busy && !currentResult) paintIdle();
  };

  void Promise.all([chrome.storage.local.get(FEATURES_KEY), loadImagePromptSettings()]).then(([stored, saved]) => {
    settings = saved;
    applyEnabled(isImagePromptEnabled(normalizeFeatures(stored[FEATURES_KEY])));
    idleRefresh();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[FEATURES_KEY]) {
      applyEnabled(isImagePromptEnabled(normalizeFeatures(changes[FEATURES_KEY].newValue)));
      idleRefresh();
    }
    if (changes[IMAGE_PROMPT_KEY]) {
      settings = normalizeImagePromptSettings(changes[IMAGE_PROMPT_KEY].newValue);
      idleRefresh();
    }
  });
}
