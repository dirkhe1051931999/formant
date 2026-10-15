import { isVueEnabled, loadFeatures, normalizeFeatures } from "./features.js";
import { paintVueIcon } from "./vue-icon.js";

const HOOK_ID = "formant-vue-hook";
const DETECT_ID = "formant-vue-detect";

/** @type {Promise<void>} */
let chain = Promise.resolve();
/** @type {Set<number>} */
const touched = new Set();
/** @type {Map<number, number[]>} */
const scanTimers = new Map();

/**
 * @param {boolean} enabled
 * @param {boolean} force
 */
async function applyNow(enabled, force) {
  if (!enabled || force) {
    await chrome.scripting.unregisterContentScripts({ ids: [HOOK_ID, DETECT_ID] }).catch(() => {});
  }
  if (!enabled) {
    await setOpenPages(false);
    await clearVueIcons();
    return;
  }
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [HOOK_ID, DETECT_ID] });
  const ids = new Set(existing.map((script) => script.id));
  /** @type {chrome.scripting.RegisteredContentScript[]} */
  const missing = [];
  if (!ids.has(HOOK_ID)) {
    missing.push({
      id: HOOK_ID,
      js: ["vue/page-hook.js"],
      matches: ["http://*/*", "https://*/*"],
      runAt: "document_start",
      world: "MAIN",
      allFrames: true,
      persistAcrossSessions: true,
    });
  }
  if (!ids.has(DETECT_ID)) {
    missing.push({
      id: DETECT_ID,
      js: ["vue/detect.js"],
      matches: ["http://*/*", "https://*/*"],
      runAt: "document_start",
      world: "ISOLATED",
      allFrames: true,
      persistAcrossSessions: true,
    });
  }
  if (missing.length) await chrome.scripting.registerContentScripts(missing);
  await setOpenPages(true);
}

async function clearVueIcons() {
  const tabIds = [...touched];
  touched.clear();
  await Promise.all(tabIds.map((tabId) => paintVueIcon(tabId, false).catch(() => {})));
}

/**
 * @param {number} tabId
 */
async function scanTab(tabId) {
  const features = await loadFeatures();
  if (!isVueEnabled(features)) {
    await paintVueIcon(tabId, false).catch(() => {});
    return;
  }
  let present = false;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: "MAIN",
      func: () => {
        const hook = window.__VUE_DEVTOOLS_GLOBAL_HOOK__;
        if (hook && (hook.Vue || hook.store || (hook.apps && hook.apps.length))) return true;
        const nodes = document.getElementsByTagName("*");
        const limit = Math.min(nodes.length, 8000);
        for (let i = 0; i < limit; i += 1) {
          if (nodes[i].__vue__ || nodes[i].__vue_app__) return true;
        }
        return false;
      },
    });
    present = results.some((item) => item.result === true);
  } catch {
    return;
  }
  touched.add(tabId);
  await paintVueIcon(tabId, present);
}

/**
 * @param {number} tabId
 */
function scheduleScan(tabId) {
  const prev = scanTimers.get(tabId) || [];
  prev.forEach((id) => clearTimeout(id));
  void scanTab(tabId);
  scanTimers.set(tabId, [
    setTimeout(() => scanTab(tabId), 700),
    setTimeout(() => scanTab(tabId), 2000),
  ]);
}

/**
 * @param {boolean} enabled
 */
async function setOpenPages(enabled) {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  await Promise.all(
    tabs.map((tab) => {
      if (tab.id == null) return Promise.resolve();
      return chrome.scripting
        .executeScript({
          target: { tabId: tab.id, allFrames: true },
          world: "MAIN",
          func: (on) => {
            const api = window.__FORMANT_VUE__;
            if (api && typeof api.setEnabled === "function") api.setEnabled(on);
          },
          args: [enabled],
        })
        .catch(() => {});
    }),
  );
}

/**
 * @param {boolean} enabled
 * @param {boolean} [force]
 */
function apply(enabled, force = false) {
  chain = chain.then(() => applyNow(enabled, force)).catch((error) => {
    console.warn("[formant] vue hook sync failed", error);
  });
  return chain;
}

export function initVueBackground() {
  chrome.runtime.onInstalled.addListener(() => {
    void loadFeatures().then((features) => apply(isVueEnabled(features), true));
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.formantFeatures) return;
    const features = normalizeFeatures(changes.formantFeatures.newValue);
    void apply(isVueEnabled(features), false);
  });
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== "FORMANT_VUE_DETECTED") return;
    const tabId = sender.tab?.id;
    if (tabId == null) return;
    void scanTab(tabId);
  });
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === "loading") {
      const prev = scanTimers.get(tabId) || [];
      prev.forEach((id) => clearTimeout(id));
      scanTimers.delete(tabId);
      void paintVueIcon(tabId, false).catch(() => {});
    }
    if (info.status === "complete") scheduleScan(tabId);
  });
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    scheduleScan(tabId);
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    touched.delete(tabId);
    const prev = scanTimers.get(tabId) || [];
    prev.forEach((id) => clearTimeout(id));
    scanTimers.delete(tabId);
  });
  void loadFeatures().then(async (features) => {
    await apply(isVueEnabled(features), false);
    if (!isVueEnabled(features)) return;
    const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
    tabs.forEach((tab) => {
      if (tab.id != null) scheduleScan(tab.id);
    });
  });
}
