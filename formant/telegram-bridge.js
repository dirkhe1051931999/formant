import { isTelegramEnabled, loadFeatures } from "./features.js";

const HTTP_URL = /^https?:\/\//i;

/**
 * @param {string} name
 */
function safeFilename(name) {
  const cleaned = String(name || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim();
  return cleaned.slice(0, 180) || "telegram-media";
}

/**
 * Small http(s) images can go through chrome.downloads; blob/stream stays in the page hook.
 * @param {unknown} url
 * @param {unknown} filename
 */
export async function saveTelegramUrl(url, filename) {
  const features = await loadFeatures();
  if (!isTelegramEnabled(features)) throw new Error("Telegram 下载已关闭");
  const href = String(url || "").trim();
  if (!HTTP_URL.test(href)) throw new Error("仅支持 http(s) 地址");
  await chrome.downloads.download({
    url: href,
    filename: safeFilename(filename),
    saveAs: false,
    conflictAction: "uniquify",
  });
}

/**
 * @param {unknown} message
 * @param {chrome.runtime.MessageSender} _sender
 * @param {(response?: unknown) => void} sendResponse
 */
export function handleTelegramMessage(message, _sender, sendResponse) {
  if (message?.type !== "FORMANT_TELEGRAM_SAVE_URL") return false;
  void saveTelegramUrl(message.url, message.filename)
    .then(() => sendResponse({ ok: true }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  return true;
}
