(() => {
  "use strict";

  const bootstrap = globalThis.FormantHupuBootstrap;
  const lib = globalThis.FormantHupuNavLib;
  if (!bootstrap || !lib) return;

  const BAR_ID = "formant-hupu-nav";
  const DOCK_ID = "formant-hupu-nav-dock";
  const THREAD_PATH_RE = /^\/\d+(?:-\d+)?\.html/i;
  const STYLE = `
    :host { display: block; box-sizing: border-box; font-family: "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
    .box, .row, .btn, .k, .t, .hint { box-sizing: border-box; }
    .row { display: flex; gap: 8px; width: 100%; }
    .box.is-dock {
      display: flex; flex-direction: column; gap: 6px; width: 100%;
      padding: 8px; border: 1px solid #dde3ec; border-radius: 12px;
      background: rgba(255, 255, 255, 0.96); box-shadow: 0 8px 24px rgba(21, 26, 34, 0.1);
    }
    .btn {
      flex: 1 1 0; min-width: 0; min-height: 44px; display: flex; flex-direction: column;
      justify-content: center; gap: 2px; padding: 8px 12px; border: 1px solid #dde3ec;
      border-radius: 10px; background: #fff; color: #151a22; text-decoration: none;
      box-shadow: 0 1px 2px rgba(21, 26, 34, 0.04);
    }
    .btn:hover { border-color: #1f4b99; background: #e8eef9; }
    .btn.is-off { pointer-events: none; opacity: 0.45; box-shadow: none; }
    .k { color: #1f4b99; font-size: 11px; font-weight: 650; letter-spacing: 0.02em; }
    .t { overflow: hidden; color: #2b3340; font-size: 13px; font-weight: 550; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
    .btn.is-off .k, .btn.is-off .t { color: #98a2b3; }
    .hint { color: #667084; font-size: 11px; line-height: 1.4; }
  `;

  let enabled = true;
  let running = false;
  let listTimer = 0;
  /** @type {AbortController | null} */
  let resolveAbort = null;

  function isThread() {
    return THREAD_PATH_RE.test(location.pathname);
  }

  function isList() {
    return Boolean(lib.parseBoardPath(location.pathname) && document.querySelector("a.p-title"));
  }

  function removeHosts() {
    document.getElementById(BAR_ID)?.remove();
    document.getElementById(DOCK_ID)?.remove();
  }

  /**
   * @param {string} id
   * @param {boolean} dock
   */
  function ensureHost(id, dock) {
    let host = document.getElementById(id);
    if (host) return host;
    host = document.createElement("div");
    host.id = id;
    host.setAttribute("data-formant-hupu", "nav");
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    shadow.appendChild(style);
    const box = document.createElement("div");
    box.setAttribute("data-box", "1");
    box.className = dock ? "box is-dock" : "box";
    shadow.appendChild(box);
    return host;
  }

  /**
   * @param {HTMLElement} host
   * @param {{ prev: any, next: any, found: boolean, board: string }} state
   * @param {boolean} dock
   */
  function paint(host, state, dock) {
    const box = host.shadowRoot?.querySelector("[data-box]");
    if (!box) return;
    box.className = dock ? "box is-dock" : "box";
    box.replaceChildren();
    if (dock) {
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = state.found ? "按板块列表上下翻帖" : "当前帖不在最近列表里";
      box.appendChild(hint);
    }
    const row = document.createElement("div");
    row.className = "row";
    const nextItem = state.next;
    const nextIsBoard = Boolean(!state.found && nextItem?.url);
    for (const [key, item] of [
      ["prev", state.prev],
      ["next", nextItem],
    ]) {
      const node = item?.url ? document.createElement("a") : document.createElement("div");
      node.className = item?.url ? "btn" : "btn is-off";
      if (item?.url && node instanceof HTMLAnchorElement) {
        node.href = item.url;
        node.title = item.title || "";
      }
      const k = document.createElement("span");
      k.className = "k";
      k.textContent = key === "prev" ? "← 上一帖" : nextIsBoard ? "回板块 →" : "下一帖 →";
      const t = document.createElement("span");
      t.className = "t";
      t.textContent = item?.title || "没有了";
      node.append(k, t);
      row.appendChild(node);
    }
    box.appendChild(row);
  }

  function placeDock(host) {
    const col = document.querySelector("[class*='index_bbs-post-web-body-left-wrapper']");
    const rect = col?.getBoundingClientRect();
    host.style.position = "fixed";
    host.style.zIndex = "2147483000";
    host.style.bottom = "16px";
    if (rect && rect.width > 200) {
      host.style.left = `${Math.round(rect.left)}px`;
      host.style.width = `${Math.round(rect.width)}px`;
      host.style.right = "auto";
    } else {
      host.style.left = "24px";
      host.style.right = "24px";
      host.style.width = "auto";
    }
  }

  function mountBar() {
    const title = document.querySelector("[class*='index_bbs-post-web-main-title__']");
    if (!title || title.parentElement?.querySelector(`#${BAR_ID}`)) {
      return document.getElementById(BAR_ID);
    }
    const host = ensureHost(BAR_ID, false);
    host.style.cssText = "display:block;width:100%;max-width:100%;flex:0 0 auto;align-self:stretch;margin:8px 0 4px;";
    title.insertAdjacentElement("afterend", host);
    return host;
  }

  function mountDock() {
    let host = document.getElementById(DOCK_ID);
    if (!host) {
      host = ensureHost(DOCK_ID, true);
      document.documentElement.appendChild(host);
    }
    placeDock(host);
    return host;
  }

  async function resolveAndPaint() {
    if (!enabled || !isThread()) {
      removeHosts();
      return;
    }
    const tid = lib.tidFromHref(location.pathname);
    const board = lib.boardFromCrumbs(document);
    if (!tid || !board) return;
    resolveAbort?.abort();
    const ac = new AbortController();
    resolveAbort = ac;
    const pending = { prev: null, next: null, found: false, board };
    const bar = mountBar();
    const dock = mountDock();
    if (bar) paint(bar, pending, false);
    if (dock) paint(dock, pending, true);
    try {
      const state = await lib.resolveNeighbors(board, "", tid);
      if (ac.signal.aborted || !enabled) return;
      if (bar) paint(bar, state, false);
      if (dock) paint(dock, state, true);
    } catch (error) {
      console.warn("[formant] hupu nav unavailable", error);
    }
  }

  function scheduleListPersist() {
    if (!enabled || !isList()) return;
    window.clearTimeout(listTimer);
    listTimer = window.setTimeout(() => {
      void lib.persistVisibleList(document).catch(() => {});
    }, 200);
  }

  function onResize() {
    const dock = document.getElementById(DOCK_ID);
    if (dock) placeDock(dock);
  }

  function start() {
    if (running) return;
    running = true;
    window.addEventListener("resize", onResize);
    if (isThread()) void resolveAndPaint();
    if (isList()) scheduleListPersist();
  }

  function stop() {
    running = false;
    resolveAbort?.abort();
    window.clearTimeout(listTimer);
    window.removeEventListener("resize", onResize);
    removeHosts();
  }

  const observer = new MutationObserver(() => {
    if (!enabled) return;
    if (isList()) scheduleListPersist();
    if (isThread() && !document.getElementById(BAR_ID)) void resolveAndPaint();
    else if (isThread()) onResize();
  });

  /**
   * @param {{ enabled: boolean }} state
   */
  function sync(state) {
    enabled = Boolean(state.enabled);
    if (!enabled) {
      observer.disconnect();
      stop();
      return;
    }
    observer.observe(document.documentElement, { childList: true, subtree: true });
    start();
  }

  if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
  start();
  bootstrap.subscribe(sync);
  void bootstrap.ready.then(sync);
})();
