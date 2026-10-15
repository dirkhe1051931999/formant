import { preferDifficultyReason, scoreDifficulty } from "./translate-score.js";

/**
 * @typedef {"auto" | "google" | "gpt" | "all"} TranslateMode
 * @typedef {{
 *   mode: TranslateMode,
 *   runGoogle: boolean,
 *   runGpt: boolean,
 *   runDeeplx: boolean,
 *   deeplxFallback: boolean,
 *   score: number,
 *   hard: boolean,
 *   reasons: string[],
 *   summary: string,
 * }} RoutePlan
 */

export { scoreDifficulty } from "./translate-score.js";
export { TRANSLATE_LEXICON, TRANSLATE_LEXICON_SORTED } from "./translate-lexicon.js";
export {
  ensureLexiconReady,
  getLexiconSortedSync,
  loadLexiconState,
} from "./lexicon-runtime.js";

export const TRANSLATE_MODE_KEY = "translateMode";
export const TRANSLATE_TARGET_KEY = "translateTarget";

/** @typedef {"auto" | "zh-CN" | "en"} TranslateTarget */

/** @type {TranslateMode[]} */
export const TRANSLATE_MODES = ["auto", "google", "gpt", "all"];

/** @type {Record<TranslateMode, string>} */
export const TRANSLATE_MODE_LABELS = {
  auto: "自动",
  google: "Google",
  gpt: "GPT",
  all: "全部",
};

/** @type {TranslateTarget[]} */
export const TRANSLATE_TARGETS = ["auto", "zh-CN", "en"];

/** @type {Record<TranslateTarget, string>} */
export const TRANSLATE_TARGET_LABELS = {
  auto: "自动检测",
  "zh-CN": "中文",
  en: "英语",
};

/**
 * @param {unknown} value
 * @returns {TranslateMode}
 */
export function normalizeTranslateMode(value) {
  const mode = String(value || "auto").trim();
  if (mode === "google" || mode === "gpt" || mode === "all" || mode === "auto") return mode;
  return "auto";
}

/**
 * @returns {Promise<TranslateMode>}
 */
export async function loadTranslateMode() {
  const data = await chrome.storage.local.get(TRANSLATE_MODE_KEY);
  return normalizeTranslateMode(data[TRANSLATE_MODE_KEY]);
}

/**
 * @param {TranslateMode} mode
 */
export async function saveTranslateMode(mode) {
  const next = normalizeTranslateMode(mode);
  await chrome.storage.local.set({ [TRANSLATE_MODE_KEY]: next });
  return next;
}

/**
 * @param {unknown} value
 * @returns {TranslateTarget}
 */
export function normalizeTranslateTarget(value) {
  const target = String(value || "auto").trim();
  if (target === "zh-CN" || target === "en" || target === "auto") return target;
  if (target.toLowerCase().startsWith("zh")) return "zh-CN";
  return "auto";
}

/**
 * @returns {Promise<TranslateTarget>}
 */
export async function loadTranslateTarget() {
  const data = await chrome.storage.local.get(TRANSLATE_TARGET_KEY);
  return normalizeTranslateTarget(data[TRANSLATE_TARGET_KEY]);
}

/**
 * @param {TranslateTarget} target
 */
export async function saveTranslateTarget(target) {
  const next = normalizeTranslateTarget(target);
  await chrome.storage.local.set({ [TRANSLATE_TARGET_KEY]: next });
  return next;
}

/**
 * Storage value for API calls: omit when auto.
 * @param {TranslateTarget} target
 * @returns {string | undefined}
 */
export function resolveTranslateTarget(target) {
  const next = normalizeTranslateTarget(target);
  return next === "auto" ? undefined : next;
}

/**
 * @param {string} text
 * @param {TranslateMode} mode
 * @returns {RoutePlan}
 */
export function planTranslateRoute(text, mode = "auto") {
  const normalized = normalizeTranslateMode(mode);
  const result = scoreDifficulty(text);
  const { score, hard, reasons } = result;

  if (normalized === "google") {
    return {
      mode: normalized,
      runGoogle: true,
      runGpt: false,
      runDeeplx: false,
      deeplxFallback: true,
      score,
      hard,
      reasons,
      summary: "仅 Google（失败 → DeepLX 备用）",
    };
  }
  if (normalized === "gpt") {
    return {
      mode: normalized,
      runGoogle: false,
      runGpt: true,
      runDeeplx: false,
      deeplxFallback: false,
      score,
      hard,
      reasons,
      summary: "仅 GPT",
    };
  }
  if (normalized === "all") {
    return {
      mode: normalized,
      runGoogle: true,
      runGpt: true,
      runDeeplx: true,
      deeplxFallback: false,
      score,
      hard,
      reasons,
      summary: "Google + GPT + DeepLX",
    };
  }

  // auto
  if (hard) {
    const why = preferDifficultyReason(reasons) || "需意译";
    return {
      mode: normalized,
      runGoogle: true,
      runGpt: true,
      runDeeplx: false,
      deeplxFallback: true,
      score,
      hard,
      reasons,
      summary: `自动 · 复杂（${why}）· Google 失败 → DeepLX`,
    };
  }
  const why = preferDifficultyReason(reasons);
  return {
    mode: normalized,
    runGoogle: true,
    runGpt: false,
    runDeeplx: false,
    deeplxFallback: true,
    score,
    hard,
    reasons,
    summary: `自动 · 简单${why ? `（${why}）` : ""} → Google（失败 → DeepLX）`,
  };
}
