/**
 * 解析 `// ==UserScript==` 头。兼容 Tampermonkey / Greasy Fork 常见字段。
 */

const HEADER_RE = /(?:^|\n)\s*\/\/\s*==UserScript==\s*\n([\s\S]*?)\n\s*\/\/\s*==\/UserScript==/;
const LINE_RE = /^\s*\/\/\s*@([A-Za-z0-9:_-]+)\s+(.*)$/;

/**
 * @typedef {{
 *   name: string,
 *   nameI18n: Record<string, string>,
 *   namespace: string,
 *   version: string,
 *   description: string,
 *   author: string,
 *   matches: string[],
 *   includes: string[],
 *   excludes: string[],
 *   grants: string[],
 *   requires: string[],
 *   resources: { name: string, url: string }[],
 *   connect: string[],
 *   runAt: "document-start" | "document-end" | "document-idle",
 *   noframes: boolean,
 *   updateURL: string,
 *   downloadURL: string,
 *   icon: string,
 *   header: string,
 * }} UserscriptMeta
 */

/**
 * @param {string} raw
 * @returns {string}
 */
export function stripUserscriptHeader(raw) {
  return String(raw || "").replace(HEADER_RE, "").replace(/^\s+/, "");
}

/**
 * @param {string} raw
 * @returns {UserscriptMeta}
 */
export function parseUserscriptMeta(raw) {
  const source = String(raw || "");
  const block = source.match(HEADER_RE);
  if (!block) throw new Error("缺少 // ==UserScript== 头");

  /** @type {Record<string, string[]>} */
  const fields = {};
  for (const line of block[1].split(/\r?\n/)) {
    const hit = line.match(LINE_RE);
    if (!hit) continue;
    const key = hit[1];
    const value = hit[2].trim();
    if (!fields[key]) fields[key] = [];
    fields[key].push(value);
  }

  const first = (key, fallback = "") => (fields[key] && fields[key][0]) || fallback;
  const list = (key) => fields[key] ? [...fields[key]] : [];

  const nameI18n = {};
  for (const [key, values] of Object.entries(fields)) {
    const loc = key.match(/^name:(.+)$/i);
    if (loc) nameI18n[loc[1].toLowerCase()] = values[0];
  }

  const runRaw = first("run-at", "document-idle").toLowerCase();
  const runAt =
    runRaw === "document-start" || runRaw === "document-end" || runRaw === "document-idle"
      ? runRaw
      : runRaw === "document-body"
        ? "document-end"
        : "document-idle";

  const resources = list("resource").map((item) => {
    const hit = item.match(/^(\S+)\s+(\S+)/);
    if (!hit) return null;
    return { name: hit[1], url: hit[2] };
  }).filter(Boolean);

  const grants = list("grant").filter((item) => item && item !== "none");
  if (list("grant").includes("none")) grants.length = 0;

  return {
    name: pickLocalizedName(first("name", "未命名脚本"), nameI18n),
    nameI18n,
    namespace: first("namespace"),
    version: first("version", "0.0.0"),
    description: first("description"),
    author: first("author"),
    matches: list("match"),
    includes: list("include"),
    excludes: list("exclude"),
    grants,
    requires: list("require"),
    resources,
    connect: list("connect"),
    runAt,
    noframes: Object.prototype.hasOwnProperty.call(fields, "noframes"),
    updateURL: first("updateURL"),
    downloadURL: first("downloadURL"),
    icon: first("icon") || first("iconURL"),
    header: block[0].trim(),
  };
}

/**
 * @param {string} fallback
 * @param {Record<string, string>} i18n
 */
function pickLocalizedName(fallback, i18n) {
  return i18n["zh-cn"] || i18n.zh || i18n["zh-tw"] || fallback;
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} a>b → 1, a<b → -1
 */
export function compareScriptVersion(a, b) {
  const pa = String(a || "0").split(/[^\d]+/).map((n) => Number(n) || 0);
  const pb = String(b || "0").split(/[^\d]+/).map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}
