/** AutoPagerize preferences persisted in chrome.storage.local. */
export const AUTOPAGERIZE_SETTINGS_KEY = "formantAutopagerize";
export const AUTOPAGERIZE_SITEINFO_KEY = "formantAutopagerizeSiteinfo";
export const AUTOPAGERIZE_SITEINFO_VERSION_KEY = "formantAutopagerizeSiteinfoVersion";
/** Bump when bundled siteinfo.json changes so storage cache is refreshed. */
export const AUTOPAGERIZE_SITEINFO_VERSION = 2;

/**
 * @typedef {{
 *   displayMessageBar: boolean,
 *   excludePatterns: string,
 *   customSiteinfo: Array<{ url: string, nextLink: string, pageElement: string, insertBefore?: string }>,
 * }} AutopagerizeSettings
 */

/** @type {AutopagerizeSettings} */
export const DEFAULT_AUTOPAGERIZE_SETTINGS = {
  displayMessageBar: true,
  excludePatterns: "",
  customSiteinfo: [],
};

/**
 * @param {unknown} raw
 * @returns {AutopagerizeSettings}
 */
export function normalizeAutopagerizeSettings(raw) {
  const source = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const customSiteinfo = Array.isArray(source.customSiteinfo) ? source.customSiteinfo : [];
  return {
    displayMessageBar: source.displayMessageBar !== false,
    excludePatterns: String(source.excludePatterns || ""),
    customSiteinfo: customSiteinfo.filter(
      (item) =>
        item && typeof item === "object" && typeof item.url === "string" && typeof item.nextLink === "string" && typeof item.pageElement === "string",
    ),
  };
}

/**
 * @returns {Promise<AutopagerizeSettings>}
 */
export async function loadAutopagerizeSettings() {
  const data = await chrome.storage.local.get(AUTOPAGERIZE_SETTINGS_KEY);
  return normalizeAutopagerizeSettings(data[AUTOPAGERIZE_SETTINGS_KEY]);
}

/**
 * @param {unknown} raw
 * @returns {Promise<AutopagerizeSettings>}
 */
export async function saveAutopagerizeSettings(raw) {
  const next = normalizeAutopagerizeSettings(raw);
  await chrome.storage.local.set({ [AUTOPAGERIZE_SETTINGS_KEY]: next });
  return next;
}
