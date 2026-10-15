import {
  DEFAULT_AUTOPAGERIZE_SETTINGS,
  AUTOPAGERIZE_SETTINGS_KEY,
  loadAutopagerizeSettings,
  normalizeAutopagerizeSettings,
  saveAutopagerizeSettings,
} from "./autopagerize-config.js";
import { FEATURES_KEY, loadFeatures } from "./features.js";

/** @typedef {{ toast: (text: string) => void }} PanelApi */

/**
 * @param {PanelApi} api
 */
export function initAutopagerizePanel(api) {
  const form = document.getElementById("autopagerizeForm");
  const messageBar = /** @type {HTMLInputElement | null} */ (document.getElementById("autopagerizeMessageBar"));
  const exclude = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("autopagerizeExclude"));
  const save = /** @type {HTMLButtonElement | null} */ (document.getElementById("autopagerizeSave"));
  const reset = /** @type {HTMLButtonElement | null} */ (document.getElementById("autopagerizeReset"));
  const state = document.getElementById("autopagerizeState");
  if (!form || !messageBar || !exclude || !save || !state) return;

  /** @type {import("./autopagerize-config.js").AutopagerizeSettings} */
  let current = { ...DEFAULT_AUTOPAGERIZE_SETTINGS };
  let featureEnabled = true;

  function paint() {
    messageBar.checked = current.displayMessageBar;
    exclude.value = current.excludePatterns;
    state.textContent = featureEnabled
      ? "AutoPagerize 已启用；更改保存后已打开的页面会自动应用新设置。"
      : "AutoPagerize 总开关当前关闭；可在「功能」面板重新启用，设置会被保留。";
  }

  async function reload() {
    const [settings, features] = await Promise.all([loadAutopagerizeSettings(), loadFeatures()]);
    current = settings;
    featureEnabled = features.autopagerize.enabled;
    paint();
  }

  function persist() {
    const next = normalizeAutopagerizeSettings({
      displayMessageBar: messageBar.checked,
      excludePatterns: exclude.value,
      customSiteinfo: current.customSiteinfo,
    });
    void saveAutopagerizeSettings(next)
      .then((saved) => {
        current = saved;
        paint();
        api.toast("AutoPagerize 设置已保存");
      })
      .catch((error) => {
        api.toast(error instanceof Error ? error.message : String(error));
        void reload();
      });
  }

  save.addEventListener("click", persist);
  reset?.addEventListener("click", () => {
    void saveAutopagerizeSettings({
      ...DEFAULT_AUTOPAGERIZE_SETTINGS,
      customSiteinfo: current.customSiteinfo,
    })
      .then((saved) => {
        current = saved;
        paint();
        api.toast("AutoPagerize 设置已恢复默认");
      })
      .catch((error) => api.toast(error instanceof Error ? error.message : String(error)));
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[AUTOPAGERIZE_SETTINGS_KEY]) current = normalizeAutopagerizeSettings(changes[AUTOPAGERIZE_SETTINGS_KEY].newValue);
    if (changes[FEATURES_KEY]) {
      const next = changes[FEATURES_KEY].newValue;
      featureEnabled = next?.autopagerize?.enabled !== false;
    }
    if (changes[AUTOPAGERIZE_SETTINGS_KEY] || changes[FEATURES_KEY]) paint();
  });

  void reload().catch((error) => {
    state.textContent = error instanceof Error ? error.message : String(error);
  });
}
