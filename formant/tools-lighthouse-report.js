import { escapeHtml } from "./tools-dom.js";
import {
  CATEGORIES,
  formatWhen,
  getReport,
  lhHref,
  pagespeedLink,
  scoreTone,
} from "./tools-lighthouse-lib.js";

const METRIC_LABELS = {
  "first-contentful-paint": "FCP",
  "largest-contentful-paint": "LCP",
  "total-blocking-time": "TBT",
  "cumulative-layout-shift": "CLS",
  "speed-index": "Speed Index",
};

/**
 * @param {HTMLElement} root
 * @param {string} id
 */
export async function mountLighthouseReport(root, id) {
  const report = await getReport(id);
  if (!report) {
    root.innerHTML = `<p class="tl-note tl-note--error">找不到这份报告。<a href="${lhHref("list")}">返回列表</a></p>`;
    return;
  }

  const pills = CATEGORIES.map((item) => {
    const value = report.scores?.[item.id];
    const text = value == null ? "—" : String(value);
    return `<span class="lh-score lh-score--${scoreTone(value)}" title="${escapeHtml(item.label)}">${escapeHtml(item.label)} ${text}</span>`;
  }).join("");

  const metrics = Object.entries(METRIC_LABELS)
    .filter(([key]) => report.metrics?.[key])
    .map(([key, label]) => `<li><strong>${escapeHtml(label)}</strong> ${escapeHtml(report.metrics[key])}</li>`)
    .join("");

  const failed = (report.failed || [])
    .map(
      (item) => `<article class="lh-issue">
        <strong>${escapeHtml(item.title)}</strong>
        ${item.displayValue ? `<span class="tl-meta">${escapeHtml(item.displayValue)}</span>` : ""}
        <p>${escapeHtml(item.description || "")}</p>
      </article>`,
    )
    .join("");

  root.innerHTML = `
    <section class="tl-card">
      <div class="tl-row">
        <a class="tl-btn tl-btn--ghost" href="${pagespeedLink(report.url, { strategy: report.strategy, categories: report.categories })}" target="_blank" rel="noreferrer">PageSpeed 完整报告</a>
        <span class="tl-meta">${report.strategy === "desktop" ? "桌面" : "手机"} · ${escapeHtml(formatWhen(report.fetchedAt))}</span>
      </div>
      <p class="lh-url">${escapeHtml(report.finalUrl || report.url)}</p>
      ${report.webOnly ? `<p class="tl-note">这次只打开了网页版，列表里还没有 PSI 分数。</p>` : ""}
      <div class="lh-scores">${pills}</div>
    </section>
    <section class="tl-card">
      <span class="tl-label">核心指标</span>
      ${metrics ? `<ul class="lh-metrics">${metrics}</ul>` : `<p class="tl-note">这次没有性能指标。</p>`}
    </section>
    <section class="tl-card">
      <span class="tl-label">待改进</span>
      <div data-issues>${failed || `<p class="tl-note">没有列出明显问题。</p>`}</div>
    </section>
  `;

}
