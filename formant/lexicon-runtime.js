import {
  getDefaultPacks,
  packToLexiconEntries,
  TRANSLATE_LEXICON_SORTED,
} from "./translate-lexicon.js";

/**
 * @typedef {import("./translate-lexicon.js").LexiconLang} LexiconLang
 * @typedef {import("./translate-lexicon.js").LexiconEntry} LexiconEntry
 * @typedef {import("./translate-lexicon.js").LexiconPack} LexiconPack
 * @typedef {import("./translate-lexicon.js").LexiconPackEntry} LexiconPackEntry
 */

export const LEXICON_PACKS_KEY = "formantLexiconPacks";
export const LEXICON_DISABLED_KEY = "formantLexiconDisabled";

/** @type {LexiconEntry[] | null} */
let sortedCache = null;
/** @type {Promise<LexiconEntry[]> | null} */
let readyPromise = null;
let listening = false;

/** @type {Record<LexiconLang, string>} */
export const LEXICON_LANG_LABELS = {
  en: "英语",
  zh: "中文",
  ja: "日语",
  ko: "韩语",
  tr: "土耳其语",
};

/**
 * @param {unknown} value
 * @returns {LexiconLang}
 */
export function normalizeLexiconLang(value) {
  const lang = String(value || "").trim();
  if (lang === "en" || lang === "zh" || lang === "ja" || lang === "ko" || lang === "tr") return lang;
  return "en";
}

/**
 * @param {unknown} raw
 * @returns {LexiconPackEntry[]}
 */
function normalizeEntries(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {LexiconPackEntry[]} */
  const out = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = /** @type {Record<string, unknown>} */ (item);
    const phrase = String(row.phrase || "").trim();
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const kindRaw = String(row.kind || "slang");
    const kind =
      kindRaw === "idiom" || kindRaw === "proverb" || kindRaw === "net" || kindRaw === "slang"
        ? kindRaw
        : "slang";
    out.push({
      id: String(row.id || "").trim() || `e_${out.length + 1}`,
      phrase,
      meaning: String(row.meaning || ""),
      examples: Array.isArray(row.examples)
        ? row.examples.map((x) => String(x || "").trim()).filter(Boolean)
        : [],
      tags: Array.isArray(row.tags)
        ? row.tags.map((x) => String(x || "").trim()).filter(Boolean)
        : [],
      kind,
      weight: Number(row.weight) || undefined,
    });
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {LexiconPack[]}
 */
export function normalizeCustomPacks(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {LexiconPack[]} */
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = /** @type {Record<string, unknown>} */ (item);
    const id = String(row.id || "").trim();
    if (!id || id.startsWith("builtin:")) continue;
    out.push({
      id,
      name: String(row.name || "自定义词库").trim() || "自定义词库",
      lang: normalizeLexiconLang(row.lang),
      builtin: false,
      enabled: row.enabled !== false,
      entries: normalizeEntries(row.entries),
    });
  }
  return out;
}

/**
 * @returns {Promise<{ customPacks: LexiconPack[], disabledIds: Set<string> }>}
 */
export async function loadLexiconStorage() {
  const data = await chrome.storage.local.get([LEXICON_PACKS_KEY, LEXICON_DISABLED_KEY]);
  const customPacks = normalizeCustomPacks(data[LEXICON_PACKS_KEY]);
  const disabledRaw = Array.isArray(data[LEXICON_DISABLED_KEY]) ? data[LEXICON_DISABLED_KEY] : [];
  const disabledIds = new Set(disabledRaw.map((x) => String(x || "").trim()).filter(Boolean));
  return { customPacks, disabledIds };
}

/**
 * Merge builtin + custom packs with enable flags applied.
 * @returns {Promise<LexiconPack[]>}
 */
export async function loadLexiconState() {
  const { customPacks, disabledIds } = await loadLexiconStorage();
  const builtins = getDefaultPacks().map((pack) => ({
    ...pack,
    enabled: !disabledIds.has(pack.id),
  }));
  const customs = customPacks.map((pack) => ({
    ...pack,
    builtin: false,
    enabled: pack.enabled !== false && !disabledIds.has(pack.id),
  }));
  return [...builtins, ...customs];
}

/**
 * @param {LexiconPack[]} packs
 * @returns {LexiconEntry[]}
 */
