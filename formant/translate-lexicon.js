import { EN_SLANG } from "./lexicon/en.js";
import { JA_SLANG } from "./lexicon/ja.js";
import { KO_SLANG } from "./lexicon/ko.js";
import { TR_SLANG } from "./lexicon/tr.js";
import { ZH_SLANG } from "./lexicon/zh.js";

/**
 * Hard-to-literal phrases for smart translate routing.
 * Rich slang libraries live under `./lexicon/` and are merged here for scoring.
 *
 * @typedef {"en" | "zh" | "ja" | "ko" | "tr"} LexiconLang
 * @typedef {"idiom" | "slang" | "proverb" | "net"} LexiconKind
 * @typedef {{ phrase: string, lang: LexiconLang, kind: LexiconKind, weight?: number, id?: string }} LexiconEntry
 */

/**
 * @param {string} phrase
 */
export function weightForSlangPhrase(phrase) {
  const p = String(phrase || "").trim();
  if (!p) return 40;
  // Short tags still count as slang hits (≥40 → route to GPT).
  if (!/\s/.test(p) && p.length <= 3) return 40;
  if (/\s/.test(p) || p.length >= 14) return 46;
  return 42;
}

/**
 * @typedef {{
 *   id?: string,
 *   phrase: string,
 *   meaning?: string,
 *   examples?: string[],
 *   tags?: string[],
 *   kind?: LexiconKind,
 *   weight?: number,
 * }} LexiconPackEntry
 *
 * @typedef {{
 *   id: string,
 *   name: string,
 *   lang: LexiconLang,
 *   builtin: boolean,
 *   enabled: boolean,
 *   entries: LexiconPackEntry[],
 * }} LexiconPack
 */

/**
 * @param {{ id?: string, phrase: string }[]} records
 * @param {LexiconLang} lang
 * @returns {LexiconEntry[]}
 */
export function slangRecordsToEntries(records, lang) {
  /** @type {LexiconEntry[]} */
  const out = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const record of records) {
    const phrase = String(record.phrase || "").trim();
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      lang,
      kind: "slang",
      phrase,
      weight: weightForSlangPhrase(phrase),
      id: record.id,
    });
  }
  return out;
}

/** @type {LexiconEntry[]} */
const EN_SLANG_ENTRIES = [
  ...slangRecordsToEntries(EN_SLANG, "en"),
  // Common orthography / tense variants not in the source list.
  ...slangRecordsToEntries(
    [
      { id: "en_017a", phrase: "low-key" },
      { id: "en_018a", phrase: "high-key" },
      { id: "en_007a", phrase: "ghosted" },
      { id: "en_extra_its_giving", phrase: "it's giving" },
    ],
    "en",
  ),
];

