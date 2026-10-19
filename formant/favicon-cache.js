/**
 * Local favicon cache for New Tab tiles.
 * Stored in chrome.storage.local only — never written into home JSON / mono.
 */
import {
  faviconFromUrl,
  faviconGoogleUrl,
  isDefaultFaviconSrc,
  isGoogleS2Favicon,
  resolveItemFavicon,
} from "./home-model.js";

export const FAVICON_CACHE_KEY = "newtabCacheFavicons";

/** @typedef {{ dataUrl: string, sourceUrl: string, fetchedAt: number }} FaviconCacheEntry */
/** @typedef {Record<string, FaviconCacheEntry>} FaviconCacheMap */

const TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_DATA_URL_CHARS = 128 * 1024;
const FETCH_CONCURRENCY = 3;
const FETCH_TIMEOUT_MS = 12_000;

/** @type {FaviconCacheMap} */
let memoryCache = {};

/** @type {Map<string, Promise<string>>} */
const inflight = new Map();

/**
 * @param {{ url?: string, src?: string, type?: string }} item
 */
export function cacheKeyForItem(item) {
  if (!item || item.type === "text" || item.type === "component") return "";
  const custom = typeof item.src === "string" ? item.src.trim() : "";
  const pageUrl = typeof item.url === "string" ? item.url.trim() : "";
  // Default /favicon.ico shares the origin key so edit-save does not orphan cache.
  if (custom && !isGoogleS2Favicon(custom) && !isDefaultFaviconSrc(custom, pageUrl)) {
    return `src:${custom}`;
  }
  if (!pageUrl) return "";
  try {
    const url = new URL(pageUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return `origin:${url.origin}`;
  } catch {
    return "";
  }
}

/**
 * @returns {Promise<FaviconCacheMap>}
 */
export async function loadFaviconCache() {
  const data = await chrome.storage.local.get(FAVICON_CACHE_KEY);
  const raw = data[FAVICON_CACHE_KEY];
  memoryCache = raw && typeof raw === "object" && !Array.isArray(raw) ? /** @type {FaviconCacheMap} */ (raw) : {};
  return memoryCache;
}

/**
 * @param {string} key
 * @returns {FaviconCacheEntry | null}
 */
export function getCached(key) {
  if (!key) return null;
  const entry = memoryCache[key];
  if (!entry || typeof entry.dataUrl !== "string" || !entry.dataUrl) return null;
  return entry;
}

/**
 * @param {string} key
 */
function isFresh(key) {
  const entry = getCached(key);
  if (!entry) return false;
  return Date.now() - (Number(entry.fetchedAt) || 0) < TTL_MS;
}

/**
 * @param {FaviconCacheMap} next
 */
async function persistCache(next) {
  memoryCache = next;
  await chrome.storage.local.set({ [FAVICON_CACHE_KEY]: next });
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchAsDataUrl(url) {
  if (url.startsWith("data:image/")) {
    if (url.length > MAX_DATA_URL_CHARS) throw new Error("icon too large");
    return url;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "force-cache",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let blob = await res.blob();
    if (!blob || blob.size < 16) throw new Error("empty icon");
    if (!blob.type || blob.type === "application/octet-stream") {
      blob = new Blob([blob], { type: "image/x-icon" });
    }
    const dataUrl = await blobToDataUrl(blob);
    if (!dataUrl.startsWith("data:image/")) throw new Error("not an image");
    if (dataUrl.length > MAX_DATA_URL_CHARS) throw new Error("icon too large");
    return dataUrl;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {import("./home-model.js").NewtabItem | { url?: string, src?: string, type?: string }} item
 * @returns {Promise<string>}
 */
export async function ensureFaviconCached(item) {
  const key = cacheKeyForItem(item);
  if (!key) return "";

  if (isFresh(key)) {
    return getCached(key)?.dataUrl || "";
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    const primary = resolveItemFavicon(item);
    const pageUrl = typeof item.url === "string" ? item.url : "";
    const candidates = [];
    if (primary) candidates.push(primary);
    const google = pageUrl ? faviconGoogleUrl(pageUrl) : "";
    if (google && google !== primary) candidates.push(google);

    let lastError = null;
    for (const sourceUrl of candidates) {
      try {
        const dataUrl = await fetchAsDataUrl(sourceUrl);
        const next = { ...memoryCache };
        next[key] = { dataUrl, sourceUrl, fetchedAt: Date.now() };
        await persistCache(next);
        return dataUrl;
      } catch (error) {
        lastError = error;
      }
    }

    // Keep stale entry on refresh failure. 404 / empty icon is normal; use text placeholder.
    const stale = getCached(key);
    if (stale?.dataUrl) return stale.dataUrl;
    return "";
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, task);
  return task;
}

/**
 * @param {import("./home-model.js").NewtabHome} home
 * @returns {Map<string, import("./home-model.js").NewtabItem>}
 */
function collectNeeded(home) {
  /** @type {Map<string, import("./home-model.js").NewtabItem>} */
  const needed = new Map();

  /**
   * @param {import("./home-model.js").NewtabItem[] | undefined} items
   */
  function walk(items) {
    for (const item of items || []) {
      if (item.type === "folder") {
        walk(item.children);
        continue;
      }
      const key = cacheKeyForItem(item);
      if (key && !needed.has(key)) needed.set(key, item);
    }
  }

  for (const page of home?.nav || []) walk(page.children);
  return needed;
}

/**
 * Prune orphans and fetch missing / stale icons in the background.
 * @param {import("./home-model.js").NewtabHome} home
 */
export async function reconcileFaviconCache(home) {
  const needed = collectNeeded(home);
  const next = { ...memoryCache };
  let changed = false;

  // Migrate legacy keys written when default /favicon.ico was persisted as src.
  for (const [key, item] of needed) {
    if (!key.startsWith("origin:") || next[key]?.dataUrl) continue;
    const defaultSrc = item.url ? faviconFromUrl(item.url) : "";
    if (!defaultSrc) continue;
    const legacy = next[`src:${defaultSrc}`];
    if (legacy?.dataUrl) {
      next[key] = { ...legacy };
      changed = true;
    }
  }

  for (const key of Object.keys(next)) {
    if (!needed.has(key)) {
      delete next[key];
      changed = true;
    }
  }
  if (changed) await persistCache(next);

  const queue = [];
  for (const [key, item] of needed) {
    if (!isFresh(key)) queue.push(item);
  }

  let index = 0;
  async function worker() {
    while (index < queue.length) {
      const item = queue[index++];
      try {
        await ensureFaviconCached(item);
      } catch (error) {
        console.warn("[formant] favicon reconcile", error);
      }
    }
  }

  const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, Math.max(1, queue.length)) }, () => worker());
  await Promise.all(workers);
}

/**
 * @param {HTMLElement} host
 * @param {import("./home-model.js").NewtabItem} item
 * @param {{ textLen?: number }} [opts]
 */
export function applyItemFavicon(host, item, { textLen = 4 } = {}) {
  const key = cacheKeyForItem(item);
  const label = (item.iconText || item.name || "").slice(0, textLen);
  const cached = key ? getCached(key) : null;

  /**
   * @param {string} dataUrl
   */
  function showImage(dataUrl) {
    host.replaceChildren();
    host.classList.remove("tile__icon--text");
    const img = document.createElement("img");
    img.src = dataUrl;
    img.alt = "";
    img.draggable = false;
    img.referrerPolicy = "no-referrer";
    img.classList.add("favicon-fade");
    host.appendChild(img);
  }

  function showPlaceholder() {
    host.replaceChildren();
    if (host.classList.contains("folder-cell")) {
      host.textContent = label.slice(0, 2) || "?";
    } else {
      host.classList.add("tile__icon--text");
      host.textContent = label || "?";
    }
  }

  if (cached?.dataUrl) {
    showImage(cached.dataUrl);
    if (key && !isFresh(key)) {
      void ensureFaviconCached(item).then((dataUrl) => {
        if (!dataUrl || !host.isConnected) return;
        if (cacheKeyForItem(item) !== key) return;
        showImage(dataUrl);
      });
    }
    return;
  }

  if (!key && !resolveItemFavicon(item)) {
    showPlaceholder();
    return;
  }

  showPlaceholder();
  if (!key) return;

  void ensureFaviconCached(item).then((dataUrl) => {
    if (!dataUrl || !host.isConnected) return;
    if (cacheKeyForItem(item) !== key) return;
    showImage(dataUrl);
  });
}
