import {
  FEATURES_KEY,
  isHlsEnabled,
  isImagePromptEnabled,
  isToolsEnabled,
  loadFeatures,
  normalizeFeatures,
} from "./features.js";

const PAGE_URL = chrome.runtime.getURL("tools.html");

/** 工具箱入口：工具箱、识图或 HLS 任一开启即显示。 */
export function initPopupTools() {
  const navBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("toolsNavBtn"));
  if (!navBtn) return;

  navBtn.addEventListener("click", () => {
    if (navBtn.hidden) return;
    void chrome.tabs.create({ url: PAGE_URL });
  });

  /** @param {import("./features.js").FormantFeatures} features */
  function applyFeature(features) {
    navBtn.hidden = !(isToolsEnabled(features) || isImagePromptEnabled(features) || isHlsEnabled(features));
  }

  void loadFeatures().then(applyFeature);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[FEATURES_KEY]) return;
    applyFeature(normalizeFeatures(changes[FEATURES_KEY].newValue));
  });
}
