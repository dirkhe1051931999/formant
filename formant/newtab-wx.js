import { buildMonth, dayLine, ymd } from "./newtab-calendar.js";
import { renderWeatherWidget, widgetFlipButton } from "./newtab-widgets.js";

export const WX_FACE_KEY = "formantWxFace";

const PREV_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const NEXT_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * @param {unknown} raw
 * @returns {"weather" | "calendar"}
 */
export function normalizeWxFace(raw) {
  return raw === "calendar" ? "calendar" : "weather";
}

export async function loadWxFace() {
  const data = await chrome.storage.local.get(WX_FACE_KEY);
  return normalizeWxFace(data[WX_FACE_KEY]);
}

/**
 * @param {"weather" | "calendar"} face
 */
export async function saveWxFace(face) {
  await chrome.storage.local.set({ [WX_FACE_KEY]: normalizeWxFace(face) });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function todayParts() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return { year, month, key: ymd(year, month, day) };
}

const MONTH_DIALOG_MS = 220;

/** @type {{ year: number, month: number, key: string } | null} */
let cursor = null;
/** @type {(() => void) | null} */
let paintCalendar = null;
let monthDialogBound = false;
let pickerYear = 0;

function currentCursor() {
  if (!cursor) {
    const today = todayParts();
    cursor = { year: today.year, month: today.month, key: today.key };
  }
  return cursor;
}

/**
 * @param {number} delta
 */
function moveMonth(delta) {
  const cur = currentCursor();
  const next = new Date(cur.year, cur.month - 1 + delta, 1);
  const year = next.getFullYear();
  const month = next.getMonth() + 1;
  if (year < 1900 || year > 2100) return;
  const today = todayParts();
  cursor = {
    year,
    month,
    key: year === today.year && month === today.month ? today.key : ymd(year, month, 1),
  };
}

function jumpToday() {
  const today = todayParts();
  cursor = { year: today.year, month: today.month, key: today.key };
}

/**
 * @param {number} year
 * @param {number} month
 */
function jumpMonth(year, month) {
  if (year < 1900 || year > 2100) return;
  const today = todayParts();
  cursor = {
    year,
    month,
    key: year === today.year && month === today.month ? today.key : ymd(year, month, 1),
  };
}

/**
 * @param {string} key
 */
function pickDay(key) {
  const [year, month] = key.split("-").map(Number);
  if (!year || year < 1900 || year > 2100) return;
  cursor = { year, month, key };
}

/**
 * @param {unknown} holidays
 */
function monthMarkup(holidays) {
  const cur = currentCursor();
  const today = todayParts();
  const month = buildMonth(cur.year, cur.month, holidays, today.key);
  const selected = month.weeks.flat().find((day) => day.key === cur.key) || month.weeks.flat().find((day) => day.inMonth);
  const cells = month.weeks
    .map((week) =>
      week
        .map((day, index) => {
          const classes = ["cal-day"];
          if (!day.inMonth) classes.push("is-out");
          if (day.isToday) classes.push("is-today");
          if (selected && day.key === selected.key) classes.push("is-selected");
          if (day.restName) {
            classes.push("is-rest");
            const prev = index > 0 && week[index - 1].restName === day.restName;
            const next = index < week.length - 1 && week[index + 1].restName === day.restName;
            if (!prev && !next) classes.push("is-rest-only");
            else if (!prev) classes.push("is-rest-start");
            else if (!next) classes.push("is-rest-end");
          }
          if (day.mark) classes.push(`is-${day.mark}`);
          const label = escapeHtml(dayLine(day));
          return `<button type="button" class="${classes.join(" ")}" data-cal="day" data-date="${day.key}" aria-label="${label}" aria-pressed="${selected && day.key === selected.key ? "true" : "false"}"${day.isToday ? ' aria-current="date"' : ""}>
        <span class="cal-day__n">${day.day}</span>
        <span class="cal-day__sub">${escapeHtml(day.sub)}</span>
      </button>`;
        })
        .join(""),
    )
    .join("");
  return `<div class="cal-nav">
      <button type="button" class="cal-nav__btn" data-cal="prev" aria-label="上个月"${month.canPrev ? "" : " disabled"}>${PREV_ICON}</button>
      <button type="button" class="cal-nav__title" data-cal="pick" title="选择月份">${month.year}年${month.month}月</button>
      <button type="button" class="cal-nav__btn" data-cal="next" aria-label="下个月"${month.canNext ? "" : " disabled"}>${NEXT_ICON}</button>
    </div>
    <div class="cal-grid" role="group" aria-label="${month.year}年${month.month}月">
      ${["一", "二", "三", "四", "五", "六", "日"].map((name) => `<div class="cal-dow">${name}</div>`).join("")}
      ${cells}
    </div>`;
}

