import { isAutopagerizeEnabled, loadFeatures } from "./features.js";
import {
  AUTOPAGERIZE_SITEINFO_KEY,
  AUTOPAGERIZE_SITEINFO_VERSION,
  AUTOPAGERIZE_SITEINFO_VERSION_KEY,
  AUTOPAGERIZE_SETTINGS_KEY,
  loadAutopagerizeSettings,
  normalizeAutopagerizeSettings,
} from "./autopagerize-config.js";

const SITEINFO_URL = chrome.runtime.getURL("autopagerize/siteinfo.json");

/** @type {Array<{ url: string, nextLink: string, pageElement: string, insertBefore?: string }> | null} */
let cachedSiteinfo = null;

/**
 * Loads the bundled siteinfo into chrome.storage on first install / version bump.
 * Subsequent loads read from storage to avoid re-fetching the 480KB file.
 */
export async function ensureSiteinfo() {
  if (cachedSiteinfo) return cachedSiteinfo;
  const data = await chrome.storage.local.get([
    AUTOPAGERIZE_SITEINFO_KEY,
    AUTOPAGERIZE_SITEINFO_VERSION_KEY,
  ]);
  const storedVersion = data[AUTOPAGERIZE_SITEINFO_VERSION_KEY];
  if (
    storedVersion === AUTOPAGERIZE_SITEINFO_VERSION &&
    Array.isArray(data[AUTOPAGERIZE_SITEINFO_KEY]) &&
    data[AUTOPAGERIZE_SITEINFO_KEY].length
  ) {
    cachedSiteinfo = data[AUTOPAGERIZE_SITEINFO_KEY];
    return cachedSiteinfo;
  }
  try {
    const response = await fetch(SITEINFO_URL);
    const json = await response.json();
    if (Array.isArray(json) && json.length) {
      cachedSiteinfo = json;
      await chrome.storage.local.set({
        [AUTOPAGERIZE_SITEINFO_KEY]: json,
        [AUTOPAGERIZE_SITEINFO_VERSION_KEY]: AUTOPAGERIZE_SITEINFO_VERSION,
      });
      return json;
    }
  } catch (error) {
    console.warn("[formant] AutoPagerize siteinfo load failed", error);
  }
  cachedSiteinfo = [];
  return cachedSiteinfo;
}

/**
 * Returns siteinfo entries whose url pattern matches the given page URL.
 * @param {string} pageUrl
 */
async function matchingSiteinfo(pageUrl) {
  const siteinfo = await ensureSiteinfo();
  return siteinfo.filter((entry) => {
    try {
      return new RegExp(entry.url).test(pageUrl);
    } catch {
      return false;
    }
  });
}

/**
 * Fetches a next-page URL with the extension's host permissions.
 * Strips scripts from the response and returns raw HTML.
 * @param {string} url
 */
async function fetchPage(url) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  return { html, finalUrl: response.url || url };
}

/**
 * @param {chrome.runtime.MessageSender} sender
 */
function isContentSender(sender) {
  return Boolean(sender.tab?.id);
}

/**
 * @param {unknown} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {(response: unknown) => void} sendResponse
 * @returns {boolean}
 */
export function handleAutopagerizeMessage(message, sender, sendResponse) {
  if (!message || typeof message.type !== "string") return false;

  if (message.type === "FORMANT_AUTOPAGERIZE_FETCH") {
    if (!isContentSender(sender)) return false;
    void fetchPage(String(message.url || ""))
      .then(({ html, finalUrl }) => sendResponse({ ok: true, html, finalUrl }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (message.type === "FORMANT_AUTOPAGERIZE_SITEINFO") {
    if (!isContentSender(sender)) return false;
    void matchingSiteinfo(String(message.url || ""))
      .then((siteinfo) => sendResponse({ ok: true, siteinfo }))
      .catch(() => sendResponse({ ok: false, siteinfo: [] }));
    return true;
  }

  return false;
}

/**
 * Called from background.js to initialize the AutoPagerize bridge.
 */
export async function initAutopagerizeBackground() {
  await ensureSiteinfo().catch(() => {});
}

/**
 * Broadcasts updated settings to all tabs so content scripts can reload.
 */
export async function broadcastSettings() {
  const settings = await loadAutopagerizeSettings();
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !/^https?:\/\//.test(tab.url || "")) continue;
    void chrome.tabs.sendMessage(tab.id, {
      type: "FORMANT_AUTOPAGERIZE_UPDATE_SETTINGS",
      settings,
    }).catch(() => {});
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[AUTOPAGERIZE_SETTINGS_KEY]) {
    void broadcastSettings();
  }
});
