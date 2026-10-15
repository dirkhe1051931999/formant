import { weatherIconSvg } from "./weather-icons.js";

function weekdayLabel(dateStr) {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T00:00:00`);
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()] || dateStr.slice(5);
}

function formatMonthDay(dateStr) {
  const raw = String(dateStr || "");
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(5, 10) : "";
}

function formatRange(start, end) {
  const s = String(start || "").slice(5).replace("-", ".");
  const e = String(end || "").slice(5).replace("-", ".");
  return s === e ? s : `${s}-${e}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function holidayItems(data) {
  if (!data || typeof data !== "object") return [];
  const upcoming = Array.isArray(data.upcoming) ? data.upcoming : [];
  if (upcoming.length) return upcoming;
  return data.next ? [data.next] : [];
}

export function widgetHead(title, kind, toolsHtml = "") {
  return `<div class="widget__head">
    <h4 class="widget__title">${title}</h4>
    <div class="widget__tools">${toolsHtml}<button type="button" class="widget__refresh" data-widget="${kind}" title="刷新${title}" aria-label="刷新${title}">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 3V8M3 8H8M3 8L6 5.29168C7.59227 3.86656 9.69494 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.71683 21 4.13247 18.008 3.22302 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button></div>
  </div>`;
}

function formatWeatherAge(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 0) return "";
  if (mins < 1) return "刚刚更新";
  if (mins < 60) return `${mins} 分钟前更新`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前更新`;
  return `${Math.floor(hours / 24)} 天前更新`;
}

/**
 * @param {unknown} data
 * @param {{ weatherAt?: string, widgetsAt?: string }} [meta]
 */
export function renderWeatherWidget(data, meta = {}) {
  const card = document.createElement("article");
  card.className = "widget";
  card.dataset.widget = "weather";
  card.innerHTML = widgetHead("天气", "weather");
  if (!data || typeof data !== "object") {
    card.innerHTML += `<div class="widget-empty">暂无数据</div>`;
    return card;
  }
  const w = /** @type {Record<string, any>} */ (data);
  const weatherAt = String(meta.weatherAt || meta.widgetsAt || "");
  const ageText = formatWeatherAge(weatherAt) || (weatherAt ? "已缓存" : "");
  const ageHtml = ageText
    ? ` · <span class="weather-age" data-weather-age="${weatherAt.replace(/"/g, "")}">${ageText}</span>`
    : "";
  const today = (w.daily || [])[0];
  const todayIcon = weatherIconSvg(w.iconDay || today?.iconDay, w.text || today?.textDay || "");
  const days = (w.daily || []).slice(1, 7);
  card.innerHTML += `
    <div class="weather-main">
      <div class="weather-now">
        <div class="weather-temp-row">
          <span class="weather-temp">${w.temp || "--"}°</span>
          <span class="weather-now-icon" title="${w.text || ""}">${todayIcon}</span>
        </div>
        <div class="weather-meta">${w.city || ""} · ${w.text || ""}${ageHtml}</div>
      </div>
      <div class="weather-range">${w.tempMin || "--"}° / ${w.tempMax || "--"}°</div>
    </div>
    <div class="weather-days">
      ${days
        .map((day) => {
          const icon = weatherIconSvg(day.iconDay, day.textDay || "");
          return `<div class="weather-day">
            <div class="weather-day__date">${formatMonthDay(day.date)}</div>
            <div>${weekdayLabel(day.date)}</div>
            <div class="weather-day__icon" title="${day.textDay || ""}">${icon}</div>
            <strong>${day.tempMin}-${day.tempMax}</strong>
            <div>${day.textDay || ""}</div>
          </div>`;
        })
        .join("")}
    </div>`;
  return card;
}

/** Update only the relative age label without re-fetching. */
export function tickWeatherAgeLabels(root = document) {
  root.querySelectorAll("[data-weather-age]").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    el.textContent = formatWeatherAge(el.dataset.weatherAge || "");
  });
}

export { formatWeatherAge };

/**
 * @param {unknown} data
 * @param {{ holidaysAt?: string }} [meta]
 */
export function renderHolidayWidget(data, meta = {}) {
  const card = document.createElement("article");
  card.className = "widget widget--holiday";
  card.dataset.widget = "holidays";
  const items = holidayItems(data);
  const head = items[0] || null;
  // daysLeft 为距开始日的天数；0 且仍在 upcoming 里表示今天落在该假期区间内。
  const ongoing = Boolean(head && Number(head.daysLeft) === 0);
  const countdown = ongoing ? items[1] || null : head;
  // 假期内左边是下一个假期，右边是再往后的 3 个。
  // 非假日右边是最近的 3 个（含左边正在倒计时的那个）。
  const rest = (ongoing ? items.slice(2) : items.slice(0)).slice(0, 3);
  const now = new Date();
  const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
  const holidaysAt = String(meta.holidaysAt || "");
  const ageMs = holidaysAt ? Date.now() - new Date(holidaysAt).getTime() : NaN;
  // 倒计时相对“今天”计算；数据超过 24 小时才提示更新时间，避免噪音。
  const staleNote =
    Number.isFinite(ageMs) && ageMs > 24 * 3600_000
      ? ` · <span class="holiday-stale">${formatWeatherAge(holidaysAt)}</span>`
      : "";
  const todayLine = `今天 ${now.getMonth() + 1}月${now.getDate()}日 ${weekday}${staleNote}`;
  const primary = ongoing
    ? `<div class="holiday-now">当前是${escapeHtml(head.name)}</div>
        ${
          countdown
            ? `<div class="holiday-countdown">
                <div class="holiday-until">距${escapeHtml(countdown.name)}还有</div>
                <div class="days">${escapeHtml(countdown.daysLeft)}天</div>
                <div class="range">${formatRange(countdown.start, countdown.end)}</div>
              </div>`
            : `<div class="holiday-until">暂无后续假期</div>`
        }`
    : `<div>${countdown ? `${escapeHtml(countdown.name)}还有` : "暂无假期"}</div>
        <div class="days">${countdown ? `${escapeHtml(countdown.daysLeft)}天` : "--"}</div>
        <div class="range">${countdown ? formatRange(countdown.start, countdown.end) : ""}</div>`;
  const todayHtml = ongoing
    ? staleNote
      ? `<div class="holiday-today">${staleNote.replace(/^ · /, "")}</div>`
      : ""
    : `<div class="holiday-today">${todayLine}</div>`;
  card.innerHTML = `${widgetHead("下一个假期", "holidays")}
    <div class="holiday-layout${ongoing ? " is-ongoing" : ""}">
      <div class="holiday-next${ongoing ? " is-ongoing" : ""}">
        ${primary}
        ${todayHtml}
      </div>
      <div class="holiday-list">
        ${rest
          .map(
            (item) =>
              `<div><span>${escapeHtml(item.name)}<br>${formatRange(item.start, item.end)}</span><strong>${escapeHtml(item.daysLeft)}天</strong></div>`,
          )
          .join("")}
      </div>
    </div>`;
  return card;
}
