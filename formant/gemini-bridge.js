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

function isExportImage(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (
      parsed.hostname === "googleusercontent.com" || parsed.hostname.endsWith(".googleusercontent.com") ||
      parsed.hostname === "gstatic.com" || parsed.hostname.endsWith(".gstatic.com") ||
      parsed.hostname === "gemini.google.com"
    );
  } catch { return false; }
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
  if (message?.type !== "FORMANT_GEMINI_FETCH" && message?.type !== "FORMANT_GEMINI_EXPORT_IMAGE") return false;
  const url = typeof message.url === "string" ? message.url : "";

  void (async () => {
    const features = await loadFeatures();
    if (!isGeminiEnabled(features)) throw new Error("Gemini 功能已关闭");
    if (!isGeminiTab(sender.tab?.url) || (message.type === "FORMANT_GEMINI_FETCH" ? !isGeminiImage(url) : !isExportImage(url))) throw new Error("不支持的 Gemini 图片地址");
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`拉取成图失败 ${res.status}`);
    if (message.type === "FORMANT_GEMINI_EXPORT_IMAGE" && !/^image\//i.test(res.headers.get("content-type") || "")) throw new Error("附件不是图片");
    const buffer = await res.arrayBuffer();
    if (message.type === "FORMANT_GEMINI_EXPORT_IMAGE") {
      const bytes = new Uint8Array(buffer);
      let encoded = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        encoded += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      sendResponse({ ok: true, base64: btoa(encoded), mime: res.headers.get("content-type") || "image/png" });
      return;
    }
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
