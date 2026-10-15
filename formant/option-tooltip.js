const HOST_ID = "formantUiTooltip";
const GAP = 8;

let host = null;
let hideTimer = 0;

/**
 * Two-line clamp + hover tooltip (not native title).
 * Bind any `[data-tooltip-clamp]` whose text overflows.
 * @param {ParentNode} [root]
 */
export function initClampTooltips(root = document) {
  ensureHost();
  root.querySelectorAll("[data-tooltip-clamp]").forEach((node) => {
    if (node instanceof HTMLElement) bindTrigger(node);
  });
}

function ensureHost() {
  const existing = document.getElementById(HOST_ID);
  if (existing instanceof HTMLElement) {
    host = existing;
    return host;
  }
  host = document.createElement("div");
  host.id = HOST_ID;
  host.className = "ui-tooltip";
  host.setAttribute("role", "tooltip");
  host.hidden = true;
  document.body.appendChild(host);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });
  return host;
}

/**
 * @param {HTMLElement} trigger
 */
function bindTrigger(trigger) {
  if (trigger.dataset.tooltipBound === "1") return;
  trigger.dataset.tooltipBound = "1";
  trigger.addEventListener("mouseenter", () => show(trigger));
  trigger.addEventListener("mouseleave", hide);
}

/**
 * @param {HTMLElement} trigger
 */
function show(trigger) {
  if (!host || !isTruncated(trigger)) return;
  const text = trigger.textContent?.trim() || "";
  if (!text) return;
  window.clearTimeout(hideTimer);
  host.textContent = text;
  host.hidden = false;
  place(trigger);
}

function hide() {
  if (!host || host.hidden) return;
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => {
    if (!host) return;
    host.hidden = true;
    host.textContent = "";
  }, 0);
}

/**
 * @param {HTMLElement} el
 */
function isTruncated(el) {
  return el.scrollHeight > el.clientHeight + 1;
}

/**
 * @param {HTMLElement} trigger
 */
function place(trigger) {
  if (!host) return;
  const rect = trigger.getBoundingClientRect();
  const tip = host.getBoundingClientRect();
  let top = rect.bottom + GAP;
  let left = rect.left;
  if (top + tip.height > window.innerHeight - GAP) {
    top = rect.top - tip.height - GAP;
  }
  if (left + tip.width > window.innerWidth - GAP) {
    left = window.innerWidth - tip.width - GAP;
  }
  host.style.top = `${Math.max(GAP, Math.round(top))}px`;
  host.style.left = `${Math.max(GAP, Math.round(left))}px`;
}
