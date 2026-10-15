/** DeepLX API key. Local only, included in option.html#sync key export. */

export const DEEPLX_KEY = "formantDeeplx";

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeDeeplxApiKey(raw) {
  if (typeof raw === "string") return raw.trim();
  if (!raw || typeof raw !== "object") return "";
  return String(/** @type {{ apiKey?: unknown }} */ (raw).apiKey || "").trim();
}

export async function loadDeeplxApiKey() {
  const data = await chrome.storage.local.get(DEEPLX_KEY);
  return normalizeDeeplxApiKey(data[DEEPLX_KEY]);
}

/**
 * @param {unknown} apiKey
 */
export async function saveDeeplxApiKey(apiKey) {
  const next = normalizeDeeplxApiKey(apiKey);
  await chrome.storage.local.set({ [DEEPLX_KEY]: { apiKey: next } });
  return next;
}
