/**
 * @typedef {"icon"|"text"|"folder"|"component"} ItemType
 * @typedef {"1x1"|"2x2"|"2x4"} ItemSize
 * @typedef {{
 *   id: string, name: string, type: ItemType, size: ItemSize,
 *   url?: string, src?: string, iconText?: string, backgroundColor?: string,
 *   component?: string, children?: NewtabItem[], order: number
 * }} NewtabItem
 * @typedef {{
 *   version: 2,
 *   baseConfig: {
 *     lang: string, useSearch: string, searchShow: boolean,
 *     wallpaperUrl: string, wallpaperMask: number,
 *     showClock: boolean, clock24h: boolean, showSearch: boolean,
 *     openLinksInNewWindow: boolean,
 *     locationId: string, cityName: string
 *   },
 *   nav: Array<{ id: string, name: string, children: NewtabItem[] }>,
 *   notes: Array<{ id: string, title: string, content: string, fixed: boolean, ct: number, ut: number }>
 * }} NewtabHome
 */

/** @returns {NewtabHome} */
export function createDefaultHome() {
  return {
    version: 2,
    baseConfig: {
      lang: "zh-CN",
      useSearch: "google",
      searchShow: false,
      wallpaperUrl: "",
      wallpaperMask: 0.12,
      showClock: false,
      clock24h: false,
      showSearch: false,
      openLinksInNewWindow: false,
      locationId: "",
      cityName: "",
    },
    nav: [{ id: "1", name: "主页", children: [] }],
    notes: [],
  };
}

/**
 * @param {unknown} input
 * @returns {NewtabHome}
 */
export function normalizeHome(input) {
  const defaults = createDefaultHome();
  if (!input || typeof input !== "object") return defaults;
  const body = /** @type {Record<string, unknown>} */ (input);

  if (Array.isArray(body.navConfig)) {
    return normalizeFromItab(body, defaults);
  }

  const base =
    body.baseConfig && typeof body.baseConfig === "object"
      ? /** @type {Record<string, unknown>} */ (body.baseConfig)
      : {};
  const navRaw = Array.isArray(body.nav) ? body.nav : defaults.nav;
  return {
    version: 2,
    baseConfig: {
      lang: String(base.lang || defaults.baseConfig.lang),
      useSearch: String(base.useSearch || defaults.baseConfig.useSearch),
      searchShow: base.searchShow === true,
      wallpaperUrl: String(base.wallpaperUrl || ""),
      wallpaperMask: Number.isFinite(Number(base.wallpaperMask))
        ? Math.min(0.85, Math.max(0, Number(base.wallpaperMask)))
        : defaults.baseConfig.wallpaperMask,
      showClock: false,
      clock24h: base.clock24h === true,
      showSearch: base.showSearch === true,
      openLinksInNewWindow: base.openLinksInNewWindow === true,
      locationId: String(base.locationId || "").trim(),
      cityName: String(base.cityName || "").trim(),
    },
    nav: navRaw.slice(0, 8).map((page, index) => normalizePage(page, index)),
    notes: normalizeNotes(body.notes),
  };
}

function normalizeFromItab(body, defaults) {
  const base =
    body.baseConfig && typeof body.baseConfig === "object"
      ? /** @type {Record<string, unknown>} */ (body.baseConfig)
      : {};
  const wallpaper =
    base.wallpaper && typeof base.wallpaper === "object"
      ? /** @type {Record<string, unknown>} */ (base.wallpaper)
      : {};
  const time =
    base.time && typeof base.time === "object"
      ? /** @type {Record<string, unknown>} */ (base.time)
      : {};
  const search =
    base.search && typeof base.search === "object"
      ? /** @type {Record<string, unknown>} */ (base.search)
      : {};
  return {
    version: 2,
    baseConfig: {
      ...defaults.baseConfig,
      useSearch: "google",
      wallpaperUrl: String(wallpaper.src || ""),
      wallpaperMask: Number(wallpaper.mask) || 0,
      showClock: false,
      clock24h: time.hour24 === true,
      showSearch: search.show === true,
    },
    nav: (Array.isArray(body.navConfig) ? body.navConfig : [])
      .slice(0, 8)
      .map((page, index) => normalizePage(page, index)),
    notes: normalizeNotes(body.notes),
  };
}

function normalizePage(page, index) {
  const row = page && typeof page === "object" ? page : {};
  const children = Array.isArray(row.children)
    ? row.children.map((item, i) => normalizeItem(item, i)).filter(Boolean)
    : [];
  return {
    id: String(row.id || `page-${index + 1}`),
    name: String(row.name || "主页"),
    children,
  };
}

