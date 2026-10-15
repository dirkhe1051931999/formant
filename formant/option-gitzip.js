import {
  DEFAULT_GITZIP_SETTINGS,
  GITZIP_SETTINGS_KEY,
  loadGitzipSettings,
  normalizeGitzipSettings,
  saveGitzipSettings,
} from "./gitzip-config.js";
import { FEATURES_KEY, loadFeatures } from "./features.js";

/** @typedef {{ toast: (text: string) => void }} PanelApi */

/**
 * @param {PanelApi} api
 */
export function initGitzipPanel(api) {
  const form = document.getElementById("gitzipForm");
  const selectBehaviour = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("gitzipSelectBehaviour")
  );
  const theme = /** @type {HTMLSelectElement | null} */ (document.getElementById("gitzipTheme"));
  const reset = document.getElementById("gitzipReset");
  const state = document.getElementById("gitzipState");
  if (!form || !selectBehaviour || !theme || !state) return;

  /** @type {import("./gitzip-config.js").GitzipSettings} */
  let current = { ...DEFAULT_GITZIP_SETTINGS };
  let featureEnabled = true;

  function paint() {
    selectBehaviour.value = current.selectBehaviour;
    theme.value = current.theme;
    state.textContent = featureEnabled
      ? "公开模式已启用：不会保存或请求 GitHub 访问令牌。"
      : "GitZip 总开关当前关闭；可在「功能」面板重新启用，设置会被保留。";
  }

  async function reload() {
    const [settings, features] = await Promise.all([loadGitzipSettings(), loadFeatures()]);
    current = settings;
    featureEnabled = features.gitzip.enabled;
    paint();
  }

  function persist() {
    const next = normalizeGitzipSettings({
      selectBehaviour: selectBehaviour.value,
      theme: theme.value,
    });
    void saveGitzipSettings(next)
      .then((saved) => {
        current = saved;
        paint();
        api.toast("GitZip 设置已保存");
      })
      .catch((error) => {
        api.toast(error instanceof Error ? error.message : String(error));
        void reload();
      });
  }

  selectBehaviour.addEventListener("change", persist);
  theme.addEventListener("change", persist);
  reset?.addEventListener("click", () => {
    void saveGitzipSettings(DEFAULT_GITZIP_SETTINGS)
      .then((saved) => {
        current = saved;
        paint();
        api.toast("GitZip 设置已恢复默认");
      })
      .catch((error) => api.toast(error instanceof Error ? error.message : String(error)));
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[GITZIP_SETTINGS_KEY]) current = normalizeGitzipSettings(changes[GITZIP_SETTINGS_KEY].newValue);
    if (changes[FEATURES_KEY]) {
      const next = changes[FEATURES_KEY].newValue;
      featureEnabled = next?.gitzip?.enabled !== false;
    }
    if (changes[GITZIP_SETTINGS_KEY] || changes[FEATURES_KEY]) paint();
  });

  void reload().catch((error) => {
    state.textContent = error instanceof Error ? error.message : String(error);
  });
}