/**
 * @param {unknown} holidays
 */
function renderCalendarFace(holidays) {
  const face = document.createElement("div");
  face.className = "wx-flip__face wx-flip__face--calendar";
  face.innerHTML = `<div class="widget__head">
      <h4 class="widget__title">万年历</h4>
      <div class="widget__tools">${widgetFlipButton("切换到天气")}</div>
    </div>
    <div class="cal-body"></div>`;
  const body = face.querySelector(".cal-body");
  const paint = () => {
    if (body) body.innerHTML = monthMarkup(holidays);
  };
  paintCalendar = paint;
  paint();
  face.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-cal]") : null;
    if (!(target instanceof HTMLElement) || target.closest(".widget-flip-btn")) return;
    const action = target.dataset.cal;
    if (action === "prev") moveMonth(-1);
    else if (action === "next") moveMonth(1);
    else if (action === "pick") {
      openMonthDialog();
      return;
    } else if (action === "day" && target.dataset.date) pickDay(target.dataset.date);
    else return;
    paint();
  });
  return face;
}

function monthDialogEl() {
  return document.getElementById("calMonthDialog");
}

function closeMonthDialog() {
  const dialog = monthDialogEl();
  if (!(dialog instanceof HTMLDialogElement) || !dialog.open || dialog.classList.contains("is-closing")) return;
  dialog.classList.add("is-closing");
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    dialog.classList.remove("is-closing");
    dialog.close();
  };
  const onEnd = (event) => {
    if (event.target !== dialog) return;
    dialog.removeEventListener("transitionend", onEnd);
    finish();
  };
  dialog.addEventListener("transitionend", onEnd);
  window.setTimeout(finish, MONTH_DIALOG_MS);
}

function paintMonthPicker() {
  const dialog = monthDialogEl();
  if (!(dialog instanceof HTMLDialogElement)) return;
  const label = dialog.querySelector("[data-cal-year-label]");
  const grid = dialog.querySelector("[data-cal-months]");
  const prev = dialog.querySelector("[data-cal-year='prev']");
  const next = dialog.querySelector("[data-cal-year='next']");
  if (label) label.textContent = `${pickerYear}年`;
  if (prev instanceof HTMLButtonElement) prev.disabled = pickerYear <= 1900;
  if (next instanceof HTMLButtonElement) next.disabled = pickerYear >= 2100;
  const cur = currentCursor();
  const today = todayParts();
  if (!(grid instanceof HTMLElement)) return;
  grid.replaceChildren();
  for (let month = 1; month <= 12; month += 1) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cal-month-dialog__m";
    if (pickerYear === cur.year && month === cur.month) btn.classList.add("is-current");
    if (pickerYear === today.year && month === today.month) btn.classList.add("is-today");
    btn.dataset.calMonth = String(month);
    btn.textContent = `${month}月`;
    grid.append(btn);
  }
}

