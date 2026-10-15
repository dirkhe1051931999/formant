import { FEATURES_KEY, isHuavodEnabled, loadFeatures, normalizeFeatures } from "./features.js";

/** Dynamic DNR: block disable-devtool CDN scripts initiated by huavod. */
const RULE_ID = 91_001;
const INITIATOR_DOMAINS = ["huavod.com", "www.huavod.com"];

/**
 * @param {boolean} enabled
 */
async function applyHuavodDnr(enabled) {
  /** @type {chrome.declarativeNetRequest.Rule[]} */
  const addRules = [];
  if (enabled) {
    addRules.push({
      id: RULE_ID,
      priority: 1,
      action: { type: "block" },
      condition: {
        urlFilter: "disable-devtool",
        resourceTypes: ["script"],
        initiatorDomains: INITIATOR_DOMAINS,
      },
    });
  }
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID],
    addRules,
  });
}

/**
 * Sync DNR with feature flag; re-entrant for SW restarts.
 */
export async function initHuavodBackground() {
  const features = await loadFeatures();
  await applyHuavodDnr(isHuavodEnabled(features));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[FEATURES_KEY]) return;
    const next = normalizeFeatures(changes[FEATURES_KEY].newValue);
    void applyHuavodDnr(isHuavodEnabled(next)).catch((error) => {
      console.warn("[formant] huavod DNR update failed", error);
    });
  });
}
