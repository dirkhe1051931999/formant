/**
 * 中国历月历：阳历格子、农历（1900–2100）、节日、节气（北京时间），
 * 以及国务院放假区间。放假表与 mono HOLIDAY_SPANS 对齐，并合并本机假期缓存。
 */

/** 低 4 位闰月；bit4–15 为正月到腊月的大小（1=30 天）；bit16 为闰月大小。 */
const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, 0x04ae0, 0x0a5b6, 0x0a4d0,
  0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, 0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54,
  0x02b60, 0x09570, 0x052f2, 0x04970, 0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7,
  0x0c950, 0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, 0x06ca0, 0x0b550,
  0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, 0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570,
  0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, 0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540,
  0x0b6a0, 0x195a6, 0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, 0x04af5,
  0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0, 0x0c960, 0x0d954, 0x0d4a0, 0x0da50,
  0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, 0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0,
  0x15176, 0x052b0, 0x0a930, 0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, 0x0b5a0, 0x056d0, 0x055b2,
  0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, 0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6,
  0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, 0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0,
  0x055d4, 0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, 0x0b273, 0x06930,
  0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, 0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0,
  0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, 0x0d520,
];

const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const MONTH_NAMES = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];
const DAY_ONES = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

const SOLAR_FESTIVALS = {
  "01-01": "元旦",
  "03-08": "妇女节",
  "03-12": "植树节",
  "05-01": "劳动节",
  "05-04": "青年节",
  "06-01": "儿童节",
  "07-01": "建党节",
  "08-01": "建军节",
  "09-10": "教师节",
  "10-01": "国庆节",
};

const LUNAR_FESTIVALS = {
  "1-1": "春节",
  "1-15": "元宵节",
  "2-2": "龙抬头",
  "5-5": "端午节",
  "7-7": "七夕",
  "7-15": "中元节",
  "8-15": "中秋节",
  "9-9": "重阳节",
  "12-8": "腊八",
  "12-23": "北小年",
  "12-24": "南小年",
};

const TERM_NAMES = [
  "小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨", "立夏", "小满", "芒种", "夏至",
  "小暑", "大暑", "立秋", "处暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至",
];
const TERM_LONGITUDE = [285, 300, 315, 330, 345, 0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270];

/** 与 mono client-newtab HOLIDAY_SPANS 相同，含已过去的区间，方便翻月仍能标出放假。 */
const REST_SPANS = [
  { name: "国庆节", start: "2025-10-01", end: "2025-10-07" },
  { name: "元旦", start: "2026-01-01", end: "2026-01-01" },
  { name: "春节", start: "2026-02-15", end: "2026-02-23" },
  { name: "清明节", start: "2026-04-04", end: "2026-04-06" },
  { name: "劳动节", start: "2026-05-01", end: "2026-05-05" },
  { name: "端午节", start: "2026-06-19", end: "2026-06-21" },
  { name: "中秋节", start: "2026-09-25", end: "2026-09-27" },
  { name: "国庆节", start: "2026-10-01", end: "2026-10-07" },
  { name: "元旦", start: "2027-01-01", end: "2027-01-01" },
  { name: "春节", start: "2027-02-05", end: "2027-02-11" },
  { name: "清明节", start: "2027-04-03", end: "2027-04-05" },
  { name: "劳动节", start: "2027-05-01", end: "2027-05-05" },
  { name: "端午节", start: "2027-06-09", end: "2027-06-11" },
  { name: "中秋节", start: "2027-09-15", end: "2027-09-17" },
  { name: "国庆节", start: "2027-10-01", end: "2027-10-07" },
];

/** @type {Map<number, Map<string, string>>} */
const termCache = new Map();

function pad(n) {
  return String(n).padStart(2, "0");
}

