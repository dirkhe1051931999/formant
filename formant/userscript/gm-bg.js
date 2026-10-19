import { getScript, saveValues, valuesFor } from "./store.js";

const HOST_RE = /^https?:\/\/([^/]+)/i;

/**
 * @param {import("./store.js").UserscriptRecord} script
 * @param {string} url
 */
function assertConnect(script, url) {
  const rules = script.meta.connect || [];
  if (!rules.length || rules.includes("*")) return;
  const hit = String(url || "").match(HOST_RE);
  const host = hit ? hit[1].toLowerCase() : "";
  if (!host) throw new Error("GM_xmlhttpRequest 地址无效");
  const ok = rules.some((rule) => {
    const item = String(rule || "").toLowerCase();
    if (item === "*" || item === host) return true;
    if (item.startsWith(".")) return host.endsWith(item) || host === item.slice(1);
    if (item.startsWith("*.")) return host === item.slice(2) || host.endsWith(item.slice(1));
    return host === item || host.endsWith(`.${item}`);
  });
  if (!ok) throw new Error(`@connect 未允许 ${host}`);
}

/**
 * @param {string} scriptId
 * @param {string} method
 * @param {unknown[]} args
 * @param {chrome.runtime.MessageSender} sender
 */
export async function runGmMethod(scriptId, method, args, sender) {
  const script = await getScript(scriptId);
  if (!script || !script.enabled) throw new Error("脚本不可用");
  const list = Array.isArray(args) ? args : [];

  if (method === "setValue") {
    const values = await valuesFor(scriptId);
    values[String(list[0])] = list[1];
    await saveValues(scriptId, values);
    return true;
  }
  if (method === "deleteValue") {
    const values = await valuesFor(scriptId);
    delete values[String(list[0])];
    await saveValues(scriptId, values);
    return true;
  }
  if (method === "xhr") {
    return await gmXhr(script, list[0]);
  }
  if (method === "openInTab") {
    const url = String(list[0] || "");
    if (!/^https?:\/\//i.test(url)) throw new Error("只能打开 http(s) 链接");
    await chrome.tabs.create({ url, active: !list[1], openerTabId: sender.tab?.id });
    return true;
  }
  if (method === "notification") {
    const spec = list[0] && typeof list[0] === "object" ? list[0] : {};
    await chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: String(spec.title || script.meta.name || "formant"),
      message: String(spec.text || ""),
    });
    return true;
  }
  if (method === "setClipboard") {
    return { text: String(list[0] ?? ""), clipboard: true };
  }
  if (method === "registerMenu" || method === "unregisterMenu") {
    return true;
  }
  throw new Error(`未知 GM 方法 ${method}`);
}

/**
 * @param {import("./store.js").UserscriptRecord} script
 * @param {unknown} raw
 */
async function gmXhr(script, raw) {
  const details = raw && typeof raw === "object" ? /** @type {Record<string, any>} */ (raw) : {};
  const url = String(details.url || "");
  if (!/^https?:\/\//i.test(url)) throw new Error("GM_xmlhttpRequest 只支持 http(s)");
  assertConnect(script, url);
  const headers = details.headers && typeof details.headers === "object" ? details.headers : {};
  const ctrl = new AbortController();
  const timer = Number(details.timeout) > 0 ? setTimeout(() => ctrl.abort(), Number(details.timeout)) : 0;
  try {
    const res = await fetch(url, {
      method: String(details.method || "GET").toUpperCase(),
      headers,
      body: details.data ? String(details.data) : undefined,
      credentials: details.anonymous ? "omit" : "include",
      signal: ctrl.signal,
    });
    const responseHeaders = [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\r\n");
    const responseText = await res.text();
    return {
      status: res.status,
      statusText: res.statusText,
      readyState: 4,
      responseHeaders,
      responseText,
      response: responseText,
      finalUrl: res.url,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
