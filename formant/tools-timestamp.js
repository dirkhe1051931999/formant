import { $, $$, copyText, must, toast } from "./tools-dom.js";

const FILETIME_EPOCH_MS = 11644473600000n;

const ZONES = [
  [-12, "国际日期变更线西 (GMT-12)"],
  [-11, "中途岛 (GMT-11)"],
  [-10, "夏威夷 (GMT-10)"],
  [-9, "阿拉斯加 (GMT-9)"],
  [-8, "太平洋时间 (GMT-8)"],
  [-7, "山地时间 (GMT-7)"],
  [-6, "中部时间 (GMT-6)"],
  [-5, "东部时间 (GMT-5)"],
  [-4, "大西洋时间 (GMT-4)"],
  [-3, "巴西利亚 (GMT-3)"],
  [-2, "中大西洋 (GMT-2)"],
  [-1, "亚速尔群岛 (GMT-1)"],
  [0, "格林威治 (GMT)"],
  [1, "柏林 / 巴黎 (GMT+1)"],
  [2, "开罗 / 雅典 (GMT+2)"],
  [3, "莫斯科 (GMT+3)"],
  [4, "迪拜 (GMT+4)"],
  [5, "新德里 (GMT+5)"],
  [6, "达卡 (GMT+6)"],
  [7, "曼谷 (GMT+7)"],
  [8, "北京 / 新加坡 (GMT+8)"],
  [9, "东京 / 首尔 (GMT+9)"],
  [10, "悉尼 (GMT+10)"],
  [11, "马加丹 (GMT+11)"],
  [12, "奥克兰 (GMT+12)"],
];

/** @param {number} n @param {number} [len] */
const pad = (n, len = 2) => String(n).padStart(len, "0");

/**
 * @param {number} ms
 * @param {"local" | number} zone 本机时区或固定 GMT 偏移（小时）
 * @param {boolean} [withMs]
 */
export function formatDate(ms, zone, withMs = false) {
  if (!Number.isFinite(ms)) return "";
  let d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  let y, mo, da, h, mi, s, msec;
  if (zone === "local") {
    [y, mo, da, h, mi, s, msec] = [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()];
  } else {
    d = new Date(ms + zone * 3600000);
    [y, mo, da, h, mi, s, msec] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()];
  }
  const base = `${pad(y, 4)}-${pad(mo)}-${pad(da)} ${pad(h)}:${pad(mi)}:${pad(s)}`;
  return withMs ? `${base}.${pad(msec, 3)}` : base;
}

/**
 * 解析 `YYYY-MM-DD[ T]HH:mm:ss[.SSS]`（时间部分可省略）为毫秒时间戳。
 * @param {string} text
 * @param {"local" | number} zone
 * @returns {number} 解析失败返回 NaN
 */
export function parseDate(text, zone) {
  const m = String(text || "")
    .trim()
    .match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,3}))?)?)?$/);
  if (!m) return NaN;
  const [y, mo, da, h, mi, s, frac] = [m[1], m[2], m[3], m[4] || "0", m[5] || "0", m[6] || "0", (m[7] || "0").padEnd(3, "0")].map(Number);
  if (zone === "local") return new Date(y, mo - 1, da, h, mi, s, frac).getTime();
  return Date.UTC(y, mo - 1, da, h, mi, s, frac) - zone * 3600000;
}

/**
 * 时间戳字符串 -> 毫秒。unit: auto | s | ms
 * @param {string} text
 * @param {"auto" | "s" | "ms"} unit
 */
