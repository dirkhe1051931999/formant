import { FEATURES_KEY, isUblockEnabled, loadFeatures, normalizeFeatures } from "./features.js";
import { UBLOCK_RULE_ID_MIN, UBLOCK_RULE_ID_MAX, applyUblockLists, getUblockDynamicRules } from "./ublock-apply.js";
import { UBLOCK_CONFIG_KEY, loadUblockConfig } from "./ublock-config.js";
import { STATIC_RULESET_IDS } from "./ublock-dnr-utils.js";
import {
  UBLOCK_PROGRESS_KEY,
  UBLOCK_STATUS_KEY,
  loadUblockStatus,
  refreshListsFromNetwork,
  resolveLists,
} from "./ublock-sync.js";
import { getGenericCss, getPageCss, hasPageRules } from "./ublock-page-rules.js";
import { clearAllAdCounts, clearTabIcon, getTabIconInfo, setTabAdCount } from "./action-icon.js";

export const UBLOCK_ALARM = "formant-ublock-lists";
const ALARM_MINUTES = 24 * 60;
const UBLOCK_AUTO_DATE_KEY = "formantUblockAutoUpdateDate";
const COSMETIC_ID = "formant-ublock-cosmetic";
const BADGE_ID = "formant-ublock-badge";
const STATIC_RULESET_SET = new Set(STATIC_RULESET_IDS);

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
  void setTabAdCount(tabId, totalHits(tabId));
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
  const config = enabled ? await loadUblockConfig() : null;
  const cosmeticOn = Boolean(enabled && config?.cosmetic);
  if (!enabled) {
    tabHits.clear();
    void clearAllAdCounts();
  }
  await broadcastEnabled(cosmeticOn);
  if (!enabled || !cosmeticOn) return;

  await chrome.scripting.registerContentScripts([
    {
      id: COSMETIC_ID,
      js: ["ublock/content/procedural.js", "ublock/content/cosmetic.js"],
      matches: ["http://*/*", "https://*/*"],
      runAt: "document_start",
      allFrames: true,
      matchOriginAsFallback: true,
      persistAcrossSessions: true,
    },
  ]);

  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id == null) return;
      await chrome.scripting
        .executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ["ublock/content/procedural.js", "ublock/content/cosmetic.js"],
        })
        .catch(() => {});
    }),
  );
}

function createProgressTracker() {
  const startedAt = Date.now();
  /** @type {string[]} */
  const logs = [];
  let writeChain = Promise.resolve();

  const flush = (running) => {
    const payload = {
      running,
      startedAt,
      updatedAt: Date.now(),
      logs: logs.slice(-60),
    };
    writeChain = writeChain
      .then(() => chrome.storage.local.set({ [UBLOCK_PROGRESS_KEY]: payload }))
      .catch(() => {});
    return writeChain;
  };

  const log = (msg) => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    logs.push(`[${hh}:${mm}:${ss}] ${msg}`);
    void flush(true);
  };

  const finish = async (summary) => {
    if (summary) log(summary);
    await flush(false);
  };

  return { log, finish, startedAt };
}

/**
 * @param {boolean} enabled
 * @param {{ refresh?: boolean, trackProgress?: boolean }} [opts]
 */
