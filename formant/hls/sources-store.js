export const HLS_SOURCES_KEY = "formantHlsSources";
export const HLS_SOURCES_MAX = 20;

/**
 * @param {string} raw
 * @returns {string}
 */
export function feedName(raw) {
  try {
    const part = new URL(raw).pathname.split("/").filter(Boolean).pop() || raw;
    return decodeURIComponent(part);
  } catch {
    return raw;
  }
}

/**
 * @param {string} raw
 * @returns {string}
 */
export function hlsPlayerPageUrl(raw) {
  return `${chrome.runtime.getURL("hls/player.html")}#${encodeURIComponent(raw)}`;
}

/**
 * @param {unknown} raw
 * @returns {{ version: number, defaultId: string, items: { id: string, name: string, url: string }[] }}
 */
export function normalizeSourceStore(raw) {
  const src = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const items = Array.isArray(src.items)
    ? src.items.map(asItem).filter(Boolean).slice(0, HLS_SOURCES_MAX)
    : [];
  let defaultId = typeof src.defaultId === "string" ? src.defaultId : "";
  if (defaultId && !items.some((item) => item.id === defaultId || item.url === defaultId)) {
    defaultId = items[0] ? items[0].id : "";
  }
  if (!defaultId && items[0]) defaultId = items[0].id;
  return { version: 1, defaultId, items };
}

/**
 * @param {unknown} raw
 * @returns {{ id: string, name: string, url: string } | null}
 */
function asItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const url = String(/** @type {{ url?: unknown }} */ (raw).url || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  const name = String(/** @type {{ name?: unknown }} */ (raw).name || "").trim() || feedName(url);
  const id = String(/** @type {{ id?: unknown }} */ (raw).id || "").trim() || url;
  return { id, name, url };
}

/**
 * @returns {Promise<{ version: number, defaultId: string, items: { id: string, name: string, url: string }[] }>}
 */
export async function loadSourceStore() {
  try {
    const data = await chrome.storage.local.get(HLS_SOURCES_KEY);
    return normalizeSourceStore(data[HLS_SOURCES_KEY]);
  } catch {
    return { version: 1, defaultId: "", items: [] };
  }
}

/**
 * @param {{ version?: number, defaultId?: string, items: { id: string, name: string, url: string }[] }} store
 */
export async function saveSourceStore(store) {
  const items = (store.items || []).slice(0, HLS_SOURCES_MAX);
  let defaultId = store.defaultId || "";
  if (defaultId && !items.some((item) => item.id === defaultId || item.url === defaultId)) {
    defaultId = items[0] ? items[0].id : "";
  }
  await chrome.storage.local.set({
    [HLS_SOURCES_KEY]: { version: 1, defaultId, items },
  });
}

/**
 * @returns {Promise<{ id: string, name: string, url: string }[]>}
 */
export async function loadFeeds() {
  return (await loadSourceStore()).items;
}

/**
 * @param {{ id: string, name: string, url: string }[]} items
 */
export async function saveFeeds(items) {
  const store = await loadSourceStore();
  store.items = items.slice(0, HLS_SOURCES_MAX);
  await saveSourceStore(store);
}

/**
 * @param {string} url
 * @param {string} [name]
 */
export async function rememberFeed(url, name) {
  const href = String(url || "").trim();
  if (!/^https?:\/\//i.test(href)) return loadFeeds();
  const store = await loadSourceStore();
  const old = store.items.find((item) => item.url === href);
  const label = String(name || "").trim() || (old && old.name) || feedName(href);
  store.items = [{ id: href, name: label, url: href }, ...store.items.filter((item) => item.url !== href)].slice(
    0,
    HLS_SOURCES_MAX
  );
  if (!store.defaultId) store.defaultId = href;
  await saveSourceStore(store);
  return store.items;
}

/**
 * @param {string} id
 */
export async function setDefaultFeed(id) {
  const store = await loadSourceStore();
  const found = store.items.find((item) => item.id === id || item.url === id);
  if (!found) return store;
  store.defaultId = found.id;
  await saveSourceStore(store);
  return store;
}