/** @type {LexiconEntry[]} */
const EN_IDIOM_PROVERB = [
  // ── English idioms / proverbs ──
  { lang: "en", kind: "idiom", phrase: "piece of cake", weight: 46 },
  { lang: "en", kind: "idiom", phrase: "break a leg", weight: 46 },
  { lang: "en", kind: "idiom", phrase: "hit the sack", weight: 44 },
  { lang: "en", kind: "idiom", phrase: "hit the nail on the head", weight: 48 },
  { lang: "en", kind: "idiom", phrase: "hit the nail", weight: 42 },
  { lang: "en", kind: "idiom", phrase: "once in a blue moon", weight: 48 },
  { lang: "en", kind: "idiom", phrase: "cost an arm and a leg", weight: 48 },
  { lang: "en", kind: "idiom", phrase: "kill two birds with one stone", weight: 50 },
  { lang: "en", kind: "idiom", phrase: "kill two birds", weight: 44 },
  { lang: "en", kind: "idiom", phrase: "under the weather", weight: 44 },
  { lang: "en", kind: "idiom", phrase: "spill the beans", weight: 44 },
  { lang: "en", kind: "idiom", phrase: "bite the bullet", weight: 44 },
  { lang: "en", kind: "idiom", phrase: "the ball is in your court", weight: 48 },
  { lang: "en", kind: "idiom", phrase: "call it a day", weight: 42 },
  { lang: "en", kind: "idiom", phrase: "cut corners", weight: 42 },
  { lang: "en", kind: "idiom", phrase: "get out of hand", weight: 42 },
  { lang: "en", kind: "idiom", phrase: "hang in there", weight: 40 },
  { lang: "en", kind: "idiom", phrase: "miss the boat", weight: 42 },
  { lang: "en", kind: "idiom", phrase: "on the fence", weight: 40 },
  { lang: "en", kind: "idiom", phrase: "speak of the devil", weight: 46 },
  { lang: "en", kind: "idiom", phrase: "the best of both worlds", weight: 44 },
  { lang: "en", kind: "idiom", phrase: "when pigs fly", weight: 46 },
  { lang: "en", kind: "idiom", phrase: "add insult to injury", weight: 46 },
  { lang: "en", kind: "idiom", phrase: "back to the drawing board", weight: 46 },
  { lang: "en", kind: "idiom", phrase: "barking up the wrong tree", weight: 48 },
  { lang: "en", kind: "idiom", phrase: "beat around the bush", weight: 46 },
  { lang: "en", kind: "idiom", phrase: "blessing in disguise", weight: 46 },
  { lang: "en", kind: "idiom", phrase: "burn the midnight oil", weight: 46 },
  { lang: "en", kind: "idiom", phrase: "butterflies in my stomach", weight: 46 },
  { lang: "en", kind: "idiom", phrase: "cross that bridge", weight: 42 },
  { lang: "en", kind: "idiom", phrase: "devil's advocate", weight: 44 },
  { lang: "en", kind: "idiom", phrase: "don't cry over spilled milk", weight: 50 },
  { lang: "en", kind: "idiom", phrase: "every cloud has a silver lining", weight: 50 },
  { lang: "en", kind: "idiom", phrase: "go the extra mile", weight: 42 },
  { lang: "en", kind: "idiom", phrase: "hit the books", weight: 40 },
  { lang: "en", kind: "idiom", phrase: "in hot water", weight: 40 },
  { lang: "en", kind: "idiom", phrase: "it takes two to tango", weight: 46 },
  { lang: "en", kind: "idiom", phrase: "jump on the bandwagon", weight: 46 },
  { lang: "en", kind: "idiom", phrase: "let the cat out of the bag", weight: 48 },
  { lang: "en", kind: "idiom", phrase: "make a long story short", weight: 42 },
  { lang: "en", kind: "idiom", phrase: "no pain no gain", weight: 42 },
  { lang: "en", kind: "idiom", phrase: "on cloud nine", weight: 42 },
  { lang: "en", kind: "idiom", phrase: "pull someone's leg", weight: 44 },
  { lang: "en", kind: "idiom", phrase: "rain on someone's parade", weight: 46 },
  { lang: "en", kind: "idiom", phrase: "see eye to eye", weight: 42 },
  { lang: "en", kind: "idiom", phrase: "take it with a grain of salt", weight: 48 },
  { lang: "en", kind: "idiom", phrase: "the last straw", weight: 42 },
  { lang: "en", kind: "idiom", phrase: "throw in the towel", weight: 44 },
  { lang: "en", kind: "idiom", phrase: "you can't have your cake and eat it", weight: 50 },
  { lang: "en", kind: "idiom", phrase: "raining cats and dogs", weight: 48 },
  { lang: "en", kind: "idiom", phrase: "a dime a dozen", weight: 44 },
  { lang: "en", kind: "idiom", phrase: "bite off more than you can chew", weight: 48 },
  { lang: "en", kind: "idiom", phrase: "burn bridges", weight: 42 },
  { lang: "en", kind: "idiom", phrase: "by the skin of your teeth", weight: 48 },
  { lang: "en", kind: "idiom", phrase: "cut to the chase", weight: 42 },
  { lang: "en", kind: "idiom", phrase: "get cold feet", weight: 42 },
  { lang: "en", kind: "idiom", phrase: "hit the road", weight: 40 },
  { lang: "en", kind: "idiom", phrase: "kick the bucket", weight: 46 },
  { lang: "en", kind: "idiom", phrase: "let sleeping dogs lie", weight: 48 },
  { lang: "en", kind: "idiom", phrase: "once bitten twice shy", weight: 46 },
  { lang: "en", kind: "idiom", phrase: "out of the blue", weight: 42 },
  { lang: "en", kind: "idiom", phrase: "pull yourself together", weight: 42 },
  { lang: "en", kind: "idiom", phrase: "the elephant in the room", weight: 48 },
  { lang: "en", kind: "proverb", phrase: "actions speak louder than words", weight: 50 },
  { lang: "en", kind: "proverb", phrase: "better late than never", weight: 46 },
  { lang: "en", kind: "proverb", phrase: "don't judge a book by its cover", weight: 50 },
  { lang: "en", kind: "proverb", phrase: "the early bird catches the worm", weight: 50 },
  { lang: "en", kind: "proverb", phrase: "when in rome", weight: 44 },
];

