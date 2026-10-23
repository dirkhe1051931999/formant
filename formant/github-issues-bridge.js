import { isGithubIssuesEnabled, loadFeatures } from "./features.js";
import { translateGooglePa } from "./translate-api.js";

const CHUNK = 1200;
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

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
 * GitHub issues only: Google PA, never mono / GPT / DeepLX.
 * Mixed Chinese-foreign text is left as-is.
 * @param {unknown} q
 */
export async function translateGithubIssues(q) {
  const features = await loadFeatures();
  if (!isGithubIssuesEnabled(features)) throw new Error("GitHub issues 翻译已关闭");
  const text = String(q || "").trim();
  if (!text) throw new Error("空文本");
  if (CJK.test(text)) return text;
  const pieces = [];
  for (const piece of splitText(text)) {
    const result = await translateGooglePa({
      q: piece,
      source: "auto",
      target: "zh-CN",
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
export function handleGithubIssuesTranslateMessage(message, _sender, sendResponse) {
  if (message?.type !== "FORMANT_GITHUB_ISSUES_TRANSLATE") return false;
  void translateGithubIssues(message.q)
    .then((text) => sendResponse({ ok: true, text }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  return true;
}
