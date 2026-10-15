(() => {
  "use strict";

  if (globalThis.__FORMANT_SCREENSHOT__) return;
  globalThis.__FORMANT_SCREENSHOT__ = true;

  const HOST_ID = "formant-screenshot-host";
  const LOCK_CLASS = "formant-screenshot-lock";
  const MAX_WALK = 2500;

  /** @type {null | {
   *   el: Element,
   *   isWindow: boolean,
   *   originTop: number,
   *   originLeft: number,
   *   hidden: Array<{ el: HTMLElement, visibility: string }>,
   * }} */
  let session = null;
  let cancelled = false;
  /** @type {HTMLElement | null} */
  let host = null;
  /** @type {HTMLElement | null} */
  let statusEl = null;
  /** @type {HTMLStyleElement | null} */
  let lockStyle = null;

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function scrollingElement() {
    return document.scrollingElement || document.documentElement;
  }

  /**
   * Prefer the document scroller; otherwise the largest overflow box.
   * @returns {{ el: Element, isWindow: boolean }}
   */
  function findScroller() {
    const doc = scrollingElement();
    if (doc && doc.scrollHeight > doc.clientHeight + 8) {
      return { el: doc, isWindow: true };
    }

    let best = null;
    let bestOverflow = 0;
    const nodes = document.body ? document.body.querySelectorAll("*") : [];
    let n = 0;
    for (const el of nodes) {
      if (n++ > MAX_WALK) break;
      if (el.id === HOST_ID) continue;
      const style = getComputedStyle(el);
      if (style.overflowY !== "auto" && style.overflowY !== "scroll") continue;
      if (el.clientHeight < 200) continue;
      const overflow = el.scrollHeight - el.clientHeight;
      if (overflow > bestOverflow) {
        bestOverflow = overflow;
        best = el;
      }
    }
    if (best && bestOverflow > 8) return { el: best, isWindow: false };
    return { el: doc, isWindow: true };
  }

  function readScroll(el, isWindow) {
    if (isWindow) {
      return { top: window.scrollY, left: window.scrollX };
    }
    return { top: el.scrollTop, left: el.scrollLeft };
  }

  function writeScroll(el, isWindow, top, left) {
    if (isWindow) {
      window.scrollTo(left, top);
      return;
    }
    el.scrollTop = top;
    el.scrollLeft = left;
  }

  function cropOf(el, isWindow) {
    if (isWindow) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, rect.left),
      y: Math.max(0, rect.top),
      w: Math.min(rect.width, window.innerWidth),
      h: Math.min(rect.height, window.innerHeight),
    };
  }

  function ensureLockStyle() {
    if (lockStyle) return;
    lockStyle = document.createElement("style");
    lockStyle.id = "formant-screenshot-lock-style";
    lockStyle.textContent = `
      html.${LOCK_CLASS}, html.${LOCK_CLASS} body {
        scrollbar-width: none !important;
      }
      html.${LOCK_CLASS}::-webkit-scrollbar,
      html.${LOCK_CLASS} body::-webkit-scrollbar {
        display: none !important;
      }
    `;
    document.documentElement.append(lockStyle);
  }

  function ensureOverlay() {
    if (host && statusEl) return;
    host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.style.cssText = "position:fixed;width:0;height:0;overflow:visible;pointer-events:none;z-index:2147483646;";
    }
    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    shadow.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .card {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483646;
        min-width: 196px;
        max-width: min(280px, calc(100vw - 32px));
        padding: 12px 14px;
        border-radius: 10px;
        background: rgba(21, 26, 34, 0.9);
        color: #fff;
        font: 12px/1.45 "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        box-shadow: 0 8px 24px rgba(21, 26, 34, 0.28);
        pointer-events: auto;
      }
      .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .status { margin: 0; color: #fff; }
      .cancel {
        border: 0;
        background: transparent;
        color: #c9cdd4;
        cursor: pointer;
        font: 12px/1 "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      .cancel:hover { color: #fff; }
      .bar {
        margin-top: 8px;
        height: 4px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.18);
      }
      .bar > i {
        display: block;
        height: 100%;
        width: 0;
        background: #1f4b99;
      }
    `;
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML =
      '<div class="row"><p class="status">正在截屏…</p><button type="button" class="cancel">取消</button></div><div class="bar"><i></i></div>';
    shadow.append(style, card);
    statusEl = $(".p.status", shadow);
    const cancelBtn = $("button.cancel", shadow);
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        cancelled = true;
        if (statusEl) statusEl.textContent = "已取消";
      });
    }
    if (!host.isConnected) document.documentElement.append(host);
  }

  function setOverlayVisible(on) {
    if (!host) return;
    host.style.visibility = on ? "visible" : "hidden";
  }

  /**
   * @param {string} text
   * @param {number} [current]
   * @param {number} [total]
   */
  function paintProgress(text, current, total) {
    ensureOverlay();
    setOverlayVisible(true);
    if (statusEl) statusEl.textContent = text;
    const fill = host?.shadowRoot?.querySelector(".bar > i");
    if (fill instanceof HTMLElement && total) {
      fill.style.width = `${Math.max(0, Math.min(100, (current / total) * 100))}%`;
    }
  }

  function hideSticky() {
    if (!session) return;
    const hidden = [];
    const nodes = document.body ? document.body.querySelectorAll("*") : [];
    let n = 0;
    for (const node of nodes) {
      if (n++ > MAX_WALK) break;
      if (!(node instanceof HTMLElement)) continue;
      if (node.id === HOST_ID || node.closest(`#${HOST_ID}`)) continue;
      const pos = getComputedStyle(node).position;
      if (pos !== "fixed" && pos !== "sticky") continue;
      hidden.push({ el: node, visibility: node.style.visibility });
      node.style.setProperty("visibility", "hidden", "important");
    }
    session.hidden = hidden;
  }

  function restoreSticky() {
    if (!session) return;
    for (const item of session.hidden) {
      if (item.visibility) item.el.style.visibility = item.visibility;
      else item.el.style.removeProperty("visibility");
    }
    session.hidden = [];
  }

  function teardown() {
    if (session) {
      restoreSticky();
      writeScroll(session.el, session.isWindow, session.originTop, session.originLeft);
    }
    session = null;
    cancelled = false;
    document.documentElement.classList.remove(LOCK_CLASS);
    host?.remove();
    host = null;
    statusEl = null;
    lockStyle?.remove();
    lockStyle = null;
  }

  /**
   * @param {"full" | "visible"} mode
   */
  function prepare(mode) {
    teardown();
    cancelled = false;
    const found = findScroller();
    const origin = readScroll(found.el, found.isWindow);
    session = {
      el: found.el,
      isWindow: found.isWindow,
      originTop: origin.top,
      originLeft: origin.left,
      hidden: [],
    };
    ensureLockStyle();
    document.documentElement.classList.add(LOCK_CLASS);
    ensureOverlay();
    paintProgress(mode === "visible" ? "正在截取可见区域…" : "正在准备整页截屏…", 0, 1);

    const viewportHeight = found.isWindow ? window.innerHeight : found.el.clientHeight;
    const scrollHeight = found.isWindow
      ? Math.max(found.el.scrollHeight, document.documentElement.scrollHeight, document.body?.scrollHeight || 0)
      : found.el.scrollHeight;

    return {
      mode,
      title: document.title || "",
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      viewportHeight,
      scrollHeight,
      crop: cropOf(found.el, found.isWindow),
      isWindow: found.isWindow,
    };
  }

  /**
   * @param {number} top
   * @param {boolean} hideFixed
   */
  async function scrollToTop(top, hideFixed) {
    if (!session) throw new Error("截屏未开始");
    if (cancelled) return { cancelled: true, top: readScroll(session.el, session.isWindow).top };
    writeScroll(session.el, session.isWindow, top, session.originLeft);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await sleep(280);
    if (hideFixed && session.hidden.length === 0) hideSticky();
    const now = readScroll(session.el, session.isWindow);
    return { cancelled, top: now.top };
  }

  /**
   * Isolated-world dispatcher. Background talks to this via executeScript,
   * which is more reliable than tabs.sendMessage on pages that already have
   * several formant listeners.
   * @param {string} cmd
   * @param {Record<string, unknown> | null} payload
   */
  async function dispatch(cmd, payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    if (cmd === "ping") return { ok: true };
    if (cmd === "prepare") {
      return { ok: true, metrics: prepare(p.mode === "visible" ? "visible" : "full") };
    }
    if (cmd === "scroll") {
      const result = await scrollToTop(Number(p.top) || 0, Boolean(p.hideFixed));
      return { ok: true, ...result };
    }
    if (cmd === "overlay") {
      if (p.visible === false) setOverlayVisible(false);
      else paintProgress(String(p.text || "正在截屏…"), Number(p.current) || 0, Number(p.total) || 0);
      return { ok: true, cancelled };
    }
    if (cmd === "error") {
      paintProgress(String(p.text || "截屏失败"), 1, 1);
      return { ok: true };
    }
    if (cmd === "finish") {
      teardown();
      return { ok: true };
    }
    return { ok: false, error: "未知命令" };
  }

  globalThis.__formantScreenshot = dispatch;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== "object") return false;
    if (message.type !== "FORMANT_SCREENSHOT") return false;
    void dispatch(String(message.cmd || ""), message.payload || null)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      );
    return true;
  });
})();