function ensureMonthDialog() {
  let dialog = monthDialogEl();
  if (!(dialog instanceof HTMLDialogElement)) {
    dialog = document.createElement("dialog");
    dialog.id = "calMonthDialog";
    dialog.className = "cal-month-dialog";
    dialog.setAttribute("aria-labelledby", "calMonthDialogTitle");
    dialog.innerHTML = `<header class="cal-month-dialog__head">
        <div class="cal-month-dialog__year">
          <button type="button" class="cal-nav__btn" data-cal-year="prev" aria-label="上一年">${PREV_ICON}</button>
          <h3 id="calMonthDialogTitle" data-cal-year-label></h3>
          <button type="button" class="cal-nav__btn" data-cal-year="next" aria-label="下一年">${NEXT_ICON}</button>
        </div>
        <button type="button" class="cal-month-dialog__today" data-cal-year="today">今天</button>
      </header>
      <div class="cal-month-dialog__grid" data-cal-months></div>`;
    document.body.appendChild(dialog);
  }
  if (monthDialogBound) return dialog;
  monthDialogBound = true;
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeMonthDialog();
  });
  dialog.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target === dialog) {
      closeMonthDialog();
      return;
    }
    const yearBtn = target.closest("[data-cal-year]");
    if (yearBtn instanceof HTMLElement) {
      const action = yearBtn.dataset.calYear;
      if (action === "prev") pickerYear = Math.max(1900, pickerYear - 1);
      else if (action === "next") pickerYear = Math.min(2100, pickerYear + 1);
      else if (action === "today") {
        jumpToday();
        closeMonthDialog();
        paintCalendar?.();
        return;
      }
      paintMonthPicker();
      return;
    }
    const monthBtn = target.closest("[data-cal-month]");
    if (!(monthBtn instanceof HTMLElement)) return;
    const month = Number(monthBtn.dataset.calMonth);
    if (month < 1 || month > 12) return;
    jumpMonth(pickerYear, month);
    closeMonthDialog();
    paintCalendar?.();
  });
  return dialog;
}

function openMonthDialog() {
  const dialog = ensureMonthDialog();
  pickerYear = currentCursor().year;
  paintMonthPicker();
  dialog.classList.remove("is-closing");
  if (!dialog.open) dialog.showModal();
}

/** @type {HTMLElement | null} */
let activeFlip = null;

/**
 * @param {{
 *   weather?: unknown,
 *   weatherMeta?: { weatherAt?: string, widgetsAt?: string },
 *   holidays?: unknown,
 *   face?: "weather" | "calendar",
 * }} opts
 */
export function renderWeatherCalendarWidget(opts = {}) {
  const card = document.createElement("article");
  card.className = "widget widget--wx";
  card.dataset.widget = "weather";

  const inner = document.createElement("div");
  inner.className = "wx-flip__inner";
  inner.append(
    renderWeatherWidget(opts.weather || null, opts.weatherMeta || {}),
    renderCalendarFace(opts.holidays || null),
  );

  const flip = document.createElement("div");
  flip.className = "wx-flip";
  if (opts.face === "calendar") flip.classList.add("is-calendar", "is-instant");
  flip.append(inner);
  card.append(flip);
  syncFaceAria(flip);
  activeFlip = flip;
  if (opts.face === "calendar") {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => flip.classList.remove("is-instant"));
    });
  }

  flip.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest(".widget-flip-btn")) return;
    const next = flip.classList.contains("is-calendar") ? "weather" : "calendar";
    card.classList.add("is-flipping");
    flip.classList.toggle("is-calendar", next === "calendar");
    syncFaceAria(flip);
    if (next === "weather") closeMonthDialog();
    void saveWxFace(next);
  });
  inner.addEventListener("transitionend", (event) => {
    if (event.propertyName !== "transform") return;
    card.classList.remove("is-flipping");
  });
  return card;
}

function syncFaceAria(flip) {
  const calendar = flip.classList.contains("is-calendar");
  flip.querySelector(".wx-flip__face--weather")?.setAttribute("aria-hidden", calendar ? "true" : "false");
  flip.querySelector(".wx-flip__face--calendar")?.setAttribute("aria-hidden", calendar ? "false" : "true");
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[WX_FACE_KEY] || !activeFlip?.isConnected) return;
  const calendar = changes[WX_FACE_KEY].newValue === "calendar";
  if (activeFlip.classList.contains("is-calendar") === calendar) return;
  activeFlip.classList.add("is-instant");
  activeFlip.classList.toggle("is-calendar", calendar);
  syncFaceAria(activeFlip);
  requestAnimationFrame(() => activeFlip?.classList.remove("is-instant"));
});
