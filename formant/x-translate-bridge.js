import { isXTranslateEnabled, loadFeatures } from "./features.js";
import { translateGooglePa } from "./translate-api.js";

/**
 * X timeline only: Google PA, never mono / GPT / DeepLX.
 * @param {unknown} q
 * @param {unknown} target
 */
export async function translateXTweet(q, target) {
  const features = await loadFeatures();
  if (!isXTranslateEnabled(features)) throw new Error("X 推文翻译已关闭");
  const text = String(q || "").trim();
  if (!text) throw new Error("空文本");
  return translateGooglePa({
    q: text,
    source: "auto",
    target: typeof target === "string" ? target : "auto",
  });
}

/**
 * @param {unknown} message
 * @param {chrome.runtime.MessageSender} _sender
 * @param {(response?: unknown) => void} sendResponse
 */
export function handleXTranslateMessage(message, _sender, sendResponse) {
  if (message?.type !== "FORMANT_X_TRANSLATE") return false;
  void translateXTweet(message.q, message.target)
    .then((result) =>
      sendResponse({
        ok: true,
        text: result.text,
        source: result.source,
        target: result.target,
      }),
    )
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  return true;
}
