/** 企业背景查询：公开检索地址。不抓站、不经 mono。 */

/**
 * @typedef {{ id: string, name: string, hint: string, group?: "main" | "more", href: (q: string) => string }} CompanyEngine
 */

/** @type {CompanyEngine[]} */
export const ENGINES = [
  {
    id: "tyc",
    name: "天眼查",
    hint: "工商 / 股东 / 风险",
    group: "main",
    href: (q) => "https://www.tianyancha.com/nsearch?key=" + encodeURIComponent(q),
  },
  {
    id: "qcc",
    name: "企查查",
    hint: "企业工商档案",
    group: "main",
    href: (q) => "https://www.qcc.com/web/search?key=" + encodeURIComponent(q),
  },
  {
    id: "aqc",
    name: "爱企查",
    hint: "百度企业库",
    group: "main",
    href: (q) => "https://aiqicha.baidu.com/s?q=" + encodeURIComponent(q),
  },
  {
    id: "qixin",
    name: "启信宝",
    hint: "企业信息",
    group: "main",
    href: (q) => "https://www.qixin.com/search?key=" + encodeURIComponent(q),
  },
  {
    id: "qcm",
    name: "企查猫",
    hint: "企业查询",
    group: "more",
    href: (q) => "https://www.qichamao.com/search/all/" + encodeURIComponent(q),
  },
  {
    id: "shuidi",
    name: "水滴信用",
    hint: "企业信用",
    group: "more",
    href: (q) => "https://shuidi.cn/company-search?keyword=" + encodeURIComponent(q),
  },
  {
    id: "gsxt",
    name: "国家企业信用公示",
    hint: "工商总局（站内再搜）",
    group: "more",
    href: () => "https://www.gsxt.gov.cn/index.html",
  },
  {
    id: "credit",
    name: "信用中国",
    hint: "公共信用（站内再搜）",
    group: "more",
    href: () => "https://www.creditchina.gov.cn/",
  },
  {
    id: "baidu",
    name: "百度",
    hint: "网页检索「公司」",
    group: "more",
    href: (q) => "https://www.baidu.com/s?wd=" + encodeURIComponent(q + " 公司"),
  },
];

export const DEFAULT_ENGINE = "tyc";
export const MAIN_IDS = ENGINES.filter((e) => e.group === "main").map((e) => e.id);

const STORE = "formantCompanySearch";
const MAX_RECENT = 8;

/** @param {string} text */
export function normalizeQuery(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 18 位统一社会信用代码（不含 I/O/Z/S/V）。 */
export function looksLikeCreditCode(text) {
  return /^[0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10}$/i.test(normalizeQuery(text));
}

/** @param {string} id */
export function engineById(id) {
  return ENGINES.find((e) => e.id === id) || ENGINES[0];
}

/**
 * @param {string} id
 * @param {string} query
 */
export function searchUrl(id, query) {
  const q = normalizeQuery(query);
  const eng = engineById(id);
  return eng.href(q || " ");
}

/** @returns {Promise<string[]>} */
export async function loadRecent() {
  try {
    const stored = await chrome.storage.local.get(STORE);
    const raw = stored[STORE];
    const list = raw && Array.isArray(raw.recent) ? raw.recent : [];
    return list.map(normalizeQuery).filter(Boolean).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/** @param {string} query */
export async function pushRecent(query) {
  const q = normalizeQuery(query);
  if (!q) return [];
  const prev = await loadRecent();
  const next = [q, ...prev.filter((x) => x !== q)].slice(0, MAX_RECENT);
  await chrome.storage.local.set({ [STORE]: { recent: next } });
  return next;
}

export async function clearRecent() {
  await chrome.storage.local.set({ [STORE]: { recent: [] } });
}