/** @type {LexiconEntry[]} */
const ZH_SLANG_ENTRIES = [
  ...slangRecordsToEntries(ZH_SLANG, "zh"),
  // Orthography / alias variants not in the source list.
  ...slangRecordsToEntries(
    [
      { id: "zh_023a", phrase: "芭比q" },
      { id: "zh_023b", phrase: "芭比Q" },
      { id: "zh_078a", phrase: "栓q" },
      { id: "zh_039a", phrase: "嘴替" },
      { id: "zh_extra_社死", phrase: "社死" },
      { id: "zh_extra_摆烂", phrase: "摆烂" },
      { id: "zh_extra_草", phrase: "草" },
      { id: "zh_extra_yyds", phrase: "yyds" },
      { id: "zh_extra_xswl", phrase: "xswl" },
      { id: "zh_extra_awsl", phrase: "awsl" },
    ],
    "zh",
  ),
];

/** @type {LexiconEntry[]} */
const ZH_IDIOM_PROVERB = [
  { lang: "zh", kind: "idiom", phrase: "一石二鸟", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "亡羊补牢", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "画蛇添足", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "对牛弹琴", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "狐假虎威", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "井底之蛙", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "守株待兔", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "掩耳盗铃", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "滥竽充数", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "刻舟求剑", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "买椟还珠", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "叶公好龙", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "塞翁失马", weight: 50 },
  { lang: "zh", kind: "idiom", phrase: "盲人摸象", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "杯弓蛇影", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "朝三暮四", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "杞人忧天", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "投鼠忌器", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "走马观花", weight: 46 },
  { lang: "zh", kind: "idiom", phrase: "水深火热", weight: 46 },
  { lang: "zh", kind: "idiom", phrase: "雪中送炭", weight: 46 },
  { lang: "zh", kind: "idiom", phrase: "锦上添花", weight: 46 },
  { lang: "zh", kind: "idiom", phrase: "纸上谈兵", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "望梅止渴", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "画饼充饥", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "卧薪尝胆", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "破釜沉舟", weight: 48 },
  { lang: "zh", kind: "idiom", phrase: "四面楚歌", weight: 48 },
  { lang: "zh", kind: "proverb", phrase: "三个和尚", weight: 44 },
  { lang: "zh", kind: "proverb", phrase: "说曹操曹操到", weight: 50 },
  { lang: "zh", kind: "proverb", phrase: "说曹操", weight: 44 },
  { lang: "zh", kind: "proverb", phrase: "姜还是老的辣", weight: 48 },
  { lang: "zh", kind: "proverb", phrase: "天下没有免费的午餐", weight: 50 },
  { lang: "zh", kind: "proverb", phrase: "吃一堑长一智", weight: 48 },
  { lang: "zh", kind: "proverb", phrase: "远亲不如近邻", weight: 48 },
  { lang: "zh", kind: "proverb", phrase: "有钱能使鬼推磨", weight: 50 },
  { lang: "zh", kind: "proverb", phrase: "不怕一万就怕万一", weight: 48 },
  { lang: "zh", kind: "proverb", phrase: "计划不如变化", weight: 42 },
];

