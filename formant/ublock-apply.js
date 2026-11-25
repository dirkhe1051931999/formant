import "./ublock/core/vapi-shim.js";
import { dnrRulesetFromRawLists } from "./ublock/core/static-dnr-filtering.js";
import publicSuffixList from "./ublock/core/publicsuffix.js";
import punycode from "./ublock/lib/punycode.js";
import { SEED_PATHS, SUBSCRIBED_LISTS, UBLOCK_STATUS_KEY } from "./ublock-sync.js";
import { loadUblockConfig } from "./ublock-config.js";
import { clearPageRules, clearUblockScriptlets, setPageRules, syncUblockScriptlets } from "./ublock-page-rules.js";
import {
  ENV,
  MAX_REGEX_DEFAULT,
  STATIC_RULESETS,
  STATIC_RULESET_IDS,
  explodeDomains,
  extensionPaths,
  ruleFingerprint,
  sanitizeRule,
} from "./ublock-dnr-utils.js";

export const UBLOCK_RULE_ID_MIN = 20_000;
export const UBLOCK_RULE_ID_MAX = 49_999;

const BATCH = 400;

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
 * @param {string[]} [enabledIds]
 */
async function setStaticRulesetsEnabled(enabledIds = []) {
  if (typeof chrome.declarativeNetRequest.updateEnabledRulesets !== "function") return;
  const enabledSet = new Set(enabledIds);
  const enableRulesetIds = STATIC_RULESETS.filter((r) => enabledSet.has(r.listId)).map((r) => r.rulesetId);
  const disableRulesetIds = STATIC_RULESETS.filter((r) => !enabledSet.has(r.listId)).map((r) => r.rulesetId);
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds,
    disableRulesetIds,
  });
}

/**
 * @param {string[]} enabledIds
 * @returns {Promise<{ totalRules: number, totalRegex: number }>}
 */
async function loadStaticMeta(enabledIds) {
  try {
    const res = await fetch(chrome.runtime.getURL("ublock/rulesets/meta.json"));
    if (!res.ok) return { totalRules: 0, totalRegex: 0 };
    const meta = await res.json();
    const list = Array.isArray(meta.rulesets) ? meta.rulesets : [];
    const enabledSet = new Set(enabledIds);
    let totalRules = 0;
    let totalRegex = 0;
    for (const item of list) {
      if (!enabledSet.has(item.listId)) continue;
      totalRules += Number(item.count) || 0;
      totalRegex += Number(item.regexCount) || 0;
    }
    return { totalRules, totalRegex };
  } catch {
    return { totalRules: 0, totalRegex: 0 };
  }
}

/**
 * Build fingerprint set for a single static ruleset so CDN updates only consume dynamic budget for deltas.
 * @param {string} listId
 * @returns {Promise<Set<string>>}
 */
async function loadStaticFingerprintSet(listId) {
  /** @type {Set<string>} */
  const set = new Set();
  const item = STATIC_RULESETS.find((entry) => entry.listId === listId);
  if (!item) return set;
  try {
    const res = await fetch(chrome.runtime.getURL(item.path));
    if (!res.ok) return set;
    const rules = await res.json();
    if (!Array.isArray(rules)) return set;
    for (const rule of rules) {
      set.add(ruleFingerprint(rule));
    }
  } catch (error) {
    console.warn("[formant] failed reading static ruleset for diff", item.rulesetId, error);
  }
  return set;
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
    if (rule.action.type === "allow" || rule.action.type === "allowAllRequests") allow.push(rule);
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
 * @param {chrome.declarativeNetRequest.Rule[]} chunk
 * @param {{ skipped: number }} stats
 */
async function addChunkBisect(chunk, stats) {
  if (!chunk.length) return;
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: chunk,
      removeRuleIds: [],
    });
  } catch (error) {
    if (chunk.length === 1) {
      stats.skipped += 1;
      if (stats.skipped <= 8) {
        console.warn("[formant] uBO DNR skip rule", chunk[0].id, error);
      }
      return;
    }
    const mid = Math.floor(chunk.length / 2);
    await addChunkBisect(chunk.slice(0, mid), stats);
    await addChunkBisect(chunk.slice(mid), stats);
  }
}

/**
 * @param {chrome.declarativeNetRequest.Rule[]} rules
 * @returns {Promise<number>} skipped because Chrome rejected them
 */
