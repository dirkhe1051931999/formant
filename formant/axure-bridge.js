import { isAxureEnabled, loadFeatures } from "./features.js";

/**
 * @param {number} tabId
 * @param {string} payload
 */
async function fanOut(tabId, payload) {
  const frames = await chrome.webNavigation.getAllFrames({ tabId });
  await Promise.all(
    (frames || []).map((frame) =>
      chrome.tabs
        .sendMessage(
          tabId,
          { type: "FORMANT_AXURE_ROUTE", data: payload },
          { frameId: frame.frameId },
        )
        .catch(() => {}),
    ),
  );
}

/**
 * @param {unknown} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {(response?: unknown) => void} sendResponse
 */
export function handleAxureMessage(message, sender, sendResponse) {
  if (!message || typeof message !== "object") return false;
  if (/** @type {{ type?: string }} */ (message).type !== "FORMANT_AXURE_ROUTE") return false;
  const tabId = sender.tab?.id;
  const url = sender.tab?.url || "";
  if (tabId == null || !url.startsWith("file:")) {
    sendResponse({ ok: false });
    return true;
  }
  const data = /** @type {{ data?: unknown }} */ (message).data;
  const payload = typeof data === "string" ? data : "";
  void (async () => {
    const features = await loadFeatures();
    if (!isAxureEnabled(features)) {
      sendResponse({ ok: false });
      return;
    }
    await fanOut(tabId, payload);
    sendResponse({ ok: true });
  })().catch(() => {
    sendResponse({ ok: false });
  });
  return true;
}
