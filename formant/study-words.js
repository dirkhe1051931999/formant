/**
 * 生词本：只记划词 / popup 里译过的单个英文单词。
 * 存在 chrome.storage.local，不进 mono，也不跟 Client API Key 清除。
 */

export const STUDY_WORDS_KEY = "formantStudyWords";
export const VOCAB_FACE_KEY = "formantVocabFace";

const MAX_WORDS = 200;
const MAX_WORD = 40;
const MAX_IPA = 80;

/** 字母，可含撇号或连字符；不含空格、数字和其他语言。 */
const ENGLISH_WORD = /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/;

/** 功能词不进生词本：冠词、代词、介词、连词、疑问词、be/do/have 与情态动词。 */
const STUDY_SKIP = new Set(
  `a an the
i me my mine myself you your yours yourself yourselves
he him his himself she her hers herself it its itself
we us our ours ourselves they them their theirs themselves
who whom whose what which where when why how
this that these those
and or but if else nor so yet because although though while than as
to on in at of for with from by about into over after before between
under above up down off out through during without within along across
behind below beside near upon via per onto
be am is are was were been being do does did doing have has had having
will would shall should can could may might must not no
i'm i've i'll i'd you're you've you'll you'd he's she's it's
we're we've we'll we'd they're they've they'll they'd
that's there's here's what's who's where's how's
isn't aren't wasn't weren't don't doesn't didn't can't couldn't
won't wouldn't shouldn't mustn't haven't hasn't hadn't let's cannot`
    .split(/\s+/)
    .filter(Boolean),
);

const KEY_LINES = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "qaz", "wsx", "edc", "rfv", "tgb", "yhn", "ujm"].flatMap(
  (line) => [line, [...line].reverse().join("")],
);
const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

/**
 * 连着三同一个字母、键盘行/列、字母表顺排，或英文里几乎不出现的字母对。
 * @param {string} word 已小写，撇号为 ASCII
 */
