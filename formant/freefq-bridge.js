import { isFreefqEnabled, loadFeatures } from "./features.js";

/**
 * @param {string} name
 */
function safeFilename(name) {
  const cleaned = String(name || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  const base = cleaned.slice(0, 120) || "freefq-article";
  return base.toLowerCase().endsWith(".txt") ? base : `${base}.txt`;
}

/**
 * @param {unknown} text
 * @param {unknown} filename
 */
export async function saveFreefqTxt(text, filename) {
  const features = await loadFeatures();
  if (!isFreefqEnabled(features)) throw new Error("freefq 导出已关闭");
  const body = String(text || "");
  if (!body.trim()) throw new Error("正文为空");
  // BOM helps Notepad on Windows open UTF-8 correctly.
  const dataUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(`\uFEFF${body}`)}`;
  await chrome.downloads.download({
    url: dataUrl,
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
export function handleFreefqMessage(message, _sender, sendResponse) {
  if (message?.type !== "FORMANT_FREEQ_EXPORT_TXT") return false;
  void saveFreefqTxt(message.text, message.filename)
    .then(() => sendResponse({ ok: true }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  return true;
}
