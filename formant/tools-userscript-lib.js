import { scriptMatchesUrl } from "./userscript/match.js";

export const NEW_TEMPLATE = `// ==UserScript==
// @name         新脚本
// @namespace    formant
// @version      0.1.0
// @description  由 formant 创建
// @match        https://example.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";
})();
`;

/**
 * @param {string} type
 * @param {Record<string, unknown>} [payload]
 */
export function usSend(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (res) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      if (!res || res.ok === false) {
        reject(new Error((res && res.error) || "请求失败"));
        return;
      }
      resolve(res);
    });
  });
}

export async function listUserscripts() {
  const res = await usSend("FORMANT_US_LIST");
  return {
    scripts: Array.isArray(res.scripts) ? res.scripts : [],
    engine: res.engine || { engine: "", token: "", error: "" },
  };
}

/** @returns {Promise<chrome.tabs.Tab | null>} */
export async function pickHttpTab() {
  try {
    const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
    const http = tabs
      .filter((t) => t.id && /^https?:/i.test(t.url || ""))
      .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    if (http[0]) return http[0];
    const actives = await chrome.tabs.query({ active: true });
    return actives.find((t) => t.id && /^https?:/i.test(t.url || "")) || null;
  } catch {
    return null;
  }
}

/**
 * @param {import("./userscript/store.js").UserscriptRecord} script
 * @param {string} url
 */
export function scriptMatchesTab(script, url) {
  if (!url) return false;
  return scriptMatchesUrl(script.meta, url, { isTop: true });
}

/**
 * @param {import("./userscript/store.js").UserscriptRecord} script
 */
export function matchHint(script) {
  const rules = [...(script.meta.matches || []), ...(script.meta.includes || [])];
  return rules.slice(0, 2).join(" · ") || "未指定匹配";
}

/**
 * @param {string} hash
 */
export function parseUserscriptHash(hash) {
  const raw = decodeURIComponent(String(hash || "").replace(/^#/, ""));
  const parts = raw.split("/").filter(Boolean);
  if (parts[0] !== "userscript") return { view: "list", id: "" };
  const next = parts[1] || "list";
  if (next === "search" || next === "import" || next === "new" || next === "list") {
    return { view: next, id: "" };
  }
  if (next === "edit") return { view: "edit", id: parts[2] || "" };
  return { view: "list", id: "" };
}

export function userscriptHref(view, id = "") {
  if (view === "list") return "#userscript";
  if (view === "edit") return `#userscript/edit/${encodeURIComponent(id)}`;
  return `#userscript/${view}`;
}

/**
 * @param {string} name
 */
export function safeJsFilename(name) {
  const cleaned = String(name || "script")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${cleaned || "script"}.user.js`;
}
