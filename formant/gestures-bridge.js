import { isGesturesEnabled, loadFeatures } from "./features.js";

/**
 * @param {unknown} action
 * @param {chrome.tabs.Tab | undefined} tab
 */
export async function runGestureAction(action, tab) {
  const features = await loadFeatures();
  if (!isGesturesEnabled(features)) throw new Error("鼠标手势已关闭");
  const tabId = tab?.id;
  if (!tabId) throw new Error("当前标签不可用");

  if (action === "back") {
    await chrome.tabs.goBack(tabId);
    return;
  }
  if (action === "forward") {
    await chrome.tabs.goForward(tabId);
    return;
  }
  if (action === "reload") {
    await chrome.tabs.reload(tabId, { bypassCache: true });
    return;
  }
  if (action === "closeTab") {
    const url = String(tab.url || "");
    if (!/^https?:\/\//i.test(url)) throw new Error("只能关闭 http/https 标签");
    await chrome.tabs.remove(tabId);
    return;
  }
  if (action === "scrollTop" || action === "scrollBottom") {
    await chrome.tabs.sendMessage(tabId, { type: "FORMANT_GESTURE_SCROLL", edge: action === "scrollTop" ? "top" : "bottom" });
    return;
  }
  throw new Error("未知手势动作");
}

/**
 * @param {unknown} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {(response?: unknown) => void} sendResponse
 */
export function handleGestureMessage(message, sender, sendResponse) {
  if (message?.type !== "FORMANT_GESTURE_RUN") return false;
  void runGestureAction(message.action, sender.tab)
    .then(() => sendResponse({ ok: true }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  return true;
}
