import { isDiscordEnabled, loadFeatures } from "./features.js";
import { translateGooglePa, translateGpt } from "./translate-api.js";

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
 * Discord chat messages only: Google PA, never mono / GPT / DeepLX.
 * @param {unknown} q
 * @param {unknown} target
 */
export async function translateDiscordMessage(q, target) {
  const features = await loadFeatures();
  if (!isDiscordEnabled(features)) throw new Error("Discord 翻译已关闭");
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
 * Discord input box → English. Only on explicit user click.
 * google = translate-pa (same as X); gpt = mono GPT (uses Client API Key).
 * @param {unknown} q
 * @param {unknown} engine
 */
export async function translateDiscordInput(q, engine) {
  const features = await loadFeatures();
  if (!isDiscordEnabled(features)) throw new Error("Discord 翻译已关闭");
  const text = String(q || "").trim();
  if (!text) throw new Error("输入框是空的");
  if (engine === "gpt") {
    const data = await translateGpt({ q: text, source: "auto", target: "en" });
    const out = String(data?.text || "").trim();
    if (!out) throw new Error("GPT 翻译结果为空");
    return out;
  }
  const pieces = [];
  for (const piece of splitText(text)) {
    const result = await translateGooglePa({ q: piece, source: "auto", target: "en" });
    pieces.push(String(result.text || "").trim());
  }
  return pieces.filter(Boolean).join("\n").trim();
}

/**
 * @param {unknown} message
 * @param {chrome.runtime.MessageSender} _sender
 * @param {(response?: unknown) => void} sendResponse
 */
export function handleDiscordTranslateMessage(message, _sender, sendResponse) {
  if (message?.type === "FORMANT_DISCORD_INPUT_TRANSLATE") {
    void translateDiscordInput(message.q, message.engine)
      .then((text) => sendResponse({ ok: true, text }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }
  if (message?.type !== "FORMANT_DISCORD_TRANSLATE") return false;
  void translateDiscordMessage(message.q, message.target)
    .then((text) => sendResponse({ ok: true, text }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  return true;
}
