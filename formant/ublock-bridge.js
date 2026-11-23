import { FEATURES_KEY, isUblockEnabled, loadFeatures, normalizeFeatures } from "./features.js";
import { UBLOCK_RULE_ID_MIN, UBLOCK_RULE_ID_MAX, applyUblockLists, getUblockDynamicRules } from "./ublock-apply.js";
import {
  UBLOCK_STATUS_KEY,
  loadUblockStatus,
  refreshListsFromNetwork,
  resolveLists,
} from "./ublock-sync.js";
import { getGenericCss, getPageCss, hasPageRules } from "./ublock-page-rules.js";

export const UBLOCK_ALARM = "formant-ublock-lists";
const ALARM_MINUTES = 12 * 60;
const COSMETIC_ID = "formant-ublock-cosmetic";
const BADGE_ID = "formant-ublock-badge";

/** @type {Promise<unknown> | null} */
let applyJob = null;
let lastEnabled = null;
/** @type {Set<number>} */
const blockRuleIds = new Set();
/** @type {Map<number, { network: number, video: number }>} */
const tabHits = new Map();

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function enqueue(fn) {
  const run = (applyJob || Promise.resolve()).then(fn, fn);
  applyJob = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function totalHits(tabId) {
  const cur = tabHits.get(tabId);
  return cur ? cur.network + cur.video : 0;
}

/**
 * @param {number} tabId
 * @param {"network" | "video"} kind
 * @param {number} [n]
 */
function bump(tabId, kind, n = 1) {
  if (!Number.isInteger(tabId) || tabId < 0 || n <= 0) return;
  const cur = tabHits.get(tabId) || { network: 0, video: 0 };
  cur[kind] += n;
  tabHits.set(tabId, cur);
  notifyBadge(tabId);
}

function notifyBadge(tabId) {
  void chrome.tabs
    .sendMessage(tabId, { type: "FORMANT_UBLOCK_COUNT", count: totalHits(tabId) })
    .catch(() => {});
}

async function refreshBlockRuleIds() {
  blockRuleIds.clear();
  const rules = await getUblockDynamicRules();
  for (const rule of rules) {
    if (rule.action?.type === "block" || rule.action?.type === "redirect") blockRuleIds.add(rule.id);
  }
}

/**
 * @param {boolean} enabled
 */
async function broadcastEnabled(enabled) {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  await Promise.all(
    tabs.map((tab) => {
      if (tab.id == null) return Promise.resolve();
      return chrome.tabs
        .sendMessage(tab.id, { type: "FORMANT_UBLOCK_SET_ENABLED", enabled })
        .catch(() => {});
    }),
  );
}

/**
 * @param {boolean} enabled
 */
async function syncContentScripts(enabled) {
  await chrome.scripting.unregisterContentScripts({ ids: [COSMETIC_ID, BADGE_ID, "formant-ublock-video"] }).catch(() => {});
  await broadcastEnabled(enabled);
  if (!enabled) return;
  await chrome.scripting.registerContentScripts([
    {
      id: COSMETIC_ID,
      js: ["ublock/content/cosmetic.js"],
      matches: ["http://*/*", "https://*/*"],
      runAt: "document_start",
      allFrames: true,
      persistAcrossSessions: true,
    },
    {
      id: BADGE_ID,
      js: ["ublock/content/badge.js"],
      matches: ["http://*/*", "https://*/*"],
      runAt: "document_idle",
      allFrames: false,
      persistAcrossSessions: true,
    },
  ]);
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id == null) return;
      await chrome.scripting
        .executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["ublock/content/cosmetic.js"] })
        .catch(() => {});
      await chrome.scripting
        .executeScript({ target: { tabId: tab.id }, files: ["ublock/content/badge.js"] })
        .catch(() => {});
    }),
  );
}

/**
 * @param {boolean} enabled
 * @param {{ refresh?: boolean }} [opts]
 */
async function applyNow(enabled, opts = {}) {
  const state = opts.refresh ? await refreshListsFromNetwork() : await resolveLists(true);
  try {
    const status = await applyUblockLists(state, { enabled });
    await refreshBlockRuleIds();
    if (enabled) {
      const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
      for (const tab of tabs) {
        if (tab.id != null) {
          void chrome.tabs.sendMessage(tab.id, { type: "FORMANT_UBLOCK_RULES_UPDATED" }).catch(() => {});
        }
      }
    }
    return status;
  } catch (error) {
    console.warn("[formant] uBO apply failed, keeping previous DNR", error);
    const prev = await loadUblockStatus();
    const status = {
      ...prev,
      enabled,
      lastError: error instanceof Error ? error.message : String(error),
      lastUpdated: Date.now(),
    };
    await chrome.storage.local.set({ [UBLOCK_STATUS_KEY]: status });
    throw error;
  }
}

