/** Public GitHub download preferences persisted in chrome.storage.local. */
export const GITZIP_SETTINGS_KEY = "formantGitzip";

/** @typedef {{ selectBehaviour: "both" | "single-check" | "double-click", theme: "default" | "light" | "dark" }} GitzipSettings */

/** @type {GitzipSettings} */
export const DEFAULT_GITZIP_SETTINGS = {
  selectBehaviour: "both",
  theme: "default",
};

/**
 * @param {unknown} value
 * @param {readonly string[]} values
 * @param {string} fallback
 */
function enumValue(value, values, fallback) {
  return typeof value === "string" && values.includes(value) ? value : fallback;
}

/**
 * @param {unknown} raw
 * @returns {GitzipSettings}
 */
export function normalizeGitzipSettings(raw) {
  const source = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  return {
    selectBehaviour: /** @type {GitzipSettings["selectBehaviour"]} */ (
      enumValue(source.selectBehaviour, ["both", "single-check", "double-click"], DEFAULT_GITZIP_SETTINGS.selectBehaviour)
    ),
    theme: /** @type {GitzipSettings["theme"]} */ (
      enumValue(source.theme, ["default", "light", "dark"], DEFAULT_GITZIP_SETTINGS.theme)
    ),
  };
}

/**
 * @returns {Promise<GitzipSettings>}
 */
export async function loadGitzipSettings() {
  const data = await chrome.storage.local.get(GITZIP_SETTINGS_KEY);
  return normalizeGitzipSettings(data[GITZIP_SETTINGS_KEY]);
}

/**
 * @param {unknown} raw
 * @returns {Promise<GitzipSettings>}
 */
export async function saveGitzipSettings(raw) {
  const next = normalizeGitzipSettings(raw);
  await chrome.storage.local.set({ [GITZIP_SETTINGS_KEY]: next });
  return next;
}