async function applyNow(enabled, opts = {}) {
  let effectiveEnabled = Boolean(enabled);
  if (effectiveEnabled && !isUblockEnabled(await loadFeatures())) {
    effectiveEnabled = false;
  }
  const tracker = effectiveEnabled && opts.trackProgress ? createProgressTracker() : null;
  const onLog = tracker?.log;
  const state = effectiveEnabled
    ? (opts.refresh ? await refreshListsFromNetwork(onLog) : await resolveLists(true))
    : { catalogSource: "seed", catalogFetchedAt: 0, lists: {} };
  if (effectiveEnabled && !isUblockEnabled(await loadFeatures())) {
    effectiveEnabled = false;
  }
  try {
    const status = await applyUblockLists(state, { enabled: effectiveEnabled, onLog });
    if (!effectiveEnabled) {
      tabHits.clear();
      void clearAllAdCounts();
    }
    await refreshBlockRuleIds();
    if (effectiveEnabled) {
      const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
      for (const tab of tabs) {
        if (tab.id != null) {
          void chrome.tabs.sendMessage(tab.id, { type: "FORMANT_UBLOCK_RULES_UPDATED" }).catch(() => {});
        }
      }
    }
    if (tracker) {
      const sec = ((Date.now() - tracker.startedAt) / 1000).toFixed(1);
      await tracker.finish(`更新完成，总耗时 ${sec}s（网络 ${status.ruleCount} 条）`);
    }
    return status;
  } catch (error) {
    console.warn("[formant] uBO apply failed, keeping previous DNR", error);
    const prev = await loadUblockStatus();
    const status = {
      ...prev,
      enabled: effectiveEnabled,
      lastError: error instanceof Error ? error.message : String(error),
      lastUpdated: Date.now(),
    };
    await chrome.storage.local.set({ [UBLOCK_STATUS_KEY]: status });
    if (tracker) {
      const msg = error instanceof Error ? error.message : String(error);
      await tracker.finish(`更新失败: ${msg}`);
    }
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

function todayKey() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

async function markAutoUpdatedToday() {
  await chrome.storage.local.set({ [UBLOCK_AUTO_DATE_KEY]: todayKey() }).catch(() => {});
}

/** Run at most once per local calendar day when formant activates. */
function maybeDailyAutoUpdate() {
  void enqueue(async () => {
    const features = await loadFeatures();
    if (!isUblockEnabled(features)) return;
    const today = todayKey();
    const stored = await chrome.storage.local.get(UBLOCK_AUTO_DATE_KEY);
    if (stored?.[UBLOCK_AUTO_DATE_KEY] === today) return;
    await applyNow(true, { refresh: true });
    await markAutoUpdatedToday();
  }).catch((error) => {
    console.warn("[formant] uBO daily auto-update failed", error);
  });
}

function onRuleMatched(info) {
  const tabId = info?.request?.tabId;
  const ruleId = info?.rule?.ruleId;
  const rulesetId = info?.rule?.rulesetId;
  if (!Number.isInteger(tabId) || tabId < 0) return;
  const isStatic = typeof rulesetId === "string" && STATIC_RULESET_SET.has(rulesetId);
  const isDynamic =
    typeof ruleId === "number" &&
    ruleId >= UBLOCK_RULE_ID_MIN &&
    ruleId <= UBLOCK_RULE_ID_MAX &&
    blockRuleIds.has(ruleId);
  if (!isStatic && !isDynamic) return;
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
    void setTabAdCount(details.tabId, 0);
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabHits.delete(tabId);
    clearTabIcon(tabId);
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== UBLOCK_ALARM) return;
    maybeDailyAutoUpdate();
  });

  if (chrome.runtime?.onStartup) {
    chrome.runtime.onStartup.addListener(() => {
      maybeDailyAutoUpdate();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[UBLOCK_CONFIG_KEY]) {
      void enqueue(async () => {
        const features = await loadFeatures();
        if (!isUblockEnabled(features)) return;
        await applyNow(true, { refresh: false });
        await syncContentScripts(true);
      }).catch((error) => {
        console.warn("[formant] uBO config update failed", error);
      });
    }
    if (!changes[FEATURES_KEY]) return;
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
  maybeDailyAutoUpdate();
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

  if (type === "FORMANT_TAB_PAGE_INFO") {
    maybeDailyAutoUpdate();
    const reqTabId = /** @type {{ tabId?: number }} */ (message).tabId;
    void (async () => {
      let tabId = Number.isInteger(reqTabId) ? reqTabId : undefined;
      if (tabId == null) {
        const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        tabId = active?.id;
      }
      const info = tabId != null ? getTabIconInfo(tabId) : { framework: null, frameworkName: null, adCount: 0 };
      return { ok: true, ...info };
    })().then(sendResponse);
    return true;
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
    const now = new Date();
    const ts = `[${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}]`;
    void chrome.storage.local.set({
      [UBLOCK_PROGRESS_KEY]: {
        running: true,
        startedAt: Date.now(),
        updatedAt: Date.now(),
        logs: [applyJob ? `${ts} 正在等待前一个后台任务完成...` : `${ts} 已提交更新任务，正在连接 CDN...`],
      },
    });
    void enqueue(async () => {
      const features = await loadFeatures();
      if (!isUblockEnabled(features)) {
        await syncContentScripts(false);
        return applyNow(false, { refresh: false });
      }
      const status = await applyNow(true, { refresh: true, trackProgress: true });
      await markAutoUpdatedToday();
      void syncContentScripts(true);
      return status;
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