export async function configureUblockAlarm(enabled) {
  if (enabled) {
    chrome.alarms.create(UBLOCK_ALARM, { periodInMinutes: ALARM_MINUTES });
    return;
  }
  await chrome.alarms.clear(UBLOCK_ALARM);
}

function onRuleMatched(info) {
  const tabId = info?.request?.tabId;
  const ruleId = info?.rule?.ruleId;
  if (!Number.isInteger(tabId) || tabId < 0) return;
  if (typeof ruleId !== "number" || ruleId < UBLOCK_RULE_ID_MIN || ruleId > UBLOCK_RULE_ID_MAX) return;
  if (!blockRuleIds.has(ruleId)) return;
  bump(tabId, "network");
}

/**
 * SW start: apply cache/seed immediately, then refresh from CDN.
 */
export async function initUblockBackground() {
  if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
    chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(onRuleMatched);
  }

  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    tabHits.delete(details.tabId);
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabHits.delete(tabId);
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== UBLOCK_ALARM) return;
    void enqueue(async () => {
      const features = await loadFeatures();
      if (!isUblockEnabled(features)) return;
      await applyNow(true, { refresh: true });
    }).catch((error) => {
      console.warn("[formant] uBO alarm update failed", error);
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[FEATURES_KEY]) return;
    const next = normalizeFeatures(changes[FEATURES_KEY].newValue);
    const enabled = isUblockEnabled(next);
    if (enabled === lastEnabled) return;
    lastEnabled = enabled;
    void enqueue(async () => {
      await configureUblockAlarm(enabled);
      if (!enabled) await syncContentScripts(false);
      await applyNow(enabled, { refresh: false });
      if (enabled) {
        await syncContentScripts(true);
        await applyNow(true, { refresh: true });
      }
    }).catch((error) => {
      console.warn("[formant] uBO feature toggle failed", error);
    });
  });

  const features = await loadFeatures();
  const enabled = isUblockEnabled(features);
  lastEnabled = enabled;
  await configureUblockAlarm(enabled);
  if (!enabled) {
    await syncContentScripts(false);
    await enqueue(() => applyNow(false, { refresh: false }));
    return;
  }

  await enqueue(() => applyNow(true, { refresh: false }));
  await syncContentScripts(true);
  void enqueue(() => applyNow(true, { refresh: true })).catch((error) => {
    console.warn("[formant] uBO CDN refresh failed", error);
  });
}

/**
 * @param {unknown} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {(response: unknown) => void} sendResponse
 * @returns {boolean}
 */
export function handleUblockMessage(message, sender, sendResponse) {
  if (!message || typeof message !== "object") return false;
  const type = /** @type {{ type?: string, n?: number }} */ (message).type;

  if (type === "FORMANT_UBLOCK_STATUS") {
    void loadUblockStatus()
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }

  if (type === "FORMANT_UBLOCK_GET_COUNT") {
    const tabId = sender.tab?.id;
    sendResponse({ ok: true, count: tabId == null ? 0 : totalHits(tabId) });
    return false;
  }

  if (type === "FORMANT_UBLOCK_PAGE_RULES" || type === "FORMANT_UBLOCK_GENERIC") {
    void (async () => {
      if (!hasPageRules()) {
        if (applyJob) await applyJob;
        if (!hasPageRules()) {
          const features = await loadFeatures();
          if (!isUblockEnabled(features)) return { ok: false };
          await enqueue(() => applyNow(true, { refresh: false }));
        }
      }
      if (!hasPageRules() || !sender.url) return { ok: false };
      if (type === "FORMANT_UBLOCK_PAGE_RULES") {
        return { ok: true, ...getPageCss(sender.url) };
      }
      const keys = Array.isArray(message.keys)
        ? message.keys.filter((key) => typeof key === "string" && key.length < 128).slice(0, 1000)
        : [];
      return { ok: true, css: getGenericCss(sender.url, keys) };
    })()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === "FORMANT_UBLOCK_LOCAL_BLOCK") {
    const tabId = sender.tab?.id;
    const n = Number(/** @type {{ n?: number }} */ (message).n) || 0;
    if (tabId != null) bump(tabId, "video", n);
    sendResponse({ ok: true });
    return false;
  }

  if (type === "FORMANT_UBLOCK_UPDATE_NOW") {
    void enqueue(async () => {
      const features = await loadFeatures();
      if (!isUblockEnabled(features)) {
        await syncContentScripts(false);
        return applyNow(false, { refresh: false });
      }
      await syncContentScripts(true);
      return applyNow(true, { refresh: true });
    })
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }

  return false;
}
