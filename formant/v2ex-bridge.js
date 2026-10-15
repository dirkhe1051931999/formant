import { isV2exEnabled, loadFeatures } from "./features.js";
import {
  ensureV2exOptions,
  loadV2exOptions,
  V2EX_OPTIONS_KEY,
} from "./v2ex-options.js";
import { runV2exCheckin } from "./v2ex-plus/background/checkin.js";
import { refreshV2exUnreadBadge } from "./v2ex-plus/background/notifications.js";

export const V2EX_MENU_SOV2EX = "formant.v2ex.sov2ex";

const V2EX_CHECKIN_ALARM = "formant-v2ex-checkin";
const V2EX_NOTIFICATIONS_ALARM = "formant-v2ex-notifications";
const V2EX_WEIBO_RULESET = "v2ex_weibo_images";

let initialized = false;
/** @type {() => void} */
let refreshMenus = () => {};

/**
 * @returns {Promise<boolean>}
 */
async function isV2exRuntimeEnabled() {
  return isV2exEnabled(await loadFeatures());
}

async function configureV2exAlarms() {
  const [features, options] = await Promise.all([loadFeatures(), ensureV2exOptions()]);
  if (!isV2exEnabled(features)) {
    await chrome.alarms.clear(V2EX_CHECKIN_ALARM);
    await chrome.alarms.clear(V2EX_NOTIFICATIONS_ALARM);
    await chrome.action.setBadgeText({ text: "" });
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      disableRulesetIds: [V2EX_WEIBO_RULESET],
    });
    return;
  }

  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: [V2EX_WEIBO_RULESET],
  });

  if (options.checkin) {
    chrome.alarms.create(V2EX_CHECKIN_ALARM, { periodInMinutes: 5 });
  } else {
    await chrome.alarms.clear(V2EX_CHECKIN_ALARM);
  }

  if (options.msgNote) {
    chrome.alarms.create(V2EX_NOTIFICATIONS_ALARM, { periodInMinutes: 3 });
  } else {
    await chrome.alarms.clear(V2EX_NOTIFICATIONS_ALARM);
    await chrome.action.setBadgeText({ text: "" });
  }
}

/**
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function runV2exCheckinIfEnabled() {
  if (!(await isV2exRuntimeEnabled())) {
    return { status: "disabled", message: "V2EX Plus 功能已关闭" };
  }
  return runV2exCheckin(await loadV2exOptions());
}

/**
 * @returns {Promise<{ status: string, unread: string }>}
 */
export async function refreshV2exBadgeIfEnabled() {
  if (!(await isV2exRuntimeEnabled())) {
    await chrome.action.setBadgeText({ text: "" });
    return { status: "disabled", unread: "" };
  }
  return refreshV2exUnreadBadge(await loadV2exOptions());
}

/**
 * @param {{ id: string, title: string, contexts: chrome.contextMenus.ContextType[] }} create
 * @param {import("./features.js").FormantFeatures} features
 * @param {import("./v2ex-options.js").V2exOptions} options
 */
export function addV2exContextMenus(create, features, options) {
  if (!isV2exEnabled(features) || !options.sov2exMenu) return;
  create({
    id: V2EX_MENU_SOV2EX,
    title: "使用 sov2ex 搜索 “%s”",
    contexts: ["selection"],
  });
}

/**
 * @param {chrome.contextMenus.OnClickData} info
 * @returns {Promise<boolean>}
 */
export async function handleV2exContextMenu(info) {
  if (info.menuItemId !== V2EX_MENU_SOV2EX) return false;
  const [features, options] = await Promise.all([loadFeatures(), loadV2exOptions()]);
  if (!isV2exEnabled(features) || !options.sov2exMenu) return true;
  const query = String(info.selectionText || "").trim();
  if (!query) return true;
  await chrome.tabs.create({
    url: `https://www.sov2ex.com/?q=${encodeURIComponent(query)}`,
  });
  return true;
}

/**
 * @param {{ refreshContextMenus: () => void }} api
 */
export async function initV2exBackground(api) {
  refreshMenus = api.refreshContextMenus;
  if (initialized) {
    await configureV2exAlarms();
    return;
  }
  initialized = true;

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === V2EX_CHECKIN_ALARM) {
      void runV2exCheckinIfEnabled().catch((error) => {
        console.warn("[formant] V2EX auto check-in failed", error);
      });
    }
    if (alarm.name === V2EX_NOTIFICATIONS_ALARM) {
      void refreshV2exBadgeIfEnabled().catch((error) => {
        console.warn("[formant] V2EX unread refresh failed", error);
      });
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    const v2exOptionsChanged = area === "sync" && Boolean(changes[V2EX_OPTIONS_KEY]);
    const v2exFeatureChanged = area === "local" && Boolean(changes.formantFeatures);
    if (!v2exOptionsChanged && !v2exFeatureChanged) return;
    void configureV2exAlarms().catch((error) => {
      console.warn("[formant] V2EX alarm refresh failed", error);
    });
    refreshMenus();
  });

  await configureV2exAlarms();
  void runV2exCheckinIfEnabled().catch(() => {});
  void refreshV2exBadgeIfEnabled().catch(() => {});
}