/** @type {LexiconEntry[]} */
const JA_SLANG_ENTRIES = [
  ...slangRecordsToEntries(JA_SLANG, "ja"),
  // Variants / related forms not listed as primary phrases.
  ...slangRecordsToEntries(
    [
      { id: "ja_extra_やばい", phrase: "やばい" },
      { id: "ja_extra_やばっ", phrase: "やばっ" },
      { id: "ja_extra_ガチで", phrase: "ガチで" },
      { id: "ja_extra_わかりみ", phrase: "わかりみ" },
      { id: "ja_extra_詰んだ", phrase: "詰んだ" },
      { id: "ja_extra_無理ゲー", phrase: "無理ゲー" },
      { id: "ja_extra_チルい", phrase: "チルい" },
      { id: "ja_extra_それある", phrase: "それある" },
      { id: "ja_extra_www", phrase: "www" },
      { id: "ja_extra_ｗｗｗ", phrase: "ｗｗｗ" },
      { id: "ja_extra_wktk", phrase: "wktk" },
      { id: "ja_extra_kwsk", phrase: "kwsk" },
    ],
    "ja",
  ),
];

/** @type {LexiconEntry[]} */
const JA_IDIOM_PROVERB = [
  { lang: "ja", kind: "idiom", phrase: "猫をかぶる", weight: 50 },
  { lang: "ja", kind: "idiom", phrase: "猫を被る", weight: 50 },
  { lang: "ja", kind: "idiom", phrase: "一石二鳥", weight: 48 },
  { lang: "ja", kind: "idiom", phrase: "十人十色", weight: 48 },
  { lang: "ja", kind: "idiom", phrase: "以心伝心", weight: 48 },
  { lang: "ja", kind: "idiom", phrase: "臨機応変", weight: 48 },
  { lang: "ja", kind: "idiom", phrase: "七転び八起き", weight: 52 },
  { lang: "ja", kind: "idiom", phrase: "馬の耳に念仏", weight: 52 },
  { lang: "ja", kind: "idiom", phrase: "猿も木から落ちる", weight: 52 },
  { lang: "ja", kind: "idiom", phrase: "石の上にも三年", weight: 52 },
  { lang: "ja", kind: "idiom", phrase: "口が滑る", weight: 46 },
  { lang: "ja", kind: "idiom", phrase: "手が足りない", weight: 42 },
  { lang: "ja", kind: "idiom", phrase: "足を引っ張る", weight: 48 },
  { lang: "ja", kind: "idiom", phrase: "顔が広い", weight: 46 },
  { lang: "ja", kind: "idiom", phrase: "頭が痛い", weight: 40 },
  { lang: "ja", kind: "idiom", phrase: "気が重い", weight: 44 },
  { lang: "ja", kind: "idiom", phrase: "気が利く", weight: 44 },
  { lang: "ja", kind: "idiom", phrase: "さじを投げる", weight: 50 },
  { lang: "ja", kind: "idiom", phrase: "匙を投げる", weight: 50 },
  { lang: "ja", kind: "idiom", phrase: "油を売る", weight: 48 },
  { lang: "ja", kind: "idiom", phrase: "道草を食う", weight: 48 },
  { lang: "ja", kind: "idiom", phrase: "二の足を踏む", weight: 50 },
  { lang: "ja", kind: "idiom", phrase: "腹が立つ", weight: 42 },
  { lang: "ja", kind: "idiom", phrase: "胸が痛い", weight: 40 },
  { lang: "ja", kind: "proverb", phrase: "出る杭は打たれる", weight: 52 },
  { lang: "ja", kind: "proverb", phrase: "知らぬが仏", weight: 48 },
  { lang: "ja", kind: "proverb", phrase: "急がば回れ", weight: 50 },
  { lang: "ja", kind: "proverb", phrase: "案ずるより産むが易し", weight: 54 },
  { lang: "ja", kind: "proverb", phrase: "笑う門には福来る", weight: 52 },
  { lang: "ja", kind: "proverb", phrase: "類は友を呼ぶ", weight: 50 },
];

