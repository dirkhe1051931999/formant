import { SUBSCRIBED_LISTS } from "./ublock-sync.js";
import redirectResources from "./ublock/core/redirect-resources.js";

export const DNR_RESOURCE_TYPES = new Set([
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "media",
  "websocket",
  "webtransport",
  "webbundle",
  "other",
]);

export const ENV = ["chromium", "native_css_has"];
export const MAX_DOMAINS_PER_RULE = 1_000;
export const MAX_REGEX_DEFAULT = 1_000;
export const STATIC_REGEX_BUDGET = 900;

export const STATIC_RULESETS = SUBSCRIBED_LISTS.map((id) => ({
  listId: id,
  rulesetId: `ublock_${id}`,
  path: `ublock/rulesets/${id}.json`,
}));

export const STATIC_RULESET_IDS = STATIC_RULESETS.map((item) => item.rulesetId);

export const extensionPaths = [];
for (const [name, details] of redirectResources) {
  if (name === "click2load.html") continue;
  const path = `/ublock/core/web_accessible_resources/${name}`;
  extensionPaths.push([name, path]);
  const aliases = Array.isArray(details.alias) ? details.alias : details.alias ? [details.alias] : [];
  for (const alias of aliases) extensionPaths.push([alias, path]);
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string" && item.length > 0);
}

/**
 * Reject regex filters incompatible with Chrome/Edge DNR's RE2 engine (2KB memory limit,
 * max quantifier 1000, no lookarounds, no backreferences, ASCII-only).
 * @param {string} rf
 * @returns {boolean}
 */
function isSafeRe2Regex(rf) {
  if (/[^\x00-\x7f]/.test(rf)) return false;
  if (/\(\?[=!<]/.test(rf) || /\\[1-9]/.test(rf)) return false;
  let totalRep = 0;
  for (const match of rf.matchAll(/\{(\d+)(?:,(\d*))?\}/g)) {
    const a = Number(match[1]);
    const b = match[2] ? Number(match[2]) : a;
    if (a > 50 || b > 50) return false;
    totalRep += Math.max(a, b);
    if (totalRep > 80) return false;
  }
  try {
    new RegExp(rf);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Record<string, any>} rule
 * @returns {chrome.declarativeNetRequest.Rule | null}
 */
export function sanitizeRule(rule) {
  if (!rule || typeof rule !== "object") return null;
  if (rule._error) return null;
  const actionType = rule.action?.type;
  if (!["block", "allow", "redirect", "modifyHeaders"].includes(actionType)) return null;

  const conditionIn = rule.condition && typeof rule.condition === "object" ? rule.condition : {};
  /** @type {chrome.declarativeNetRequest.RuleCondition} */
  const condition = {};

  if (typeof conditionIn.urlFilter === "string" && conditionIn.urlFilter) {
    if (conditionIn.urlFilter.length > 1024 || /[^\x00-\x7f]/.test(conditionIn.urlFilter)) return null;
    condition.urlFilter = conditionIn.urlFilter;
  }
  if (typeof conditionIn.regexFilter === "string" && conditionIn.regexFilter) {
    if (condition.urlFilter) return null;
    if (conditionIn.regexFilter.length > 1024 || !isSafeRe2Regex(conditionIn.regexFilter)) return null;
    condition.regexFilter = conditionIn.regexFilter;
    if (conditionIn.isUrlFilterCaseSensitive === true) {
      condition.isUrlFilterCaseSensitive = true;
    }
  }

  const resourceTypes = asStringArray(conditionIn.resourceTypes).filter((type) =>
    DNR_RESOURCE_TYPES.has(type),
  );
  if (resourceTypes.length) condition.resourceTypes = resourceTypes;
  else if (asStringArray(conditionIn.resourceTypes).length) return null;

  const excludedResourceTypes = asStringArray(conditionIn.excludedResourceTypes).filter((type) =>
    DNR_RESOURCE_TYPES.has(type),
  );
  if (excludedResourceTypes.length) condition.excludedResourceTypes = excludedResourceTypes;

  const requestDomains = asStringArray(conditionIn.requestDomains);
  if (requestDomains.length) condition.requestDomains = requestDomains;
  const excludedRequestDomains = asStringArray(conditionIn.excludedRequestDomains);
  if (excludedRequestDomains.length) condition.excludedRequestDomains = excludedRequestDomains;
  const initiatorDomains = asStringArray(conditionIn.initiatorDomains);
  if (initiatorDomains.length) condition.initiatorDomains = initiatorDomains;
  const excludedInitiatorDomains = asStringArray(conditionIn.excludedInitiatorDomains);
  if (excludedInitiatorDomains.length) condition.excludedInitiatorDomains = excludedInitiatorDomains;

  if (conditionIn.domainType === "firstParty" || conditionIn.domainType === "thirdParty") {
    condition.domainType = conditionIn.domainType;
  }

  if (
    !condition.urlFilter &&
    !condition.regexFilter &&
    !condition.requestDomains &&
    !condition.initiatorDomains
  ) {
    return null;
  }

  /** @type {chrome.declarativeNetRequest.RuleAction} */
  const action = { type: actionType };
  if (actionType === "redirect") {
    const extensionPath = rule.action.redirect?.extensionPath;
    if (
      typeof extensionPath !== "string" ||
      !extensionPath.startsWith("/ublock/core/web_accessible_resources/")
    ) {
      return null;
    }
    action.redirect = { extensionPath };
  }
  if (actionType === "modifyHeaders") {
    const headers = rule.action.responseHeaders;
    if (!Array.isArray(headers) || !headers.length) return null;
    if (!headers.every((item) => item && item.operation === "remove" && typeof item.header === "string")) {
      return null;
    }
    action.responseHeaders = headers.map(({ header }) => ({ header, operation: "remove" }));
  }

  /** @type {chrome.declarativeNetRequest.Rule} */
  const out = { id: 1, action, condition };
  if (typeof rule.priority === "number" && Number.isFinite(rule.priority) && rule.priority >= 1) {
    out.priority = Math.min(Math.floor(rule.priority), 2_147_483_647);
  }
  return out;
}

/**
 * @param {chrome.declarativeNetRequest.Rule} rule
 * @param {"requestDomains" | "initiatorDomains"} key
 * @returns {chrome.declarativeNetRequest.Rule[]}
 */
function splitDomainKey(rule, key) {
  const values = rule.condition[key];
  if (!Array.isArray(values) || values.length <= MAX_DOMAINS_PER_RULE) return [rule];
  const parts = [];
  for (let i = 0; i < values.length; i += MAX_DOMAINS_PER_RULE) {
    parts.push({
      ...rule,
      condition: {
        ...rule.condition,
        [key]: values.slice(i, i + MAX_DOMAINS_PER_RULE),
      },
    });
  }
  return parts;
}

/**
 * @param {chrome.declarativeNetRequest.Rule} rule
 * @returns {chrome.declarativeNetRequest.Rule[]}
 */
export function explodeDomains(rule) {
  return splitDomainKey(rule, "requestDomains").flatMap((item) =>
    splitDomainKey(item, "initiatorDomains"),
  );
}

/**
 * Stable fingerprint of a sanitized DNR rule (ignoring `id`) for static-vs-CDN diffing.
 * @param {chrome.declarativeNetRequest.Rule} rule
 * @returns {string}
 */
export function ruleFingerprint(rule) {
  return JSON.stringify({
    p: rule.priority || 1,
    a: rule.action,
    c: rule.condition,
  });
}
