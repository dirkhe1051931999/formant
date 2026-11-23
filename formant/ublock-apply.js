import "./ublock/core/vapi-shim.js";
import { dnrRulesetFromRawLists } from "./ublock/core/static-dnr-filtering.js";
import publicSuffixList from "./ublock/core/publicsuffix.js";
import punycode from "./ublock/lib/punycode.js";
import { SUBSCRIBED_LISTS, UBLOCK_STATUS_KEY } from "./ublock-sync.js";
import { clearPageRules, clearUblockScriptlets, setPageRules, syncUblockScriptlets } from "./ublock-page-rules.js";
import redirectResources from "./ublock/core/redirect-resources.js";

export const UBLOCK_RULE_ID_MIN = 20_000;
export const UBLOCK_RULE_ID_MAX = 49_999;

const DNR_RESOURCE_TYPES = new Set([
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

const BATCH = 400;
const MAX_REGEX_DEFAULT = 1_000;
const MAX_DOMAINS_PER_RULE = 1_000;
const ENV = ["chromium", "native_css_has"];

const extensionPaths = [];
for (const [name, details] of redirectResources) {
  if (name === "click2load.html") continue;
  const path = `/ublock/core/web_accessible_resources/${name}`;
  extensionPaths.push([name, path]);
  const aliases = Array.isArray(details.alias) ? details.alias : details.alias ? [details.alias] : [];
  for (const alias of aliases) extensionPaths.push([alias, path]);
}

/** @type {Promise<void> | null} */
let pslReady = null;

/**
 * @typedef {{
 *   enabled: boolean,
 *   ruleCount: number,
 *   skipped: number,
 *   lastUpdated: number,
 *   lastError: string | null,
 *   source: "cdn" | "cache" | "seed",
 *   scriptlets: string,
 *   cosmeticCount: number,
 * }} UblockStatus
 */

function ensurePsl() {
  if (pslReady) return pslReady;
  pslReady = (async () => {
    const url = chrome.runtime.getURL(
      "ublock/assets/thirdparties/publicsuffix.org/list/effective_tld_names.dat",
    );
    const text = await fetch(url).then((res) => {
      if (!res.ok) throw new Error(`PSL ${res.status}`);
      return res.text();
    });
    publicSuffixList.parse(text, punycode.toASCII);
  })().catch((error) => {
    console.warn("[formant] uBO public suffix list parse failed", error);
  });
  return pslReady;
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
 * @param {Record<string, any>} rule
 * @returns {chrome.declarativeNetRequest.Rule | null}
 */
function sanitizeRule(rule) {
  if (!rule || typeof rule !== "object") return null;
  if (rule._error) return null;
  const actionType = rule.action?.type;
  if (!["block", "allow", "redirect", "modifyHeaders"].includes(actionType)) return null;

  const conditionIn = rule.condition && typeof rule.condition === "object" ? rule.condition : {};
  /** @type {chrome.declarativeNetRequest.RuleCondition} */
  const condition = {};

  if (typeof conditionIn.urlFilter === "string" && conditionIn.urlFilter) {
    if (conditionIn.urlFilter.length > 1024) return null;
    condition.urlFilter = conditionIn.urlFilter;
  }
  if (typeof conditionIn.regexFilter === "string" && conditionIn.regexFilter) {
    if (condition.urlFilter) return null;
    if (conditionIn.regexFilter.length > 1024) return null;
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

  /** @type {chrome.declarativeNetRequest.Rule} */
  const action = { type: actionType };
  if (actionType === "redirect") {
    const extensionPath = rule.action.redirect?.extensionPath;
    if (typeof extensionPath !== "string" || !extensionPath.startsWith("/ublock/core/web_accessible_resources/")) return null;
    action.redirect = { extensionPath };
  }
  if (actionType === "modifyHeaders") {
    const headers = rule.action.responseHeaders;
    if (!Array.isArray(headers) || !headers.length) return null;
    if (!headers.every((item) => item && item.operation === "remove" && typeof item.header === "string")) return null;
    action.responseHeaders = headers.map(({ header }) => ({ header, operation: "remove" }));
  }
  const out = {
    id: 1,
    action,
    condition,
  };
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
  /** @type {chrome.declarativeNetRequest.Rule[]} */
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
function explodeDomains(rule) {
  return splitDomainKey(rule, "requestDomains").flatMap((item) =>
    splitDomainKey(item, "initiatorDomains"),
  );
}

/**
 * @param {chrome.declarativeNetRequest.Rule[]} rules
 * @param {number} budget
 * @param {number} regexBudget
 * @param {number} unsafeBudget
 */
function pickRules(rules, budget, regexBudget, unsafeBudget) {
  const allow = [];
  const redirect = [];
  const modifyHeaders = [];
  const block = [];
  for (const rule of rules) {
    if (rule.action.type === "allow") allow.push(rule);
    else if (rule.action.type === "redirect") redirect.push(rule);
    else if (rule.action.type === "modifyHeaders") modifyHeaders.push(rule);
    else if (rule.action.type === "block") block.push(rule);
  }
  const ordered = [...allow, ...redirect, ...modifyHeaders, ...block];
  /** @type {chrome.declarativeNetRequest.Rule[]} */
  const picked = [];
  let regexUsed = 0;
  let unsafeUsed = 0;
  let skipped = 0;
  for (const rule of ordered) {
    if (picked.length >= budget) {
      skipped += 1;
      continue;
    }
    if (rule.action.type === "redirect" || rule.action.type === "modifyHeaders") {
      if (unsafeUsed >= unsafeBudget) {
        skipped += 1;
        continue;
      }
    }
    if (rule.condition.regexFilter) {
      if (regexUsed >= regexBudget) {
        skipped += 1;
        continue;
      }
      regexUsed += 1;
    }
    if (rule.action.type === "redirect" || rule.action.type === "modifyHeaders") unsafeUsed += 1;
    picked.push(rule);
  }
  return { picked, skipped };
}

/**
 * @param {number[]} ids
 */
async function removeRuleIds(ids) {
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: chunk,
      addRules: [],
    });
  }
}

/**
 * @param {chrome.declarativeNetRequest.Rule[]} rules
 * @returns {Promise<number>} skipped because Chrome rejected them
 */
async function addRulesBatched(rules) {
  let skipped = 0;
  for (let i = 0; i < rules.length; i += BATCH) {
    const chunk = rules.slice(i, i + BATCH);
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: chunk,
        removeRuleIds: [],
      });
    } catch (error) {
      console.warn("[formant] uBO DNR batch failed, retrying singly", error);
      for (const rule of chunk) {
        try {
          await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [rule],
            removeRuleIds: [],
          });
        } catch (inner) {
          skipped += 1;
          if (skipped <= 8) {
            console.warn("[formant] uBO DNR skip rule", rule.id, inner);
          }
        }
      }
    }
  }
  return skipped;
}

