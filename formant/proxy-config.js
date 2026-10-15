/** Lightweight proxy preferences in chrome.storage.local. */

export const PROXY_SETTINGS_KEY = "formantProxy";

export const PROXY_BUILTIN = {
  DIRECT: "direct",
  SYSTEM: "system",
  PAC: "pac",
};

export const PROXY_SCHEMES = ["http", "https", "socks4", "socks5"];

export const MAX_PROXY_PROFILES = 5;

export const DEFAULT_PROXY_PORT = 7890;

export const DEFAULT_BYPASS_LIST = ["localhost", "127.0.0.1", "<local>"];

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   scheme: "http" | "https" | "socks4" | "socks5",
 *   host: string,
 *   port: number,
 *   bypassList: string[],
 * }} ProxyProfile
 */

/**
 * @typedef {{
 *   url: string,
 *   data: string,
 * }} ProxyPacConfig
 */

/**
 * @typedef {{
 *   activeId: string,
 *   profiles: ProxyProfile[],
 *   pac: ProxyPacConfig,
 * }} ProxySettings
 */

/** @type {ProxyPacConfig} */
export const DEFAULT_PAC = { url: "", data: "" };

/** @type {ProxySettings} */
export const DEFAULT_PROXY_SETTINGS = {
  activeId: PROXY_BUILTIN.SYSTEM,
  profiles: [],
  pac: { ...DEFAULT_PAC },
};

/**
 * @param {unknown} value
 * @returns {string}
 */
function asScheme(value) {
  const scheme = String(value || "").toLowerCase();
  return PROXY_SCHEMES.includes(scheme) ? scheme : "http";
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function asPort(value, fallback = DEFAULT_PROXY_PORT) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const port = Math.floor(n);
  if (port < 1 || port > 65535) return fallback;
  return port;
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeBypassList(raw) {
  const items = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean);
  const unique = [];
  const seen = new Set();
  for (const item of items) {
    const key = String(item).trim();
    if (!key || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    unique.push(key);
  }
  return unique.length ? unique : [...DEFAULT_BYPASS_LIST];
}

/**
 * @param {unknown} raw
 * @returns {ProxyPacConfig}
 */
export function normalizePac(raw) {
  const source = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  return {
    url: String(source.url || "").trim(),
    data: String(source.data || "").trim(),
  };
}

/**
 * @param {ProxyPacConfig} pac
 */
export function hasPacConfig(pac) {
  return Boolean(pac?.url || pac?.data);
}

/**
 * @param {ProxyPacConfig} pac
 */
export function describePac(pac) {
  if (pac?.url) return pac.url;
  if (pac?.data) return `本地脚本（${pac.data.length} 字符）`;
  return "未配置";
}

/**
 * @param {unknown} raw
 * @returns {ProxyProfile | null}
 */
export function normalizeProxyProfile(raw) {
  if (!raw || typeof raw !== "object") return null;
  const source = /** @type {Record<string, unknown>} */ (raw);
  const id = String(source.id || "").trim();
  const host = String(source.host || "").trim();
  const name = String(source.name || "").trim() || host || "代理";
  if (!id || !host) return null;
  return {
    id,
    name: name.slice(0, 40),
    scheme: /** @type {ProxyProfile["scheme"]} */ (asScheme(source.scheme)),
    host,
    port: asPort(source.port, DEFAULT_PROXY_PORT),
    bypassList: normalizeBypassList(source.bypassList),
  };
}

/**
 * @param {unknown} raw
 * @returns {ProxySettings}
 */
export function normalizeProxySettings(raw) {
  const source = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const profiles = (Array.isArray(source.profiles) ? source.profiles : [])
    .map(normalizeProxyProfile)
    .filter(Boolean)
    .slice(0, MAX_PROXY_PROFILES);
  const pac = normalizePac(source.pac);
  let activeId = String(source.activeId || PROXY_BUILTIN.SYSTEM).trim() || PROXY_BUILTIN.SYSTEM;
  const validBuiltin =
    activeId === PROXY_BUILTIN.DIRECT ||
    activeId === PROXY_BUILTIN.SYSTEM ||
    (activeId === PROXY_BUILTIN.PAC && hasPacConfig(pac));
  if (!validBuiltin && !profiles.some((profile) => profile.id === activeId)) {
    activeId = PROXY_BUILTIN.SYSTEM;
  }
  return { activeId, profiles, pac };
}

/**
 * @returns {Promise<ProxySettings>}
 */
export async function loadProxySettings() {
  const data = await chrome.storage.local.get(PROXY_SETTINGS_KEY);
  return normalizeProxySettings(data[PROXY_SETTINGS_KEY]);
}

/**
 * @param {unknown} raw
 * @returns {Promise<ProxySettings>}
 */
export async function saveProxySettings(raw) {
  const next = normalizeProxySettings(raw);
  await chrome.storage.local.set({ [PROXY_SETTINGS_KEY]: next });
  return next;
}

/**
 * @param {string} activeId
 * @returns {Promise<ProxySettings>}
 */
export async function setActiveProxyId(activeId) {
  const current = await loadProxySettings();
  return saveProxySettings({ ...current, activeId });
}

/**
 * @returns {string}
 */
export function createProxyProfileId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {ProxySettings} settings
 * @returns {{ id: string, label: string, kind: "builtin" | "profile" | "pac" }[]}
 */
export function listProxyChoices(settings) {
  /** @type {{ id: string, label: string, kind: "builtin" | "profile" | "pac" }[]} */
  const items = [
    { id: PROXY_BUILTIN.DIRECT, label: "直连", kind: "builtin" },
    { id: PROXY_BUILTIN.SYSTEM, label: "系统", kind: "builtin" },
  ];
  if (hasPacConfig(settings.pac)) {
    items.push({ id: PROXY_BUILTIN.PAC, label: "PAC", kind: "pac" });
  }
  for (const profile of settings.profiles) {
    items.push({ id: profile.id, label: profile.name, kind: "profile" });
  }
  return items;
}
