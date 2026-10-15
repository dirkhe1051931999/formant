import {
  ensureHostPermission,
  envForBaseUrl,
  loadSettings,
  MONO_ENV_PRESETS,
  saveSettings,
} from "./sync.js";
import { countVisibleHomeItems, createDefaultHome, normalizeHome } from "./home-model.js";
import { exchangeCacheMatches, exchangeFetchCodes, loadExchangePrefs } from "./newtab-exchange.js";

const HOME_KEYS = {
  home: "newtabHome",
  revision: "newtabRevision",
  updatedAt: "newtabUpdatedAt",
  lastSyncAt: "newtabLastSyncAt",
  lastSyncResult: "newtabLastSyncResult",
};

const CACHE_KEYS = {
  weather: "newtabCacheWeather",
  weatherKey: "newtabCacheWeatherKey",
  weatherAt: "newtabCacheWeatherAt",
  exchange: "newtabCacheExchange",
  exchangeAt: "newtabCacheExchangeAt",
  holidays: "newtabCacheHolidays",
  holidaysAt: "newtabCacheHolidaysAt",
  vocab: "newtabCacheVocab",
  vocabAt: "newtabCacheVocabAt",
  widgetsAt: "newtabCacheWidgetsAt",
};

export async function loadLocalHomeState() {
  const data = await chrome.storage.local.get([
    HOME_KEYS.home,
    HOME_KEYS.revision,
    HOME_KEYS.updatedAt,
    HOME_KEYS.lastSyncAt,
    HOME_KEYS.lastSyncResult,
  ]);
  return {
    home: normalizeHome(data[HOME_KEYS.home] || createDefaultHome()),
    revision: Number(data[HOME_KEYS.revision] || 0) || 0,
    updatedAt: String(data[HOME_KEYS.updatedAt] || ""),
    lastSyncAt: String(data[HOME_KEYS.lastSyncAt] || ""),
    lastSyncResult: String(data[HOME_KEYS.lastSyncResult] || ""),
  };
}

export async function saveLocalHome(home, meta = {}) {
  const normalized = normalizeHome(home);
  /** @type {Record<string, unknown>} */
  const patch = { [HOME_KEYS.home]: normalized };
  if (typeof meta.revision === "number") patch[HOME_KEYS.revision] = meta.revision;
  if (typeof meta.updatedAt === "string") patch[HOME_KEYS.updatedAt] = meta.updatedAt;
  await chrome.storage.local.set(patch);
  return normalized;
}

/**
 * @returns {Promise<{ weather: unknown | null, exchange: unknown | null, holidays: unknown | null, vocab: unknown | null, weatherKey: string, weatherAt: string, exchangeAt: string, holidaysAt: string, vocabAt: string, widgetsAt: string }>}
 */
export async function loadWidgetCache() {
  const data = await chrome.storage.local.get([
    CACHE_KEYS.weather,
    CACHE_KEYS.weatherKey,
    CACHE_KEYS.weatherAt,
    CACHE_KEYS.exchange,
    CACHE_KEYS.exchangeAt,
    CACHE_KEYS.holidays,
    CACHE_KEYS.holidaysAt,
    CACHE_KEYS.vocab,
    CACHE_KEYS.vocabAt,
    CACHE_KEYS.widgetsAt,
  ]);
  const weather = data[CACHE_KEYS.weather] ?? null;
  const exchange = data[CACHE_KEYS.exchange] ?? null;
  const holidays = data[CACHE_KEYS.holidays] ?? null;
  const widgetsAt = String(data[CACHE_KEYS.widgetsAt] || "");
  let weatherAt = String(data[CACHE_KEYS.weatherAt] || "");
  // Old caches had weather but no weatherAt; fall back so "N 分钟前" still shows.
  if (weather && !weatherAt) {
    weatherAt = widgetsAt || new Date().toISOString();
    void chrome.storage.local.set({ [CACHE_KEYS.weatherAt]: weatherAt });
  }
  let holidaysAt = String(data[CACHE_KEYS.holidaysAt] || "");
  if (holidays && !holidaysAt) {
    holidaysAt = widgetsAt || new Date().toISOString();
    void chrome.storage.local.set({ [CACHE_KEYS.holidaysAt]: holidaysAt });
  }
  let exchangeAt = String(data[CACHE_KEYS.exchangeAt] || "");
  if (exchange && !exchangeAt) {
    exchangeAt = widgetsAt || new Date().toISOString();
    void chrome.storage.local.set({ [CACHE_KEYS.exchangeAt]: exchangeAt });
  }
  return {
    weather,
    weatherKey: String(data[CACHE_KEYS.weatherKey] || ""),
    weatherAt,
    exchange,
    exchangeAt,
    holidays,
    holidaysAt,
    vocab: data[CACHE_KEYS.vocab] ?? null,
    vocabAt: String(data[CACHE_KEYS.vocabAt] || ""),
    widgetsAt,
  };
}

