import { formatWeatherAge, widgetHead } from "./newtab-widgets.js";
import { EXCHANGE_CURRENCIES } from "./newtab-exchange-currencies.js";
import { searchExchangePlaces } from "./newtab-exchange-countries.js";

/** Local-only display prefs. Not synced to mono and not cleared with the Client API Key. */
export const EXCHANGE_PREFS_KEY = "formantExchange";

const DEFAULT_CODES = ["CNY", "HKD", "EUR"];
const FILL_CODES = ["CNY", "HKD", "EUR", "GBP", "JPY", "KRW", "AUD", "CAD", "SGD", "CHF", "TWD", "THB", "MOP", "NZD", "MYR", "VND"];
const NAME_BY_CODE = new Map(EXCHANGE_CURRENCIES.map((item) => [item.code, item.name]));

const GRIP_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="1.3" fill="currentColor"/><circle cx="15" cy="7" r="1.3" fill="currentColor"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="15" cy="12" r="1.3" fill="currentColor"/><circle cx="9" cy="17" r="1.3" fill="currentColor"/><circle cx="15" cy="17" r="1.3" fill="currentColor"/></svg>`;

const EDIT_BUTTON = `<button type="button" class="widget__refresh widget__edit" data-fx-edit title="编辑汇率" aria-label="编辑汇率" aria-pressed="false">
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M13.5 6.5l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>
</button>`;

/** @type {{ count: number, codes: string[] }} */
let prefsCache = normalizeExchangePrefs(null);
let editing = false;
let convertAmount = "1";
let convertCode = "USD";

export function isExchangeEditing() {
  return editing;
}

/**
 * @param {unknown} raw
 * @returns {{ count: number, codes: string[] }}
 */
export function normalizeExchangePrefs(raw) {
  const known = new Set(EXCHANGE_CURRENCIES.map((item) => item.code));
  const source = raw && typeof raw === "object" ? /** @type {{ count?: unknown, codes?: unknown }} */ (raw) : {};
  const incoming = Array.isArray(source.codes) ? source.codes : DEFAULT_CODES;
  /** @type {string[]} */
  const codes = [];
  for (const item of incoming) {
    const code = String(item || "").trim().toUpperCase();
    if (!known.has(code) || codes.includes(code)) continue;
    codes.push(code);
  }
  let count = Number(source.count);
  if (!Number.isInteger(count)) count = codes.length || DEFAULT_CODES.length;
  count = Math.min(5, Math.max(1, count));
  const next = codes.slice(0, count);
  while (next.length < count) {
    const extra =
      FILL_CODES.find((code) => !next.includes(code)) ||
      EXCHANGE_CURRENCIES.find((item) => !next.includes(item.code))?.code;
    if (!extra) break;
    next.push(extra);
  }
  return { count: next.length, codes: next };
}

export function getExchangePrefs() {
  return prefsCache;
}

/** Display codes plus CNY, so the card can convert into RMB even when CNY is not listed. */
export function exchangeFetchCodes(prefs = prefsCache) {
  const codes = prefs.codes.slice();
  if (!codes.includes("CNY")) codes.push("CNY");
  return codes;
}

export async function loadExchangePrefs() {
  const data = await chrome.storage.local.get(EXCHANGE_PREFS_KEY);
  prefsCache = normalizeExchangePrefs(data[EXCHANGE_PREFS_KEY]);
  return prefsCache;
}

/**
 * @param {{ count: number, codes: string[] }} prefs
 */
async function saveExchangePrefs(prefs) {
  prefsCache = normalizeExchangePrefs(prefs);
  await chrome.storage.local.set({ [EXCHANGE_PREFS_KEY]: prefsCache });
  return prefsCache;
}

/**
 * Cached rates already include every code the card wants to show.
 * @param {{ exchange?: { rates?: Array<{ target?: string }> } | null }} cache
 * @param {{ codes: string[] }} [prefs]
 */
export function exchangeCacheMatches(cache, prefs = prefsCache) {
  const rates = cache?.exchange?.rates;
  if (!Array.isArray(rates) || !prefs.codes.length) return false;
  const have = new Set(rates.map((row) => String(row?.target || "").toUpperCase()));
  const need = new Set(prefs.codes);
  need.add("CNY");
  return [...need].every((code) => have.has(code));
}

/**
 * @param {string[]} codes
 * @param {number} count
 */
function resizeCodes(codes, count) {
  const next = codes.slice(0, count);
  while (next.length < count) {
    const extra =
      FILL_CODES.find((code) => !next.includes(code)) ||
      EXCHANGE_CURRENCIES.find((item) => !next.includes(item.code))?.code;
    if (!extra) break;
    next.push(extra);
  }
  return next;
}

/**
 * @param {unknown} data
 * @param {{ codes: string[] }} prefs
 */
function rowsFor(data, prefs) {
  const byCode = new Map();
  const rates = data && typeof data === "object" ? /** @type {{ rates?: unknown[] }} */ (data).rates : [];
  if (Array.isArray(rates)) {
    for (const row of rates) {
      if (!row || typeof row !== "object") continue;
      const target = String(/** @type {{ target?: string }} */ (row).target || "").toUpperCase();
      const rate = Number(/** @type {{ rate?: number }} */ (row).rate);
      if (target) byCode.set(target, rate);
    }
  }
  return prefs.codes.map((code) => ({ code, rate: byCode.get(code) }));
}

function rateMap(data) {
  const map = new Map();
  const rates = data && typeof data === "object" ? /** @type {{ rates?: unknown[] }} */ (data).rates : [];
  if (!Array.isArray(rates)) return map;
  for (const row of rates) {
    if (!row || typeof row !== "object") continue;
    const target = String(/** @type {{ target?: string }} */ (row).target || "").toUpperCase();
    const rate = Number(/** @type {{ rate?: number }} */ (row).rate);
    if (target && Number.isFinite(rate) && rate > 0) map.set(target, rate);
  }
  return map;
}

/**
 * 1 USD buys `rate` units of that currency. RMB = amount / foreignPerUsd * cnyPerUsd.
 * @param {number} amount
 * @param {string} code
 * @param {Map<string, number>} rates
 */
function amountInCny(amount, code, rates) {
  if (!Number.isFinite(amount)) return null;
  if (code === "CNY") return amount;
  const cny = rates.get("CNY");
  const perUsd = code === "USD" ? 1 : rates.get(code);
  if (!Number.isFinite(cny) || !Number.isFinite(perUsd) || perUsd <= 0) return null;
  return (amount / perUsd) * cny;
}

function formatCny(value) {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

/**
 * @param {Map<string, number>} rates
 */
function buildConverter(rates) {
  const codes = ["USD"];
  for (const code of prefsCache.codes) {
    if (!codes.includes(code)) codes.push(code);
  }
  if (!codes.includes(convertCode)) convertCode = "USD";

  const row = document.createElement("div");
  row.className = "fx-convert";
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "any";
  input.inputMode = "decimal";
  input.value = convertAmount;
  input.setAttribute("aria-label", "金额");
  const select = document.createElement("select");
  select.setAttribute("aria-label", "币种");
  for (const code of codes) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = code;
    if (code === convertCode) option.selected = true;
    select.append(option);
  }
  const arrow = document.createElement("span");
  arrow.className = "fx-convert__arrow";
  arrow.textContent = "→";
  const out = document.createElement("strong");
  out.className = "fx-convert__out";
  const unit = document.createElement("span");
  unit.className = "fx-convert__unit";
  unit.textContent = "RMB";

  function paintOut() {
    const amount = Number(input.value);
    out.textContent = formatCny(amountInCny(amount, convertCode, rates));
  }
  input.addEventListener("input", () => {
    convertAmount = input.value;
    paintOut();
  });
  select.addEventListener("change", () => {
    convertCode = select.value;
    paintOut();
  });
  paintOut();
  row.append(input, select, arrow, out, unit);
  return row;
}

/**
 * @param {unknown} data
 * @param {{ exchangeAt?: string, onCommit?: (prefs: { count: number, codes: string[] }) => void, onClose?: () => void }} [meta]
 */
export function renderExchangeWidget(data, meta = {}) {
  const card = document.createElement("article");
  card.className = "widget widget--exchange";
  if (editing) card.classList.add("is-editing");
  card.dataset.widget = "exchange";
  card.dataset.fxCount = String(prefsCache.count);
  card.innerHTML = `${widgetHead("汇率", "exchange", EDIT_BUTTON)}<div class="fx-body"></div>`;
  const body = /** @type {HTMLElement} */ (card.querySelector(".fx-body"));
  const editBtn = /** @type {HTMLButtonElement} */ (card.querySelector("[data-fx-edit]"));
  if (editing) {
    editBtn.classList.add("is-active");
    editBtn.setAttribute("aria-pressed", "true");
  }
  editBtn.addEventListener("click", () => {
    editing = !editing;
    card.classList.toggle("is-editing", editing);
    if (!editing) {
      meta.onClose?.();
      return;
    }
    editBtn.classList.add("is-active");
    editBtn.setAttribute("aria-pressed", "true");
    paintBody();
  });
  paintBody();
  return card;

  function paintBody() {
    body.replaceChildren();
    if (editing) {
      body.append(buildEditor(prefsCache, meta.onCommit));
      return;
    }
    const prefs = prefsCache;
    card.dataset.fxCount = String(prefs.count);
    body.dataset.count = String(prefs.count);
    body.append(buildConverter(rateMap(data)));
    const base = document.createElement("div");
    base.className = "fx-base";
    base.textContent = "1 USD";
    const list = document.createElement("div");
    list.className = "fx-list";
    for (const row of rowsFor(data, prefs)) {
      const line = document.createElement("div");
      line.className = "fx-row";
      const label = document.createElement("span");
      label.textContent = row.code;
      const value = document.createElement("strong");
      value.textContent = Number.isFinite(row.rate) && row.rate > 0 ? row.rate.toFixed(2) : "—";
      line.append(label, value);
      list.append(line);
    }
    body.append(base, list);
    const exchangeAt = String(meta.exchangeAt || "");
    const ageMs = exchangeAt ? Date.now() - new Date(exchangeAt).getTime() : NaN;
    if (Number.isFinite(ageMs) && ageMs > 24 * 3600_000) {
      const age = document.createElement("div");
      age.className = "fx-age";
      age.textContent = formatWeatherAge(exchangeAt);
      body.append(age);
    }
  }
}

/**
 * @param {{ count: number, codes: string[] }} initial
 * @param {((prefs: { count: number, codes: string[] }) => void) | undefined} onCommit
 */
function buildEditor(initial, onCommit) {
  let current = normalizeExchangePrefs(initial);
  let dragFrom = -1;
  const root = document.createElement("div");
  root.className = "fx-edit";

  const sliderRow = document.createElement("div");
  sliderRow.className = "fx-slider";
  const sliderLabel = document.createElement("span");
  sliderLabel.textContent = "显示条数";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "1";
  slider.max = "5";
  slider.step = "1";
  slider.value = String(current.count);
  slider.setAttribute("aria-label", "显示条数");
  const sliderValue = document.createElement("strong");
  sliderValue.textContent = String(current.count);
  sliderRow.append(sliderLabel, slider, sliderValue);

  const list = document.createElement("div");
  list.className = "fx-sort";
  root.append(sliderRow, list);

  slider.addEventListener("input", () => {
    const count = Number(slider.value);
    current = normalizeExchangePrefs({ count, codes: resizeCodes(current.codes, count) });
    sliderValue.textContent = String(current.count);
    void saveExchangePrefs(current);
    paintRows();
  });
  slider.addEventListener("change", () => {
    onCommit?.(current);
  });

  paintRows();
  return root;

  function paintRows() {
    list.replaceChildren();
    const used = new Set(current.codes);
    current.codes.forEach((code, index) => {
      const row = document.createElement("div");
      row.className = "fx-sort-row";
      const grip = document.createElement("span");
      grip.className = "fx-grip";
      grip.draggable = true;
      grip.title = "拖拽排序";
      grip.setAttribute("role", "button");
      grip.setAttribute("aria-label", `拖拽排序 ${NAME_BY_CODE.get(code) || code}`);
      grip.innerHTML = GRIP_SVG;
      const picker = buildPicker(code, used, (nextCode) => {
        const codes = current.codes.slice();
        codes[index] = nextCode;
        current = normalizeExchangePrefs({ count: codes.length, codes });
        void saveExchangePrefs(current).then(() => onCommit?.(current));
        paintRows();
      });
      grip.addEventListener("dragstart", (event) => {
        dragFrom = index;
        row.classList.add("is-dragging");
        event.dataTransfer?.setData("text/plain", String(index));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      grip.addEventListener("dragend", () => {
        dragFrom = -1;
        row.classList.remove("is-dragging");
      });
      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        row.classList.add("is-over");
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      });
      row.addEventListener("dragleave", () => row.classList.remove("is-over"));
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        row.classList.remove("is-over");
        const from = dragFrom;
        dragFrom = -1;
        if (from < 0 || from === index) return;
        const codes = current.codes.slice();
        const [moved] = codes.splice(from, 1);
        codes.splice(index, 0, moved);
        current = normalizeExchangePrefs({ count: codes.length, codes });
        void saveExchangePrefs(current).then(() => onCommit?.(current));
        paintRows();
      });
      row.append(grip, picker);
      list.append(row);
    });
  }
}

function currencyLabel(code) {
  return `${code} ${NAME_BY_CODE.get(code) || code}`;
}

/**
 * @param {string} code
 * @param {Set<string>} used
 * @param {(nextCode: string) => void} onPick
 */
function buildPicker(code, used, onPick) {
  const blocked = new Set([...used].filter((item) => item !== code));
  let chosen = code;
  const wrap = document.createElement("div");
  wrap.className = "fx-pick";
  const input = document.createElement("input");
  input.className = "fx-pick__input";
  input.type = "text";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "搜索国家或货币";
  input.value = currencyLabel(code);
  input.setAttribute("aria-label", currencyLabel(code));
  const menu = document.createElement("div");
  menu.className = "fx-pick__menu";
  menu.hidden = true;
  wrap.append(input, menu);

  function renderMenu(query) {
    menu.replaceChildren();
    const hits = searchExchangePlaces(query, EXCHANGE_CURRENCIES, blocked);
    if (!hits.length) {
      const empty = document.createElement("div");
      empty.className = "fx-pick__empty";
      empty.textContent = "没有匹配的国家或货币";
      menu.append(empty);
      return;
    }
    for (const hit of hits) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "fx-pick__option";
      button.textContent = hit.country ? `${hit.country} · ${hit.code} ${hit.name}` : `${hit.code} ${hit.name}`;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        chosen = hit.code;
        input.value = currencyLabel(hit.code);
        menu.hidden = true;
        onPick(hit.code);
      });
      menu.append(button);
    }
  }

  input.addEventListener("focus", () => {
    input.select();
    menu.hidden = false;
    renderMenu("");
  });
  input.addEventListener("input", () => {
    menu.hidden = false;
    renderMenu(input.value);
  });
  input.addEventListener("blur", () => {
    menu.hidden = true;
    input.value = currencyLabel(chosen);
  });
  return wrap;
}
