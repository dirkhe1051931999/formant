import { FEATURES_KEY, isTranslatePopupEnabled, loadFeatures } from "./features.js";
import { initPopupBookmarks } from "./popup-bookmarks.js";
import { initPopupExtensions } from "./popup-extensions.js";
import { createLastTranslateSession } from "./popup-last-translate.js";
import { initDetachedTranslatePanel, initPopoutButton, isDetachedTranslatePanel } from "./popup-panel.js";
import { initPopupProxy } from "./popup-proxy.js";
import { initPopupTools } from "./popup-tools.js";
import { initPopupSiteData } from "./popup-site-data.js";
import { copyText } from "./site-data.js";
import { guessSpeakLang, speakText } from "./speak.js";
import { translateSmart } from "./translate-api.js";
import { createPopupStudyCapture } from "./study-words.js";
import {
  loadTranslateMode,
  loadTranslateTarget,
  normalizeTranslateMode,
  normalizeTranslateTarget,
  resolveTranslateTarget,
  saveTranslateMode,
  saveTranslateTarget,
  TRANSLATE_MODE_LABELS,
} from "./translate-router.js";

const viewTranslate = document.getElementById("viewTranslate");
const viewBookmarks = document.getElementById("viewBookmarks");
const viewSiteData = document.getElementById("viewSiteData");
const viewExtensions = document.getElementById("viewExtensions");
const translateInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("translateInput"));
const speakInputBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("speakInputBtn"));
const clearInputBtn = document.getElementById("clearInputBtn");
const translateModeEl = document.getElementById("translateMode");
const routeHintEl = document.getElementById("routeHint");
const googleResult = document.getElementById("googleResult");
const gptResult = document.getElementById("gptResult");
const deeplxResult = document.getElementById("deeplxResult");
const googleCard = /** @type {HTMLElement | null} */ (document.querySelector('.tr-card[data-provider="google"]'));
const gptCard = /** @type {HTMLElement | null} */ (document.querySelector('.tr-card[data-provider="gpt"]'));
const deeplxCard = /** @type {HTMLElement | null} */ (document.querySelector('.tr-card[data-provider="deeplx"]'));
const deeplxBadge = /** @type {HTMLElement | null} */ (document.getElementById("deeplxBadge"));
const googleTarget = /** @type {HTMLSelectElement} */ (document.getElementById("googleTarget"));
const gptTarget = /** @type {HTMLSelectElement} */ (document.getElementById("gptTarget"));
const linkGoogle = /** @type {HTMLAnchorElement} */ (document.getElementById("linkGoogle"));
const linkWiki = /** @type {HTMLAnchorElement} */ (document.getElementById("linkWiki"));
const linkCambridge = /** @type {HTMLAnchorElement} */ (document.getElementById("linkCambridge"));
const translateOffBanner = document.getElementById("translateOffBanner");

/** @type {boolean} */
let popupTranslateEnabled = true;
let translateTimer = 0;
let translateSeq = 0;
/** @type {import("./translate-router.js").TranslateMode} */
let translateMode = "auto";

/** @type {(name: string) => void} */
let showView = () => {};

function focusTranslateInput() {
  if (viewTranslate?.hidden) return;
  translateInput.focus();
}

const appVersionEl = document.getElementById("appVersion");
if (appVersionEl) {
  const version = chrome.runtime.getManifest()?.version || "";
  appVersionEl.textContent = version ? `v${version}` : "";
}

/**
 * @param {boolean} enabled
 */
function setPopupTranslateEnabled(enabled) {
  popupTranslateEnabled = enabled;
  if (translateOffBanner) translateOffBanner.hidden = enabled;
  viewTranslate?.classList.toggle("is-translate-off", !enabled);
  translateInput.disabled = !enabled;
  if (translateModeEl) {
    translateModeEl.querySelectorAll("button").forEach((btn) => {
      /** @type {HTMLButtonElement} */ (btn).disabled = !enabled;
    });
  }
  googleTarget.disabled = !enabled;
  gptTarget.disabled = !enabled;
  if (!enabled) {
    googleResult.innerHTML = `<p class="tr-placeholder">弹窗翻译已关闭</p>`;
    gptResult.innerHTML = `<p class="tr-placeholder">弹窗翻译已关闭</p>`;
    if (deeplxResult) deeplxResult.innerHTML = `<p class="tr-placeholder">弹窗翻译已关闭</p>`;
  }
}

