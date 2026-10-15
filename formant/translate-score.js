import { getLexiconSortedSync } from "./lexicon-runtime.js";

/**
 * @typedef {"en" | "zh" | "ja" | "ko" | "tr" | "mixed" | "other"} ScriptLang
 * @typedef {{
 *   id: string,
 *   delta: number,
 *   detail?: string,
 * }} ScoreSignal
 * @typedef {{
 *   phrase: string,
 *   lang: string,
 *   kind: string,
 *   weight: number,
 * }} LexiconHit
 * @typedef {{
 *   score: number,
 *   hard: boolean,
 *   threshold: number,
 *   reasons: string[],
 *   signals: ScoreSignal[],
 *   langs: ScriptLang[],
 *   primaryLang: ScriptLang,
 *   lexiconHits: LexiconHit[],
 * }} DifficultyResult
 */

export const DIFFICULTY_HARD_THRESHOLD = 55;

/**
 * @param {string} text
 */
export function detectScriptLangs(text) {
  const q = String(text || "");
  const hasLatin = /[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(q);
  const hasTurkish = /[çğıöşüÇĞİÖŞÜ]/.test(q);
  const hasHangul = /[\uac00-\ud7af]/.test(q);
  const hasHiragana = /[\u3040-\u309f]/.test(q);
  const hasKatakana = /[\u30a0-\u30ff]/.test(q);
  const hasHan = /[\u4e00-\u9fff]/.test(q);

  /** @type {ScriptLang[]} */
  const langs = [];
  if (hasHangul) langs.push("ko");
  if (hasHiragana || hasKatakana) langs.push("ja");
  // Han without kana is usually Chinese; with kana it still counts toward ja compound text.
  if (hasHan && !hasHiragana && !hasKatakana) langs.push("zh");
  else if (hasHan && (hasHiragana || hasKatakana)) {
    if (!langs.includes("ja")) langs.push("ja");
  } else if (hasHan) langs.push("zh");
  if (hasTurkish) langs.push("tr");
  else if (hasLatin) langs.push("en");

  if (langs.length === 0) langs.push("other");

  /** @type {ScriptLang} */
  let primaryLang = langs[0] || "other";
  if (langs.includes("ko")) primaryLang = "ko";
  else if (langs.includes("ja")) primaryLang = "ja";
  else if (langs.includes("zh")) primaryLang = "zh";
  else if (langs.includes("tr")) primaryLang = "tr";
  else if (langs.includes("en")) primaryLang = "en";

  if (langs.filter((l) => l !== "other").length >= 2) {
    return { langs, primaryLang, mixed: true };
  }
  return { langs, primaryLang, mixed: false };
}

/**
 * @param {string} text
 */
function normalizeForMatch(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * @param {string} phrase
 */
function isShortTokenPhrase(phrase) {
  return /^[a-z0-9]{1,5}$/i.test(phrase) || /^[ㄱ-ㅎㅏ-ㅣㅋㅎㅇㄴㅠㅜ]{1,4}$/.test(phrase);
}

/**
 * @param {string} value
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} haystack
 * @param {string} phrase
 */
function containsPhrase(haystack, phrase) {
  const p = phrase.toLowerCase();
  if (!p) return false;
  if (haystack === p || haystack === phrase) return true;

  // Non-latin phrases (润 / 破防 / それな / 갓생): substring.
  // False positives like 草⊂种草 are handled by longer-phrase precedence in matchLexicon.
  if (/[^\u0000-\u007f]/.test(phrase)) {
    return haystack.includes(p) || haystack.includes(phrase);
  }

  if (isShortTokenPhrase(phrase)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(p)}([^a-z0-9]|$)`, "i").test(haystack);
  }

  return haystack.includes(p);
}

/**
 * Scan the full multi-lingual lexicon. Script langs only affect prioritization.
 * (Kanji-only Japanese idioms must still match even if script sniff says zh.)
 * @param {string} text
 * @param {ScriptLang[]} [langs]
 * @returns {LexiconHit[]}
 */
export function matchLexicon(text, langs = []) {
  const raw = String(text || "").trim();
  const lower = normalizeForMatch(raw);
  if (!raw) return [];

  /** @type {LexiconHit[]} */
  const hits = [];
  /** @type {Set<string>} */
  const seen = new Set();
  const preferred = new Set(langs.filter((l) => l !== "mixed" && l !== "other"));

  for (const entry of getLexiconSortedSync()) {
    const key = `${entry.lang}:${entry.phrase.toLowerCase()}`;
    if (seen.has(key)) continue;
    // Use boundary-aware matcher only — plain includes() false-positives short CJK tags (草 in 种草).
    if (!containsPhrase(lower, entry.phrase) && !containsPhrase(raw, entry.phrase)) continue;

    // Avoid double counting a shorter phrase already covered by a longer hit of same lang.
    const covered = hits.some(
      (h) => h.lang === entry.lang && h.phrase.toLowerCase().includes(entry.phrase.toLowerCase()),
    );
    if (covered) continue;

    seen.add(key);
    hits.push({
      phrase: entry.phrase,
      lang: entry.lang,
      kind: entry.kind,
      weight: Number(entry.weight) || 40,
    });
    if (hits.length >= 8) break;
  }

  // Drop 1-char cross-script tags when script sniff disagrees (zh text vs ja「草」).
  // Keep 2+ char hits even across zh/ja kanji overlap (一石二鳥).
  const filtered = hits.filter((hit) => {
    if ([...hit.phrase].length > 1) return true;
    if (preferred.size === 0) return true;
    return preferred.has(/** @type {ScriptLang} */ (hit.lang));
  });

  filtered.sort((a, b) => {
    const ap = preferred.has(/** @type {ScriptLang} */ (a.lang)) ? 1 : 0;
    const bp = preferred.has(/** @type {ScriptLang} */ (b.lang)) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return b.weight - a.weight;
  });

  return filtered;
}

/**
 * @param {string} text
 */
function isWordLike(text) {
  const q = String(text || "").trim();
  if (!q) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+'’\-.]*$/.test(q)) return true;
  if (/^[\u4e00-\u9fff]{1,4}$/.test(q)) return true;
  if (/^[\u3040-\u30ff]{1,8}$/.test(q)) return true;
  if (/^[\uac00-\ud7af]{1,6}$/.test(q)) return true;
  return false;
}

/**
 * @param {string} text
 */
function isIdentifierLike(text) {
  const q = String(text || "").trim();
  return (
    /^[a-zA-Z_][\w./:#-]*$/.test(q) ||
    /^(get|set|is|has|on|use|create|update|delete|fetch)[A-Z]\w*$/.test(q)
  );
}

/**
 * Language-specific figurative / slang patterns beyond the lexicon.
 * @param {string} text
 * @param {ScriptLang} primaryLang
 * @returns {ScoreSignal[]}
 */
function patternSignals(text, primaryLang) {
  const q = String(text || "");
  /** @type {ScoreSignal[]} */
  const out = [];

  // Chinese: utterance is (almost) a classic 4-char chengyu, not just any 4 Han chars in a sentence.
  const zhCompact = q.replace(/\s+/g, "");
  if (
    (primaryLang === "zh" || (/[\u4e00-\u9fff]/.test(q) && !/[\u3040-\u30ff\uac00-\ud7af]/.test(q))) &&
    /^[\u4e00-\u9fff]{4}$/.test(zhCompact)
  ) {
    out.push({ id: "zh_chengyu_shape", delta: 14, detail: "疑似成语" });
  }
  if (/简直|难道|怎么可能|宛如|仿佛|堪称|活成了|属于是/.test(q)) {
    out.push({ id: "zh_rhetoric", delta: 10, detail: "修辞/语气" });
  }

  // Japanese: figurative body idioms / sentence-final colloquial.
  if (/[\u3040-\u30ff]/.test(q)) {
    if (/みたいな|っぽい|じゃね[えぇ]?|っす[よね]?|〜|※|ｗ{2,}|草$/.test(q)) {
      out.push({ id: "ja_colloquial", delta: 12, detail: "日语口语" });
    }
    if (/気が|腹が|顔が|足を|手を|口が|胸が/.test(q) && q.length <= 40) {
      out.push({ id: "ja_body_idiom", delta: 10, detail: "日语惯用" });
    }
  }

  // Korean: elongated endings / laugh / slang morphology.
  // Hangul jamo laugh marks may appear without full syllables (ㅋㅋ).
  if (/[\uac00-\ud7af]/.test(q) || /[ㅋㅎㅠㅜㅇㄴㄱ]{2,}/.test(q)) {
    if (/[ㅋㅎㅠㅜㅇㄴㄱ]{2,}/.test(q)) {
      out.push({ id: "ko_net_chars", delta: 12, detail: "韩语网络语" });
    }
    if (/거든요|잖아요|ㅋㅋ|ㅎㅎ|대박|헐|존[나맛]|진짜/.test(q)) {
      out.push({ id: "ko_colloquial", delta: 10, detail: "韩语口语" });
    }
    if (/이\/가 |을\/를 |은\/는 /.test(q) === false && /보다|같다|듯/.test(q)) {
      out.push({ id: "ko_figurative", delta: 8, detail: "韩语比喻" });
    }
  }

  // English figurative markers.
  if (/[a-z]/i.test(q)) {
    if (/\bas if\b|\blike a\b|\bkind of\b|\bsort of\b|\bliterally\b|\bno offense\b/i.test(q)) {
      out.push({ id: "en_hedge", delta: 8, detail: "英语语气" });
    }
    if (/\b(ain't|gonna|wanna|gotta|y'?all)\b/i.test(q)) {
      out.push({ id: "en_colloquial", delta: 10, detail: "英语口语" });
    }
  }

  return out;
}

/**
 * Fine-grained local difficulty score for translate routing.
 * @param {string} text
 * @returns {DifficultyResult}
 */
export function scoreDifficulty(text) {
  const q = String(text || "").trim();
  /** @type {ScoreSignal[]} */
  const signals = [];
  if (!q) {
    return {
      score: 0,
      hard: false,
      threshold: DIFFICULTY_HARD_THRESHOLD,
      reasons: [],
      signals,
      langs: ["other"],
      primaryLang: "other",
      lexiconHits: [],
    };
  }

  const detected = detectScriptLangs(q);
  const mixed = detected.mixed;
  /** @type {ScriptLang[]} */
  let langs = [...detected.langs];
  /** @type {ScriptLang} */
  let primaryLang = detected.primaryLang;
  const len = q.length;
  const words = q.split(/\s+/).filter(Boolean);
  const sentences = q.split(/[.!?。！？…]+/).filter((s) => s.trim());

  let score = 40;
  signals.push({ id: "baseline", delta: 40, detail: "基准" });

  if (isWordLike(q)) {
    score -= 20;
    signals.push({ id: "word_like", delta: -20, detail: "单词/短词" });
  } else if (len <= 24 && words.length <= 3 && sentences.length <= 1) {
    score -= 12;
    signals.push({ id: "short_clause", delta: -12, detail: "短句" });
  }

  if (len > 120) {
    score += 24;
    signals.push({ id: "len_long", delta: 24, detail: "较长文本" });
  } else if (len > 80) {
    score += 18;
    signals.push({ id: "len_long", delta: 18, detail: "较长文本" });
  } else if (len > 40) {
    score += 10;
    signals.push({ id: "len_mid", delta: 10, detail: "中等长度" });
  }

  if (sentences.length >= 3) {
    score += 18;
    signals.push({ id: "multi_sentence", delta: 18, detail: "多句" });
  } else if (sentences.length >= 2) {
    score += 10;
    signals.push({ id: "two_sentence", delta: 10, detail: "复句" });
  }

  const punct = (q.match(/[,;:，；：、——…]|-{2,}|\.{3}|…/g) || []).length;
  if (punct >= 3) {
    score += 12;
    signals.push({ id: "punct_heavy", delta: 12, detail: "结构复杂" });
  } else if (punct >= 1 && len > 28) {
    score += 6;
    signals.push({ id: "punct_some", delta: 6, detail: "结构复杂" });
  }

  if (isIdentifierLike(q)) {
    score -= 18;
    signals.push({ id: "identifier", delta: -18, detail: "标识符/API" });
  }

  if (mixed) {
    score += 14;
    signals.push({ id: "script_mixed", delta: 14, detail: "多语混杂" });
  }

  const lexiconHits = matchLexicon(q, langs);
  // ASCII Turkish slang (Aynen / Kanka) sniffs as Latin→en; promote when lexicon is clearly TR.
  if (
    (primaryLang === "en" || primaryLang === "other") &&
    lexiconHits[0]?.lang === "tr" &&
    !lexiconHits.some((h) => h.lang === "en" && h.weight >= lexiconHits[0].weight)
  ) {
    primaryLang = "tr";
    if (!langs.includes("tr")) langs.push("tr");
  }
  if (lexiconHits.length) {
    // Strongest hit dominates; extra hits add a little.
    const strongest = Math.max(...lexiconHits.map((h) => h.weight));
    const extra = Math.min(16, (lexiconHits.length - 1) * 6);
    const delta = strongest + extra;
    score += delta;
    const kindLabel =
      lexiconHits[0].kind === "proverb"
        ? "谚语"
        : lexiconHits[0].kind === "idiom"
          ? "习语"
          : lexiconHits[0].kind === "slang"
            ? "俚语"
            : "网络语";
    const langLabel =
      lexiconHits[0].lang === "zh"
        ? "中文"
        : lexiconHits[0].lang === "ja"
          ? "日语"
          : lexiconHits[0].lang === "ko"
            ? "韩语"
            : lexiconHits[0].lang === "tr"
              ? "土耳其语"
              : "英文";
    signals.push({
      id: "lexicon",
      delta,
      detail: `${langLabel}${kindLabel}`,
    });
  }

  for (const signal of patternSignals(q, primaryLang)) {
    score += signal.delta;
    signals.push(signal);
  }

  // Rhetorical punctuation in longer text.
  if (/[?？]/.test(q) && len > 12) {
    score += 6;
    signals.push({ id: "question", delta: 6, detail: "修辞/语气" });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // Net-only tags alone shouldn't force GPT unless weight is high enough via lexicon.
  const hard =
    score >= DIFFICULTY_HARD_THRESHOLD ||
    lexiconHits.some((h) => h.kind === "idiom" || h.kind === "proverb" || h.weight >= 40);

  /** @type {string[]} */
  const reasons = [];
  for (const signal of signals) {
    if (!signal.detail || signal.id === "baseline") continue;
    if (!reasons.includes(signal.detail)) reasons.push(signal.detail);
    if (reasons.length >= 5) break;
  }

  return {
    score,
    hard,
    threshold: DIFFICULTY_HARD_THRESHOLD,
    reasons,
    signals,
    langs: mixed ? /** @type {ScriptLang[]} */ (["mixed", ...langs]) : langs,
    primaryLang,
    lexiconHits,
  };
}

/**
 * Pick the most useful reason label for UI copy.
 * @param {string[]} reasons
 */
export function preferDifficultyReason(reasons) {
  const rank = [
    "英文习语",
    "英文俚语",
    "英文谚语",
    "中文习语",
    "中文俚语",
    "中文谚语",
    "日语习语",
    "日语俚语",
    "日语谚语",
    "韩语习语",
    "韩语俚语",
    "韩语谚语",
    "土耳其语习语",
    "土耳其语俚语",
    "土耳其语谚语",
    "日语口语",
    "日语惯用",
    "韩语口语",
    "韩语网络语",
    "疑似成语",
    "多语混杂",
    "中英混杂",
    "修辞/语气",
    "较长文本",
    "多句",
    "复句",
    "结构复杂",
    "英语口语",
    "英语语气",
  ];
  for (const key of rank) {
    if (reasons.includes(key)) return key;
  }
  return reasons[0] || "";
}
