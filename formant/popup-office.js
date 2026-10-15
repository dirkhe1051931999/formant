import { FEATURES_KEY, isOfficeEnabled, loadFeatures, normalizeFeatures } from "./features.js";
import { openOfficePage } from "./office-bridge.js";

/** popup 主界面快捷条：起始页 / Word / Excel / PPT。不增加顶栏图标。 */
function initPopupOffice() {
  const root = document.getElementById("officeSwitch");
  if (!root) return;

  /** @param {import("./features.js").FormantFeatures} features */
  function applyFeature(features) {
    root.hidden = !isOfficeEnabled(features);
  }

  root.addEventListener("click", (event) => {
    const btn = event.target instanceof Element ? event.target.closest("[data-office]") : null;
    if (!btn || root.hidden) return;
    const kind = btn.getAttribute("data-office") || "";
    void openOfficePage(kind);
  });

  void loadFeatures().then(applyFeature);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[FEATURES_KEY]) return;
    applyFeature(normalizeFeatures(changes[FEATURES_KEY].newValue));
  });
}

initPopupOffice();