/**
 * @param {{ weather?: unknown, exchange?: unknown, holidays?: unknown, vocab?: unknown, weatherKey?: string, weatherAt?: string, exchangeAt?: string, holidaysAt?: string, vocabAt?: string }} patch
 */
export async function saveWidgetCache(patch) {
  /** @type {Record<string, unknown>} */
  const data = { [CACHE_KEYS.widgetsAt]: new Date().toISOString() };
  if ("weather" in patch) {
    data[CACHE_KEYS.weather] = patch.weather;
    data[CACHE_KEYS.weatherAt] =
      typeof patch.weatherAt === "string" && patch.weatherAt
        ? patch.weatherAt
        : new Date().toISOString();
  }
  if ("weatherKey" in patch) data[CACHE_KEYS.weatherKey] = patch.weatherKey;
  if ("exchange" in patch) {
    data[CACHE_KEYS.exchange] = patch.exchange;
    data[CACHE_KEYS.exchangeAt] =
      typeof patch.exchangeAt === "string" && patch.exchangeAt
        ? patch.exchangeAt
        : new Date().toISOString();
  }
  if ("holidays" in patch) {
    data[CACHE_KEYS.holidays] = patch.holidays;
    data[CACHE_KEYS.holidaysAt] =
      typeof patch.holidaysAt === "string" && patch.holidaysAt
        ? patch.holidaysAt
        : new Date().toISOString();
  }
  if ("vocab" in patch) {
    data[CACHE_KEYS.vocab] = patch.vocab;
    data[CACHE_KEYS.vocabAt] =
      typeof patch.vocabAt === "string" && patch.vocabAt
        ? patch.vocabAt
        : new Date().toISOString();
  }
  await chrome.storage.local.set(data);
}

export function weatherCacheKey(locationId, cityName) {
  return `${String(locationId || "").trim()}|${String(cityName || "").trim()}`;
}

async function requireSyncSettings() {
  const settings = await loadSettings();
  if (!settings.baseUrl) throw new Error("请先填写 mono Base URL");
  if (!settings.clientKey) throw new Error("请先填写 Client API Key");
  await ensureHostPermission(settings.baseUrl);
  return settings;
}

