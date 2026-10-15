(() => {
  "use strict";

  const bootstrap = globalThis.FormantGmailBootstrap;
  if (!bootstrap) return;

  const HOST_ID = "formant-gmail-email";
  const EMAIL_ATTR = "data-formant-gmail-email";
  const STYLE_ATTR = "data-formant-gmail-style";
  const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i;

  let enabled = false;
  let shown = "";
  /** @type {HTMLElement | null} */
  let host = null;
  /** @type {HTMLElement | null} */
  let field = null;
  /** @type {HTMLElement | null} */
  let gapEl = null;
  /** @type {number} */
  let timer = 0;
  /** @type {number} */
  let copiedTimer = 0;

  /**
   * @param {string} raw
   */
  function normalizeEmail(raw) {
    const text = String(raw || "").trim();
    if (!text) return "";
    if (EMAIL_RE.test(text) && text.length < 120 && !/\s/.test(text)) return text;
    const wrapped = text.match(/\(([^()\s]+@[^()\s]+)\)/);
    if (wrapped && EMAIL_RE.test(wrapped[1])) return wrapped[1];
    const match = text.match(EMAIL_RE);
    if (!match) return "";
    return match[0].length < 120 ? match[0] : "";
  }

  function readEmail() {
    const accounts = document.querySelectorAll(
      'a[href*="SignOutOptions"], [aria-label*="Google 账号"], [aria-label*="Google 帐户"], [aria-label*="Google Account"]',
    );
    for (const el of accounts) {
      if (!(el instanceof Element) || el.closest(`#${HOST_ID}`)) continue;
      const fromLabel = normalizeEmail(el.getAttribute("aria-label") || "");
      if (fromLabel) return fromLabel;
      const fromData = normalizeEmail(el.getAttribute("data-email") || "");
      if (fromData) return fromData;
    }
    return normalizeEmail(document.documentElement.getAttribute(EMAIL_ATTR) || "");
  }

  /**
   * @param {string} label
   */
  function isHelpLabel(label) {
    return /^(支持|帮助|Support|Help)$/i.test(label);
  }

  /**
   * @param {string} label
   */
  function isSettingsLabel(label) {
    return /^(设置|Settings)$/i.test(label);
  }

  /**
   * @param {Element} el
   */
  function inTopBar(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.height < 88 && rect.top >= 0 && rect.top < 120;
  }

  /**
   * @param {(label: string) => boolean} match
   */
  function findBarButton(match) {
    const nodes = document.querySelectorAll("[aria-label], [data-tooltip]");
    for (const el of nodes) {
      if (!(el instanceof Element) || el.closest(`#${HOST_ID}`)) continue;
      const label = (el.getAttribute("aria-label") || el.getAttribute("data-tooltip") || "").trim();
      if (!match(label) || !inTopBar(el)) continue;
      return el;
    }
    return null;
  }

  /**
   * @param {Element} el
   */
  function flexRow(el) {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const display = getComputedStyle(node).display;
      const rect = node.getBoundingClientRect();
      if ((display === "flex" || display === "inline-flex") && rect.width > 280 && rect.top < 120) {
        return node;
      }
      node = node.parentElement;
    }
    return el.parentElement;
  }

  /**
   * @param {Element} el
   * @param {Element} row
   */
  function rowItem(el, row) {
    let node = el;
    while (node.parentElement && node.parentElement !== row) node = node.parentElement;
    return node;
  }

  /**
   * @param {Element} beforeItem
   */
  function emptyGapBefore(beforeItem) {
    let node = beforeItem.previousElementSibling;
    while (node) {
      if (node.id === HOST_ID) return null;
      const rect = node.getBoundingClientRect();
      if (rect.width < 80 || rect.height < 8) {
        node = node.previousElementSibling;
        continue;
      }
      if (node.querySelector("a, button, input, textarea, select, img, svg, [role='button']")) return null;
      const text = (node.textContent || "").replace(/\s+/g, "");
      if (text) return null;
      return node;
    }
    return null;
  }

  function findPlace() {
    const anchor = findBarButton(isHelpLabel) || findBarButton(isSettingsLabel);
    if (!anchor) return null;
    const row = flexRow(anchor);
    if (!row) return null;
    const before = rowItem(anchor, row);
    if (!before || before === row) return null;
    return { before, gap: emptyGapBefore(before) };
  }

  /**
   * @param {HTMLElement} el
   */
  function rememberStyle(el) {
    if (el.getAttribute(STYLE_ATTR) != null) return;
    el.setAttribute(STYLE_ATTR, el.getAttribute("style") || "");
  }

  /**
   * @param {HTMLElement | null} el
   */
  function restoreStyle(el) {
    if (!el || el.getAttribute(STYLE_ATTR) == null) return;
    const prev = el.getAttribute(STYLE_ATTR) || "";
    if (prev) el.setAttribute("style", prev);
    else el.removeAttribute("style");
    el.removeAttribute(STYLE_ATTR);
  }

  function teardown() {
    host?.remove();
    host = null;
    field = null;
    restoreStyle(gapEl);
    gapEl = null;
    shown = "";
  }

  /**
   * @param {string} email
   */
  /**
   * @param {HTMLElement} node
   * @param {string} email
   */
  function showEmail(node, email) {
    node.dataset.email = email;
    node.textContent = email;
    node.title = "点击复制";
    node.style.minWidth = `${email.length + 2}ch`;
  }

  function ensureHost(email) {
    if (host && field) {
      if (field.dataset.email !== email) showEmail(field, email);
      return;
    }
    host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      span {
        display: inline-block;
        box-sizing: content-box;
        width: max-content;
        max-width: none;
        margin: 0;
        padding: 0 12px 0 2px;
        overflow: visible;
        white-space: nowrap;
        background: transparent;
        color: #1f4b99;
        -webkit-text-fill-color: #1f4b99;
        font: 600 14px/32px Arial, "Microsoft YaHei", sans-serif;
        cursor: text;
        user-select: text;
      }
      span.is-copied {
        color: #0d7a32;
        -webkit-text-fill-color: #0d7a32;
      }
    `;
    field = document.createElement("span");
    field.tabIndex = 0;
    showEmail(field, email);
    field.setAttribute("aria-label", "当前 Google 邮箱");
    const stop = (event) => event.stopPropagation();
    for (const type of ["mousedown", "mouseup", "click", "keydown", "keyup", "copy", "cut"]) {
      field.addEventListener(type, stop);
    }
    field.addEventListener("click", () => {
      selectEmail();
      copyEmail();
    });
    shadow.append(style, field);
  }

  function selectEmail() {
    if (!field) return;
    const range = document.createRange();
    range.selectNodeContents(field);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  /**
   * @param {string} email
   */
  function copyWithTextarea(email) {
    const area = document.createElement("textarea");
    area.value = email;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }

  function markCopied() {
    if (!field) return;
    field.classList.add("is-copied");
    field.title = "已复制";
    window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => {
      field?.classList.remove("is-copied");
      if (field) field.title = "点击复制";
    }, 1200);
  }

  function copyEmail() {
    if (!field) return;
    const email = field.dataset.email || "";
    if (!email) return;
    const textareaOk = copyWithTextarea(email);
    selectEmail();
    if (textareaOk) markCopied();
    const clipboard = navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") return;
    void clipboard.writeText(email).then(
      () => markCopied(),
      () => {},
    );
  }

  /**
   * @param {{ before: Element, gap: Element | null }} place
   * @param {string} email
   */
  function placeHost(place, email) {
    ensureHost(email);
    if (!host) return;
    host.style.boxSizing = "content-box";
    host.style.display = "flex";
    host.style.alignItems = "center";
    host.style.flex = "0 0 auto";
    host.style.width = "max-content";
    host.style.minWidth = "max-content";
    host.style.maxWidth = "none";
    host.style.overflow = "visible";
    host.style.margin = "0 8px 0 0";
    if (place.gap instanceof HTMLElement) {
      if (gapEl && gapEl !== place.gap) restoreStyle(gapEl);
      gapEl = place.gap;
      rememberStyle(gapEl);
      const display = getComputedStyle(gapEl).display;
      if (display !== "flex" && display !== "inline-flex") {
        gapEl.style.display = "flex";
        gapEl.style.alignItems = "center";
      }
      gapEl.style.overflow = "visible";
      gapEl.style.flexShrink = "0";
      gapEl.style.minWidth = "max-content";
      if (host.parentElement !== gapEl) gapEl.appendChild(host);
    } else {
      restoreStyle(gapEl);
      gapEl = null;
      if (host.nextElementSibling !== place.before || host.parentElement !== place.before.parentElement) {
        place.before.parentElement?.insertBefore(host, place.before);
      }
    }
    shown = email;
    window.requestAnimationFrame(unclip);
  }

  function unclip() {
    if (!host || !field) return;
    const edge = field.getBoundingClientRect().right;
    let node = host.parentElement;
    let depth = 0;
    while (node && node !== document.body && depth < 5) {
      const rect = node.getBoundingClientRect();
      if (rect.top > 140) break;
      const overflow = getComputedStyle(node).overflowX;
      const clips = overflow === "hidden" || overflow === "clip" || overflow === "auto";
      if (clips && rect.right + 1 < edge) {
        const extra = Math.ceil(edge - rect.right) + 8;
        node.style.overflow = "visible";
        node.style.flexShrink = "0";
        node.style.minWidth = `${Math.ceil(rect.width + extra)}px`;
      }
      node = node.parentElement;
      depth += 1;
    }
  }

  function render() {
    if (!enabled) {
      teardown();
      return;
    }
    const email = readEmail();
    if (!email) return;
    const place = findPlace();
    if (!place) return;
    const parked = Boolean(host && host.isConnected && shown === email);
    const inGap = place.gap && host?.parentElement === place.gap;
    const beforeHelp = !place.gap && host?.nextElementSibling === place.before;
    if (parked && (inGap || beforeHelp)) {
      unclip();
      return;
    }
    placeHost(place, email);
  }

  function schedule() {
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = 0;
      render();
    }, 200);
  }

  void bootstrap.ready.then(() => {
    enabled = bootstrap.getState().enabled;
    render();
  });

  bootstrap.subscribe((state) => {
    enabled = state.enabled;
    render();
  });

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label", "data-tooltip", "data-email", EMAIL_ATTR],
  });
  window.addEventListener("resize", schedule);
})();