function openOptionsPage(hash = "") {
  const path = hash ? `option.html#${hash.replace(/^#/, "")}` : "option.html";
  void chrome.tabs.create({ url: chrome.runtime.getURL(path) });
}

function currentTarget() {
  return resolveTranslateTarget(
    googleTarget.value !== "auto"
      ? googleTarget.value
      : gptTarget.value !== "auto"
        ? gptTarget.value
        : "auto"
  );
}

const studyCapture = createPopupStudyCapture({ getQuery: () => translateInput.value.trim(), input: translateInput });
const lastSession = createLastTranslateSession({
  getQuery: () => translateInput.value.trim(),
  setQuery: (q) => {
    translateInput.value = q;
  },
  getMode: () => translateMode,
  getTarget: currentTarget,
  paint: (snap) => {
    setRouteHint(snap.routeHint || "");
    if (snap.google) paintResult(googleResult, "google", snap.google);
    if (snap.gpt) paintResult(gptResult, "gpt", snap.gpt);
    if (deeplxResult && snap.deeplx) paintResult(deeplxResult, "deeplx", snap.deeplx);
  },
});

function updateFooterLinks(q) {
  const query = q.trim();
  const encoded = encodeURIComponent(query || "formant");
  linkGoogle.href = `https://www.google.com/search?q=${encoded}`;
  linkWiki.href = `https://zh.wikipedia.org/w/index.php?search=${encoded}`;
  linkCambridge.href = `https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${encoded}`;
}

/**
 * @param {import("./translate-router.js").TranslateMode} mode
 */
