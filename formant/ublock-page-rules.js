/** Page-level results from uBO 1.76.0's own static DNR parser. */

import * as makeScriptlets from "./ublock/core/make-scriptlets.js";
import { builtinScriptlets } from "./ublock/core/resources/scriptlets.js";
import redirectResources from "./ublock/core/redirect-resources.js";
import { isTrustedHost } from "./ublock-config.js";

const SCRIPT_IDS = ["formant-ubo-main", "formant-ubo-isolated"];
const FALLBACK_SCRIPT_IDS = ["formant-ubo-fallback-main", "formant-ubo-fallback-isolated"];
const SCRIPT_TEMPLATE = "ublock/core/scriptlet.template.js";
const BEGIN_TEMPLATE = "ublock/core/scriptlet-begin.template.js";
const END_TEMPLATE = "ublock/core/scriptlet-end.template.js";

let specific = [];
let procedural = [];
let generic = new Map();
let genericHigh = [];
let genericExceptions = new Set();
let network = {};
let trusted = [];
let ready = false;
let scriptletState = "pending";

function hostMatches(pattern, hostname, url) {
  if (pattern === "*") return true;
  if (pattern.startsWith("*.")) return hostname.endsWith(pattern.slice(1));
  if (pattern.startsWith("/") && pattern.endsWith("/")) {
    try { return new RegExp(pattern.slice(1, -1)).test(hostname); } catch { return false; }
  }
  if (pattern.includes("/")) {
    const [host, path] = pattern.split("/", 2);
    return hostMatches(host, hostname, url) && url.includes(`/${path}`);
  }
  if (pattern.endsWith(".*")) {
    const entity = pattern.slice(0, -2);
    return hostname === entity || hostname.startsWith(`${entity}.`) || hostname.includes(`.${entity}.`);
  }
  return hostname === pattern || hostname.endsWith(`.${pattern}`);
}

function matchesAny(patterns, hostname, url) {
  return Array.isArray(patterns) && patterns.some((pattern) => hostMatches(pattern, hostname, url));
}

function styleRules(selectors) {
  return selectors.map((selector) => {
    if (!selector.startsWith("{")) return `${selector}{display:none!important}`;
    try {
      const rule = JSON.parse(selector);
      if (rule.cssable && rule.action?.[0] === "style" && rule.selector) {
        return `${rule.selector}{${rule.action[1]}}`;
      }
    } catch {}
    return "";
  }).filter(Boolean).join("\n");
}

/**
 * @param {object} compiled
 * @param {string[]} [trustedSites]
 */
export function setPageRules(compiled, trustedSites = []) {
  trusted = Array.isArray(trustedSites) ? trustedSites : [];
  specific = [];
  procedural = [];
  for (const [selector, details] of compiled.specificCosmetic || []) {
    if (details.rejected) continue;
    if (!selector.startsWith("{")) {
      specific.push([selector, details]);
      continue;
    }
    try {
      const rule = JSON.parse(selector);
      if (rule.cssable && rule.action?.[0] === "style" && typeof rule.selector === "string") {
        specific.push([selector, details]);
      } else if (!rule.cssable) {
        procedural.push([selector, rule, details]);
      }
    } catch {}
  }
  genericExceptions = new Set((compiled.genericCosmeticExceptions || []).map((item) => item.selector));
  generic = new Map();
  genericHigh = [];
  for (const { key, selector } of compiled.genericCosmeticFilters || []) {
    if (genericExceptions.has(selector)) continue;
    if (key) {
      const values = generic.get(key) || [];
      values.push(selector);
      generic.set(key, values);
    } else {
      genericHigh.push(selector);
    }
  }
  network = compiled.network || {};
  ready = true;
  return specific.length + procedural.length + generic.size + genericHigh.length;
}

export function hasPageRules() {
  return ready;
}

export function clearPageRules() {
  ready = false;
  specific = [];
  procedural = [];
  generic = new Map();
  genericHigh = [];
  genericExceptions = new Set();
  network = {};
  trusted = [];
}

/** @param {string} pageUrl */
export function getPageCss(pageUrl) {
  const url = new URL(pageUrl);
  const hostname = url.hostname;
  if (isTrustedHost(hostname, trusted)) {
    return { specific: "", genericHigh: "", genericEnabled: false, procedural: [] };
  }
  const exceptions = new Set();
  const selectors = new Set();
  for (const [selector, details] of specific) {
    if (matchesAny(details.excludeMatches, hostname, pageUrl)) exceptions.add(selector);
    if (matchesAny(details.matches, hostname, pageUrl)) selectors.add(selector);
  }
  for (const selector of exceptions) selectors.delete(selector);

  const procExceptions = new Set();
  const procMap = new Map();
  for (const [key, rule, details] of procedural) {
    if (matchesAny(details.excludeMatches, hostname, pageUrl)) procExceptions.add(key);
    if (matchesAny(details.matches, hostname, pageUrl)) procMap.set(key, rule);
  }
  for (const key of procExceptions) procMap.delete(key);

  const hideGeneric = !matchesAny(network.generichideExclusions, hostname, pageUrl);
  return {
    specific: styleRules([...selectors]),
    genericHigh: hideGeneric ? styleRules(genericHigh.filter((selector) => !exceptions.has(selector))) : "",
    genericEnabled: hideGeneric,
    procedural: [...procMap.values()],
  };
}

