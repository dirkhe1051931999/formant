import { isHlsEnabled, loadFeatures } from "./features.js";
import { isTxtListUrl, looksLikeChannelList } from "./hls/m3u-lib.js";

const PLAYER_PATH = "hls/player.html";

/**
 * @param {string} raw
 * @returns {string}
 */
export function hlsPlayerUrl(raw) {
  return `${chrome.runtime.getURL(PLAYER_PATH)}#${encodeURIComponent(raw)}`;
}

/**
 * http(s) pathname ends with .m3u8 / .m3u / .txt. Query and hash are ignored.
 * @param {string} raw
 * @returns {boolean}
 */
export function isHlsNavUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const path = url.pathname.toLowerCase();
    return path.endsWith(".m3u8") || path.endsWith(".m3u") || path.endsWith(".txt");
  } catch {
    return false;
  }
}

/**
 * @param {string} raw
 * @returns {Promise<boolean>}
 */
async function txtLooksLikePlaylist(raw) {
  if (!isTxtListUrl(raw)) return true;
  try {
    const res = await fetch(raw, { credentials: "include" });
    if (!res.ok) return false;
    return looksLikeChannelList(await res.text());
  } catch {
    return false;
  }
}

/**
 * @param {number | undefined} tabId
 * @param {string} raw
 */
async function openPlayer(tabId, raw) {
  const url = hlsPlayerUrl(raw);
  if (tabId) {
    await chrome.tabs.update(tabId, { url });
    return;
  }
  await chrome.tabs.create({ url });
}

/** Redirect main-frame .m3u8 / .m3u / IPTV .txt navigations and the m3u8 omnibox keyword. */
export function initHlsBackground() {
  chrome.webNavigation.onBeforeNavigate.addListener(
    async (details) => {
      try {
        if (details.frameId !== 0) return;
        if (!isHlsNavUrl(details.url)) return;
        const features = await loadFeatures();
        if (!isHlsEnabled(features)) return;
        if (!(await txtLooksLikePlaylist(details.url))) return;
        await openPlayer(details.tabId, details.url);
      } catch (error) {
        console.warn("[formant] HLS redirect failed", error);
      }
    },
    { url: [{ urlMatches: ".*\\.m3u8?.*" }, { urlMatches: ".*\\.txt.*" }] }
  );

  chrome.omnibox.setDefaultSuggestion({
    description: "用 formant 播放这个 HLS 地址",
  });

  chrome.omnibox.onInputEntered.addListener(async (input) => {
    try {
      const text = String(input || "").trim();
      if (!text) return;
      const features = await loadFeatures();
      if (!isHlsEnabled(features)) return;
      const [tab] = await chrome.tabs.query({ currentWindow: true, active: true });
      await openPlayer(tab && tab.id, text);
    } catch (error) {
      console.warn("[formant] HLS omnibox failed", error);
    }
  });
}
