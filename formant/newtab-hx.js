import { renderHolidayWidget } from "./newtab-widgets.js";
import { renderExchangeWidget } from "./newtab-exchange.js";

export const HX_FACE_KEY = "formantHxFace";

/**
 * @param {unknown} raw
 * @returns {"holidays" | "exchange"}
 */
export function normalizeHxFace(raw) {
  return raw === "exchange" ? "exchange" : "holidays";
}

export async function loadHxFace() {
  const data = await chrome.storage.local.get(HX_FACE_KEY);
  return normalizeHxFace(data[HX_FACE_KEY]);
}

/**
 * @param {"holidays" | "exchange"} face
 */
export async function saveHxFace(face) {
  await chrome.storage.local.set({ [HX_FACE_KEY]: normalizeHxFace(face) });
}

/**
 * @param {{
 *   holidays?: unknown,
 *   holidaysMeta?: { holidaysAt?: string },
 *   exchange?: unknown,
 *   exchangeMeta?: { exchangeAt?: string, onCommit?: (prefs: { count: number, codes: string[] }) => void, onClose?: () => void },
 *   face?: "holidays" | "exchange",
 * }} opts
 */
export function renderHolidayExchangeWidget(opts = {}) {
  const card = document.createElement("article");
  card.className = "widget widget--hx";
  card.dataset.widget = "hx";

  const holidayFace = renderHolidayWidget(opts.holidays || null, opts.holidaysMeta || {});
  const exchangeFace = renderExchangeWidget(opts.exchange || null, opts.exchangeMeta || {});

  const inner = document.createElement("div");
  inner.className = "hx-flip__inner";
  inner.append(holidayFace, exchangeFace);

  const flip = document.createElement("div");
  flip.className = "hx-flip";
  if (opts.face === "exchange") flip.classList.add("is-exchange", "is-instant");
  flip.append(inner);
  card.append(flip);
  activeFlip = flip;
  if (opts.face === "exchange") {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => flip.classList.remove("is-instant"));
    });
  }

  flip.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest(".widget-flip-btn")) return;
    const next = flip.classList.contains("is-exchange") ? "holidays" : "exchange";
    card.classList.add("is-flipping");
    flip.classList.toggle("is-exchange", next === "exchange");
    void saveHxFace(next);
  });
  inner.addEventListener("transitionend", (event) => {
    if (event.propertyName !== "transform") return;
    card.classList.remove("is-flipping");
  });
  return card;
}

/** @type {HTMLElement | null} */
let activeFlip = null;

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[HX_FACE_KEY] || !activeFlip?.isConnected) return;
  const exchange = changes[HX_FACE_KEY].newValue === "exchange";
  if (activeFlip.classList.contains("is-exchange") === exchange) return;
  activeFlip.classList.add("is-instant");
  activeFlip.classList.toggle("is-exchange", exchange);
  requestAnimationFrame(() => activeFlip?.classList.remove("is-instant"));
});
