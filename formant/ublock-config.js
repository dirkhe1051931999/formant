import { SUBSCRIBED_LISTS } from "./ublock-sync.js";

export const UBLOCK_CONFIG_KEY = "formantUblockConfig";

export const UBLOCK_LIST_META = [
  { id: "ublock-filters", label: "uBlock filters – Ads" },
  { id: "ublock-badware", label: "uBlock filters – Badware risks" },
  { id: "ublock-privacy", label: "uBlock filters – Privacy" },
  { id: "ublock-quick-fixes", label: "uBlock filters – Quick fixes" },
  { id: "ublock-unbreak", label: "uBlock filters – Unbreak" },
  { id: "easylist", label: "EasyList" },
  { id: "easyprivacy", label: "EasyPrivacy" },
  { id: "CHN-0", label: "AdGuard Chinese (中文规则)" },
  { id: "plowe-0", label: "Peter Lowe's Ad and tracking server list" },
  { id: "urlhaus-1", label: "Online Malicious URL Blocklist" },
];

/**
 * @typedef {{
 *   lists: Record<string, boolean>,
 *   cosmetic: boolean,
 *   scriptlets: boolean,
 *   badge: boolean,
 *   trustedSites: string[],
 *   customFilters: string,
 * }} UblockConfig
 */

/** @type {UblockConfig} */
export const DEFAULT_UBLOCK_CONFIG = {
  lists: Object.fromEntries(SUBSCRIBED_LISTS.map((id) => [id, true])),
  cosmetic: true,
  scriptlets: true,
  badge: true,
  trustedSites: [],
  customFilters: "",
};

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizeTrustedHost(raw) {
  let s = String(raw || "").trim().toLowerCase();
  if (!s || s.startsWith("#") || s.startsWith("!")) return "";
  s = s.replace(/^[a-z]+:\/\//, "").split("/")[0].split(":")[0].replace(/^\.+|\.+$/g, "");
  if (!s || !/^[a-z0-9.-]+$/.test(s)) return "";
  return s;
}

/**
 * @param {unknown} raw
 * @returns {UblockConfig}
 */
export function normalizeUblockConfig(raw) {
  const src = raw && typeof raw === "object" ? /** @type {Record<string, any>} */ (raw) : {};
  const listsIn = src.lists && typeof src.lists === "object" ? src.lists : {};
  /** @type {Record<string, boolean>} */
  const lists = {};
  for (const id of SUBSCRIBED_LISTS) {
    lists[id] = typeof listsIn[id] === "boolean" ? listsIn[id] : true;
  }
  const rawSites = Array.isArray(src.trustedSites)
    ? src.trustedSites
    : typeof src.trustedSites === "string"
      ? src.trustedSites.split(/\r?\n/)
      : [];
  const trustedSites = [...new Set(rawSites.map(normalizeTrustedHost).filter(Boolean))];
  return {
    lists,
    cosmetic: typeof src.cosmetic === "boolean" ? src.cosmetic : true,
    scriptlets: typeof src.scriptlets === "boolean" ? src.scriptlets : true,
    badge: typeof src.badge === "boolean" ? src.badge : true,
    trustedSites,
    customFilters: typeof src.customFilters === "string" ? src.customFilters : "",
  };
}

/**
 * @returns {Promise<UblockConfig>}
 */
export async function loadUblockConfig() {
  if (typeof chrome?.storage?.local?.get !== "function") {
    return normalizeUblockConfig(DEFAULT_UBLOCK_CONFIG);
  }
  const data = await chrome.storage.local.get(UBLOCK_CONFIG_KEY);
  return normalizeUblockConfig(data?.[UBLOCK_CONFIG_KEY]);
}

/**
 * @param {UblockConfig} config
 * @returns {Promise<UblockConfig>}
 */
export async function saveUblockConfig(config) {
  const next = normalizeUblockConfig(config);
  await chrome.storage.local.set({ [UBLOCK_CONFIG_KEY]: next });
  return next;
}

/**
 * @param {string} hostname
 * @param {string[]} trustedSites
 * @returns {boolean}
 */
export function isTrustedHost(hostname, trustedSites) {
  if (!hostname || !Array.isArray(trustedSites) || !trustedSites.length) return false;
  const host = hostname.toLowerCase();
  return trustedSites.some((site) => host === site || host.endsWith(`.${site}`));
}
