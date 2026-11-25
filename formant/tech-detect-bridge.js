import { FEATURES_KEY, isTechDetectEnabled, loadFeatures, normalizeFeatures } from "./features.js";
import { clearAllTechIcons, setTabTech } from "./action-icon.js";

/** @type {Map<number, number>} */
const timers = new Map();

function detectPageFramework() {
  try {
    const metaGen = (re) => {
      const el = document.querySelector('meta[name="generator"]');
      return Boolean(el && re.test(el.getAttribute("content") || ""));
    };
    if (
      window.__NUXT__ ||
      window.$nuxt ||
      document.getElementById("__nuxt") ||
      document.getElementById("__layout") ||
      metaGen(/nuxt/i)
    ) {
      return "nuxt";
    }
    if (
      window.__NEXT_DATA__ ||
      document.getElementById("__next") ||
      document.querySelector("next-route-announcer")
    ) {
      return "next";
    }
    if (document.querySelector("astro-island") || metaGen(/astro/i)) {
      return "astro";
    }
    if (window.__remixContext || window.__remixManifest) {
      return "remix";
    }
    if (metaGen(/vitepress/i)) {
      return "vitepress";
    }
    if (metaGen(/docusaurus/i) || document.getElementById("__docusaurus")) {
      return "docusaurus";
    }
    if (
      metaGen(/wordpress/i) ||
      document.querySelector('link[href*="/wp-content/"], script[src*="/wp-includes/"]')
    ) {
      return "wordpress";
    }
    if (window.Shopify && typeof window.Shopify === "object") {
      return "shopify";
    }
    if (window.ng || window.getAllAngularRootElements || document.querySelector("[ng-version]")) {
      return "angular";
    }
    if (window.__svelte || document.querySelector('[class*="svelte-"]')) {
      return "svelte";
    }
    if (window._$HY) {
      return "solid";
    }
    const reactHook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (reactHook?.renderers?.size > 0 || document.querySelector("[data-reactroot]")) {
      return "react";
    }
    for (const el of [document.getElementById("root"), document.getElementById("app"), document.body]) {
      if (!el) continue;
      for (const key of Object.keys(el)) {
        if (key.startsWith("__reactContainer$") || key.startsWith("__reactFiber$")) {
          return "react";
        }
      }
    }
  } catch {}
  return null;
}

/**
 * @param {number} tabId
 */
async function scanTab(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  const features = await loadFeatures();
  if (!isTechDetectEnabled(features)) {
    await setTabTech(tabId, null);
    return;
  }
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.url || !/^https?:\/\//i.test(tab.url)) {
      await setTabTech(tabId, null);
      return;
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: detectPageFramework,
    });
    const detected = results?.find((item) => typeof item?.result === "string")?.result || null;
    await setTabTech(tabId, detected);
  } catch {
    // Tab closed or restricted URL.
  }
}

/**
 * @param {number} tabId
 */
function scheduleScan(tabId) {
  const prev = timers.get(tabId);
  if (prev) clearTimeout(prev);
  timers.set(
    tabId,
    setTimeout(() => {
      timers.delete(tabId);
      void scanTab(tabId);
    }, 350),
  );
}

export function initTechDetectBackground() {
  chrome.webNavigation.onCompleted.addListener((details) => {
    if (details.frameId !== 0) return;
    scheduleScan(details.tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete") return;
    if (tab?.url && /^https?:\/\//i.test(tab.url)) scheduleScan(tabId);
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    scheduleScan(tabId);
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    const prev = timers.get(tabId);
    if (prev) clearTimeout(prev);
    timers.delete(tabId);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[FEATURES_KEY]) return;
    const enabled = isTechDetectEnabled(normalizeFeatures(changes[FEATURES_KEY].newValue));
    if (!enabled) {
      void clearAllTechIcons();
      return;
    }
    void chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      for (const tab of tabs) {
        if (tab.id != null) scheduleScan(tab.id);
      }
    });
  });
}