async function clientFetch(path, init = {}) {
  const settings = await requireSyncSettings();
  let response;
  try {
    response = await fetch(`${settings.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-oolaf-client-key": settings.clientKey,
        ...(init.headers || {}),
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`无法连接 ${settings.baseUrl}（${detail}）`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`请求失败：HTTP ${response.status}`);
  }
  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.message || `请求失败：HTTP ${response.status}`);
  }
  return payload.data;
}

async function rememberSync(result, label, keptRemote = false) {
  const home = normalizeHome(result.home);
  const revision = Number(result.revision) || 0;
  const updatedAt = result.updatedAt || "";
  await chrome.storage.local.set({
    [HOME_KEYS.home]: home,
    [HOME_KEYS.revision]: revision,
    [HOME_KEYS.updatedAt]: updatedAt,
    [HOME_KEYS.lastSyncAt]: new Date().toISOString(),
    [HOME_KEYS.lastSyncResult]: `${label} revision ${revision}`,
  });
  return {
    revision,
    updatedAt: result.updatedAt,
    home,
    fromDefault: Boolean(result.fromDefault),
    keptRemote,
  };
}

export async function pullHomeFromMono() {
  const data = await clientFetch("/api/v1/client/newtab/home");
  return rememberSync(data, "已拉取");
}

/**
 * Open-tab reconcile: pull when local is empty or cloud revision is newer.
 * Same-revision local edits are kept so an in-progress layout is not clobbered.
 * @returns {Promise<
 *   | { ok: true, applied: boolean, home: import("./home-model.js").NewtabHome, revision: number, updatedAt: string, fromDefault: boolean, keptRemote?: boolean }
 *   | { ok: false, reason: "missing-key" | "error", error?: Error }
 * >}
 */
export async function tryReconcileHomeFromMono() {
  const settings = await loadSettings();
  if (!settings.baseUrl || !settings.clientKey) {
    return { ok: false, reason: "missing-key" };
  }
  try {
    const local = await loadLocalHomeState();
    const data = await clientFetch("/api/v1/client/newtab/home");
    const localCount = countVisibleHomeItems(local.home);
    const remoteRevision = Number(data?.revision) || 0;
    if (localCount > 0 && remoteRevision <= local.revision) {
      return {
        ok: true,
        applied: false,
        home: local.home,
        revision: local.revision,
        updatedAt: local.updatedAt,
        fromDefault: false,
      };
    }
    const synced = await rememberSync(data, localCount === 0 ? "已拉取" : "已拉取云端更新");
    return { ok: true, applied: true, ...synced };
  } catch (error) {
    return {
      ok: false,
      reason: "error",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

export async function pushHomeToMono(home) {
  const local = normalizeHome(home);
  const localState = await loadLocalHomeState();
  const existing = await clientFetch("/api/v1/client/newtab/home");
  const remoteHome = normalizeHome(existing?.home);
  const localCount = countVisibleHomeItems(local);
  const remoteCount = countVisibleHomeItems(remoteHome);
  const remoteRevision = Number(existing?.revision) || 0;
  const localRevision = Number(localState.revision) || 0;
  if (localCount === 0 && (remoteCount > 0 || existing?.fromDefault)) {
    if (remoteCount > 0) {
      return rememberSync(existing, "已保留云端主页（未用空主页覆盖）", true);
    }
    throw new Error("本机主页是空的，无法覆盖云端。请先点「刷新」拉取，或在已有图标的电脑点「同步」。");
  }
  if (remoteRevision > localRevision) {
    return rememberSync(existing, "已保留云端主页（本机较旧，未覆盖）", true);
  }
  const data = await clientFetch("/api/v1/client/newtab/home", {
    method: "PUT",
    body: JSON.stringify({ home: local }),
  });
  return rememberSync(data, "已同步");
}

export async function createItemOnMono(body) {
  return clientFetch("/api/v1/client/newtab/items", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateItemOnMono(id, body) {
  return clientFetch(`/api/v1/client/newtab/items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteItemOnMono(id) {
  return clientFetch(`/api/v1/client/newtab/items/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

async function fetchWeather(locationId, cityName) {
  const params = new URLSearchParams();
  if (locationId) params.set("locationId", locationId);
  if (cityName) params.set("cityName", cityName);
  const qs = params.toString();
  return clientFetch(`/api/v1/client/newtab/weather${qs ? `?${qs}` : ""}`);
}

async function fetchExchangeRate() {
  const prefs = await loadExchangePrefs();
  const target = encodeURIComponent(exchangeFetchCodes(prefs).join(","));
  return clientFetch(`/api/v1/client/newtab/exchange-rate?money=1&source=USD&target=${target}`);
}

async function fetchHolidays() {
  return clientFetch("/api/v1/client/newtab/holidays?limit=6");
}

async function fetchVocab() {
  return clientFetch("/api/v1/client/newtab/vocab");
}

export async function refreshHolidaysFromMono() {
  const holidays = await fetchHolidays();
  await saveWidgetCache({ holidays });
  return { holidays };
}

export async function refreshExchangeFromMono() {
  const exchange = await fetchExchangeRate();
  await saveWidgetCache({ exchange });
  return { exchange };
}

export async function refreshVocabFromMono() {
  const vocab = await clientFetch("/api/v1/client/newtab/vocab/refresh", {
    method: "POST",
    body: "{}",
  });
  await saveWidgetCache({ vocab });
  return { vocab };
}

/**
 * Load current card (generate on server if missing) into cache.
 */
export async function ensureVocabFromMono() {
  const vocab = await fetchVocab();
  await saveWidgetCache({ vocab });
  return { vocab };
}

/**
 * @param {string} word
 */
export async function dismissVocabWord(word) {
  const data = await clientFetch("/api/v1/client/newtab/vocab/dismiss", {
    method: "POST",
    body: JSON.stringify({ word: String(word || "").trim() }),
  });
  const vocab = { words: Array.isArray(data?.words) ? data.words : [] };
  await saveWidgetCache({ vocab });
  return { vocab, replacement: data?.replacement || null };
}

/**
 * Force-refresh widget APIs and write cache.
 * @param {{ locationId?: string, cityName?: string }} [opts]
 */
export async function refreshWidgetsFromMono(opts = {}) {
  const locationId = opts.locationId || "";
  const cityName = opsCity(opts.cityName);
  const key = weatherCacheKey(locationId, cityName);
  const settled = await Promise.allSettled([
    fetchWeather(locationId, cityName),
    fetchHolidays(),
    fetchExchangeRate(),
    fetchVocab(),
  ]);
  const weather = settled[0].status === "fulfilled" ? settled[0].value : null;
  const holidays = settled[1].status === "fulfilled" ? settled[1].value : null;
  const exchange = settled[2].status === "fulfilled" ? settled[2].value : null;
  const vocab = settled[3].status === "fulfilled" ? settled[3].value : null;
  const errors = settled
    .map((result, index) => {
      if (result.status === "fulfilled") return null;
      const label = ["weather", "holidays", "exchange", "vocab"][index];
      return `${label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`;
    })
    .filter(Boolean);

  await saveWidgetCache({
    ...(weather ? { weather, weatherKey: key } : {}),
    ...(holidays ? { holidays } : {}),
    ...(exchange ? { exchange } : {}),
    ...(vocab ? { vocab } : {}),
  });

  if (!weather && !holidays && !exchange && !vocab) {
    throw new Error(errors.join("；") || "卡片数据刷新失败");
  }
  if (errors.length) {
    console.warn("[formant] widget refresh partial", errors.join("；"));
  }
  return { weather, holidays, exchange, vocab, weatherKey: key, errors };
}

/**
 * Refresh weather only when city key changed or forced.
 * @param {{ locationId?: string, cityName?: string, force?: boolean }} opts
 */
export async function refreshWeatherFromMono(opts = {}) {
  const locationId = opts.locationId || "";
  const cityName = opsCity(opts.cityName);
  const key = weatherCacheKey(locationId, cityName);
  const cache = await loadWidgetCache();
  if (!opts.force && cache.weather && cache.weatherKey === key) {
    return { weather: cache.weather, weatherKey: key, fromCache: true };
  }
  const weather = await fetchWeather(locationId, cityName);
  await saveWidgetCache({ weather, weatherKey: key });
  return { weather, weatherKey: key, fromCache: false };
}

/** Weather older than this is refetched even when the city key matches. */
const WEATHER_STALE_MS = 30 * 60_000;

/** Exchange rates older than this are refetched. */
const EXCHANGE_STALE_MS = 24 * 3600_000;

/**
 * Holiday countdowns are relative to "today": a cache written on a previous
 * local calendar day is stale even though the holiday schedule rarely changes.
 */
export function isHolidaysCacheStale(cache) {
  if (!cache?.holidays) return true;
  const at = Date.parse(cache.holidaysAt || "") || 0;
  if (!at) return true;
  if (new Date(at).toDateString() !== new Date().toDateString()) return true;
  const upcoming = cache.holidays?.upcoming;
  const items = Array.isArray(upcoming) ? upcoming : [];
  const ongoing = Number(items[0]?.daysLeft) === 0;
  // 假期内要留出「当前 + 左边下一个 + 右边 3 个」。
  return items.length < (ongoing ? 5 : 3);
}

/**
 * Auto-refresh only stale widget data: weather older than 30 minutes (or with a
 * changed city key), holidays cached on a previous day, and exchange rates older
 * than 24 hours. Fresh caches are kept without hitting the network.
 * @param {{ locationId?: string, cityName?: string }} [opts]
 */
export async function refreshStaleWidgetsFromMono(opts = {}) {
  const cache = await loadWidgetCache();
  const locationId = opts.locationId || "";
  const cityName = opts.cityName || "";
  const weatherAt = Date.parse(cache.weatherAt || "") || 0;
  const weatherStale = !cache.weather || Date.now() - weatherAt > WEATHER_STALE_MS;
  await loadExchangePrefs();
  const exchangeAt = Date.parse(cache.exchangeAt || "") || 0;
  const exchangeStale = !exchangeCacheMatches(cache) || Date.now() - exchangeAt > EXCHANGE_STALE_MS;

  /** @type {Promise<unknown>[]} */
  const tasks = [refreshWeatherFromMono({ locationId, cityName, force: weatherStale })];
  const kinds = ["weather"];
  if (isHolidaysCacheStale(cache)) {
    kinds.push("holidays");
    tasks.push(refreshHolidaysFromMono());
  }
  if (exchangeStale) {
    kinds.push("exchange");
    tasks.push(refreshExchangeFromMono());
  }
  const results = await Promise.allSettled(tasks);
  let refreshed = false;
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn(`[formant] stale widget refresh failed: ${kinds[index]}`, result.reason);
      return;
    }
    if (kinds[index] !== "weather" || result.value?.fromCache === false) refreshed = true;
  });
  return { refreshed };
}

function opsCity(cityName) {
  return cityName || "";
}

export {
  loadSettings,
  saveSettings,
  MONO_ENV_PRESETS,
  envForBaseUrl,
  HOME_KEYS,
  CACHE_KEYS,
};
