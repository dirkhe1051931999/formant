export const STORE_KEY = "formantLighthouse";
export const MAX_REPORTS = 20;

export const CATEGORIES = [
  { id: "performance", label: "性能" },
  { id: "accessibility", label: "无障碍" },
  { id: "best-practices", label: "最佳实践" },
  { id: "seo", label: "SEO" },
];

const METRIC_IDS = [
  "first-contentful-paint",
  "largest-contentful-paint",
  "total-blocking-time",
  "cumulative-layout-shift",
  "speed-index",
];

/**
 * @param {string} hash
 */
export function parseLhHash(hash) {
  const raw = decodeURIComponent(String(hash || "").replace(/^#/, ""));
  const parts = raw.split("/").filter(Boolean);
  if (parts[0] !== "lighthouse") return { view: "list", id: "" };
  if (parts[1] === "new") return { view: "new", id: "" };
  if (parts[1] === "view") return { view: "view", id: parts[2] || "" };
  return { view: "list", id: "" };
}

export function lhHref(view, id = "") {
  if (view === "list") return "#lighthouse";
  if (view === "view") return `#lighthouse/view/${encodeURIComponent(id)}`;
  return `#lighthouse/${view}`;
}

/** @returns {Promise<chrome.tabs.Tab | null>} */
export async function pickHttpTab() {
  try {
    const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
    const http = tabs
      .filter((t) => t.id && /^https?:/i.test(t.url || ""))
      .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    return http[0] || null;
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{ reports: object[] }>}
 */
export async function loadReports() {
  const data = await chrome.storage.local.get(STORE_KEY);
  const raw = data[STORE_KEY];
  const reports = raw && Array.isArray(raw.reports) ? raw.reports : [];
  return { reports };
}

/**
 * @param {object} report
 */
export async function saveReport(report) {
  const { reports } = await loadReports();
  const next = [report, ...reports.filter((item) => item.id !== report.id)].slice(0, MAX_REPORTS);
  await chrome.storage.local.set({ [STORE_KEY]: { version: 1, reports: next } });
  return next;
}

/**
 * @param {string} id
 */
export async function getReport(id) {
  const { reports } = await loadReports();
  return reports.find((item) => item.id === id) || null;
}

/**
 * @param {string} id
 */
export async function removeReport(id) {
  const { reports } = await loadReports();
  const next = reports.filter((item) => item.id !== id);
  await chrome.storage.local.set({ [STORE_KEY]: { version: 1, reports: next } });
  return next;
}

/**
 * @param {number | null | undefined} score
 */
export function score100(score) {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  return Math.round(score * 100);
}

/**
 * @param {number | null} value
 */
export function scoreTone(value) {
  if (value == null) return "mute";
  if (value >= 90) return "ok";
  if (value >= 50) return "mid";
  return "bad";
}

/**
 * @param {string} url
 */
export function assertPublicHttp(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("请填写有效的 http(s) 地址");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("只支持 http(s) 地址");
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost")) {
    throw new Error("PSI 不能测本机地址，请用 Chrome DevTools 的 Lighthouse 面板");
  }
  return parsed.toString();
}

/**
 * @param {string} url
 * @param {{ strategy?: string, categories?: string[] }} [opt]
 */
export async function runPsi(url, opt = {}) {
  const target = assertPublicHttp(url);
  const strategy = opt.strategy === "desktop" ? "desktop" : "mobile";
  const categories = (opt.categories || CATEGORIES.map((item) => item.id)).filter((id) =>
    CATEGORIES.some((item) => item.id === id),
  );
  if (!categories.length) throw new Error("请至少选一个类别");

  const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  api.searchParams.set("url", target);
  api.searchParams.set("strategy", strategy);
  api.searchParams.set("locale", "zh");
  for (const id of categories) api.searchParams.append("category", id);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  let res;
  try {
    res = await fetch(api.toString(), { credentials: "omit", signal: ctrl.signal });
  } catch (error) {
    if (error && /** @type {Error} */ (error).name === "AbortError") throw new Error("测评超时，请稍后重试");
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) {
    throw new Error("Google 免费 PSI 接口额度用完了（未带 API Key）。官方扩展也是打开网页版，不走这个接口。");
  }
  if (!res.ok) {
    let detail = "";
    try {
      const err = await res.json();
      detail = err?.error?.message || "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || `测评失败（${res.status}）`);
  }
  return summarizePsi(await res.json(), { url: target, strategy, categories });
}

/**
 * @param {any} raw
 * @param {{ url: string, strategy: string, categories: string[] }} ctx
 */
export function summarizePsi(raw, ctx) {
  const lh = raw && raw.lighthouseResult ? raw.lighthouseResult : {};
  const cats = lh.categories && typeof lh.categories === "object" ? lh.categories : {};
  /** @type {Record<string, number | null>} */
  const scores = {};
  for (const item of CATEGORIES) {
    const row = cats[item.id];
    scores[item.id] = row && typeof row.score === "number" ? score100(row.score) : null;
  }
  const audits = lh.audits && typeof lh.audits === "object" ? lh.audits : {};
  /** @type {Record<string, string>} */
  const metrics = {};
  for (const id of METRIC_IDS) {
    const row = audits[id];
    if (row && row.displayValue) metrics[id] = String(row.displayValue);
  }
  const failed = Object.values(audits)
    .filter((row) => row && typeof row === "object" && typeof row.score === "number" && row.score < 0.9)
    .filter((row) => row.scoreDisplayMode === "binary" || row.scoreDisplayMode === "numeric" || row.scoreDisplayMode === "metricSavings")
    .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
    .slice(0, 16)
    .map((row) => ({
      id: String(row.id || ""),
      title: String(row.title || ""),
      description: String(row.description || "").replace(/\[.*?\]\(.*?\)/g, "").trim(),
      displayValue: row.displayValue ? String(row.displayValue) : "",
      score: score100(row.score),
    }));

  return {
    id: newId(),
    url: ctx.url,
    finalUrl: String(lh.finalUrl || raw.id || ctx.url),
    strategy: ctx.strategy,
    categories: ctx.categories,
    fetchedAt: Date.now(),
    scores,
    metrics,
    failed,
  };
}

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `lh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {string} url
 */
/**
 * 与官方 Lighthouse 扩展相同：打开 pagespeed.web.dev，不打免费 API。
 * @param {string} url
 * @param {{ strategy?: string, categories?: string[] }} [opt]
 */
export function pagespeedLink(url, opt = {}) {
  const href = new URL("https://pagespeed.web.dev/analysis");
  href.searchParams.set("url", url);
  href.searchParams.set("form_factor", opt.strategy === "desktop" ? "desktop" : "mobile");
  const cats = opt.categories && opt.categories.length ? opt.categories : CATEGORIES.map((item) => item.id);
  for (const id of cats) href.searchParams.append("category", id);
  href.searchParams.set("hl", "zh-CN");
  return href.href;
}

/**
 * @param {number} ts
 */
export function formatWhen(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