/** @type {LexiconEntry[]} */
const KO_SLANG_ENTRIES = [
  ...slangRecordsToEntries(KO_SLANG, "ko"),
  // Extra net / legacy short tags.
  ...slangRecordsToEntries(
    [
      { id: "ko_extra_대박", phrase: "대박" },
      { id: "ko_extra_헐", phrase: "헐" },
      { id: "ko_extra_짱", phrase: "짱" },
      { id: "ko_extra_존맛", phrase: "존맛" },
      { id: "ko_extra_헬조선", phrase: "헬조선" },
      { id: "ko_extra_핵노잼", phrase: "핵노잼" },
      { id: "ko_extra_레알", phrase: "레알" },
      { id: "ko_extra_띵작", phrase: "띵작" },
      { id: "ko_extra_인싸", phrase: "인싸" },
      { id: "ko_extra_아싸", phrase: "아싸" },
      { id: "ko_extra_혼코노", phrase: "혼코노" },
      { id: "ko_extra_ㅋㅋ", phrase: "ㅋㅋ" },
      { id: "ko_extra_ㅋㅋㅋ", phrase: "ㅋㅋㅋ" },
      { id: "ko_extra_ㅎㅎ", phrase: "ㅎㅎ" },
      { id: "ko_extra_ㅠㅠ", phrase: "ㅠㅠ" },
      { id: "ko_extra_ㅜㅜ", phrase: "ㅜㅜ" },
      { id: "ko_extra_ㅇㅇ", phrase: "ㅇㅇ" },
      { id: "ko_extra_ㄱㄱ", phrase: "ㄱㄱ" },
      { id: "ko_extra_ㄴㄴ", phrase: "ㄴㄴ" },
    ],
    "ko",
  ),
];

/** @type {LexiconEntry[]} */
const KO_IDIOM_PROVERB = [
  { lang: "ko", kind: "idiom", phrase: "식은 죽 먹기", weight: 50 },
  { lang: "ko", kind: "idiom", phrase: "눈 코 뜰 새 없다", weight: 52 },
  { lang: "ko", kind: "idiom", phrase: "귀가 얇다", weight: 48 },
  { lang: "ko", kind: "idiom", phrase: "손이 크다", weight: 46 },
  { lang: "ko", kind: "idiom", phrase: "발이 넓다", weight: 46 },
  { lang: "ko", kind: "idiom", phrase: "배가 아프다", weight: 44 },
  { lang: "ko", kind: "idiom", phrase: "간이 크다", weight: 48 },
  { lang: "ko", kind: "idiom", phrase: "코가 석자", weight: 50 },
  { lang: "ko", kind: "idiom", phrase: "귀가 솔깃하다", weight: 48 },
  { lang: "ko", kind: "idiom", phrase: "손에 땀을 쥐다", weight: 50 },
  { lang: "ko", kind: "idiom", phrase: "발을 빼다", weight: 44 },
  { lang: "ko", kind: "idiom", phrase: "물을 먹다", weight: 42 },
  { lang: "ko", kind: "idiom", phrase: "파김치가 되다", weight: 50 },
  { lang: "ko", kind: "idiom", phrase: "닭 쫓던 개", weight: 48 },
  { lang: "ko", kind: "idiom", phrase: "산 넘어 산", weight: 48 },
  { lang: "ko", kind: "proverb", phrase: "가는 말이 고와야 오는 말이 곱다", weight: 54 },
  { lang: "ko", kind: "proverb", phrase: "원숭이도 나무에서 떨어진다", weight: 52 },
  { lang: "ko", kind: "proverb", phrase: "고생 끝에 낙이 온다", weight: 50 },
  { lang: "ko", kind: "proverb", phrase: "티끌 모아 태산", weight: 50 },
  { lang: "ko", kind: "proverb", phrase: "소 잃고 외양간 고친다", weight: 52 },
  { lang: "ko", kind: "proverb", phrase: "누워서 떡 먹기", weight: 50 },
  { lang: "ko", kind: "proverb", phrase: "고래 싸움에 새우 등 터진다", weight: 54 },
];

/** @type {LexiconEntry[]} */
const TR_SLANG_ENTRIES = [
  ...slangRecordsToEntries(TR_SLANG, "tr"),
  // Case / spacing variants common in chat.
  ...slangRecordsToEntries(
    [
      { id: "tr_002a", phrase: "aynen" },
      { id: "tr_004a", phrase: "kanka" },
      { id: "tr_030a", phrase: "naber" },
      { id: "tr_028a", phrase: "eyvallah" },
      { id: "tr_027a", phrase: "yok artık" },
      { id: "tr_100a", phrase: "neyse" },
      { id: "tr_039a", phrase: "bi tık" },
      { id: "tr_039b", phrase: "bir tık" },
    ],
    "tr",
  ),
];

