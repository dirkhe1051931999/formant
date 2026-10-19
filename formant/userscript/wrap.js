import { stripUserscriptHeader } from "./parse.js";

/**
 * @param {import("./store.js").UserscriptRecord} script
 * @param {{ token: string, values: Record<string, unknown>, extVersion: string }} ctx
 */
export function wrapUserscript(script, ctx) {
  const body = [
    ...script.requires.map((item) => item.code || ""),
    stripUserscriptHeader(script.source),
  ].join("\n;\n");
  const grants = new Set(script.meta.grants || []);
  const grantNone = grants.size === 0;
  const info = {
    scriptHandler: "formant",
    version: ctx.extVersion,
    injectInto: "page",
    uuid: script.id,
    scriptMetaStr: script.meta.header || "",
    script: {
      name: script.meta.name,
      namespace: script.meta.namespace,
      description: script.meta.description,
      version: script.meta.version,
      includes: script.meta.includes,
      excludes: script.meta.excludes,
      matches: script.meta.matches,
      resources: Object.fromEntries(script.resources.map((item) => [item.name, item.url])),
      grant: script.meta.grants,
      "run-at": script.meta.runAt,
    },
  };
  const resources = Object.fromEntries(script.resources.map((item) => [item.name, item.text]));
  const payload = {
    id: script.id,
    token: ctx.token,
    grantNone,
    grants: [...grants],
    info,
    values: ctx.values || {},
    resources,
    code: body,
  };
  return `(${runtime.toString()})(${JSON.stringify(payload)});`;
}

/**
 * 注入到页面 MAIN world。GM_* 挂在 Function 参数上，避免依赖页面 eval。
 * @param {{
 *   id: string,
 *   token: string,
 *   grantNone: boolean,
 *   grants: string[],
 *   info: object,
 *   values: Record<string, unknown>,
 *   resources: Record<string, string>,
 *   code: string,
 * }} payload
 */
