import { initClampTooltips } from "./option-tooltip.js";
import { initFeaturesPanel } from "./option-features.js";
import { initImagePromptPanel } from "./option-image-prompt.js";
import { initGesturesPanel } from "./option-gestures.js";
import { initGitzipPanel } from "./option-gitzip.js";
import { initAutopagerizePanel } from "./option-autopagerize.js";
import { initExtensionsPanel } from "./option-extensions.js";
import { initLexiconPanel } from "./option-lexicon.js";
import { initNewtabPanel } from "./option-newtab.js";
import { initProxyPanel } from "./option-proxy.js";
import { initSyncPanel } from "./option-sync.js";
import { initKeysTransfer } from "./option-keys.js";
import { initClientKeyScope } from "./option-scope.js";
import { initTranslatePanel } from "./option-translate.js";
import { initXTranslatePanel } from "./option-x-translate.js";
import { initV2exPanel } from "./option-v2ex.js";

/** @type {Set<string>} */
const ENABLED_PANELS = new Set([
  "general",
  "features",
  "newtab",
  "v2ex",
  "gitzip",
  "autopagerize",
  "gestures",
  "proxy",
  "extensions",
  "lexicon",
  "translate",
  "x-translate",
  "image-prompt",
  "sync",
]);

/** @type {Record<string, string>} */
const PANEL_TITLES = {
  general: "扩展设置",
  features: "功能",
  newtab: "New Tab",
  v2ex: "V2EX",
  gitzip: "GitZip",
  autopagerize: "自动翻页",
  gestures: "手势",
  proxy: "代理",
  extensions: "扩展",
  lexicon: "词库",
  translate: "翻译",
  "x-translate": "X 推文",
  "image-prompt": "识图",
  sync: "同步",
};

const toastEl = document.getElementById("toast");
let toastTimer = 0;

/**
 * @param {string} text
 */
export function toast(text) {
  if (!toastEl) return;
  toastEl.hidden = false;
  toastEl.textContent = text;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.hidden = true;
  }, 2200);
}

/**
 * @param {string} raw
 */
function normalizePanelId(raw) {
  const id = String(raw || "")
    .replace(/^#/, "")
    .trim()
    .toLowerCase();
  if (ENABLED_PANELS.has(id)) return id;
  return "general";
}

/**
 * @param {string} panelId
 * @param {{ pushHash?: boolean }} [opts]
 */
function showPanel(panelId, opts = {}) {
  const usable = normalizePanelId(panelId);

  document.querySelectorAll(".shell-nav__item").forEach((btn) => {
    const active = btn.getAttribute("data-panel") === usable;
    btn.classList.toggle("is-active", active);
  });

  document.querySelectorAll(".panel").forEach((panel) => {
    const match = panel.getAttribute("data-panel") === usable;
    panel.classList.toggle("is-active", match);
    /** @type {HTMLElement} */ (panel).hidden = !match;
  });

  if (opts.pushHash !== false) {
    const next = `#${usable}`;
    if (location.hash !== next) {
      history.replaceState(null, "", next);
    }
  }

  document.title = `formant · ${PANEL_TITLES[usable] || "扩展设置"}`;
}

function bindShell() {
  const versionEl = document.getElementById("shellVersion");
  if (versionEl) {
    const version = chrome.runtime.getManifest()?.version || "";
    versionEl.textContent = version ? `v${version}` : "";
  }

  document.querySelector(".shell-nav")?.addEventListener("click", (event) => {
    const btn = /** @type {HTMLElement | null} */ (
      event.target instanceof Element ? event.target.closest("[data-panel]") : null
    );
    if (!btn || btn.hasAttribute("disabled")) return;
    const panel = btn.getAttribute("data-panel") || "general";
    showPanel(panel);
  });

  document.querySelectorAll("[data-go-panel]").forEach((el) => {
    el.addEventListener("click", () => {
      const panel = el.getAttribute("data-go-panel") || "general";
      showPanel(panel);
    });
  });

  window.addEventListener("hashchange", () => {
    showPanel(location.hash, { pushHash: false });
  });

  showPanel(location.hash || "general", { pushHash: true });
}

bindShell();
initClampTooltips();
initClientKeyScope();
initFeaturesPanel({ toast });
initNewtabPanel({ toast });
initV2exPanel({ toast });
initGitzipPanel({ toast });
initAutopagerizePanel({ toast });
initGesturesPanel({ toast });
initProxyPanel({ toast });
initExtensionsPanel({ toast });
initLexiconPanel({ toast });
initTranslatePanel({ toast });
initXTranslatePanel({ toast });
initImagePromptPanel({ toast });
initSyncPanel({ toast });
initKeysTransfer({ toast });
