/** X timeline tweet translation appearance. Not synced to mono. */
export const X_TRANSLATE_SETTINGS_KEY = "formantXTranslate";

const HEX = /^#[0-9A-Fa-f]{6}$/;
const MIN_SIZE = 10;
const MAX_SIZE = 24;

/** @typedef {{ color: string, textSize: number }} XTranslateSettings */

/** @type {XTranslateSettings} */
export const DEFAULT_X_TRANSLATE_SETTINGS = {
  color: "#8c8c8c",
  textSize: 14,
};

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeXTranslateColor(value) {
  const raw = String(value || "").trim();
  if (HEX.test(raw)) return raw.toLowerCase();
  return DEFAULT_X_TRANSLATE_SETTINGS.color;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeXTranslateSize(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_X_TRANSLATE_SETTINGS.textSize;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));
}

/**
 * @param {unknown} raw
 * @returns {XTranslateSettings}
 */
export function normalizeXTranslateSettings(raw) {
  const source = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  return {
    color: normalizeXTranslateColor(source.color),
    textSize: normalizeXTranslateSize(source.textSize),
  };
}

/**
 * @returns {Promise<XTranslateSettings>}
 */
export async function loadXTranslateSettings() {
  const data = await chrome.storage.local.get(X_TRANSLATE_SETTINGS_KEY);
  return normalizeXTranslateSettings(data[X_TRANSLATE_SETTINGS_KEY]);
}

/**
 * @param {unknown} raw
 * @returns {Promise<XTranslateSettings>}
 */
export async function saveXTranslateSettings(raw) {
  const next = normalizeXTranslateSettings(raw);
  await chrome.storage.local.set({ [X_TRANSLATE_SETTINGS_KEY]: next });
  return next;
}