function setModeUi(mode) {
  translateMode = normalizeTranslateMode(mode);
  translateModeEl?.querySelectorAll(".tr-mode__btn").forEach((btn) => {
    const active = btn.getAttribute("data-mode") === translateMode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
}

/**
 * @param {string} [summary]
 */
function setRouteHint(summary) {
  if (!routeHintEl) return;
  if (!summary) {
    routeHintEl.hidden = true;
    routeHintEl.textContent = "";
    return;
  }
  routeHintEl.hidden = false;
  routeHintEl.textContent = summary;
}

/**
 * @param {HTMLElement | null} card
 * @param {boolean} dimmed
 */
function setCardDimmed(card, dimmed) {
  card?.classList.toggle("is-dimmed", dimmed);
}

const SPEAK_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M4.5 9.5v5h3.2L12 18.8V5.2L7.7 9.5H4.5Z" fill="currentColor"/>
  <path d="M15.2 8.8a4.2 4.2 0 0 1 0 6.4M17.6 6.2a7.2 7.2 0 0 1 0 11.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
</svg>`;
const COPY_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <rect x="8.2" y="7.8" width="10.2" height="12.2" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.7"/>
  <path d="M6.2 16.2V5.8A1.6 1.6 0 0 1 7.8 4.2h8.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
</svg>`;

/**
 * @param {"google" | "gpt" | "deeplx"} provider
 */
function cardForProvider(provider) {
  if (provider === "gpt") return gptCard;
  if (provider === "deeplx") return deeplxCard;
  return googleCard;
}

/**
 * @param {HTMLElement} el
 * @param {"google" | "gpt" | "deeplx"} provider
 * @param {{ ok?: boolean, data?: { text?: string, phonetic?: string, target?: string, fallbackFrom?: string }, error?: string, skipped?: boolean } | null | undefined} result
 */
function paintResult(el, provider, result) {
  if (provider === "deeplx" && deeplxBadge) {
    deeplxBadge.hidden = !(result?.ok && result.data?.fallbackFrom === "google");
  }

  if (result?.skipped) {
    if (provider === "deeplx") {
      el.innerHTML = `<p class="tr-skipped">${escapeHtml(result.error || "已跳过")}</p>`;
      setCardDimmed(deeplxCard, true);
      return;
    }
    const forceMode = provider === "gpt" ? "gpt" : "google";
    const forceLabel = TRANSLATE_MODE_LABELS[forceMode];
    el.innerHTML = `<p class="tr-skipped">${escapeHtml(result.error || "已跳过")} <button type="button" class="tr-skipped__action" data-force-mode="${forceMode}">改用 ${forceLabel}</button></p>`;
    setCardDimmed(cardForProvider(provider), true);
    return;
  }
  setCardDimmed(cardForProvider(provider), false);
  if (!result?.ok) {
    el.innerHTML = `<div class="tr-error">${escapeHtml(result?.error || "翻译失败")}</div>`;
    return;
  }
  const text = String(result.data?.text || "").trim();
  const phoneticRaw = String(result.data?.phonetic || "").trim();
  const phonetic =
    phoneticRaw && phoneticRaw.length <= 80
      ? `<p class="tr-phonetic">/${escapeHtml(phoneticRaw)}/</p>`
      : "";
  const fallbackNote =
    provider === "deeplx" && result.data?.fallbackFrom === "google"
      ? `<p class="tr-fallback-note">Google 不可用，已用 DeepLX 备用</p>`
      : "";
  const speakLang = String(result.data?.target || "").trim() || guessSpeakLang(text);
  const actions = text
    ? `<div class="tr-result-actions">
        <button type="button" class="tr-copy-result" data-action="copy-result" title="复制" aria-label="复制">${COPY_ICON_SVG}</button>
        <button type="button" class="tr-speak-result" data-action="speak-result" data-speak-lang="${escapeHtml(speakLang)}" title="发音" aria-label="发音">${SPEAK_ICON_SVG}</button>
      </div>`
    : "";
  el.innerHTML = `${fallbackNote}${phonetic}<div class="tr-result-row"><p class="tr-text">${escapeHtml(text)}</p>${actions}</div>`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function syncInputActions() {
  const hasText = Boolean(translateInput.value.trim());
  if (speakInputBtn) speakInputBtn.hidden = !hasText;
  if (clearInputBtn) clearInputBtn.hidden = !translateInput.value;
}

async function runTranslate() {
  if (!popupTranslateEnabled) {
    syncInputActions();
    return;
  }
  const q = translateInput.value.trim();
  syncInputActions();
  updateFooterLinks(q);
  if (!q) {
    studyCapture.endSession();
    lastSession.persist();
    googleResult.innerHTML = `<p class="tr-placeholder">翻译结果将显示在这里</p>`;
    gptResult.innerHTML = `<p class="tr-placeholder">翻译结果将显示在这里</p>`;
    if (deeplxResult) deeplxResult.innerHTML = `<p class="tr-placeholder">Google 不可用时自动启用</p>`;
    if (deeplxBadge) deeplxBadge.hidden = true;
    setRouteHint("");
    setCardDimmed(googleCard, false);
    setCardDimmed(gptCard, false);
    setCardDimmed(deeplxCard, false);
    return;
  }

  const target = currentTarget();
  if (lastSession.reusable()) {
    lastSession.applyCached();
    studyCapture.noteResult(q, lastSession.snapshot());
    return;
  }

  lastSession.persist({ google: null, gpt: null, deeplx: null, routeHint: "" });
  const seq = ++translateSeq;
  googleResult.innerHTML = `<p class="tr-loading">翻译中…</p>`;
  gptResult.innerHTML = `<p class="tr-loading">翻译中…</p>`;
  if (deeplxResult) deeplxResult.innerHTML = `<p class="tr-loading">待机…</p>`;
  if (deeplxBadge) deeplxBadge.hidden = true;
  setCardDimmed(googleCard, false);
  setCardDimmed(gptCard, false);
  setCardDimmed(deeplxCard, false);

  try {
    await translateSmart(
      { q, source: "auto", target, mode: translateMode },
      {
        onRoute: (plan) => {
          if (seq !== translateSeq) return;
          setRouteHint(plan.summary);
          lastSession.persist({ routeHint: plan.summary });
          if (!plan.runGoogle) {
            googleResult.innerHTML = `<p class="tr-loading">跳过中…</p>`;
          }
          if (!plan.runGpt) {
            gptResult.innerHTML = `<p class="tr-loading">跳过中…</p>`;
          }
          if (plan.runDeeplx) {
            if (deeplxResult) deeplxResult.innerHTML = `<p class="tr-loading">翻译中…</p>`;
          } else if (plan.deeplxFallback) {
            if (deeplxResult) deeplxResult.innerHTML = `<p class="tr-loading">等待 Google…</p>`;
          } else if (deeplxResult) {
            deeplxResult.innerHTML = `<p class="tr-loading">跳过中…</p>`;
          }
        },
        onGoogle: (result) => {
          if (seq !== translateSeq) return;
          paintResult(googleResult, "google", result);
          lastSession.persist({ google: result });
        },
        onGpt: (result) => {
          if (seq !== translateSeq) return;
          paintResult(gptResult, "gpt", result);
          lastSession.persist({ gpt: result });
        },
        onDeeplx: (result) => {
          if (seq !== translateSeq || !deeplxResult) return;
          paintResult(deeplxResult, "deeplx", result);
          lastSession.persist({ deeplx: result });
        },
      },
    ).then((result) => {
      if (seq === translateSeq) studyCapture.noteResult(q, result);
    });
  } catch (error) {
    if (seq !== translateSeq) return;
    const msg = error instanceof Error ? error.message : String(error);
    googleResult.innerHTML = `<div class="tr-error">${escapeHtml(msg)}</div>`;
    gptResult.innerHTML = `<div class="tr-error">${escapeHtml(msg)}</div>`;
    if (deeplxResult) deeplxResult.innerHTML = `<div class="tr-error">${escapeHtml(msg)}</div>`;
  }
}

/**
 * @param {import("./translate-router.js").TranslateMode} mode
 */
async function applyTranslateMode(mode) {
  setModeUi(mode);
  await saveTranslateMode(translateMode);
  scheduleTranslate();
}

function scheduleTranslate() {
  window.clearTimeout(translateTimer);
  translateTimer = window.setTimeout(() => {
    void runTranslate();
  }, 220);
}

document.getElementById("openOptionsBtn")?.addEventListener("click", () => {
  openOptionsPage("sync");
});

initPopoutButton(
  /** @type {HTMLButtonElement | null} */ (document.getElementById("popoutTranslateBtn")),
  () => translateInput.value,
);

speakInputBtn?.addEventListener("click", () => {
  const q = translateInput.value.trim();
  if (!q) return;
  void speakText(q, guessSpeakLang(q), speakInputBtn);
});

clearInputBtn?.addEventListener("click", () => {
  translateInput.value = "";
  syncInputActions();
  void runTranslate();
  translateInput.focus();
});

translateModeEl?.addEventListener("click", (event) => {
  const btn = /** @type {HTMLElement | null} */ (
    event.target instanceof Element ? event.target.closest("[data-mode]") : null
  );
  if (!btn) return;
  const mode = normalizeTranslateMode(btn.getAttribute("data-mode"));
  void applyTranslateMode(mode);
});

/**
 * @param {Element} btn
 */
function flashCopyOk(btn) {
  btn.classList.add("is-ok");
  btn.setAttribute("title", "已复制");
  window.setTimeout(() => {
    btn.classList.remove("is-ok");
    btn.setAttribute("title", "复制");
  }, 900);
}

document.addEventListener("click", (event) => {
  const copyBtn = /** @type {HTMLElement | null} */ (
    event.target instanceof Element ? event.target.closest('[data-action="copy-result"]') : null
  );
  if (copyBtn) {
    event.preventDefault();
    const row = copyBtn.closest(".tr-result-row");
    const text = row?.querySelector(".tr-text")?.textContent?.trim() || "";
    if (!text) return;
    void copyText(text)
      .then(() => flashCopyOk(copyBtn))
      .catch((error) => console.warn("[formant] copy failed", error));
    return;
  }

  const speakBtn = /** @type {HTMLElement | null} */ (
    event.target instanceof Element ? event.target.closest('[data-action="speak-result"]') : null
  );
  if (speakBtn) {
    event.preventDefault();
    const row = speakBtn.closest(".tr-result-row");
    const text = row?.querySelector(".tr-text")?.textContent?.trim() || "";
    if (!text) return;
    const lang = speakBtn.getAttribute("data-speak-lang") || guessSpeakLang(text);
    void speakText(text, lang, speakBtn);
    return;
  }

  const btn = /** @type {HTMLElement | null} */ (
    event.target instanceof Element ? event.target.closest("[data-force-mode]") : null
  );
  if (!btn) return;
  event.preventDefault();
  const mode = normalizeTranslateMode(btn.getAttribute("data-force-mode"));
  void applyTranslateMode(mode);
});

translateInput.addEventListener("input", scheduleTranslate);
syncInputActions();
const modeReady = loadTranslateMode().then((mode) => {
  setModeUi(mode);
});
const targetReady = loadTranslateTarget().then((target) => {
  googleTarget.value = target;
  gptTarget.value = target;
});
if (isDetachedTranslatePanel()) {
  initDetachedTranslatePanel((draft) => {
    void Promise.all([modeReady, targetReady, lastSession.load()]).then(() => {
      const state = lastSession.restore(draft);
      syncInputActions();
      updateFooterLinks(translateInput.value);
      if (state === "fetch") void runTranslate();
      focusTranslateInput();
    });
  });
} else {
  void Promise.all([modeReady, targetReady]).then(async () => {
    const state = await lastSession.openFromToolbar();
    lastSession.watchTabSwitchToRestore();
    syncInputActions();
    updateFooterLinks(translateInput.value);
    if (state === "fetch") void runTranslate();
  });
}
googleTarget.addEventListener("change", () => {
  gptTarget.value = googleTarget.value;
  void saveTranslateTarget(normalizeTranslateTarget(googleTarget.value));
  scheduleTranslate();
});
gptTarget.addEventListener("change", () => {
  googleTarget.value = gptTarget.value;
  void saveTranslateTarget(normalizeTranslateTarget(gptTarget.value));
  scheduleTranslate();
});

updateFooterLinks("");

void loadFeatures().then((features) => {
  setPopupTranslateEnabled(isTranslatePopupEnabled(features));
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[FEATURES_KEY]) return;
  void loadFeatures().then((features) => {
    setPopupTranslateEnabled(isTranslatePopupEnabled(features));
  });
});

const bookmarksApi = initPopupBookmarks({
  showView: (name) => showView(name),
});

showView = (name) => {
  const isTranslate = name === "translate";
  const isBookmarks = name === "bookmarks";
  const isSiteData = name === "siteData";
  const isExtensions = name === "extensions";
  if (viewTranslate) viewTranslate.hidden = !isTranslate;
  if (viewBookmarks) viewBookmarks.hidden = !isBookmarks;
  if (viewSiteData) viewSiteData.hidden = !isSiteData;
  if (viewExtensions) viewExtensions.hidden = !isExtensions;
  if (isBookmarks) void bookmarksApi.loadBookmarks();
  if (isTranslate) focusTranslateInput();
};

initPopupTools();
initPopupSiteData({ showView: (name) => showView(name) });
initPopupExtensions({ showView: (name) => showView(name) });
initPopupProxy();
window.requestAnimationFrame(focusTranslateInput);
window.setTimeout(focusTranslateInput, 0);
