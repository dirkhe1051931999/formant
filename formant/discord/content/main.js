(() => {
  "use strict";

  const bootstrap = globalThis.FormantDiscordBootstrap;
  const overlay = globalThis.FormantDiscordOverlay;
  if (!bootstrap || !overlay) return;

  /**
   * @typedef {{ source: string, text: string, status: "done" | "skip" | "fail", at: number }} Memory
   */

  /** @type {{ windowKey: string, pageIds: string[], cache: Map<string, Memory> }} */
  let session = { windowKey: "", pageIds: [], cache: new Map() };
  let enabled = false;
  let target = "auto";
  let gen = 0;
  let watchTimer = 0;
  let labelTimer = 0;
  let restoreSoon = 0;
  /** @type {MutationObserver | null} */
  let observer = null;

  /**
   * @param {Element} el
   */
  function plainText(el) {
    let out = "";
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.textContent || "";
        return;
      }
      if (!(node instanceof Element)) return;
      if (node.tagName === "IMG") {
        out += node.getAttribute("alt") || "";
        return;
      }
      if (node.hasAttribute("data-formant-discord-translate")) return;
      for (const child of node.childNodes) walk(child);
    };
    walk(el);
    return out.replace(/\s+/g, " ").trim();
  }

  function windowKey() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] !== "channels" || parts.length < 3) return "";
    if (parts[1] !== "@me" && !/^\d+$/.test(parts[1])) return "";
    if (!/^\d+$/.test(parts[2])) return "";
    return `${parts[1]}/${parts[2]}`;
  }

  function onChannels() {
    return location.pathname === "/channels" || location.pathname.startsWith("/channels/");
  }

  /**
   * @returns {HTMLElement[]}
   */
  function messageNodes() {
    const root = document.querySelector('[data-list-id="chat-messages"]');
    if (!root) return [];
    return [...root.querySelectorAll('[id^="message-content-"]')].filter((el) => el instanceof HTMLElement);
  }

  /**
   * @param {string[]} a
   * @param {string[]} b
   */
  function sameIds(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }

  /**
   * @param {string} win
   * @param {string[]} ids
   * @returns {"window" | "page" | "same"}
   */
  function classify(win, ids) {
    if (!session.windowKey || win !== session.windowKey) return "window";
    if (!sameIds(session.pageIds, ids)) return "page";
    return "same";
  }

  function resetSession(win, ids) {
    session = { windowKey: win, pageIds: ids.slice(), cache: new Map() };
    overlay.clearTranslations();
  }

  /**
   * @param {HTMLElement[]} nodes
   */
  function prepare(nodes) {
    /** @type {HTMLElement[]} */
    const todo = [];
    for (const el of nodes) {
      const source = plainText(el);
      if (!source) continue;
      const prev = session.cache.get(el.id);
      if (prev && prev.source === source && prev.status === "done") {
        overlay.show(el, prev.text);
        continue;
      }
      if (prev && prev.source === source && prev.status === "skip") {
        overlay.hide(el);
        continue;
      }
      todo.push(el);
    }
    return todo;
  }

  /**
   * @param {HTMLElement} el
   * @param {number} myGen
   */
  async function translateOne(el, myGen) {
    const source = plainText(el);
    if (!source) {
      session.cache.set(el.id, { source: "", text: "", status: "skip", at: Date.now() });
      return;
    }
    try {
      const result = await chrome.runtime.sendMessage({
        type: "FORMANT_DISCORD_TRANSLATE",
        q: source,
        target,
      });
      if (gen !== myGen || !enabled || !el.isConnected) return;
      if (!result?.ok) throw new Error(result?.error || "翻译失败");
      const text = String(result.text || "").trim();
      if (!text || text === source) {
        overlay.hide(el);
        session.cache.set(el.id, { source, text: "", status: "skip", at: Date.now() });
        return;
      }
      overlay.show(el, text);
      session.cache.set(el.id, { source, text, status: "done", at: Date.now() });
    } catch {
      if (gen !== myGen || !enabled) return;
      session.cache.set(el.id, { source, text: "", status: "fail", at: Date.now() });
    }
  }

  /**
   * @param {string} label
   */
  function flash(label) {
    window.clearTimeout(labelTimer);
    overlay.setLabel(label);
    labelTimer = window.setTimeout(() => {
      if (enabled) overlay.setLabel("翻译");
    }, 1600);
  }

  async function handleClick() {
    if (!enabled) return;
    const myGen = ++gen;
    const win = windowKey();
    const nodes = messageNodes();
    if (!win || !nodes.length) {
      overlay.setBusy(false);
      flash("没有聊天");
      return;
    }
    const ids = nodes.map((node) => node.id);
    const kind = classify(win, ids);
    if (kind === "window") resetSession(win, ids);
    else session.pageIds = ids.slice();

    const todo = prepare(nodes);
    const prefix = kind === "window" ? "新窗口" : kind === "page" ? "新页" : "当前页";
    if (!todo.length) {
      overlay.setBusy(false);
      const hasText = nodes.some((node) => plainText(node));
      flash(hasText ? "已翻译" : "没有文字");
      return;
    }

    overlay.setBusy(true);
    overlay.setLabel(`${prefix} 0/${todo.length}`);
    let failed = 0;
    try {
      for (let i = 0; i < todo.length; i += 1) {
        if (gen !== myGen || !enabled) return;
        await translateOne(todo[i], myGen);
        if (gen !== myGen || !enabled) return;
        if (session.cache.get(todo[i].id)?.status === "fail") failed += 1;
        overlay.setLabel(`${prefix} ${i + 1}/${todo.length}`);
      }
      if (gen !== myGen || !enabled) return;
      flash(failed ? `${prefix} 失败 ${failed}` : `${prefix} 完成`);
    } finally {
      if (gen === myGen) overlay.setBusy(false);
    }
  }

  function syncButton() {
    if (!enabled || !onChannels()) overlay.hideButton();
    else overlay.showButton();
  }

  function restoreCached() {
    if (!enabled || !session.windowKey || windowKey() !== session.windowKey) return;
    for (const el of messageNodes()) {
      const prev = session.cache.get(el.id);
      if (!prev) continue;
      const source = plainText(el);
      if (prev.status === "done" && source === prev.source) overlay.show(el, prev.text);
      else if (source !== prev.source) overlay.hide(el);
    }
  }

  function scheduleRestore() {
    window.clearTimeout(restoreSoon);
    restoreSoon = window.setTimeout(restoreCached, 80);
  }

  function start() {
    overlay.bindClick(() => {
      void handleClick();
    });
    syncButton();
    if (!observer) {
      observer = new MutationObserver(scheduleRestore);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    void globalThis.FormantDiscordInput?.start();
    if (watchTimer) return;
    watchTimer = window.setInterval(syncButton, 500);
  }

  function stop() {
    gen += 1;
    globalThis.FormantDiscordInput?.stop();
    window.clearInterval(watchTimer);
    watchTimer = 0;
    window.clearTimeout(labelTimer);
    labelTimer = 0;
    window.clearTimeout(restoreSoon);
    restoreSoon = 0;
    observer?.disconnect();
    observer = null;
    session = { windowKey: "", pageIds: [], cache: new Map() };
    overlay.clearTranslations();
    overlay.hideButton();
    overlay.setBusy(false);
    overlay.setLabel("翻译");
  }

  /**
   * @param {{ enabled: boolean, color: string, textSize: number, target: string }} state
   */
  function apply(state) {
    overlay.setStyle(state.color, state.textSize);
    const nextTarget = state.target || "auto";
    if (nextTarget !== target) {
      target = nextTarget;
      session.cache.clear();
      session.pageIds = [];
      overlay.clearTranslations();
    }
    const on = state.enabled === true;
    if (on === enabled) {
      syncButton();
      return;
    }
    enabled = on;
    if (enabled) start();
    else stop();
  }

  void bootstrap.ready.then(apply);
  bootstrap.subscribe(apply);
})();
