import { isUserscriptEnabled, loadFeatures } from "../features.js";
import { registerPatterns, scriptMatchesUrl } from "./match.js";
import {
  ENGINE_KEY,
  TOKEN_KEY,
  listScripts,
  saveEngineState,
  valuesFor,
} from "./store.js";
import { wrapUserscript } from "./wrap.js";

const PREFIX = "formant-us-";

function newToken() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function userScriptsApi() {
  return /** @type {{ register?: Function, unregister?: Function, getScripts?: Function } | undefined} */ (
    chrome.userScripts
  );
}

/**
 * @returns {Promise<{ engine: string, token: string, error: string }>}
 */
export async function syncUserscripts() {
  const features = await loadFeatures();
  const token = newToken();
  const enabled = isUserscriptEnabled(features);
  await chrome.storage.local.set({ [TOKEN_KEY]: token });

  try {
    await unregisterOurs();
  } catch {
    /* 权限未开时 getScripts 也会失败 */
  }

  if (!enabled) {
    const state = { engine: "", token, error: "" };
    await saveEngineState(state);
    return state;
  }

  const scripts = (await listScripts()).filter((item) => item.enabled);
  const extVersion = chrome.runtime.getManifest().version;
  /** @type {object[]} */
  const regs = [];
  for (const script of scripts) {
    if (!script.meta.matches.length && !script.meta.includes.length) continue;
    const values = await valuesFor(script.id);
    const { matches, excludeMatches } = registerPatterns(script.meta);
    /** @type {Record<string, unknown>} */
    const reg = {
      id: `${PREFIX}${script.id}`,
      matches,
      allFrames: !script.meta.noframes,
      runAt: script.meta.runAt === "document-start" ? "document_start" : script.meta.runAt === "document-end" ? "document_end" : "document_idle",
      world: "MAIN",
      js: [{ code: wrapUserscript(script, { token, values, extVersion }) }],
    };
    if (excludeMatches.length) reg.excludeMatches = excludeMatches;
    regs.push(reg);
  }

  const api = userScriptsApi();
  if (api && typeof api.register === "function" && regs.length) {
    try {
      await api.register(regs);
      const state = { engine: "userScripts", token, error: "" };
      await saveEngineState(state);
      return state;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const state = {
        engine: "content",
        token,
        error: /user script|User Scripts|not allowed|must be enabled/i.test(message)
          ? "请在扩展详情开启「允许运行用户脚本」，然后重载。"
          : message,
      };
      await saveEngineState(state);
      return state;
    }
  }

  const state = {
    engine: regs.length ? "content" : "",
    token,
    error: regs.length && !api ? "当前浏览器没有 userScripts API，已改用内容脚本注入。" : "",
  };
  await chrome.storage.local.set({ [ENGINE_KEY]: state.engine, [TOKEN_KEY]: token });
  return state;
}

async function unregisterOurs() {
  const api = userScriptsApi();
  if (!api || typeof api.getScripts !== "function") return;
  const existing = await api.getScripts();
  const ids = (existing || [])
    .map((item) => item.id)
    .filter((id) => typeof id === "string" && id.startsWith(PREFIX));
  if (ids.length && typeof api.unregister === "function") {
    await api.unregister({ ids });
  }
}

/**
 * @param {string} url
 * @param {{ isTop?: boolean }} opt
 */
export async function matchingScripts(url, opt = {}) {
  const features = await loadFeatures();
  if (!isUserscriptEnabled(features)) return [];
  const scripts = await listScripts();
  return scripts.filter((item) => item.enabled && scriptMatchesUrl(item.meta, url, opt));
}
