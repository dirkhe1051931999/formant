import { FEATURES_KEY, isUserscriptEnabled, loadFeatures, normalizeFeatures } from "./features.js";
import { runGmMethod } from "./userscript/gm-bg.js";
import { compareScriptVersion, parseUserscriptMeta } from "./userscript/parse.js";
import { matchingScripts, syncUserscripts } from "./userscript/register.js";
import { importSeedIfNeeded } from "./userscript/seed.js";
import {
  SCRIPTS_KEY,
  fetchText,
  getScript,
  listScripts,
  loadEngineState,
  removeScript,
  setScriptEnabled,
  upsertFromSource,
  valuesFor,
} from "./userscript/store.js";
import { wrapUserscript } from "./userscript/wrap.js";

let chain = Promise.resolve();

function enqueue(task) {
  const next = chain.then(task, task);
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export function initUserscriptBackground() {
  void enqueue(async () => {
    await importSeedIfNeeded();
    await syncUserscripts();
  }).catch((error) => {
    console.warn("[formant] userscript sync failed", error);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!changes[FEATURES_KEY] && !changes[SCRIPTS_KEY]) return;
    if (changes[FEATURES_KEY]) {
      const prev = normalizeFeatures(changes[FEATURES_KEY].oldValue);
      const next = normalizeFeatures(changes[FEATURES_KEY].newValue);
      if (isUserscriptEnabled(prev) === isUserscriptEnabled(next) && !changes[SCRIPTS_KEY]) return;
    }
    void enqueue(() => syncUserscripts()).catch((error) => {
      console.warn("[formant] userscript resync failed", error);
    });
  });
}

/**
 * @param {unknown} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {(response?: unknown) => void} sendResponse
 */
export function handleUserscriptMessage(message, sender, sendResponse) {
  const type = message && typeof message === "object" ? message.type : "";
  if (typeof type !== "string" || !type.startsWith("FORMANT_US_")) return false;

  void (async () => {
    if (type === "FORMANT_US_LIST") return { scripts: await listScripts(), engine: await loadEngineState() };
    if (type === "FORMANT_US_GET") return { script: await getScript(String(message.id || "")) };
    if (type === "FORMANT_US_SAVE") {
      const record = await upsertFromSource(String(message.source || ""), {
        id: message.id ? String(message.id) : undefined,
        installUrl: message.installUrl ? String(message.installUrl) : undefined,
        enabled: typeof message.enabled === "boolean" ? message.enabled : undefined,
      });
      return { script: record };
    }
    if (type === "FORMANT_US_TOGGLE") {
      return { script: await setScriptEnabled(String(message.id || ""), Boolean(message.enabled)) };
    }
    if (type === "FORMANT_US_DELETE") {
      await removeScript(String(message.id || ""));
      return { ok: true };
    }
    if (type === "FORMANT_US_FETCH") {
      const text = await fetchText(String(message.url || ""));
      parseUserscriptMeta(text);
      return { source: text };
    }
    if (type === "FORMANT_US_SEARCH") {
      return { items: await searchGreasyFork(String(message.q || ""), String(message.site || "")) };
    }
    if (type === "FORMANT_US_UPDATE") {
      return await checkUpdate(String(message.id || ""));
    }
    if (type === "FORMANT_US_ENGINE") return await loadEngineState();
    if (type === "FORMANT_US_MATCH") {
      const url = String(message.url || sender.tab?.url || "");
      const isTop = sender.frameId === 0;
      return {
        scripts: await matchingScripts(url, { isTop }),
        engine: await loadEngineState(),
        url,
      };
    }
    if (type === "FORMANT_US_INJECT") {
      await injectFallback(sender, String(message.url || sender.tab?.url || ""));
      return { ok: true };
    }
    if (type === "FORMANT_US_GM") {
      return {
        result: await runGmMethod(String(message.scriptId || ""), String(message.method || ""), message.args || [], sender),
      };
    }
    throw new Error(`未知消息 ${type}`);
  })()
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  return true;
}

/**
 * @param {string} q
 * @param {string} site
 */
async function searchGreasyFork(q, site) {
  const query = q.trim();
  const host = site.trim();
  if (!query && !host) throw new Error("请输入关键字或选择当前站");
  const url = host
    ? `https://greasyfork.org/zh-CN/scripts/by-site/${encodeURIComponent(host)}.json`
    : `https://greasyfork.org/zh-CN/scripts.json?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    credentials: "omit",
  });
  if (!res.ok) throw new Error(`Greasy Fork 搜索失败（${res.status}）`);
  const data = await res.json();
  const rows = Array.isArray(data) ? data : [];
  return rows.slice(0, 40).map((item) => ({
    id: item.id,
    name: item.name || "",
    description: item.description || "",
    url: item.url || `https://greasyfork.org/scripts/${item.id}`,
    codeUrl: item.code_url || `https://greasyfork.org/scripts/${item.id}/code.user.js`,
    version: item.version || "",
    dailyInstalls: item.daily_installs || 0,
    totalInstalls: item.total_installs || 0,
    locale: item.locale || "",
  }));
}

/**
 * @param {string} id
 */
async function checkUpdate(id) {
  const script = await getScript(id);
  if (!script) throw new Error("脚本不存在");
  const url = script.meta.updateURL || script.meta.downloadURL || script.installUrl;
  if (!url) throw new Error("没有更新地址");
  const source = await fetchText(url);
  const meta = parseUserscriptMeta(source);
  const newer = compareScriptVersion(meta.version, script.meta.version) > 0;
  if (newer) {
    await upsertFromSource(source, { id: script.id, installUrl: script.installUrl || url });
  }
  return { newer, version: meta.version, source: newer ? source : "" };
}

/**
 * @param {chrome.runtime.MessageSender} sender
 * @param {string} url
 */
async function injectFallback(sender, url) {
  const features = await loadFeatures();
  if (!isUserscriptEnabled(features)) return;
  const tabId = sender.tab?.id;
  if (tabId == null) return;
  const engine = await loadEngineState();
  if (engine.engine === "userScripts") return;
  const isTop = sender.frameId === 0;
  const scripts = await matchingScripts(url, { isTop });
  const extVersion = chrome.runtime.getManifest().version;
  for (const script of scripts) {
    const values = await valuesFor(script.id);
    const code = wrapUserscript(script, { token: engine.token, values, extVersion });
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: sender.frameId != null ? [sender.frameId] : undefined },
      world: "MAIN",
      injectImmediately: script.meta.runAt === "document-start",
      func: (src) => {
        const runner = new Function(src);
        runner();
      },
      args: [code],
    });
  }
}
