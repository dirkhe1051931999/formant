import { loadHlsSession, saveHlsSession } from "./session-store.js";
import { hlsPlayerPageUrl, rememberFeed } from "./sources-store.js";

/** @type {(() => void) | null} */
let dismissMenu = null;

function closePlayTargetMenu() {
  const dismiss = dismissMenu;
  dismissMenu = null;
  dismiss?.();
}

/**
 * @param {HTMLElement} anchor
 * @returns {Promise<"newtab" | "page" | "">}
 */
export async function choosePlayTarget(anchor) {
  const last = (await loadHlsSession()).target;
  closePlayTargetMenu();
  const menu = document.createElement("div");
  menu.className = "hls-target";
  menu.setAttribute("role", "menu");
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${Math.round(rect.left)}px`;
  menu.style.top = `${Math.round(rect.bottom + 6)}px`;
  const options = [
    ["newtab", "New Tab 卡片"],
    ["page", "播放页"],
  ];
  for (const [id, label] of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hls-target__item";
    btn.setAttribute("role", "menuitem");
    if (id === last) btn.classList.add("is-last");
    btn.textContent = id === last ? `${label}（上次）` : label;
    btn.addEventListener("click", () => finish(/** @type {"newtab" | "page"} */ (id)));
    menu.appendChild(btn);
  }
  document.body.appendChild(menu);
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  let left = rect.left;
  let top = rect.bottom + 6;
  if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6);
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  const onDoc = (event) => {
    if (event.target instanceof Node && menu.contains(event.target)) return;
    finish("");
  };
  const onKey = (event) => {
    if (event.key === "Escape") finish("");
  };
  document.addEventListener("mousedown", onDoc, true);
  document.addEventListener("keydown", onKey, true);

  /** @type {(value: "newtab" | "page" | "") => void} */
  let settle = () => {};
  const done = new Promise((resolve) => {
    settle = resolve;
  });
  let closed = false;

  /**
   * @param {"newtab" | "page" | ""} value
   */
  function finish(value) {
    if (closed) return;
    closed = true;
    if (dismissMenu === dismiss) dismissMenu = null;
    document.removeEventListener("mousedown", onDoc, true);
    document.removeEventListener("keydown", onKey, true);
    menu.remove();
    settle(value);
  }

  function dismiss() {
    finish("");
  }

  dismissMenu = dismiss;
  return done;
}

export async function focusOrOpenNewtab() {
  const page = chrome.runtime.getURL("newtab.html");
  const tabs = await chrome.tabs.query({});
  const hit = tabs.find((tab) => {
    const url = String(tab.url || tab.pendingUrl || "");
    return url === page || url.startsWith(`${page}#`) || url.startsWith(`${page}?`);
  });
  if (hit?.id) {
    await chrome.tabs.update(hit.id, { active: true });
    if (typeof hit.windowId === "number") await chrome.windows.update(hit.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: "chrome://newtab/" });
}

/**
 * @param {string} url
 * @param {"newtab" | "page"} target
 */
export async function playHlsFeed(url, target) {
  const href = String(url || "").trim();
  if (!/^https?:\/\//i.test(href)) return;
  void rememberFeed(href);
  if (target === "newtab") {
    await saveHlsSession({
      target: "newtab",
      pendingUrl: href,
      playId: Date.now(),
    });
    await focusOrOpenNewtab();
    return;
  }
  await saveHlsSession({ target: "page", pendingUrl: "", playId: Date.now() });
  await chrome.tabs.create({ url: hlsPlayerPageUrl(href) });
}
