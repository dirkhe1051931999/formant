/** Fetch uBO list catalog + subscribed filter texts. CDN first, bundled seed fallback. */

export const UBLOCK_LISTS_KEY = "formantUblockLists";
export const UBLOCK_STATUS_KEY = "formantUblockStatus";

export const SUBSCRIBED_LISTS = [
  "ublock-filters",
  "ublock-badware",
  "ublock-privacy",
  "ublock-quick-fixes",
  "ublock-unbreak",
  "easylist",
  "easyprivacy",
  "CHN-0",
  "plowe-0",
  "urlhaus-1",
];

const SEED_PATHS = {
  "ublock-filters": "ublock/assets/ublock/filters.min.txt",
  "ublock-quick-fixes": "ublock/assets/ublock/quick-fixes.min.txt",
  "ublock-unbreak": "ublock/assets/ublock/unbreak.min.txt",
  "ublock-badware": "ublock/assets/ublock/badware.min.txt",
  "ublock-privacy": "ublock/assets/ublock/privacy.min.txt",
  "easylist": "ublock/assets/thirdparties/easylist/easylist.txt",
  "easyprivacy": "ublock/assets/thirdparties/easylist/easyprivacy.txt",
  "urlhaus-1": "ublock/assets/thirdparties/urlhaus-filter/urlhaus-filter-online.txt",
  "plowe-0": "ublock/assets/thirdparties/pgl.yoyo.org/as/serverlist.txt",
  "CHN-0": "ublock/assets/thirdparties/adguard/chinese.txt",
};

const CATALOG_URLS = [
  "https://ublockorigin.github.io/uAssetsCDN/ublock/assets.json",
  "https://ublockorigin.pages.dev/ublock/assets.json",
  "https://cdn.jsdelivr.net/gh/gorhill/uBlock@master/assets/assets.json",
];

