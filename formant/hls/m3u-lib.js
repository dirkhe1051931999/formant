/** IPTV lists: `.m3u` / TVBox `.txt` (`name,url` and `组名,#genre#`). */

/**
 * @param {string} raw
 * @returns {string}
 */
function pathnameOf(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.pathname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * @param {string} raw
 * @returns {boolean}
 */
export function isChannelListUrl(raw) {
  const path = pathnameOf(raw);
  if (!path) return false;
  return (path.endsWith(".m3u") && !path.endsWith(".m3u8")) || path.endsWith(".txt");
}

/**
 * @param {string} raw
 * @returns {boolean}
 */
export function isTxtListUrl(raw) {
  return pathnameOf(raw).endsWith(".txt");
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isHlsManifest(text) {
  return /#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE|ENDLIST|PLAYLIST-TYPE|I-FRAMES-ONLY)\b/i.test(
    String(text || "")
  );
}

/**
 * @param {string} href
 * @param {string} baseUrl
 * @returns {string}
 */
function resolveHttpUrl(href, baseUrl) {
  try {
    const url = new URL(String(href || "").trim(), baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.href;
  } catch {
    return "";
  }
}

/**
 * @param {string} href
 * @returns {string}
 */
function guessTitle(href) {
  try {
    const part = new URL(href).pathname.split("/").filter(Boolean).pop() || href;
    return decodeURIComponent(part);
  } catch {
    return href;
  }
}

/**
 * Split TVBox backups (`url#url$备注` / `url;url`).
 * @param {string} rest
 * @param {string} baseUrl
 * @returns {string[]}
 */
export function splitIptvSources(rest, baseUrl) {
  const urls = [];
  const seen = new Set();
  const chunks = String(rest || "").split(/#(?=https?:\/\/)|;(?=https?:\/\/)/i);
  for (const chunk of chunks) {
    const href = chunk.split("$")[0].trim();
    if (!href) continue;
    const url = resolveHttpUrl(href, baseUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

/**
 * @param {string} title
 * @returns {string}
 */
export function normalizeChannelKey(title) {
  return String(title || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\-_.·•]+/g, "");
}

/**
 * @param {{ title?: string, group?: string }} item
 * @returns {boolean}
 */
function isMetaItem(item) {
  const title = String(item.title || "").trim();
  const group = String(item.group || "");
  return /更新时间/.test(group) || /^\d{4}-\d{2}-\d{2}/.test(title);
}

/**
 * @param {string} line
 * @returns {{ title: string, group: string, tvgId: string }}
 */
function parseExtinf(line) {
  const rest = line.replace(/^#EXTINF:/i, "");
  const comma = rest.lastIndexOf(",");
  const title = comma >= 0 ? rest.slice(comma + 1).trim() : rest.trim();
  const attrs = comma >= 0 ? rest.slice(0, comma) : "";
  const group = (/group-title="([^"]*)"/i.exec(attrs) || [])[1] || "";
  const tvgId = (/tvg-id="([^"]*)"/i.exec(attrs) || [])[1] || "";
  return { title, group, tvgId };
}

/**
 * Same name (CCTV-1 / cctv1) becomes one channel; URLs become backup sources.
 * @param {{ title: string, url: string, group?: string, sources?: string[], tvgId?: string }[]} items
 * @returns {{ title: string, url: string, group: string, sources: string[] }[]}
 */
export function mergeChannels(items) {
  const map = new Map();
  const order = [];
  for (const item of items) {
    if (isMetaItem(item)) continue;
    const key = normalizeChannelKey(item.tvgId || item.title);
    if (!key) continue;
    const urls = (item.sources && item.sources.length ? item.sources : item.url ? [item.url] : []).filter(Boolean);
    let found = map.get(key);
    if (!found) {
      found = {
        title: item.title,
        url: urls[0] || "",
        group: item.group || "",
        sources: [],
      };
      map.set(key, found);
      order.push(found);
    } else if (!found.group && item.group) {
      found.group = item.group;
    }
    for (const url of urls) {
      if (!found.sources.includes(url)) found.sources.push(url);
    }
    if (!found.url) found.url = found.sources[0] || "";
  }
  return order;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isBlockedPage(text) {
  return /^\s*</.test(text) || /just a moment|cloudflare/i.test(text.slice(0, 800));
}

/**
 * @param {string} text
 * @param {string} baseUrl
 * @returns {{ kind: "hls" | "list" | "empty", items: { title: string, url: string, group: string }[] }}
 */
function parseM3uBody(text, baseUrl) {
    const items = [];
    let pending = { title: "", group: "", tvgId: "" };
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("#EXTINF:")) {
        pending = parseExtinf(trimmed);
        continue;
      }
      if (trimmed.startsWith("#")) continue;
      if (!/^https?:\/\//i.test(trimmed) && trimmed.includes(",")) {
        const idx = trimmed.indexOf(",");
        const name = trimmed.slice(0, idx).trim();
        const urls = splitIptvSources(trimmed.slice(idx + 1), baseUrl);
        if (urls.length) items.push({ title: name || guessTitle(urls[0]), url: urls[0], group: "", sources: urls });
        pending = { title: "", group: "", tvgId: "" };
        continue;
      }
      const urls = splitIptvSources(trimmed, baseUrl);
      if (!urls.length) continue;
      items.push({
        title: pending.title || guessTitle(urls[0]),
        url: urls[0],
        group: pending.group,
        tvgId: pending.tvgId,
        sources: urls,
      });
      pending = { title: "", group: "", tvgId: "" };
    }
    return { kind: items.length ? "list" : "empty", items };
}

/**
 * @param {string} text
 * @param {string} baseUrl
 * @returns {{ kind: "list" | "empty", items: { title: string, url: string, group: string }[] }}
 */
function parseIptvTxt(text, baseUrl) {
  const items = [];
  let group = "";
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    if (/#genre#\s*$/i.test(trimmed)) {
      group = trimmed.replace(/,?[\s]*#genre#\s*$/i, "").trim();
      continue;
    }
    const idx = trimmed.indexOf(",");
    if (idx < 0) continue;
    const name = trimmed.slice(0, idx).trim();
    const urls = splitIptvSources(trimmed.slice(idx + 1), baseUrl);
    if (!urls.length) continue;
    items.push({ title: name || guessTitle(urls[0]), url: urls[0], group, sources: urls });
  }
  return { kind: items.length ? "list" : "empty", items };
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeChannelList(text) {
  const raw = String(text || "").replace(/^\uFEFF/, "");
  if (!raw || isBlockedPage(raw)) return false;
  if (isHlsManifest(raw)) return true;
  if (/#EXTM3U|#EXTINF:|#genre#/i.test(raw)) return true;
  let hits = 0;
  for (const line of raw.split(/\r?\n/)) {
    if (/^[^,#]+,\s*https?:\/\//i.test(line.trim())) {
      hits += 1;
      if (hits >= 2) return true;
    }
  }
  return false;
}

/**
 * @param {string} text
 * @param {string} baseUrl
 * @returns {{ kind: "hls" | "list" | "empty", items: { title: string, url: string, group: string }[] }}
 */
export function parseChannelList(text, baseUrl) {
  const raw = String(text || "").replace(/^\uFEFF/, "");
  if (isBlockedPage(raw)) return { kind: "empty", items: [] };
  if (isHlsManifest(raw)) return { kind: "hls", items: [] };
  const parsed = /#EXTM3U|#EXTINF:/i.test(raw) ? parseM3uBody(raw, baseUrl) : parseIptvTxt(raw, baseUrl);
  if (parsed.kind === "list") parsed.items = mergeChannels(parsed.items);
  return parsed;
}

export const isM3uListUrl = isChannelListUrl;
export const parseM3u = parseChannelList;