function isGibberish(word) {
  const parts = word.split(/['-]/).filter(Boolean);
  return parts.some(isGibberishPart);
}

/**
 * @param {string} part
 */
function isGibberishPart(part) {
  if (part.length < 3) return false;
  if (/(.)\1\1/.test(part)) return true;
  if (!/[aeiouy]/.test(part)) return true;
  if (KEY_LINES.some((line) => line.includes(part))) return true;
  if (part.length >= 4 && (ALPHABET.includes(part) || [...ALPHABET].reverse().join("").includes(part))) return true;
  if (/q(?=[^ui])/.test(part)) return true;
  if (/bx|bz|cj|cv|cx|dx|fq|fv|fx|fz|gq|gx|hx|hz|jb|jd|jf|jg|jq|jv|jw|jx|jz|kq|kx|kz|mx|mz|pq|px|pz|sx|sz|tx|vb|vf|vj|vk|vq|vw|vx|wq|wx|wz|xj|xk|xz|yq|yx|zj|zq|zx/.test(part)) return true;
  if (/[^aeiouy]{7,}/.test(part)) return true;
  return /^(.{2,})\1{2,}$/.test(part);
}

/**
 * @typedef {{ word: string, meaning: string, ipa: string, at: number }} StudyWord
 * @typedef {{ ok?: boolean, data?: { text?: string, phonetic?: string } }} TranslateSide
 */

/**
 * @param {unknown} text
 * @returns {string}
 */
export function englishHeadword(text) {
  const word = String(text || "")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .trim()
    .replace(/^[^A-Za-z]+/, "")
    .replace(/[^A-Za-z]+$/, "");
  if (!word || word.length > MAX_WORD || !ENGLISH_WORD.test(word)) return "";
  const key = word.toLowerCase().replace(/’/g, "'");
  if (STUDY_SKIP.has(key) || isGibberish(key)) return "";
  return word;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
function cleanIpa(raw) {
  let ipa = String(raw || "").trim();
  if (!ipa || ipa.length > MAX_IPA) return "";
  ipa = ipa.replace(/^\/+|\/+$/g, "").trim();
  return ipa.length > MAX_IPA ? "" : ipa;
}

/** 拼音声调、以及只有重音符号的音节拆分，都不是英文音标。 */
const IPA_MARK = /[ɪʊʌæɑɒɔəɛɜɝɚɐɵɯɨʉɡʃʒθðŋɹɾɸβçʝɣχʁʔˈˌː]/;
const PINYIN_TONE = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/;

/**
 * @param {unknown} raw
 * @param {string} word
 */
function usablePhonetic(raw, word) {
  const ipa = cleanIpa(raw);
  if (!ipa || /[\u4e00-\u9fff]/.test(ipa) || PINYIN_TONE.test(ipa)) return "";
  const letters = ipa.toLowerCase().replace(/[^a-z]/g, "");
  const source = String(word || "").toLowerCase().replace(/[^a-z]/g, "");
  if (source && letters === source) return "";
  if (!IPA_MARK.test(ipa)) return "";
  return ipa;
}

/**
 * @param {unknown} raw
 * @returns {StudyWord[]}
 */
export function normalizeStudyWords(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {StudyWord[]} */
  const words = [];
  const seen = new Set();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = /** @type {StudyWord} */ (item);
    const word = englishHeadword(row.word);
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const meaning = String(row.meaning || "").trim();
    if (!meaning) continue;
    words.push({
      word,
      meaning,
      ipa: usablePhonetic(row.ipa, word),
      at: Number(row.at) || 0,
    });
    if (words.length >= MAX_WORDS) break;
  }
  return words;
}

/**
 * 第一个成功译文。Google，否则 GPT，否则 DeepLX。
 * @param {{ google?: TranslateSide, gpt?: TranslateSide, deeplx?: TranslateSide } | null | undefined} result
 * @param {string} word
 * @returns {{ meaning: string, ipa: string } | null}
 */
export function pickStudyMeaning(result, word) {
  const sides = [result?.google, result?.gpt, result?.deeplx];
  for (const side of sides) {
    if (!side?.ok) continue;
    const meaning = String(side.data?.text || "").trim();
    if (!meaning) continue;
    return { meaning, ipa: usablePhonetic(side.data?.phonetic, word) };
  }
  return null;
}

/**
 * @param {string} face
 * @returns {"hot" | "study"}
 */
export function normalizeVocabFace(face) {
  return face === "study" ? "study" : "hot";
}

export async function loadStudyWords() {
  const data = await chrome.storage.local.get(STUDY_WORDS_KEY);
  const raw = data[STUDY_WORDS_KEY];
  const words = normalizeStudyWords(raw);
  if (Array.isArray(raw) && raw.length !== words.length) {
    await chrome.storage.local.set({ [STUDY_WORDS_KEY]: words });
  }
  return words;
}

export async function loadVocabFace() {
  const data = await chrome.storage.local.get(VOCAB_FACE_KEY);
  return normalizeVocabFace(data[VOCAB_FACE_KEY]);
}

/**
 * @param {"hot" | "study"} face
 */
export async function saveVocabFace(face) {
  await chrome.storage.local.set({ [VOCAB_FACE_KEY]: normalizeVocabFace(face) });
}

/**
 * 同一轮输入里的前后缀，例如 he / hello。
 * @param {string} a
 * @param {string} b
 */
export function isStudyAffix(a, b) {
  const left = String(a || "").trim().toLowerCase();
  const right = String(b || "").trim().toLowerCase();
  if (!left || !right) return false;
  return left === right || left.startsWith(right) || right.startsWith(left);
}

const POS_TOKEN = /(?:^|\s)(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|int|interj|art|aux|abbr|pl|modal|det)\.(?=\s|$|[\u4e00-\u9fff])/i;
const POS_STRIP = /(?:^|\s)(?:[a-z]{1,6}\.)(?:\s*&\s*[a-z]{1,6}\.)*\s*/gi;
const MEANING_POS_MAX = 4;
const MEANING_SENSE_MAX = 3;

/**
 * 释义里是否已带词性标注（n. / v. / adj. …）。
 * @param {string} meaning
 */
export function hasPosMeaning(meaning) {
  return POS_TOKEN.test(String(meaning || ""));
}

/**
 * 朗读用中文：去掉词性标记，只念前两个义项。
 * @param {string} meaning
 */
export function speechMeaning(meaning) {
  const text = String(meaning || "")
    .replace(POS_STRIP, " ")
    .replace(/[（(][^）)]*[）)]/g, "")
    .trim();
  return text
    .split(/[；;，,\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .join("，");
}

/**
 * 有道 ec 词条 → 「n. 枪口；炮口 v. 搞砸」，一行能放下，多余交给 CSS 省略。
 * @param {unknown} entry
 */
function dictMeaning(entry) {
  const trs = /** @type {{ tr?: { l?: { i?: unknown[] } }[] }[]} */ (
    /** @type {{ trs?: unknown }} */ (entry)?.trs
  );
  if (!Array.isArray(trs)) return "";
  const lines = [];
  for (const group of trs) {
    const raw = group?.tr?.[0]?.l?.i?.[0];
    const text = String(typeof raw === "string" ? raw : /** @type {{ "#text"?: string }} */ (raw)?.["#text"] || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || !/[\u4e00-\u9fff]/.test(text)) continue;
    const match = text.match(/^((?:[a-z]{1,6}\.)(?:\s*&\s*[a-z]{1,6}\.)*)\s*(.*)$/i);
    const pos = match ? match[1] : "";
    const senses = (match ? match[2] : text)
      .replace(/^[A-Za-z'’ -]+的[^：:；;，,]*[：:]/, "")
      .replace(/[（(][^）)]*[）)]/g, "")
      .replace(/[。.]+$/, "")
      .split(/[；;，,、]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, MEANING_SENSE_MAX);
    if (!senses.length) continue;
    lines.push(`${pos ? `${pos} ` : ""}${senses.join("；")}`);
    if (lines.length >= MEANING_POS_MAX) break;
  }
  return lines.join(" ");
}

/**
 * 有道英汉词典：美式音标 + 带词性的多义释义。Google 译到中文时给出的是译文拼音，不用。
 * @param {string} word
 * @returns {Promise<{ ipa: string, meaning: string }>}
 */
async function lookupDict(word) {
  const dicts = encodeURIComponent(JSON.stringify({ count: 1, dicts: [["ec"]] }));
  const url = `https://dict.youdao.com/jsonapi?jsonversion=2&client=mobile&q=${encodeURIComponent(word)}&dicts=${dicts}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return { ipa: "", meaning: "" };
    const payload = await response.json();
    const entry = payload?.ec?.word?.[0];
    const raw = entry?.usphone || entry?.ukphone || entry?.phone;
    return { ipa: usablePhonetic(raw, word), meaning: dictMeaning(entry) };
  } catch {
    return { ipa: "", meaning: "" };
  } finally {
    clearTimeout(timer);
  }
}

/** @type {Set<string>} */
const phoneticTried = new Set();

/**
 * 给还没有音标、或释义还没标词性的词补查词典，不改顺序。
 * @param {StudyWord[]} [list]
 */
export async function backfillStudyIpa(list) {
  const words = Array.isArray(list) ? list : await loadStudyWords();
  for (const item of words) {
    const key = item.word.toLowerCase();
    const needIpa = !usablePhonetic(item.ipa, item.word);
    const needMeaning = !hasPosMeaning(item.meaning);
    if ((!needIpa && !needMeaning) || phoneticTried.has(key)) continue;
    phoneticTried.add(key);
    const dict = await lookupDict(item.word);
    if (!dict.ipa && !dict.meaning) continue;
    const current = await loadStudyWords();
    let changed = false;
    const next = current.map((row) => {
      if (row.word.toLowerCase() !== key) return row;
      const ipa = row.ipa || dict.ipa;
      const meaning = hasPosMeaning(row.meaning) || !dict.meaning ? row.meaning : dict.meaning;
      if (ipa === row.ipa && meaning === row.meaning) return row;
      changed = true;
      return { ...row, ipa, meaning };
    });
    if (changed) await chrome.storage.local.set({ [STUDY_WORDS_KEY]: next });
  }
}

/**
 * @param {string} q
 * @param {{ google?: TranslateSide, gpt?: TranslateSide, deeplx?: TranslateSide } | null | undefined} result
 * @param {{ replace?: string }} [opts] 同一轮里被续写或删短的词，从列表里换掉
 */
export async function recordStudyWord(q, result, opts = {}) {
  const word = englishHeadword(q);
  const picked = word ? pickStudyMeaning(result, word) : null;
  if (!word || !picked) return false;

  const words = await loadStudyWords();
  const key = word.toLowerCase();
  const previous = words.find((item) => item.word.toLowerCase() === key);
  const dict = await lookupDict(word);
  const ipa = dict.ipa || usablePhonetic(picked.ipa, word) || usablePhonetic(previous?.ipa, word);
  const meaning = dict.meaning || (hasPosMeaning(previous?.meaning) ? previous?.meaning || "" : "") || picked.meaning;
  phoneticTried.add(key);
  const drop = String(opts.replace || "").trim().toLowerCase();
  const next = [
    { word, meaning, ipa, at: Date.now() },
    ...words.filter((item) => {
      const itemKey = item.word.toLowerCase();
      if (itemKey === key) return false;
      return !(drop && drop !== key && itemKey === drop);
    }),
  ].slice(0, MAX_WORDS);
  await chrome.storage.local.set({ [STUDY_WORDS_KEY]: next });
  return true;
}

const POPUP_SETTLE_MS = 1000;

/**
 * 翻译框：翻译仍立刻出结果，生词本等输入停住再记。
 * 同一轮里 he 再续成 hello，只留 hello。
 * @param {{ getQuery: () => string, input?: HTMLElement | null }} api
 */
export function createPopupStudyCapture(api) {
  /** @type {{ q: string, result: { google?: TranslateSide, gpt?: TranslateSide, deeplx?: TranslateSide } } | null} */
  let draft = null;
  let sessionWord = "";
  let timer = 0;

  function clearTimer() {
    window.clearTimeout(timer);
    timer = 0;
  }

  function endSession() {
    clearTimer();
    draft = null;
    sessionWord = "";
  }

  function noteQuery(q) {
    const text = String(q || "").trim();
    if (!text) {
      endSession();
      return;
    }
    if (draft && draft.q !== text) draft = null;
    if (sessionWord && !isStudyAffix(sessionWord, text)) sessionWord = "";
    clearTimer();
  }

  function arm() {
    clearTimer();
    timer = window.setTimeout(() => {
      void flush();
    }, POPUP_SETTLE_MS);
  }

  /**
   * @param {string} q
   * @param {{ google?: TranslateSide, gpt?: TranslateSide, deeplx?: TranslateSide } | null | undefined} result
   */
  function noteResult(q, result) {
    const text = String(q || "").trim();
    if (!text || text !== api.getQuery() || !result) return;
    draft = { q: text, result };
    arm();
  }

  async function flush() {
    clearTimer();
    const q = api.getQuery();
    if (!draft || draft.q !== q) return;
    const word = englishHeadword(q);
    if (!word) {
      if (sessionWord && q.toLowerCase().startsWith(sessionWord.toLowerCase())) {
        await removeStudyWord(sessionWord);
      }
      sessionWord = "";
      return;
    }
    const replace = sessionWord && isStudyAffix(sessionWord, word) ? sessionWord : "";
    const saved = await recordStudyWord(q, draft.result, { replace });
    if (saved) sessionWord = word;
  }

  api.input?.addEventListener("input", () => {
    noteQuery(api.getQuery());
  });
  api.input?.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent) || event.key !== "Enter" || event.shiftKey) return;
    clearTimer();
    void flush();
  });
  api.input?.addEventListener("blur", () => {
    clearTimer();
    void flush();
  });
  window.addEventListener("pagehide", () => {
    clearTimer();
    void flush();
  });

  return { noteResult, endSession, flush };
}

/**
 * @param {string} word
 */
export async function removeStudyWord(word) {
  const key = String(word || "").trim().toLowerCase();
  if (!key) return;
  const words = (await loadStudyWords()).filter((item) => item.word.toLowerCase() !== key);
  await chrome.storage.local.set({ [STUDY_WORDS_KEY]: words });
}