const FETCH_MS = 20_000;
const DB_NAME = "formant-ublock-lists";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("cache");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbRead() {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction("cache", "readonly").objectStore("cache").get("lists");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function dbWrite(value) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("cache", "readwrite");
      tx.objectStore("cache").put(value, "lists");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * @typedef {{
 *   id: string,
 *   title?: string,
 *   text: string,
 *   url: string,
 *   fetchedAt: number,
 *   source: "cdn" | "seed" | "cache",
 * }} UblockList
 */

/**
 * @typedef {{
 *   catalogSource: "cdn" | "seed",
 *   catalogFetchedAt: number,
 *   lists: Record<string, UblockList>,
 * }} UblockListsState
 */

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function asUrlList(raw) {
  if (typeof raw === "string" && /^https?:\/\//i.test(raw)) return [raw];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => typeof item === "string" && /^https?:\/\//i.test(item));
}

/**
 * @returns {Promise<Record<string, any>>}
 */
async function loadSeedCatalog() {
  const url = chrome.runtime.getURL("ublock/assets/assets.json");
  const text = await fetchText(url);
  return JSON.parse(text);
}

/**
 * @returns {Promise<{ catalog: Record<string, any>, source: "cdn" | "seed" }>}
 */
export async function loadCatalog() {
  for (const url of CATALOG_URLS) {
    try {
      const text = await fetchText(url);
      const catalog = JSON.parse(text);
      if (catalog && typeof catalog === "object") {
        return { catalog, source: "cdn" };
      }
    } catch (error) {
      console.warn("[formant] uBO catalog fetch failed", url, error);
    }
  }
  return { catalog: await loadSeedCatalog(), source: "seed" };
}

/**
 * @param {string} id
 * @returns {Promise<UblockList>}
 */
async function loadSeedList(id) {
  const path = SEED_PATHS[id];
  if (!path) throw new Error(`no seed for ${id}`);
  const url = chrome.runtime.getURL(path);
  const text = await fetchText(url);
  return {
    id,
    text,
    url,
    fetchedAt: Date.now(),
    source: "seed",
  };
}

/**
 * @param {string} id
 * @param {Record<string, any>} entry
 * @returns {Promise<UblockList>}
 */
async function fetchRemoteList(id, entry) {
  const urls = [...asUrlList(entry?.cdnURLs), ...asUrlList(entry?.contentURL)];
  let lastError = /** @type {unknown} */ (null);
  for (const url of urls) {
    try {
      const text = await fetchText(url);
      if (!text || text.length < 32) continue;
      return {
        id,
        title: typeof entry?.title === "string" ? entry.title : id,
        text,
        url,
        fetchedAt: Date.now(),
        source: "cdn",
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`failed to fetch ${id}`);
}

/**
 * @returns {Promise<UblockListsState | null>}
 */
export async function loadCachedLists() {
  let raw;
  try {
    raw = await dbRead();
  } catch (error) {
    console.warn("[formant] uBO IndexedDB read failed", error);
  }
  if (!raw) {
    const data = await chrome.storage.local.get(UBLOCK_LISTS_KEY);
    raw = data[UBLOCK_LISTS_KEY];
  }
  if (!raw || typeof raw !== "object") return null;
  const lists = raw.lists && typeof raw.lists === "object" ? raw.lists : {};
  /** @type {Record<string, UblockList>} */
  const next = {};
  for (const id of SUBSCRIBED_LISTS) {
    const item = lists[id];
    if (!item || typeof item.text !== "string" || item.text.length < 32) continue;
    next[id] = {
      id,
      title: typeof item.title === "string" ? item.title : id,
      text: item.text,
      url: typeof item.url === "string" ? item.url : "",
      fetchedAt: typeof item.fetchedAt === "number" ? item.fetchedAt : 0,
      source: item.source === "cdn" || item.source === "seed" ? item.source : "cache",
    };
  }
  if (Object.keys(next).length === 0) return null;
  return {
    catalogSource: raw.catalogSource === "cdn" ? "cdn" : "seed",
    catalogFetchedAt: typeof raw.catalogFetchedAt === "number" ? raw.catalogFetchedAt : 0,
    lists: next,
  };
}

/**
 * @param {UblockListsState} state
 */
export async function saveCachedLists(state) {
  await dbWrite(state);
  await chrome.storage.local.remove(UBLOCK_LISTS_KEY);
}

/**
 * Bundled 1.76.0 copies. Always available after deleting the Edge uBO extension.
 * @returns {Promise<UblockListsState>}
 */
export async function loadSeedLists() {
  /** @type {Record<string, UblockList>} */
  const lists = {};
  for (const id of SUBSCRIBED_LISTS) {
    if (!SEED_PATHS[id]) continue;
    lists[id] = await loadSeedList(id);
  }
  return {
    catalogSource: "seed",
    catalogFetchedAt: 0,
    lists,
  };
}

/**
 * @param {boolean} [preferCache]
 * @returns {Promise<UblockListsState>}
 */
export async function resolveLists(preferCache = true) {
  if (preferCache) {
    const cached = await loadCachedLists();
    if (cached) return cached;
  }
  return loadSeedLists();
}

/**
 * Pull catalog + lists from uAssets. On total failure, keep previous cache/seed.
 * @returns {Promise<UblockListsState>}
 */
export async function refreshListsFromNetwork() {
  const previous = (await loadCachedLists()) || (await loadSeedLists());
  let catalog;
  let catalogSource;
  try {
    const loaded = await loadCatalog();
    catalog = loaded.catalog;
    catalogSource = loaded.source;
  } catch (error) {
    console.warn("[formant] uBO catalog unavailable", error);
    return previous;
  }

  /** @type {Record<string, UblockList>} */
  const lists = { ...previous.lists };
  let anyRemote = false;
  await Promise.all(SUBSCRIBED_LISTS.map(async (id) => {
    const entry = catalog[id] || {};
    try {
      const remote = await fetchRemoteList(id, entry);
      lists[id] = remote;
      anyRemote = true;
    } catch (error) {
      console.warn("[formant] uBO list fetch failed", id, error);
      if (!lists[id] && SEED_PATHS[id]) lists[id] = await loadSeedList(id);
    }
  }));

  const state = {
    catalogSource,
    catalogFetchedAt: Date.now(),
    lists,
  };
  if (anyRemote || catalogSource === "seed") {
    try {
      await saveCachedLists(state);
    } catch (error) {
      console.warn("[formant] uBO list cache write failed", error);
    }
  }
  return state;
}

/**
 * @returns {Promise<import("./ublock-apply.js").UblockStatus>}
 */
export async function loadUblockStatus() {
  const data = await chrome.storage.local.get(UBLOCK_STATUS_KEY);
  const raw = data[UBLOCK_STATUS_KEY];
  if (!raw || typeof raw !== "object") {
    return {
      enabled: false,
      ruleCount: 0,
      skipped: 0,
      lastUpdated: 0,
      lastError: null,
      source: "seed",
      scriptlets: "pending",
      cosmeticCount: 0,
    };
  }
  return {
    enabled: Boolean(raw.enabled),
    ruleCount: typeof raw.ruleCount === "number" ? raw.ruleCount : 0,
    skipped: typeof raw.skipped === "number" ? raw.skipped : 0,
    lastUpdated: typeof raw.lastUpdated === "number" ? raw.lastUpdated : 0,
    lastError: typeof raw.lastError === "string" ? raw.lastError : null,
    source: raw.source === "cdn" || raw.source === "cache" ? raw.source : "seed",
    scriptlets: typeof raw.scriptlets === "string" ? raw.scriptlets : "pending",
    cosmeticCount: typeof raw.cosmeticCount === "number" ? raw.cosmeticCount : 0,
  };
}