async function addRulesBatched(rules) {
  const stats = { skipped: 0 };
  for (let i = 0; i < rules.length; i += BATCH) {
    await addChunkBisect(rules.slice(i, i + BATCH), stats);
  }
  return stats.skipped;
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
 * @param {{ enabled: boolean, onLog?: (msg: string) => void }} extras
 * @returns {Promise<UblockStatus>}
 */
export async function applyUblockLists(state, extras) {
  const enabled = Boolean(extras.enabled);
  const onLog = typeof extras.onLog === "function" ? extras.onLog : null;
  if (!enabled) {
    await setStaticRulesetsEnabled([]);
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
  const config = await loadUblockConfig();

  const allLists = SUBSCRIBED_LISTS.map((id) => state.lists[id]).filter(Boolean);
  if (!allLists.length) {
    throw new Error("没有可用的 uBO 过滤列表");
  }
  const lists = allLists.filter((list) => config.lists[list.id] !== false);
  const enabledIds = lists.map((list) => list.id);
  const customText = config.customFilters.trim();

  const compileInputs = lists.map((list) => ({
    name: list.id,
    text: list.text,
    trustedSource: list.id.startsWith("ublock-"),
  }));
  if (customText) {
    compileInputs.push({ name: "user-custom", text: customText, trustedSource: false });
  }

  const compileStarted = Date.now();
  onLog?.(`正在编译 ${compileInputs.length} 个规则源（元素隐藏与脚本）...`);
  const result = compileInputs.length
    ? await dnrRulesetFromRawLists(compileInputs, { env: ENV, extensionPaths })
    : { specificCosmetic: [], genericCosmeticExceptions: [], genericCosmeticFilters: [], network: {}, scriptlet: new Map() };

  let cosmeticCount = 0;
  if (config.cosmetic) {
    cosmeticCount = setPageRules(result, config.trustedSites);
  } else {
    clearPageRules();
  }

  let scriptlets = "disabled";
  if (!config.scriptlets) {
    await clearUblockScriptlets();
  } else {
    try {
      scriptlets = await syncUblockScriptlets(result);
    } catch (error) {
      console.warn("[formant] uBO scriptlet build failed", error);
      scriptlets = error instanceof Error ? error.message : String(error);
    }
  }
  onLog?.(`页面规则编译完成 (${Date.now() - compileStarted}ms): 元素隐藏 ${cosmeticCount} 条，scriptlet ${scriptlets}`);

  await setStaticRulesetsEnabled(enabledIds);
  const meta = await loadStaticMeta(enabledIds);
  const hasCdnLists = lists.some((list) => list.source === "cdn");

  let skipped = 0;
  let rejected = 0;
  /** @type {chrome.declarativeNetRequest.Rule[]} */
  let numbered = [];

  /** @type {chrome.declarativeNetRequest.Rule[]} */
  const delta = [];
  if (config.trustedSites.length) {
    delta.push({
      id: 1,
      priority: 1_000_000,
      action: { type: "allowAllRequests" },
      condition: {
        requestDomains: config.trustedSites,
        resourceTypes: ["main_frame", "sub_frame"],
      },
    });
  }
  if (customText) {
    const customResult = await dnrRulesetFromRawLists(
      [{ name: "user-custom", text: customText, trustedSource: false }],
      { env: ENV, extensionPaths },
    );
    for (const raw of customResult?.network?.ruleset || []) {
      const clean = sanitizeRule(raw);
      if (clean) delta.push(...explodeDomains(clean));
    }
  }

  if (hasCdnLists || (meta.totalRules === 0 && lists.length > 0)) {
    if (meta.totalRules === 0) {
      const rawRules = Array.isArray(result?.network?.ruleset) ? result.network.ruleset : [];
      for (const raw of rawRules) {
        const clean = sanitizeRule(raw);
        if (clean) delta.push(...explodeDomains(clean));
      }
    } else {
      let changedLists = 0;
      const diffStarted = Date.now();
      for (const list of lists) {
        if (list.source !== "cdn") continue;
        const seedPath = SEED_PATHS[list.id];
        if (seedPath) {
          try {
            const seedRes = await fetch(chrome.runtime.getURL(seedPath));
            if (seedRes.ok && (await seedRes.text()) === list.text) continue;
          } catch {}
        }
        changedLists += 1;
        const listResult = await dnrRulesetFromRawLists(
          [{ name: list.id, text: list.text, trustedSource: list.id.startsWith("ublock-") }],
          { env: ENV, extensionPaths },
        );
        const staticSet = await loadStaticFingerprintSet(list.id);
        const rawRules = Array.isArray(listResult?.network?.ruleset) ? listResult.network.ruleset : [];
        for (const raw of rawRules) {
          const clean = sanitizeRule(raw);
          if (!clean) continue;
          for (const part of explodeDomains(clean)) {
            if (staticSet.size > 0 && staticSet.has(ruleFingerprint(part))) continue;
            delta.push(part);
          }
        }
      }
      onLog?.(`CDN 增量比对完成 (${Date.now() - diffStarted}ms): ${changedLists} 个列表有变化，待写入动态规则 ${delta.length} 条`);
    }
  }

  if (delta.length) {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const others = existing.filter(
      (rule) => rule.id < UBLOCK_RULE_ID_MIN || rule.id > UBLOCK_RULE_ID_MAX,
    );
    const maxDynamic = chrome.declarativeNetRequest.MAX_NUMBER_OF_DYNAMIC_RULES || 30_000;
    const regexCap = chrome.declarativeNetRequest.MAX_NUMBER_OF_REGEX_RULES || MAX_REGEX_DEFAULT;
    const regexBudget = Math.max(0, (Number(regexCap) || MAX_REGEX_DEFAULT) - meta.totalRegex);
    const budget = Math.max(0, Math.min(maxDynamic - others.length, UBLOCK_RULE_ID_MAX - UBLOCK_RULE_ID_MIN + 1));
    const maxUnsafe = chrome.declarativeNetRequest.MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES || 5_000;
    const otherUnsafe = others.filter((rule) => !["block", "allow", "allowAllRequests", "upgradeScheme"].includes(rule.action?.type)).length;
    const pickedResult = pickRules(delta, budget, regexBudget, Math.max(0, maxUnsafe - otherUnsafe));
    skipped = pickedResult.skipped;
    numbered = pickedResult.picked.map((rule, index) => ({
      ...rule,
      id: UBLOCK_RULE_ID_MIN + index,
    }));
  }

  await clearUblockDynamicRules();
  if (numbered.length) {
    const dnrStarted = Date.now();
    rejected = await addRulesBatched(numbered);
    onLog?.(`动态规则写入完成 (${Date.now() - dnrStarted}ms): 成功 ${numbered.length - rejected} 条，跳过 ${rejected} 条`);
  }
  const live = await getUblockDynamicRules();

  const source = hasCdnLists
    ? "cdn"
    : state.catalogSource === "cdn"
      ? "cache"
      : "seed";

  const status = {
    enabled: true,
    ruleCount: meta.totalRules + live.length,
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