export function ymd(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function lunarInfo(year) {
  return LUNAR_INFO[year - 1900] || 0;
}

function leapMonth(year) {
  return lunarInfo(year) & 0xf;
}

function leapDays(year) {
  if (!leapMonth(year)) return 0;
  return lunarInfo(year) & 0x10000 ? 30 : 29;
}

function monthDays(year, month) {
  return lunarInfo(year) & (0x10000 >> month) ? 30 : 29;
}

function yearDays(year) {
  let sum = 348;
  for (let bit = 0x8000; bit > 0x8; bit >>= 1) sum += lunarInfo(year) & bit ? 1 : 0;
  return sum + leapDays(year);
}

/**
 * @param {number} year
 * @param {number} month
 * @param {number} day
 * @returns {{ year: number, month: number, day: number, isLeap: boolean } | null}
 */
export function solarToLunar(year, month, day) {
  if (year < 1900 || year > 2100) return null;
  let offset = (Date.UTC(year, month - 1, day) - Date.UTC(1900, 0, 31)) / 86400000;
  if (offset < 0) return null;
  let lunarYear = 1900;
  let days = yearDays(lunarYear);
  while (lunarYear < 2100 && offset >= days) {
    offset -= days;
    lunarYear += 1;
    days = yearDays(lunarYear);
  }
  if (lunarYear > 2100) return null;
  const leap = leapMonth(lunarYear);
  let isLeap = false;
  let lunarMonth = 1;
  let size = 0;
  while (lunarMonth < 13 && offset > 0) {
    if (leap > 0 && lunarMonth === leap + 1 && !isLeap) {
      lunarMonth -= 1;
      isLeap = true;
      size = leapDays(lunarYear);
    } else {
      size = monthDays(lunarYear, lunarMonth);
    }
    if (isLeap && lunarMonth === leap + 1) isLeap = false;
    offset -= size;
    lunarMonth += 1;
  }
  if (offset === 0 && leap > 0 && lunarMonth === leap + 1) {
    if (isLeap) isLeap = false;
    else {
      isLeap = true;
      lunarMonth -= 1;
    }
  }
  if (offset < 0) {
    offset += size;
    lunarMonth -= 1;
  }
  if (lunarMonth < 1 || lunarMonth > 12) return null;
  return { year: lunarYear, month: lunarMonth, day: offset + 1, isLeap };
}

function yearGanzhi(lunarYear) {
  return STEMS[(lunarYear - 4) % 10] + BRANCHES[(lunarYear - 4) % 12];
}

function monthLabel(lunar) {
  return `${lunar.isLeap ? "闰" : ""}${MONTH_NAMES[lunar.month - 1]}月`;
}

function dayLabel(day) {
  if (day <= 10) return `初${DAY_ONES[day - 1]}`;
  if (day < 20) return `十${DAY_ONES[day - 11]}`;
  if (day === 20) return "二十";
  if (day < 30) return `廿${DAY_ONES[day - 21]}`;
  return "三十";
}

function festivalName(lunar) {
  if (!lunar || lunar.isLeap) return "";
  const named = LUNAR_FESTIVALS[`${lunar.month}-${lunar.day}`];
  if (named) return named;
  if (lunar.month === 12 && lunar.day === monthDays(lunar.year, 12)) return "除夕";
  return "";
}

function sunLongitude(ms) {
  const t = (ms / 86400000 + 2440587.5 - 2451545) / 36525;
  const mean = 357.52911 + 35999.05029 * t - 0.0001537 * t * t;
  const rad = (mean * Math.PI) / 180;
  const center =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(rad) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * rad) +
    0.000289 * Math.sin(3 * rad);
  const omega = 125.04 - 1934.136 * t;
  let lon = 280.46646 + 36000.76983 * t + 0.0003032 * t * t + center - 0.00569 - 0.00478 * Math.sin((omega * Math.PI) / 180);
  lon %= 360;
  return lon < 0 ? lon + 360 : lon;
}

function solarTermMap(year) {
  const cached = termCache.get(year);
  if (cached) return cached;
  /** @type {Map<string, string>} */
  const map = new Map();
  TERM_NAMES.forEach((name, index) => {
    const target = TERM_LONGITUDE[index];
    const approx = Date.UTC(year, 0, 5, 12) + index * 15.2 * 86400000;
    let lo = approx - 20 * 86400000;
    let hi = approx + 20 * 86400000;
    while (hi - lo > 30_000) {
      const mid = (lo + hi) / 2;
      let delta = sunLongitude(mid) - target;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      if (delta < 0) lo = mid;
      else hi = mid;
    }
    const china = new Date(hi + 8 * 3600_000);
    map.set(ymd(china.getUTCFullYear(), china.getUTCMonth() + 1, china.getUTCDate()), name);
  });
  termCache.set(year, map);
  return map;
}

/**
 * @param {unknown} holidays
 * @returns {{ name: string, start: string, end: string }[]}
 */
