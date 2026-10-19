/**
 * @match（Chrome match pattern）与 @include / @exclude（glob / /regex/）。
 */

const MATCH_RE = /^(?<scheme>\*|https?|http\*):\/\/(?<host>\*|(?:\*\.)?[^/*]+)(?<path>\/.*)?$/i;

/**
 * @param {string} pattern
 */
export function isMatchPattern(pattern) {
  const text = String(pattern || "").trim();
  if (text === "<all_urls>" || text === "*://*/*") return true;
  return MATCH_RE.test(text);
}

/**
 * @include 转成尽量接近的 match pattern；转不了就返回空，由运行时再过滤。
 * @param {string} include
 * @returns {string[]}
 */
export function includeToMatchPatterns(include) {
  const text = String(include || "").trim();
  if (!text || text.startsWith("/")) return [];
  if (text === "*" || text === "*://*/*") return ["*://*/*"];
  if (isMatchPattern(text)) return expandHttpStar(text);
  if (/^https?:\/\/\S+$/i.test(text) && !text.includes("*")) {
    return [text.includes("/", 8) ? text : `${text}/*`];
  }
  const proto = text.match(/^(https?:)\/\//i);
  if (proto && text.includes("*")) {
    const rest = text.slice(proto[0].length);
    const slash = rest.indexOf("/");
    const host = slash === -1 ? rest : rest.slice(0, slash);
    const path = slash === -1 ? "/*" : rest.slice(slash).replace(/\*+$/, "*") || "/*";
    if (!host.includes("*") || host.startsWith("*.")) {
      return [`${proto[1].toLowerCase()}//${host}${path.startsWith("/") ? path : `/${path}`}`];
    }
  }
  return [];
}

/**
 * @param {string} pattern
 * @returns {string[]}
 */
function expandHttpStar(pattern) {
  const text = String(pattern || "");
  if (text.startsWith("http*://")) {
    const rest = text.slice("http*://".length);
    return [`http://${rest}`, `https://${rest}`];
  }
  return [text];
}

/**
 * @param {string} pattern
 * @param {string} url
 */
export function urlMatchesPattern(pattern, url) {
  const text = String(pattern || "").trim();
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (text === "<all_urls>" || text === "*://*/*" || text === "*") {
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  }
  if (text.startsWith("/") && text.lastIndexOf("/") > 0) {
    try {
      const last = text.lastIndexOf("/");
      return new RegExp(text.slice(1, last), text.slice(last + 1)).test(url);
    } catch {
      return false;
    }
  }
  if (isMatchPattern(text) || text.startsWith("http*://")) {
    return expandHttpStar(text).some((item) => matchChromePattern(item, parsed));
  }
  return globMatch(text, url);
}

/**
 * @param {string} pattern
 * @param {URL} url
 */
function matchChromePattern(pattern, url) {
  if (pattern === "<all_urls>" || pattern === "*://*/*") {
    return url.protocol === "http:" || url.protocol === "https:";
  }
  const hit = String(pattern).match(MATCH_RE);
  if (!hit || !hit.groups) return false;
  const scheme = hit.groups.scheme.toLowerCase();
  const host = hit.groups.host.toLowerCase();
  const path = hit.groups.path || "/";
  const proto = url.protocol.replace(":", "");
  if (scheme === "*") {
    if (proto !== "http" && proto !== "https") return false;
  } else if (scheme !== proto) return false;
  const uh = url.hostname.toLowerCase();
  if (host === "*") {
    /* any host */
  } else if (host.startsWith("*.")) {
    const base = host.slice(2);
    if (uh !== base && !uh.endsWith(`.${base}`)) return false;
  } else if (uh !== host) return false;
  const up = `${url.pathname}${url.search}`;
  return globMatch(path, up) || globMatch(`${path}*`, up);
}

/**
 * @param {string} glob
 * @param {string} value
 */
function globMatch(glob, value) {
  let body = "";
  for (const ch of String(glob)) {
    if (ch === "*") body += ".*";
    else if (ch === "?") body += ".";
    else body += ch.replace(/[|\\{}()[\]^$+.]/g, "\\$&");
  }
  try {
    return new RegExp(`^${body}$`, "i").test(value);
  } catch {
    return false;
  }
}

/**
 * @param {{ matches?: string[], includes?: string[], excludes?: string[], noframes?: boolean }} meta
 * @param {string} url
 * @param {{ isTop?: boolean }} [opt]
 */
export function scriptMatchesUrl(meta, url, opt = {}) {
  if (meta.noframes && opt.isTop === false) return false;
  const excludes = meta.excludes || [];
  if (excludes.some((rule) => urlMatchesPattern(rule, url))) return false;
  const matches = meta.matches || [];
  const includes = meta.includes || [];
  if (!matches.length && !includes.length) return false;
  return (
    matches.some((rule) => urlMatchesPattern(rule, url)) ||
    includes.some((rule) => urlMatchesPattern(rule, url))
  );
}

/**
 * 给 chrome.userScripts.register 用的 match / exclude。
 * @param {{ matches?: string[], includes?: string[], excludes?: string[] }} meta
 */
export function registerPatterns(meta) {
  const matches = [
    ...(meta.matches || []).flatMap((item) => expandHttpStar(item)).filter(isMatchPattern),
    ...(meta.includes || []).flatMap(includeToMatchPatterns).filter(isMatchPattern),
  ];
  const excludeMatches = (meta.excludes || [])
    .flatMap((item) => expandHttpStar(item))
    .filter(isMatchPattern);
  return {
    matches: matches.length ? [...new Set(matches)] : ["*://*/*"],
    excludeMatches: [...new Set(excludeMatches)],
  };
}