/**
 * @returns {Promise<chrome.declarativeNetRequest.Rule[]>}
 */
export async function getUblockDynamicRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  return existing.filter((rule) => rule.id >= UBLOCK_RULE_ID_MIN && rule.id <= UBLOCK_RULE_ID_MAX);
}

export async function clearUblockDynamicRules() {
  const existing = await getUblockDynamicRules();
  if (existing.length) await removeRuleIds(existing.map((rule) => rule.id));
}

/**
 * @param {import("./ublock-sync.js").UblockListsState} state
 * @param {{ enabled: boolean }} extras
 * @returns {Promise<UblockStatus>}
 */
export async function applyUblockLists(state, extras) {
  const enabled = Boolean(extras.enabled);
  if (!enabled) {
    await clearUblockDynamicRules();
    await clearUblockScriptlets();
    clearPageRules();
    const status = {
      enabled: false,
      ruleCount: 0,
      skipped: 0,
      lastUpdated: Date.now(),
      lastError: null,
      source: state.catalogSource === "cdn" ? "cdn" : "seed",
      scriptlets: "disabled",
      cosmeticCount: 0,
    };
    await chrome.storage.local.set({ [UBLOCK_STATUS_KEY]: status });
    return status;
  }

  await ensurePsl();

  const lists = SUBSCRIBED_LISTS.map((id) => state.lists[id]).filter(Boolean);
  if (!lists.length) {
    throw new Error("没有可用的 uBO 过滤列表");
  }

  const result = await dnrRulesetFromRawLists(
    lists.map((list) => ({
      name: list.id,
      text: list.text,
      trustedSource: list.id.startsWith("ublock-"),
    })),
    { env: ENV, extensionPaths },
  );

  const cosmeticCount = setPageRules(result);
  let scriptlets = "unavailable";
  try {
    scriptlets = await syncUblockScriptlets(result);
  } catch (error) {
    console.warn("[formant] uBO scriptlet build failed", error);
    scriptlets = error instanceof Error ? error.message : String(error);
  }

  const rawRules = Array.isArray(result?.network?.ruleset) ? result.network.ruleset : [];
  /** @type {chrome.declarativeNetRequest.Rule[]} */
  const sanitized = [];
  for (const raw of rawRules) {
    const clean = sanitizeRule(raw);
    if (clean) sanitized.push(...explodeDomains(clean));
  }

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const others = existing.filter(
    (rule) => rule.id < UBLOCK_RULE_ID_MIN || rule.id > UBLOCK_RULE_ID_MAX,
  );
  const maxDynamic = chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES || 30_000;
  const regexCap = chrome.declarativeNetRequest.MAX_NUMBER_OF_REGEX_RULES || MAX_REGEX_DEFAULT;
  const regexBudget = Math.min(MAX_REGEX_DEFAULT, Number(regexCap) || MAX_REGEX_DEFAULT);
  const budget = Math.max(0, Math.min(maxDynamic - others.length, UBLOCK_RULE_ID_MAX - UBLOCK_RULE_ID_MIN + 1));
  const maxUnsafe = chrome.declarativeNetRequest.MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES || 5_000;
  const otherUnsafe = others.filter((rule) => !["block", "allow", "allowAllRequests", "upgradeScheme"].includes(rule.action?.type)).length;
  const { picked, skipped } = pickRules(sanitized, budget, regexBudget, Math.max(0, maxUnsafe - otherUnsafe));

  const numbered = picked.map((rule, index) => ({
    ...rule,
    id: UBLOCK_RULE_ID_MIN + index,
  }));

  await clearUblockDynamicRules();
  const rejected = await addRulesBatched(numbered);
  const live = await getUblockDynamicRules();

  const source = Object.values(state.lists).some((list) => list.source === "cdn")
    ? "cdn"
    : state.catalogSource === "cdn"
      ? "cache"
      : "seed";

  const status = {
    enabled: true,
    ruleCount: live.length,
    skipped: skipped + Math.max(rejected, numbered.length - live.length),
    lastUpdated: Date.now(),
    lastError: null,
    source,
    scriptlets,
    cosmeticCount,
  };
  await chrome.storage.local.set({ [UBLOCK_STATUS_KEY]: status });
  console.log("[formant] uBO DNR applied", status);
  return status;
}
