/**
 * Lightweight helpers around chrome.management for the options panel.
 * Does not embed third-party Extension Manager bundles.
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   enabled: boolean,
 *   mayDisable: boolean,
 *   installType: string,
 *   version: string,
 *   optionsUrl: string,
 *   homepageUrl: string,
 *   iconUrl: string,
 * }} FormantManagedExtension
 */

/**
 * @param {chrome.management.ExtensionInfo} info
 * @returns {string}
 */
function pickIconUrl(info) {
  const icons = Array.isArray(info.icons) ? [...info.icons] : [];
  if (!icons.length) return "";
  icons.sort((a, b) => Number(b.size || 0) - Number(a.size || 0));
  const preferred = icons.find((icon) => Number(icon.size || 0) >= 48) || icons[0];
  return preferred?.url || "";
}

/**
 * @param {chrome.management.ExtensionInfo} info
 * @returns {FormantManagedExtension | null}
 */
export function normalizeManagedExtension(info) {
  if (!info || info.type !== "extension") return null;
  if (info.id === chrome.runtime.id) return null;
  return {
    id: info.id,
    name: String(info.name || info.id),
    description: String(info.description || ""),
    enabled: Boolean(info.enabled),
    mayDisable: info.mayDisable !== false,
    installType: String(info.installType || ""),
    version: String(info.version || ""),
    optionsUrl: String(info.optionsUrl || ""),
    homepageUrl: String(info.homepageUrl || ""),
    iconUrl: pickIconUrl(info),
  };
}

/**
 * @returns {Promise<FormantManagedExtension[]>}
 */
export async function listManagedExtensions() {
  const all = await chrome.management.getAll();
  return all
    .map(normalizeManagedExtension)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

/**
 * @param {FormantManagedExtension[]} items
 * @param {string} query
 */
export function filterManagedExtensions(items, query) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q),
  );
}

/**
 * @param {string} id
 * @param {boolean} enabled
 */
export async function setManagedExtensionEnabled(id, enabled) {
  if (!id || id === chrome.runtime.id) {
    throw new Error("不能禁用 formant 自身");
  }
  await chrome.management.setEnabled(id, enabled);
}

/**
 * @param {(items: FormantManagedExtension[]) => void} onChange
 * @returns {() => void} unsubscribe
 */
export function subscribeManagedExtensions(onChange) {
  const refresh = () => {
    void listManagedExtensions()
      .then(onChange)
      .catch((error) => console.warn("[formant] management list failed", error));
  };

  const installed = () => refresh();
  const uninstalled = () => refresh();
  const enabled = () => refresh();
  const disabled = () => refresh();

  chrome.management.onInstalled.addListener(installed);
  chrome.management.onUninstalled.addListener(uninstalled);
  chrome.management.onEnabled.addListener(enabled);
  chrome.management.onDisabled.addListener(disabled);

  return () => {
    chrome.management.onInstalled.removeListener(installed);
    chrome.management.onUninstalled.removeListener(uninstalled);
    chrome.management.onEnabled.removeListener(enabled);
    chrome.management.onDisabled.removeListener(disabled);
  };
}
