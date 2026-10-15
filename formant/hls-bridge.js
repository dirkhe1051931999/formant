import { isHlsEnabled, loadFeatures } from "./features.js";

const PLAYER_PATH = "hls/player.html";

/**
 * @param {string} raw
 * @returns {string}
 */
export function hlsPlayerUrl(raw) {
  return `${chrome.runtime.getURL(PLAYER_PATH)}#${encodeURIComponent(raw)}`;
}

/**
 * http(s) pathname ends with .m3u8. Query and hash are ignored.
 * @param {string} raw
 * @returns {boolean}
 */
export function isM3u8Url(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.pathname.toLowerCase().endsWith(".m3u8");
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

/** Redirect main-frame .m3u8 navigations and the m3u8 omnibox keyword. */
export function initHlsBackground() {
  chrome.webNavigation.onBeforeNavigate.addListener(
    async (details) => {
      try {
        if (details.frameId !== 0) return;
        if (!isM3u8Url(details.url)) return;
        const features = await loadFeatures();
        if (!isHlsEnabled(features)) return;
        await openPlayer(details.tabId, details.url);
      } catch (error) {
        console.warn("[formant] HLS redirect failed", error);
      }
    },
    { url: [{ urlMatches: ".*\\.m3u8.*" }] }
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