/**
 * @param {LexiconPackEntry[]} slangRecords
 * @param {LexiconEntry[]} idiomProverb
 * @returns {LexiconPackEntry[]}
 */
function mergePackEntries(slangRecords, idiomProverb) {
  /** @type {LexiconPackEntry[]} */
  const out = [];
  for (const row of slangRecords) {
    out.push({
      id: row.id,
      phrase: row.phrase,
      meaning: row.meaning || "",
      examples: Array.isArray(row.examples) ? row.examples : [],
      tags: Array.isArray(row.tags) ? row.tags : [],
      kind: "slang",
      weight: weightForSlangPhrase(row.phrase),
    });
  }
  for (const row of idiomProverb) {
    out.push({
      id: row.id || `${row.lang}_${row.kind}_${row.phrase}`,
      phrase: row.phrase,
      meaning: "",
      examples: [],
      tags: [row.kind === "proverb" ? "谚语" : "习语"],
      kind: row.kind,
      weight: row.weight,
    });
  }
  return out;
}

/**
 * Built-in lexicon packs (content ships with the extension).
 * @returns {LexiconPack[]}
 */
export function getDefaultPacks() {
  return [
    {
      id: "builtin:en",
      name: "英语俚语 / 习语",
      lang: "en",
      builtin: true,
      enabled: true,
      entries: mergePackEntries(
        [
          ...EN_SLANG,
          { id: "en_017a", phrase: "low-key", meaning: "", examples: [], tags: [] },
          { id: "en_018a", phrase: "high-key", meaning: "", examples: [], tags: [] },
          { id: "en_007a", phrase: "ghosted", meaning: "", examples: [], tags: [] },
          { id: "en_extra_its_giving", phrase: "it's giving", meaning: "", examples: [], tags: [] },
        ],
        EN_IDIOM_PROVERB,
      ),
    },
    {
      id: "builtin:zh",
      name: "中文俚语 / 成语",
      lang: "zh",
      builtin: true,
      enabled: true,
      entries: mergePackEntries(
        [
          ...ZH_SLANG,
          { id: "zh_023a", phrase: "芭比q", meaning: "", examples: [], tags: [] },
          { id: "zh_023b", phrase: "芭比Q", meaning: "", examples: [], tags: [] },
          { id: "zh_078a", phrase: "栓q", meaning: "", examples: [], tags: [] },
          { id: "zh_039a", phrase: "嘴替", meaning: "", examples: [], tags: [] },
          { id: "zh_extra_社死", phrase: "社死", meaning: "", examples: [], tags: [] },
          { id: "zh_extra_摆烂", phrase: "摆烂", meaning: "", examples: [], tags: [] },
          { id: "zh_extra_草", phrase: "草", meaning: "", examples: [], tags: [] },
          { id: "zh_extra_yyds", phrase: "yyds", meaning: "", examples: [], tags: [] },
          { id: "zh_extra_xswl", phrase: "xswl", meaning: "", examples: [], tags: [] },
          { id: "zh_extra_awsl", phrase: "awsl", meaning: "", examples: [], tags: [] },
        ],
        ZH_IDIOM_PROVERB,
      ),
    },
    {
      id: "builtin:ja",
      name: "日语俚语 / 惯用",
      lang: "ja",
      builtin: true,
      enabled: true,
      entries: mergePackEntries(
        [
          ...JA_SLANG,
          { id: "ja_extra_やばい", phrase: "やばい", meaning: "", examples: [], tags: [] },
          { id: "ja_extra_やばっ", phrase: "やばっ", meaning: "", examples: [], tags: [] },
          { id: "ja_extra_ガチで", phrase: "ガチで", meaning: "", examples: [], tags: [] },
          { id: "ja_extra_わかりみ", phrase: "わかりみ", meaning: "", examples: [], tags: [] },
          { id: "ja_extra_詰んだ", phrase: "詰んだ", meaning: "", examples: [], tags: [] },
          { id: "ja_extra_無理ゲー", phrase: "無理ゲー", meaning: "", examples: [], tags: [] },
          { id: "ja_extra_チルい", phrase: "チルい", meaning: "", examples: [], tags: [] },
          { id: "ja_extra_それある", phrase: "それある", meaning: "", examples: [], tags: [] },
          { id: "ja_extra_www", phrase: "www", meaning: "", examples: [], tags: [] },
          { id: "ja_extra_ｗｗｗ", phrase: "ｗｗｗ", meaning: "", examples: [], tags: [] },
          { id: "ja_extra_wktk", phrase: "wktk", meaning: "", examples: [], tags: [] },
          { id: "ja_extra_kwsk", phrase: "kwsk", meaning: "", examples: [], tags: [] },
        ],
        JA_IDIOM_PROVERB,
      ),
    },
    {
      id: "builtin:ko",
      name: "韩语俚语 / 惯用",
      lang: "ko",
      builtin: true,
      enabled: true,
      entries: mergePackEntries(
        [
          ...KO_SLANG,
          { id: "ko_extra_대박", phrase: "대박", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_헐", phrase: "헐", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_짱", phrase: "짱", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_존맛", phrase: "존맛", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_헬조선", phrase: "헬조선", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_핵노잼", phrase: "핵노잼", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_레알", phrase: "레알", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_띵작", phrase: "띵작", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_인싸", phrase: "인싸", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_아싸", phrase: "아싸", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_혼코노", phrase: "혼코노", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_ㅋㅋ", phrase: "ㅋㅋ", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_ㅋㅋㅋ", phrase: "ㅋㅋㅋ", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_ㅎㅎ", phrase: "ㅎㅎ", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_ㅠㅠ", phrase: "ㅠㅠ", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_ㅜㅜ", phrase: "ㅜㅜ", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_ㅇㅇ", phrase: "ㅇㅇ", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_ㄱㄱ", phrase: "ㄱㄱ", meaning: "", examples: [], tags: [] },
          { id: "ko_extra_ㄴㄴ", phrase: "ㄴㄴ", meaning: "", examples: [], tags: [] },
        ],
        KO_IDIOM_PROVERB,
      ),
    },
    {
      id: "builtin:tr",
      name: "土耳其语俚语",
      lang: "tr",
      builtin: true,
      enabled: true,
      entries: mergePackEntries(
        [
          ...TR_SLANG,
          { id: "tr_002a", phrase: "aynen", meaning: "", examples: [], tags: [] },
          { id: "tr_004a", phrase: "kanka", meaning: "", examples: [], tags: [] },
          { id: "tr_030a", phrase: "naber", meaning: "", examples: [], tags: [] },
          { id: "tr_028a", phrase: "eyvallah", meaning: "", examples: [], tags: [] },
          { id: "tr_027a", phrase: "yok artık", meaning: "", examples: [], tags: [] },
          { id: "tr_100a", phrase: "neyse", meaning: "", examples: [], tags: [] },
          { id: "tr_039a", phrase: "bi tık", meaning: "", examples: [], tags: [] },
          { id: "tr_039b", phrase: "bir tık", meaning: "", examples: [], tags: [] },
        ],
        [],
      ),
    },
  ];
}

/**
 * @param {LexiconPack} pack
 * @returns {LexiconEntry[]}
 */
export function packToLexiconEntries(pack) {
  /** @type {LexiconEntry[]} */
  const out = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const row of pack.entries || []) {
    const phrase = String(row.phrase || "").trim();
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = row.kind || "slang";
    out.push({
      lang: pack.lang,
      kind,
      phrase,
      weight: Number(row.weight) || weightForSlangPhrase(phrase),
      id: row.id,
    });
  }
  return out;
}

/** @type {LexiconEntry[]} */
export const TRANSLATE_LEXICON = getDefaultPacks().flatMap((pack) => packToLexiconEntries(pack));

/**
 * Longer phrases first so "kill two birds with one stone" wins over "kill two birds".
 * @type {LexiconEntry[]}
 */
export const TRANSLATE_LEXICON_SORTED = [...TRANSLATE_LEXICON].sort(
  (a, b) => b.phrase.length - a.phrase.length,
);
