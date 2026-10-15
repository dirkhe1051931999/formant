import { FEATURES_KEY, loadFeatures } from "./features.js";
import {
  IMAGE_PROMPT_KEY,
  loadImagePromptSettings,
  normalizeImagePromptSettings,
  saveImagePromptSettings,
} from "./image-prompt.js";

/** @typedef {{ toast: (text: string) => void }} PanelApi */

/**
 * @param {PanelApi} api
 */
export function initImagePromptPanel(api) {
  const form = document.getElementById("imagePromptForm");
  const baseUrlEl = /** @type {HTMLInputElement | null} */ (document.getElementById("imagePromptBaseUrl"));
  const apiKeyEl = /** @type {HTMLInputElement | null} */ (document.getElementById("imagePromptApiKey"));
  const modelEl = /** @type {HTMLInputElement | null} */ (document.getElementById("imagePromptModel"));
  const saveBtn = document.getElementById("imagePromptSave");
  const state = document.getElementById("imagePromptState");
  if (!form || !baseUrlEl || !apiKeyEl || !modelEl || !saveBtn || !state) return;

  /** @type {import("./image-prompt.js").ImagePromptSettings | null} */
  let current = null;
  let featureEnabled = true;

  function paint() {
    if (!current) return;
    baseUrlEl.value = current.baseUrl;
    apiKeyEl.value = current.apiKey;
    modelEl.value = current.model;
    state.textContent = featureEnabled
      ? "密钥只保存在本机，不上传 mono。popup 顶栏会在新标签页打开识图。"
      : "识图总开关当前关闭；可在「功能」面板重新启用，这里的配置会保留。";
  }

  async function reload() {
    const [settings, features] = await Promise.all([loadImagePromptSettings(), loadFeatures()]);
    current = settings;
    featureEnabled = features.imagePrompt.enabled;
    paint();
  }

  saveBtn.addEventListener("click", () => {
    void (async () => {
      const saved = await saveImagePromptSettings({
        baseUrl: baseUrlEl.value,
        apiKey: apiKeyEl.value,
        model: modelEl.value,
      });
      current = saved;
      paint();
      api.toast("识图模型已保存");
    })().catch((error) => {
      api.toast(error instanceof Error ? error.message : String(error));
    });
  });

  void reload();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[IMAGE_PROMPT_KEY]) {
      current = normalizeImagePromptSettings(changes[IMAGE_PROMPT_KEY].newValue);
    }
    if (changes[FEATURES_KEY]) {
      const next = changes[FEATURES_KEY].newValue;
      featureEnabled = Boolean(next?.imagePrompt?.enabled);
    }
    if (changes[IMAGE_PROMPT_KEY] || changes[FEATURES_KEY]) paint();
  });
}
