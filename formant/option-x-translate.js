import {
  DEFAULT_X_TRANSLATE_SETTINGS,
  X_TRANSLATE_SETTINGS_KEY,
  loadXTranslateSettings,
  normalizeXTranslateColor,
  normalizeXTranslateSettings,
  normalizeXTranslateSize,
  saveXTranslateSettings,
} from "./x-translate-config.js";
import { FEATURES_KEY, loadFeatures } from "./features.js";

/** @typedef {{ toast: (text: string) => void }} PanelApi */

/**
 * @param {PanelApi} api
 */
export function initXTranslatePanel(api) {
  const form = document.getElementById("xTranslateForm");
  const colorEl = /** @type {HTMLInputElement | null} */ (document.getElementById("xTranslateColor"));
  const hexEl = /** @type {HTMLInputElement | null} */ (document.getElementById("xTranslateHex"));
  const sizeEl = /** @type {HTMLInputElement | null} */ (document.getElementById("xTranslateSize"));
  const previewEl = document.getElementById("xTranslatePreview");
  const reset = document.getElementById("xTranslateReset");
  const state = document.getElementById("xTranslateState");
  if (!form || !colorEl || !hexEl || !sizeEl || !previewEl || !state) return;

  /** @type {import("./x-translate-config.js").XTranslateSettings} */
  let current = { ...DEFAULT_X_TRANSLATE_SETTINGS };
  let featureEnabled = true;

  function paintPreview() {
    previewEl.style.color = current.color;
    previewEl.style.fontSize = `${current.textSize}px`;
  }

  function paint() {
    colorEl.value = current.color;
    hexEl.value = current.color;
    sizeEl.value = String(current.textSize);
    paintPreview();
    state.textContent = featureEnabled
      ? "默认开启。时间线走 Google 直连，不扣 Client API Key。目标语言跟「翻译」面板。"
      : "X 推文翻译总开关当前关闭；可在「功能」面板重新启用，颜色和字号会保留。";
  }

  async function reload() {
    const [settings, features] = await Promise.all([loadXTranslateSettings(), loadFeatures()]);
    current = settings;
    featureEnabled = features.xTranslate.enabled;
    paint();
  }

  /**
   * @param {Partial<import("./x-translate-config.js").XTranslateSettings>} patch
   */
  function persist(patch) {
    const next = normalizeXTranslateSettings({ ...current, ...patch });
    void saveXTranslateSettings(next)
      .then((saved) => {
        current = saved;
        paint();
        api.toast("X 推文样式已保存");
      })
      .catch((error) => {
        api.toast(error instanceof Error ? error.message : String(error));
        void reload();
      });
  }

  colorEl.addEventListener("input", () => {
    current = { ...current, color: normalizeXTranslateColor(colorEl.value) };
    hexEl.value = current.color;
    paintPreview();
  });
  colorEl.addEventListener("change", () => persist({ color: colorEl.value }));

  hexEl.addEventListener("change", () => {
    const next = hexEl.value.trim();
    if (!/^#[0-9A-Fa-f]{6}$/i.test(next)) {
      hexEl.value = current.color;
      return;
    }
    persist({ color: next });
  });
  hexEl.addEventListener("blur", () => {
    hexEl.value = current.color;
  });

  sizeEl.addEventListener("change", () => persist({ textSize: normalizeXTranslateSize(sizeEl.value) }));

  reset?.addEventListener("click", () => {
    void saveXTranslateSettings(DEFAULT_X_TRANSLATE_SETTINGS)
      .then((saved) => {
        current = saved;
        paint();
        api.toast("X 推文样式已恢复默认");
      })
      .catch((error) => api.toast(error instanceof Error ? error.message : String(error)));
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[X_TRANSLATE_SETTINGS_KEY]) {
      current = normalizeXTranslateSettings(changes[X_TRANSLATE_SETTINGS_KEY].newValue);
    }
    if (changes[FEATURES_KEY]) {
      const next = changes[FEATURES_KEY].newValue;
      featureEnabled = next?.xTranslate?.enabled !== false;
    }
    if (changes[X_TRANSLATE_SETTINGS_KEY] || changes[FEATURES_KEY]) paint();
  });

  void reload().catch((error) => {
    state.textContent = error instanceof Error ? error.message : String(error);
  });
}