function normalizeItem(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const type = ["icon", "text", "folder", "component"].includes(raw.type)
    ? raw.type
    : raw.url
      ? "icon"
      : null;
  if (!type) return null;
  /** @type {NewtabItem} */
  const item = {
    id: String(raw.id || `item-${index + 1}`),
    name: String(raw.name || "未命名"),
    type,
    size: ["1x1", "2x2", "2x4"].includes(raw.size) ? raw.size : "1x1",
    order: Number.isFinite(raw.order) ? Number(raw.order) : index,
  };
  if (raw.url) item.url = String(raw.url);
  if (raw.src) item.src = String(raw.src);
  if (raw.iconText) item.iconText = String(raw.iconText);
  if (raw.backgroundColor) item.backgroundColor = String(raw.backgroundColor);
  if (raw.component) item.component = String(raw.component);
  if (type === "folder" && Array.isArray(raw.children)) {
    item.children = raw.children.map((child, i) => normalizeItem(child, i)).filter(Boolean);
  }
  return item;
}

function normalizeNotes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 50).map((item, index) => {
    const row = item && typeof item === "object" ? item : {};
    const now = Date.now();
    return {
      id: String(row.id || `note-${index + 1}`),
      title: String(row.title || ""),
      content: String(row.content || ""),
      fixed: row.fixed === true,
      ct: Number(row.ct) || now,
      ut: Number(row.ut) || now,
    };
  });
}

/**
 * @param {NewtabHome} home
 * @param {string} query
 */
export function buildSearchUrl(home, query) {
  const q = query.trim();
  if (!q) return "";
  if (/^https?:\/\//i.test(q)) return q;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(q)) {
    return `https://${q}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export function createItemId() {
  return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** @param {NewtabHome} home */
export function currentPage(home) {
  return home.nav[0] || { id: "1", name: "主页", children: [] };
}

/** Visible shortcut tiles (skip weather/holiday component placeholders). */
export function countVisibleHomeItems(home) {
  return currentPage(normalizeHome(home)).children.filter((item) => item.type !== "component").length;
}

export const ITEM_BG_COLORS = [
  "#ffffff",
  "#f3f4f6",
  "#fee2e2",
  "#ffedd5",
  "#fef3c7",
  "#dcfce7",
  "#e0f2fe",
  "#dde4ff",
  "#f3e8ff",
  "#1f2937",
];

/**
 * @param {string} rawUrl
 */
export function faviconFromUrl(rawUrl) {
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return `${url.origin}/favicon.ico`;
  } catch {
    return "";
  }
}

/**
 * @param {string} rawUrl
 */
export function faviconGoogleUrl(rawUrl) {
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=128`;
  } catch {
    return "";
  }
}

/**
 * @param {string} src
 */
export function isGoogleS2Favicon(src) {
  return /google\.com\/s2\/favicons/i.test(src);
}

/**
 * True when src is just the derived `{origin}/favicon.ico` for the page URL.
 * @param {string} src
 * @param {string} pageUrl
 */
export function isDefaultFaviconSrc(src, pageUrl) {
  const custom = typeof src === "string" ? src.trim() : "";
  if (!custom || !pageUrl) return false;
  return custom === faviconFromUrl(pageUrl);
}

/**
 * Custom src wins unless it is the old Google CDN or the default /favicon.ico.
 * @param {{ url?: string, src?: string }} item
 */
export function resolveItemFavicon(item) {
  const custom = typeof item?.src === "string" ? item.src.trim() : "";
  const pageUrl = typeof item?.url === "string" ? item.url : "";
  if (custom && !isGoogleS2Favicon(custom) && !isDefaultFaviconSrc(custom, pageUrl)) {
    return custom;
  }
  return pageUrl ? faviconFromUrl(pageUrl) : "";
}

/**
 * If the primary icon 404s, swap to Google s2 once.
 * @param {HTMLImageElement} img
 * @param {string} [pageUrl]
 */
export function attachFaviconFallback(img, pageUrl) {
  img.dataset.faviconPageUrl = pageUrl || "";
  if (img.dataset.faviconFallbackBound === "1") return;
  img.dataset.faviconFallbackBound = "1";
  img.addEventListener("error", () => {
    const fallback = faviconGoogleUrl(img.dataset.faviconPageUrl || "");
    if (!fallback || isGoogleS2Favicon(img.getAttribute("src") || "")) return;
    img.src = fallback;
  });
}
