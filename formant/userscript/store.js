import { parseUserscriptMeta } from "./parse.js";

export const SCRIPTS_KEY = "formantUserscripts";
export const VALUES_KEY = "formantUsValues";
export const ENGINE_KEY = "formantUsEngine";
export const TOKEN_KEY = "formantUsToken";

const STORE_VERSION = 1;

/**
 * @typedef {{
 *   id: string,
 *   enabled: boolean,
 *   source: string,
 *   meta: import("./parse.js").UserscriptMeta,
 *   requires: { url: string, code: string }[],
 *   resources: { name: string, url: string, text: string }[],
 *   installUrl: string,
 *   createdAt: number,
 *   updatedAt: number,
 * }} UserscriptRecord
 */

/**
 * @returns {Promise<{ version: number, scripts: UserscriptRecord[] }>}
 */
export async function loadBundle() {
  const data = await chrome.storage.local.get(SCRIPTS_KEY);
  const raw = data[SCRIPTS_KEY];
  const scripts = raw && Array.isArray(raw.scripts) ? raw.scripts.filter(isRecord) : [];
  return { version: STORE_VERSION, scripts };
}

/**
 * @param {unknown} item
 * @returns {item is UserscriptRecord}
 */
function isRecord(item) {
  return Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.source === "string");
}

/**
 * @param {UserscriptRecord[]} scripts
 */
export async function saveBundle(scripts) {
  await chrome.storage.local.set({
    [SCRIPTS_KEY]: { version: STORE_VERSION, scripts },
  });
}

export async function listScripts() {
  const bundle = await loadBundle();
  return bundle.scripts;
}

/**
 * @param {string} id
 */
export async function getScript(id) {
  const scripts = await listScripts();
  return scripts.find((item) => item.id === id) || null;
}

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `us-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {string} source
 * @param {{ installUrl?: string, id?: string, enabled?: boolean }} [opt]
 * @returns {Promise<UserscriptRecord>}
 */
export async function upsertFromSource(source, opt = {}) {
  const meta = parseUserscriptMeta(source);
  const scripts = await listScripts();
  const same = scripts.find((item) => {
    if (opt.id && item.id === opt.id) return true;
    if (opt.installUrl && item.installUrl && item.installUrl === opt.installUrl) return true;
    return item.meta.namespace === meta.namespace && item.meta.name === meta.name && (meta.namespace || meta.name);
  });
  const now = Date.now();
  const prev = same || null;
  const requires = await fetchExtras(meta.requires, prev?.requires || [], (url, text) => ({ url, code: text }));
  const resources = await fetchExtras(
    meta.resources.map((item) => item.url),
    (prev?.resources || []).map((item) => ({ url: item.url, code: item.text })),
    (url, text) => {
      const spec = meta.resources.find((item) => item.url === url);
      return { name: spec?.name || url, url, text };
    },
  );
  const record = {
    id: prev?.id || opt.id || newId(),
    enabled: typeof opt.enabled === "boolean" ? opt.enabled : prev ? prev.enabled : true,
    source: String(source),
    meta,
    requires,
    resources,
    installUrl: opt.installUrl || prev?.installUrl || "",
    createdAt: prev?.createdAt || now,
    updatedAt: now,
  };
  const next = prev ? scripts.map((item) => (item.id === record.id ? record : item)) : [...scripts, record];
  await saveBundle(next);
  return record;
}

/**
 * @template T
 * @param {string[]} urls
 * @param {{ url: string, code?: string, text?: string }[]} cached
 * @param {(url: string, text: string) => T} map
 * @returns {Promise<T[]>}
 */
async function fetchExtras(urls, cached, map) {
  const out = [];
  for (const url of urls) {
    const hit = cached.find((item) => item.url === url);
    let text = hit ? String(hit.code || hit.text || "") : "";
    if (!hit) {
      try {
        text = await fetchText(url);
      } catch (error) {
        console.warn("[formant] userscript extra failed", url, error);
      }
    }
    out.push(map(url, text));
  }
  return out;
}

/**
 * @param {string} url
 */
export async function fetchText(url) {
  const target = String(url || "").trim();
  if (!/^https?:\/\//i.test(target)) throw new Error(`不支持的地址：${target}`);
  const res = await fetch(target, { credentials: "omit" });
  if (!res.ok) throw new Error(`下载失败 ${res.status}：${target}`);
  return await res.text();
}

/**
 * @param {string} id
 * @param {boolean} enabled
 */
export async function setScriptEnabled(id, enabled) {
  const scripts = await listScripts();
  const next = scripts.map((item) => (item.id === id ? { ...item, enabled: Boolean(enabled), updatedAt: Date.now() } : item));
  await saveBundle(next);
  return next.find((item) => item.id === id) || null;
}

/**
 * @param {string} id
 */
export async function removeScript(id) {
  const scripts = await listScripts();
  await saveBundle(scripts.filter((item) => item.id !== id));
  const values = await loadValues();
  if (values[id]) {
    delete values[id];
    await chrome.storage.local.set({ [VALUES_KEY]: values });
  }
}

/**
 * @returns {Promise<Record<string, Record<string, unknown>>>}
 */
export async function loadValues() {
  const data = await chrome.storage.local.get(VALUES_KEY);
  const raw = data[VALUES_KEY];
  return raw && typeof raw === "object" ? /** @type {Record<string, Record<string, unknown>>} */ (raw) : {};
}

/**
 * @param {string} scriptId
 */
export async function valuesFor(scriptId) {
  const all = await loadValues();
  return all[scriptId] && typeof all[scriptId] === "object" ? { ...all[scriptId] } : {};
}

/**
 * @param {string} scriptId
 * @param {Record<string, unknown>} values
 */
export async function saveValues(scriptId, values) {
  const all = await loadValues();
  all[scriptId] = values;
  await chrome.storage.local.set({ [VALUES_KEY]: all });
}

export async function loadEngineState() {
  const data = await chrome.storage.local.get([ENGINE_KEY, TOKEN_KEY]);
  return {
    engine: data[ENGINE_KEY] === "content" ? "content" : data[ENGINE_KEY] === "userScripts" ? "userScripts" : "",
    token: String(data[TOKEN_KEY] || ""),
    error: "",
  };
}

/**
 * @param {{ engine: string, token: string, error?: string }} state
 */
export async function saveEngineState(state) {
  await chrome.storage.local.set({
    [ENGINE_KEY]: state.engine,
    [TOKEN_KEY]: state.token,
  });
}
