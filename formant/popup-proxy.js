import { FEATURES_KEY, isProxyEnabled, loadFeatures } from "./features.js";
import {
  PROXY_SETTINGS_KEY,
  listProxyChoices,
  loadProxySettings,
  normalizeProxySettings,
  setActiveProxyId,
} from "./proxy-config.js";

/**
 * Compact proxy switcher for the existing formant popup.
 */
export function initPopupProxy() {
  const root = document.getElementById("proxySwitch");
  const chips = document.getElementById("proxyChips");
  const link = /** @type {HTMLAnchorElement | null} */ (document.getElementById("proxyManageLink"));
  const note = document.getElementById("proxySwitchNote");
  if (!root || !chips) return;

  let featureEnabled = true;
  /** @type {import("./proxy-config.js").ProxySettings} */
  let settings = { activeId: "system", profiles: [], pac: { url: "", data: "" } };

  function paint() {
    root.hidden = false;
    chips.replaceChildren();
    const choices = listProxyChoices(settings);
    for (const choice of choices) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `proxy-chip${settings.activeId === choice.id ? " is-active" : ""}`;
      btn.dataset.proxyId = choice.id;
      btn.textContent = choice.label;
      btn.disabled = !featureEnabled;
      btn.title = choice.label;
      chips.append(btn);
    }
    if (note) {
      note.hidden = featureEnabled;
      note.textContent = "代理已关闭，可在设置 → 功能中启用";
    }
  }

  async function reload() {
    const [proxy, features] = await Promise.all([loadProxySettings(), loadFeatures()]);
    settings = proxy;
    featureEnabled = isProxyEnabled(features);
    paint();
  }

  chips.addEventListener("click", (event) => {
    const btn = event.target instanceof Element ? event.target.closest("[data-proxy-id]") : null;
    if (!(btn instanceof HTMLButtonElement) || btn.disabled) return;
    const id = btn.dataset.proxyId || "";
    void setActiveProxyId(id)
      .then((next) => {
        settings = next;
        paint();
      })
      .catch((error) => console.warn("[formant] proxy switch failed", error));
  });

  link?.addEventListener("click", (event) => {
    event.preventDefault();
    const url = chrome.runtime.getURL("option.html#proxy");
    void chrome.tabs.create({ url });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[PROXY_SETTINGS_KEY]) {
      settings = normalizeProxySettings(changes[PROXY_SETTINGS_KEY].newValue);
    }
    if (changes[FEATURES_KEY]) {
      featureEnabled = changes[FEATURES_KEY].newValue?.proxy?.enabled !== false;
    }
    if (changes[PROXY_SETTINGS_KEY] || changes[FEATURES_KEY]) paint();
  });

  void reload().catch((error) => console.warn("[formant] popup proxy init failed", error));
}
