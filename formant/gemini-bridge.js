import { isGeminiEnabled, loadFeatures } from "./features.js";

/**
 * @param {string} url
 */
function isGeminiImage(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname;
    if (host !== "googleusercontent.com" && !host.endsWith(".googleusercontent.com")) return false;
    const segment = parsed.pathname.split("/").filter(Boolean)[0] || "";
    return segment === "gg" || segment.startsWith("gg-") || segment.startsWith("rd-");
  } catch {
    return false;
  }
}

/**
 * @param {string | undefined} url
 */
function isGeminiTab(url) {
  try {
    const host = new URL(String(url || "")).hostname;
    return host === "gemini.google.com" || host === "business.gemini.google";
  } catch {
    return false;
  }
}

/**
 * @param {unknown} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {(response?: unknown) => void} sendResponse
 */
export function handleGeminiMessage(message, sender, sendResponse) {
  if (message?.type !== "FORMANT_GEMINI_FETCH") return false;
  const url = typeof message.url === "string" ? message.url : "";

  void (async () => {
    const features = await loadFeatures();
    if (!isGeminiEnabled(features)) throw new Error("Gemini 去水印已关闭");
    if (!isGeminiTab(sender.tab?.url) || !isGeminiImage(url)) throw new Error("不是 Gemini 成图");
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`拉取成图失败 ${res.status}`);
    const buffer = await res.arrayBuffer();
    sendResponse({
      ok: true,
      buffer,
      mime: res.headers.get("content-type") || "application/octet-stream",
    });
  })().catch((error) => {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  return true;
}