function runtime(payload) {
  const values = payload.values || {};
  const resources = payload.resources || {};
  const granted = new Set(payload.grants || []);
  const gm4 = {
    GM_addStyle: "GM.addStyle",
    GM_getValue: "GM.getValue",
    GM_setValue: "GM.setValue",
    GM_deleteValue: "GM.deleteValue",
    GM_listValues: "GM.listValues",
    GM_xmlhttpRequest: "GM.xmlHttpRequest",
    GM_openInTab: "GM.openInTab",
    GM_notification: "GM.notification",
    GM_setClipboard: "GM.setClipboard",
    GM_getResourceText: "GM.getResourceText",
    GM_getResourceURL: "GM.getResourceURL",
    GM_registerMenuCommand: "GM.registerMenuCommand",
    GM_unregisterMenuCommand: "GM.unregisterMenuCommand",
    GM_addElement: "GM.addElement",
    GM_log: "GM.log",
  };
  const allow = (name) => {
    if (payload.grantNone) return false;
    return granted.has("*") || granted.has(name) || Boolean(gm4[name] && granted.has(gm4[name]));
  };

  function call(method, args) {
    return new Promise((resolve, reject) => {
      const rid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      function onMsg(event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.__formantGm !== 1 || data.dir !== "res" || data.id !== rid) return;
        window.removeEventListener("message", onMsg);
        if (data.error) reject(new Error(data.error));
        else resolve(data.result);
      }
      window.addEventListener("message", onMsg);
      window.postMessage(
        { __formantGm: 1, dir: "req", id: rid, token: payload.token, scriptId: payload.id, method, args },
        "*",
      );
    });
  }

  function GM_addStyle(css) {
    const el = document.createElement("style");
    el.setAttribute("data-formant-us", payload.id);
    el.textContent = String(css || "");
    (document.head || document.documentElement).appendChild(el);
    return el;
  }

  function GM_addElement(parent, tag, attrs) {
    let root = parent;
    let name = tag;
    let props = attrs;
    if (typeof parent === "string") {
      root = document.head || document.documentElement;
      name = parent;
      props = tag;
    }
    const el = document.createElement(String(name || "div"));
    if (props && typeof props === "object") {
      for (const [key, value] of Object.entries(props)) {
        if (key === "textContent") el.textContent = String(value);
        else el.setAttribute(key, String(value));
      }
    }
    (root || document.documentElement).appendChild(el);
    return el;
  }

  function GM_getValue(key, def) {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : def;
  }
  function GM_setValue(key, value) {
    values[key] = value;
    void call("setValue", [String(key), value]);
  }
  function GM_deleteValue(key) {
    delete values[key];
    void call("deleteValue", [String(key)]);
  }
  function GM_listValues() {
    return Object.keys(values);
  }
  function GM_getResourceText(name) {
    return resources[name] || "";
  }
  function GM_getResourceURL(name) {
    const text = resources[name];
    if (text == null) return "";
    return `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`;
  }
  function GM_log(...args) {
    console.log(`[formant userscript] ${payload.info.script.name}`, ...args);
  }
  function GM_xmlhttpRequest(details) {
    const req = details && typeof details === "object" ? details : {};
    const serial = {
      url: String(req.url || ""),
      method: String(req.method || "GET"),
      headers: req.headers && typeof req.headers === "object" ? req.headers : {},
      data: typeof req.data === "string" ? req.data : "",
      anonymous: Boolean(req.anonymous),
      timeout: Number(req.timeout) || 0,
      responseType: String(req.responseType || ""),
    };
    void call("xhr", [serial]).then(
      (res) => {
        if (typeof req.onload === "function") req.onload(res);
      },
      (error) => {
        if (typeof req.onerror === "function") req.onerror({ error: String(error && error.message ? error.message : error) });
      },
    );
    return { abort() {} };
  }
  function GM_openInTab(url, options) {
    const background = typeof options === "boolean" ? options : Boolean(options && options.active === false);
    void call("openInTab", [String(url || ""), background]);
  }
  function GM_notification(details, ondone) {
    const spec = typeof details === "string" ? { text: details } : details || {};
    void call("notification", [{ text: spec.text || spec, title: spec.title || payload.info.script.name }]);
    if (typeof ondone === "function") ondone();
  }
  function GM_setClipboard(text) {
    void call("setClipboard", [String(text ?? "")]);
  }
  const menus = new Map();
  function GM_registerMenuCommand(caption, listener) {
    const mid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    menus.set(mid, listener);
    void call("registerMenu", [mid, String(caption || "")]);
    return mid;
  }
  function GM_unregisterMenuCommand(mid) {
    menus.delete(mid);
    void call("unregisterMenu", [String(mid || "")]);
  }
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.__formantGm !== 1 || data.dir !== "menu" || data.scriptId !== payload.id) return;
    const fn = menus.get(data.menuId);
    if (typeof fn === "function") fn();
  });

  const GM_info = payload.info;
  const GM = payload.grantNone
    ? { info: GM_info }
    : {
        info: GM_info,
        addStyle: (css) => Promise.resolve(GM_addStyle(css)),
        addElement: (...args) => Promise.resolve(GM_addElement(...args)),
        getValue: async (key, def) => GM_getValue(key, def),
        setValue: async (key, value) => GM_setValue(key, value),
        deleteValue: async (key) => GM_deleteValue(key),
        listValues: async () => GM_listValues(),
        getResourceText: async (name) => GM_getResourceText(name),
        getResourceURL: async (name) => GM_getResourceURL(name),
        xmlHttpRequest: (details) => GM_xmlhttpRequest(details),
        openInTab: async (url, options) => GM_openInTab(url, options),
        notification: async (details) => GM_notification(details),
        setClipboard: async (text) => GM_setClipboard(text),
        registerMenuCommand: async (caption, listener) => GM_registerMenuCommand(caption, listener),
        unregisterMenuCommand: async (mid) => GM_unregisterMenuCommand(mid),
        log: (...args) => GM_log(...args),
      };

  const names = [
    "GM",
    "GM_info",
    "unsafeWindow",
    "cloneInto",
    "exportFunction",
    "GM_addStyle",
    "GM_getValue",
    "GM_setValue",
    "GM_deleteValue",
    "GM_listValues",
    "GM_xmlhttpRequest",
    "GM_openInTab",
    "GM_notification",
    "GM_setClipboard",
    "GM_getResourceText",
    "GM_getResourceURL",
    "GM_registerMenuCommand",
    "GM_unregisterMenuCommand",
    "GM_addElement",
    "GM_log",
  ];
  const fns = {
    GM,
    GM_info,
    unsafeWindow: window,
    cloneInto: (value) => value,
    exportFunction: (value) => value,
    GM_addStyle: allow("GM_addStyle") ? GM_addStyle : undefined,
    GM_getValue: allow("GM_getValue") || allow("GM.getValue") ? GM_getValue : undefined,
    GM_setValue: allow("GM_setValue") || allow("GM.setValue") ? GM_setValue : undefined,
    GM_deleteValue: allow("GM_deleteValue") ? GM_deleteValue : undefined,
    GM_listValues: allow("GM_listValues") ? GM_listValues : undefined,
    GM_xmlhttpRequest: allow("GM_xmlhttpRequest") || allow("GM.xmlHttpRequest") ? GM_xmlhttpRequest : undefined,
    GM_openInTab: allow("GM_openInTab") ? GM_openInTab : undefined,
    GM_notification: allow("GM_notification") ? GM_notification : undefined,
    GM_setClipboard: allow("GM_setClipboard") ? GM_setClipboard : undefined,
    GM_getResourceText: allow("GM_getResourceText") ? GM_getResourceText : undefined,
    GM_getResourceURL: allow("GM_getResourceURL") ? GM_getResourceURL : undefined,
    GM_registerMenuCommand: allow("GM_registerMenuCommand") ? GM_registerMenuCommand : undefined,
    GM_unregisterMenuCommand: allow("GM_unregisterMenuCommand") ? GM_unregisterMenuCommand : undefined,
    GM_addElement: allow("GM_addElement") ? GM_addElement : undefined,
    GM_log: allow("GM_log") ? GM_log : undefined,
  };

  try {
    const runner = new Function(...names, payload.code);
    runner(...names.map((name) => fns[name]));
  } catch (error) {
    console.error("[formant userscript]", payload.info.script.name, error);
  }
}