function collectSpans(holidays) {
  /** @type {Map<string, { name: string, start: string, end: string }>} */
  const map = new Map();
  for (const item of REST_SPANS) map.set(`${item.name}|${item.start}`, item);
  const upcoming = holidays && typeof holidays === "object" ? /** @type {{ upcoming?: unknown }} */ (holidays).upcoming : null;
  const list = Array.isArray(upcoming) ? upcoming : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = /** @type {{ name?: unknown, start?: unknown, end?: unknown }} */ (item);
    const name = String(row.name || "");
    const start = String(row.start || "");
    const end = String(row.end || "");
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
    map.set(`${name}|${start}`, { name, start, end });
  }
  return [...map.values()].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

function formatSpan(span, viewYear) {
  const piece = (iso) => (iso.slice(0, 4) === String(viewYear) ? iso.slice(5).replace("-", ".") : iso.replace(/-/g, "."));
  const start = piece(span.start);
  const end = piece(span.end);
  return `${span.name} ${start === end ? start : `${start}-${end}`}`;
}

function restText(spans, year, month) {
  const monthStart = ymd(year, month, 1);
  const monthEnd = ymd(year, month, new Date(year, month, 0).getDate());
  const hit = spans.filter((span) => span.start <= monthEnd && span.end >= monthStart);
  if (hit.length) return hit.map((span) => formatSpan(span, year)).join(" · ");
  const next = spans.find((span) => span.start > monthEnd);
  return next ? `下一个放假 ${formatSpan(next, year)}` : "";
}

/**
 * @param {number} year
 * @param {number} month
 * @param {unknown} holidays
 * @param {string} today
 */
export function buildMonth(year, month, holidays, today) {
  const spans = collectSpans(holidays);
  const terms = new Map();
  for (const y of [year - 1, year, year + 1]) {
    if (y >= 1900 && y <= 2100) {
      for (const [key, name] of solarTermMap(y)) terms.set(key, name);
    }
  }
  const first = new Date(year, month - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month - 1, 1 - lead);
  /** @type {import("./newtab-calendar.js").CalendarDay[][]} */
  const weeks = [];
  for (let row = 0; row < 6; row += 1) {
    /** @type {import("./newtab-calendar.js").CalendarDay[]} */
    const days = [];
    for (let col = 0; col < 7; col += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + row * 7 + col);
      const y = date.getFullYear();
      const m = date.getMonth() + 1;
      const d = date.getDate();
      const key = ymd(y, m, d);
      const lunar = solarToLunar(y, m, d);
      const solarFest = SOLAR_FESTIVALS[key.slice(5)] || "";
      const lunarFest = festivalName(lunar);
      const fest = lunarFest || solarFest;
      const term = terms.get(key) || "";
      const rest = spans.find((span) => key >= span.start && key <= span.end) || null;
      days.push({
        key,
        year: y,
        month: m,
        day: d,
        inMonth: y === year && m === month,
        lunar,
        sub: fest || term || (lunar ? (lunar.day === 1 ? monthLabel(lunar) : dayLabel(lunar.day)) : ""),
        mark: fest ? "fest" : term ? "term" : "",
        restName: rest?.name || "",
        isToday: key === today,
      });
    }
    weeks.push(days);
  }
  return {
    year,
    month,
    weeks,
    restText: restText(spans, year, month),
    canPrev: year > 1900 || month > 1,
    canNext: year < 2100 || month < 12,
  };
}

/**
 * @param {import("./newtab-calendar.js").CalendarDay} day
 */
export function dayLine(day) {
  if (!day?.lunar) return `${day.month}月${day.day}日`;
  const parts = [`${yearGanzhi(day.lunar.year)}年`, `${monthLabel(day.lunar)}${dayLabel(day.lunar.day)}`];
  if (day.mark === "fest" || day.mark === "term") {
    const name = day.sub;
    if (name && !parts[1].includes(name)) parts.push(name);
  }
  if (day.restName) {
    const named = day.mark === "fest" || (day.mark === "term" && day.restName.startsWith(day.sub));
    parts.push(named ? "放假" : `${day.restName}放假`);
  }
  return parts.join(" · ");
}

/**
 * @typedef {object} CalendarDay
 * @property {string} key
 * @property {number} year
 * @property {number} month
 * @property {number} day
 * @property {boolean} inMonth
 * @property {{ year: number, month: number, day: number, isLeap: boolean } | null} lunar
 * @property {string} sub
 * @property {"" | "fest" | "term"} mark
 * @property {string} restName
 * @property {boolean} isToday
 */
