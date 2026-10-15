import { isElitepvpersEnabled, loadFeatures } from "./features.js";
import { translateGooglePa } from "./translate-api.js";

const CHUNK = 1200;

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitText(text) {
  if (text.length <= CHUNK) return [text];
  /** @type {string[]} */
  const parts = [];
  let rest = text;
  while (rest.length > CHUNK) {
    let cut = rest.lastIndexOf("\n", CHUNK);
    if (cut < CHUNK * 0.4) cut = rest.lastIndexOf(" ", CHUNK);
    if (cut < CHUNK * 0.4) cut = CHUNK;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

/**
 * elitepvpers titles and posts only: Google PA, never mono / GPT / DeepLX.
 * @param {unknown} q
 * @param {unknown} target
 */
export async function translateElitepvpers(q, target) {
  const features = await loadFeatures();
  if (!isElitepvpersEnabled(features)) throw new Error("elitepvpers 翻译已关闭");
  const text = String(q || "").trim();
  if (!text) throw new Error("空文本");
  const lang = typeof target === "string" ? target : "auto";
  const pieces = [];
  for (const piece of splitText(text)) {
    const result = await translateGooglePa({
      q: piece,
      source: "auto",
      target: lang,
    });
    pieces.push(String(result.text || "").trim());
  }
  return pieces.filter(Boolean).join("\n").trim();
}

/**
 * @param {unknown} message
 * @param {chrome.runtime.MessageSender} _sender
 * @param {(response?: unknown) => void} sendResponse
 */
export function handleElitepvpersTranslateMessage(message, _sender, sendResponse) {
  if (message?.type !== "FORMANT_ELITEPVPERS_TRANSLATE") return false;
  void translateElitepvpers(message.q, message.target)
    .then((text) => sendResponse({ ok: true, text }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  return true;
}