export function getMergedEntries(packs) {
  /** @type {Map<string, LexiconEntry>} */
  const map = new Map();
  for (const pack of packs) {
    if (!pack.enabled) continue;
    for (const entry of packToLexiconEntries(pack)) {
      const key = `${entry.lang}:${entry.phrase.toLowerCase()}`;
      map.set(key, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.phrase.length - a.phrase.length);
}

/**
 * @param {LexiconPack[]} customPacks
 */
export async function saveCustomPacks(customPacks) {
  const packs = normalizeCustomPacks(customPacks).map((pack) => ({
    ...pack,
    builtin: false,
  }));
  await chrome.storage.local.set({ [LEXICON_PACKS_KEY]: packs });
  await reloadLexiconCache();
}

/**
 * @param {string} packId
 * @param {boolean} enabled
 */
export async function setPackEnabled(packId, enabled) {
  const id = String(packId || "").trim();
  if (!id) return;
  const { customPacks, disabledIds } = await loadLexiconStorage();

  if (id.startsWith("builtin:")) {
    if (enabled) disabledIds.delete(id);
    else disabledIds.add(id);
    await chrome.storage.local.set({ [LEXICON_DISABLED_KEY]: [...disabledIds] });
  } else {
    const next = customPacks.map((pack) =>
      pack.id === id ? { ...pack, enabled: Boolean(enabled) } : pack,
    );
    if (enabled) disabledIds.delete(id);
    else disabledIds.add(id);
    await chrome.storage.local.set({
      [LEXICON_PACKS_KEY]: next,
      [LEXICON_DISABLED_KEY]: [...disabledIds],
    });
  }
  await reloadLexiconCache();
}

/**
 * @param {Partial<LexiconPack> & { name?: string, lang?: string, entries?: unknown }} input
 */
export async function createCustomPack(input = {}) {
  const pack = {
    id: `custom:${crypto.randomUUID()}`,
    name: String(input.name || "自定义词库").trim() || "自定义词库",
    lang: normalizeLexiconLang(input.lang),
    builtin: false,
    enabled: true,
    entries: normalizeEntries(input.entries),
  };
  const { customPacks } = await loadLexiconStorage();
  await saveCustomPacks([...customPacks, pack]);
  return pack;
}

/**
 * @param {string} packId
 */
export async function deleteCustomPack(packId) {
  const id = String(packId || "").trim();
  if (!id || id.startsWith("builtin:")) throw new Error("内置词库不能删除");
  const { customPacks, disabledIds } = await loadLexiconStorage();
  disabledIds.delete(id);
  await chrome.storage.local.set({
    [LEXICON_PACKS_KEY]: customPacks.filter((pack) => pack.id !== id),
    [LEXICON_DISABLED_KEY]: [...disabledIds],
  });
  await reloadLexiconCache();
}

/**
 * @param {string} packId
 * @param {LexiconPackEntry[]} entries
 * @param {{ name?: string, lang?: LexiconLang }} [meta]
 */
export async function updateCustomPack(packId, entries, meta = {}) {
  const id = String(packId || "").trim();
  if (!id || id.startsWith("builtin:")) throw new Error("内置词库不能修改");
  const { customPacks } = await loadLexiconStorage();
  const next = customPacks.map((pack) => {
    if (pack.id !== id) return pack;
    return {
      ...pack,
      name: meta.name != null ? String(meta.name).trim() || pack.name : pack.name,
      lang: meta.lang != null ? normalizeLexiconLang(meta.lang) : pack.lang,
      entries: normalizeEntries(entries),
    };
  });
  if (!next.some((pack) => pack.id === id)) throw new Error("词库不存在");
  await saveCustomPacks(next);
}

async function reloadLexiconCache() {
  const packs = await loadLexiconState();
  sortedCache = getMergedEntries(packs);
  return sortedCache;
}

function ensureStorageListener() {
  if (listening || typeof chrome === "undefined" || !chrome.storage?.onChanged) return;
  listening = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!changes[LEXICON_PACKS_KEY] && !changes[LEXICON_DISABLED_KEY]) return;
    readyPromise = reloadLexiconCache().catch((error) => {
      console.warn("[formant] lexicon reload failed", error);
      return sortedCache || TRANSLATE_LEXICON_SORTED;
    });
  });
}

/**
 * Ensure merged lexicon cache is loaded.
 * @returns {Promise<LexiconEntry[]>}
 */
export async function ensureLexiconReady() {
  ensureStorageListener();
  if (sortedCache) return sortedCache;
  if (!readyPromise) {
    readyPromise = reloadLexiconCache().catch((error) => {
      console.warn("[formant] lexicon init failed", error);
      sortedCache = TRANSLATE_LEXICON_SORTED;
      return sortedCache;
    });
  }
  return readyPromise;
}

/**
 * Sync accessor for scoring (falls back to bundled defaults before first load).
 * @returns {LexiconEntry[]}
 */
export function getLexiconSortedSync() {
  return sortedCache || TRANSLATE_LEXICON_SORTED;
}