/** @param {string} pageUrl @param {string[]} keys */
export function getGenericCss(pageUrl, keys) {
  const url = new URL(pageUrl);
  const hostname = url.hostname;
  if (isTrustedHost(hostname, trusted) || matchesAny(network.generichideExclusions, hostname, pageUrl)) return "";
  const exceptions = new Set();
  for (const [selector, details] of specific) {
    if (matchesAny(details.excludeMatches, hostname, pageUrl)) exceptions.add(selector);
  }
  const selectors = new Set();
  for (const key of keys) {
    for (const selector of generic.get(key) || []) {
      if (!exceptions.has(selector)) selectors.add(selector);
    }
  }
  return styleRules([...selectors]);
}

async function bundledText(path) {
  const response = await fetch(chrome.runtime.getURL(path));
  if (!response.ok) throw new Error(`Missing uBO template: ${path}`);
  return response.text();
}

export async function clearUblockScriptlets() {
  if (typeof chrome.userScripts?.unregister === "function") {
    await chrome.userScripts.unregister({ ids: SCRIPT_IDS }).catch(() => {});
  }
  if (typeof chrome.scripting?.unregisterContentScripts === "function") {
    await chrome.scripting.unregisterContentScripts({ ids: FALLBACK_SCRIPT_IDS }).catch(() => {});
  }
  scriptletState = "disabled";
}

async function registerFallbackScriptlets() {
  if (typeof chrome.scripting?.registerContentScripts !== "function") {
    scriptletState = "scripting API unavailable";
    return scriptletState;
  }
  await chrome.scripting.unregisterContentScripts({ ids: FALLBACK_SCRIPT_IDS }).catch(() => {});
  await chrome.scripting.registerContentScripts([
    {
      id: FALLBACK_SCRIPT_IDS[0],
      js: ["ublock/rulesets/scriptlets-main.js"],
      matches: ["http://*/*", "https://*/*"],
      allFrames: true,
      matchOriginAsFallback: true,
      runAt: "document_start",
      world: "MAIN",
      persistAcrossSessions: true,
    },
    {
      id: FALLBACK_SCRIPT_IDS[1],
      js: ["ublock/rulesets/scriptlets-isolated.js"],
      matches: ["http://*/*", "https://*/*"],
      allFrames: true,
      matchOriginAsFallback: true,
      runAt: "document_start",
      world: "ISOLATED",
      persistAcrossSessions: true,
    },
  ]);
  scriptletState = "2 worlds (static fallback)";
  return scriptletState;
}

/** Compile uBO's own scriptlet registry and templates for the active lists. */
export async function syncUblockScriptlets(compiled) {
  const rules = compiled.scriptlet;
  if (!(rules instanceof Map) || rules.size === 0) {
    await clearUblockScriptlets();
    return scriptletState;
  }

  if (typeof chrome.userScripts?.register === "function") {
    try {
      const [template, begin, end] = await Promise.all(
        [SCRIPT_TEMPLATE, BEGIN_TEMPLATE, END_TEMPLATE].map(bundledText),
      );
      makeScriptlets.resetAll();
      makeScriptlets.init(builtinScriptlets);
      await Promise.all([...redirectResources].filter(([name, details]) =>
        name.endsWith(".js") && details.data === "text",
      ).map(async ([name, details]) => {
        try {
          const code = await bundledText(`ublock/core/web_accessible_resources/${name}`);
          makeScriptlets.importScriptlet({ name, code, ...details });
        } catch (error) {
          console.warn("[formant] missing uBO redirect scriptlet", name, error);
        }
      }));
      for (const details of rules.values()) {
        makeScriptlets.compile("formant", structuredClone(details));
      }
      const secret = `formant_ubo_${crypto.randomUUID().replaceAll("-", "")}`;
      const scripts = makeScriptlets.commit("formant", template, secret);
      const frameworks = makeScriptlets.commitFramework(begin, end, secret);
      const registrations = [];
      for (const [world, id] of [["MAIN", SCRIPT_IDS[0]], ["ISOLATED", SCRIPT_IDS[1]]]) {
        if (!scripts[world]) continue;
        registrations.push({
          id,
          matches: ["http://*/*", "https://*/*"],
          allFrames: true,
          runAt: "document_start",
          world: world === "MAIN" ? "MAIN" : "USER_SCRIPT",
          js: [{ code: `${frameworks[world].beginCode}\n${scripts[world].code}\n${frameworks[world].endCode}` }],
        });
      }
      await clearUblockScriptlets();
      if (registrations.length) await chrome.userScripts.register(registrations);
      scriptletState = `${registrations.length} worlds (userScripts)`;
      return scriptletState;
    } catch (error) {
      console.warn("[formant] uBO userScripts failed, falling back to scripting", error);
    }
  }

  try {
    return await registerFallbackScriptlets();
  } catch (error) {
    scriptletState = error instanceof Error ? error.message : String(error);
    console.warn("[formant] uBO scriptlet fallback unavailable", error);
    return scriptletState;
  }
}

export function getScriptletState() {
  return scriptletState;
}