export function stampToMs(text, unit) {
  const raw = String(text || "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return NaN;
  const intLen = raw.replace(/^-/, "").split(".")[0].length;
  const asMs = unit === "ms" || (unit === "auto" && intLen >= 12);
  return asMs ? Math.round(Number(raw)) : Math.round(Number(raw) * 1000);
}

/** @param {string} text */
export function fileTimeToMs(text) {
  const raw = String(text || "").trim();
  if (!/^\d+$/.test(raw)) return NaN;
  return Number(BigInt(raw) / 10000n - FILETIME_EPOCH_MS);
}

/** @param {number} ms */
export function msToFileTime(ms) {
  return String((BigInt(Math.round(ms)) + FILETIME_EPOCH_MS) * 10000n);
}

/** @param {string} value */
function parseZone(value) {
  return value === "local" ? "local" : Number(value);
}

/** @param {HTMLElement} root */
export function mount(root) {
  const zoneOptions = ZONES.map(([h, label]) => `<option value="${h}">${label}</option>`).join("");
  root.innerHTML = `
    <header class="tl-head">
      <div>
        <h2>时间戳转换</h2>
      </div>
      <label class="tl-row">
        <span class="tl-meta">时区</span>
        <select class="tl-select" data-zone>
          <option value="local">本机时区</option>
          ${zoneOptions}
        </select>
      </label>
    </header>

    <section class="tl-card">
      <span class="tl-label">现在</span>
      <div class="tl-row">
        <span class="ts-clock" data-now-date></span>
        <button type="button" class="tl-btn tl-btn--ghost" data-toggle>暂停</button>
      </div>
      <div class="tl-row">
        <input class="tl-input ts-result" data-now-s readonly title="点击复制" />
        <span class="tl-meta">秒</span>
        <input class="tl-input ts-result" data-now-ms readonly title="点击复制" />
        <span class="tl-meta">毫秒</span>
      </div>
    </section>

    <section class="tl-card">
      <span class="tl-label">时间戳 → 日期</span>
      <div class="tl-row">
        <input class="tl-input tl-input--grow" data-s2d-in placeholder="如 1388307215 或 1388307215000" />
        <select class="tl-select" data-s2d-unit>
          <option value="auto">自动判断</option>
          <option value="s">秒 (s)</option>
          <option value="ms">毫秒 (ms)</option>
        </select>
        <button type="button" class="tl-btn" data-s2d-run>转换</button>
        <input class="tl-input ts-result" data-s2d-out readonly title="点击复制" />
      </div>
    </section>

    <section class="tl-card">
      <span class="tl-label">日期 → 时间戳</span>
      <div class="tl-row">
        <input class="tl-input tl-input--grow" data-d2s-in placeholder="如 2015-04-01 10:01:01.620" />
        <button type="button" class="tl-btn" data-d2s-run>转换</button>
        <input class="tl-input ts-result" data-d2s-out readonly title="点击复制" />
        <select class="tl-select" data-d2s-unit>
          <option value="s">秒 (s)</option>
          <option value="ms">毫秒 (ms)</option>
        </select>
      </div>
    </section>

    <section class="tl-card">
      <span class="tl-label">Windows FILETIME</span>
      <div class="tl-row">
        <input class="tl-input tl-input--grow" data-ft-in placeholder="如 133574880000000000" />
        <button type="button" class="tl-btn" data-ft-to-date>FILETIME → 日期</button>
        <button type="button" class="tl-btn tl-btn--ghost" data-ft-from-now>当前时间 → FILETIME</button>
      </div>
      <div class="tl-row">
        <input class="tl-input tl-input--grow ts-result" data-ft-out readonly title="点击复制" />
      </div>
    </section>

    <section class="tl-card">
      <span class="tl-label">世界时间</span>
      <table class="ts-table"><tbody data-world></tbody></table>
    </section>`;

  const zoneSel = /** @type {HTMLSelectElement} */ (must("[data-zone]", root));
  const nowDate = must("[data-now-date]", root);
  const nowS = /** @type {HTMLInputElement} */ (must("[data-now-s]", root));
  const nowMs = /** @type {HTMLInputElement} */ (must("[data-now-ms]", root));
  const toggleBtn = must("[data-toggle]", root);
  const world = must("[data-world]", root);
  const s2dIn = /** @type {HTMLInputElement} */ (must("[data-s2d-in]", root));
  const s2dUnit = /** @type {HTMLSelectElement} */ (must("[data-s2d-unit]", root));
  const s2dOut = /** @type {HTMLInputElement} */ (must("[data-s2d-out]", root));
  const d2sIn = /** @type {HTMLInputElement} */ (must("[data-d2s-in]", root));
  const d2sUnit = /** @type {HTMLSelectElement} */ (must("[data-d2s-unit]", root));
  const d2sOut = /** @type {HTMLInputElement} */ (must("[data-d2s-out]", root));
  const ftIn = /** @type {HTMLInputElement} */ (must("[data-ft-in]", root));
  const ftOut = /** @type {HTMLInputElement} */ (must("[data-ft-out]", root));

  const zone = () => parseZone(zoneSel.value);
  let running = true;

  function tick() {
    const now = Date.now();
    nowDate.textContent = formatDate(now, zone(), true);
    nowS.value = String(Math.floor(now / 1000));
    nowMs.value = String(now);
    const rows = [["本机时间", "local"], ["格林威治 (GMT)", 0], ...ZONES.map(([h, label]) => [label, h])];
    world.innerHTML = rows.map(([label, z]) => `<tr><th>${label}</th><td>${formatDate(now, /** @type {any} */ (z))}</td></tr>`).join("");
  }

  function stampToDate() {
    const ms = stampToMs(s2dIn.value, /** @type {any} */ (s2dUnit.value));
    if (Number.isNaN(ms)) {
      s2dOut.value = "";
      toast("请输入数字时间戳", true);
      return;
    }
    s2dOut.value = formatDate(ms, zone(), true) || "超出范围";
  }

  function dateToStamp() {
    const ms = parseDate(d2sIn.value, zone());
    if (Number.isNaN(ms)) {
      d2sOut.value = "";
      toast("日期格式应为 YYYY-MM-DD HH:mm:ss", true);
      return;
    }
    d2sOut.value = d2sUnit.value === "ms" ? String(ms) : String(Math.floor(ms / 1000));
  }

  toggleBtn.addEventListener("click", () => {
    running = !running;
    toggleBtn.textContent = running ? "暂停" : "继续";
  });
  zoneSel.addEventListener("change", () => {
    tick();
    if (s2dIn.value.trim()) stampToDate();
    if (d2sIn.value.trim()) dateToStamp();
  });
  must("[data-s2d-run]", root).addEventListener("click", stampToDate);
  must("[data-d2s-run]", root).addEventListener("click", dateToStamp);
  s2dIn.addEventListener("keydown", (e) => e.key === "Enter" && stampToDate());
  d2sIn.addEventListener("keydown", (e) => e.key === "Enter" && dateToStamp());
  d2sUnit.addEventListener("change", () => d2sIn.value.trim() && dateToStamp());

  must("[data-ft-to-date]", root).addEventListener("click", () => {
    const ms = fileTimeToMs(ftIn.value);
    if (Number.isNaN(ms)) {
      ftOut.value = "";
      toast("FILETIME 应为纯数字", true);
      return;
    }
    ftOut.value = formatDate(ms, zone(), true) || "超出范围";
  });
  must("[data-ft-from-now]", root).addEventListener("click", () => {
    const ft = msToFileTime(Date.now());
    ftIn.value = ft;
    ftOut.value = ft;
  });

  for (const el of $$(".ts-result", root)) {
    el.addEventListener("click", () => void copyText(/** @type {HTMLInputElement} */ (el).value));
  }

  tick();
  window.setInterval(() => {
    if (running && !document.hidden && $("[data-now-date]", root)) tick();
  }, 1000);
}
