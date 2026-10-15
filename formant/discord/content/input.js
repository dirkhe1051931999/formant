(() => {
  "use strict";

  const HOST_ATTR = "data-formant-discord-input-translate";
  const PREF_KEY = "formantDiscordInput";
  const EDITOR_SELECTOR = 'div[role="textbox"][data-slate-editor="true"]';
  const ICON =
    '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>';
  const ENGINES = [
    { id: "google", label: "Google", hint: "同 X 推文，直连" },
    { id: "gpt", label: "GPT", hint: "走 mono，消耗 Client Key" },
  ];

  /** @type {HTMLElement | null} */
  let host = null;
  /** @type {ShadowRoot | null} */
  let shadow = null;
  let timer = 0;
  let running = false;
  let busy = false;
  /** @type {"google" | "gpt"} */
  let engine = "google";
  let placed = "";

  /**
   * @returns {HTMLElement | null}
   */
  function findEditor() {
    const active = document.activeElement;
    const own = active instanceof Element ? active.closest(EDITOR_SELECTOR) : null;
    if (own instanceof HTMLElement && visible(own)) return own;
    const all = [...document.querySelectorAll(EDITOR_SELECTOR)].filter(
      (el) => el instanceof HTMLElement && visible(el),
    );
    return /** @type {HTMLElement | null} */ (all[all.length - 1] || null);
  }

  /**
   * @param {Element} el
   */
  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /**
   * @param {HTMLElement} editor
   */
  function readText(editor) {
    return String(editor.innerText || "")
      .replace(/[\u200B\uFEFF]/g, "")
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * @param {string} s
   */
  function norm(s) {
    return s.replace(/\s+/g, " ").trim();
  }

  /**
   * Replace the whole Slate input content through Slate's own paste handling.
   * Never mutate the DOM directly (execCommand insertText/delete): Slate's model
   * would desync and Backspace stops working.
   * @param {HTMLElement} editor
   * @param {string} text
   * @param {string} source text currently in the editor
   */
  async function replaceText(editor, text, source) {
    const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    editor.focus();
    document.execCommand("selectAll"); // selection only; Slate syncs it via selectionchange
    await wait(60);
    const data = new DataTransfer();
    data.setData("text/plain", text);
    editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    await wait(120);
    if (norm(readText(editor)) === norm(text)) return;
    if (norm(readText(editor)) !== norm(source)) throw new Error("写回输入框失败，请重试");
    // Untouched: ask Slate directly via a beforeinput paste.
    editor.focus();
    document.execCommand("selectAll");
    await wait(60);
    editor.dispatchEvent(
      new InputEvent("beforeinput", {
        inputType: "insertFromPaste",
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
      }),
    );
    await wait(120);
    if (norm(readText(editor)) !== norm(text)) throw new Error("无法写回输入框");
  }

  function css() {
    return `
      :host { all: initial; }
      * { box-sizing: border-box; font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
      [hidden] { display: none !important; }
      .wrap { position: relative; width: 32px; height: 32px; }
      .icon {
        width: 32px; height: 32px; padding: 0; margin: 0; border: 0; border-radius: 6px;
        background: transparent; color: var(--interactive-icon-default, var(--interactive-normal, #4e5058)); cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.1s, color 0.1s;
      }
      .icon svg { width: 24px; height: 24px; }
      .icon:hover, .icon[aria-expanded="true"] {
        background: var(--background-modifier-hover, rgba(78, 80, 88, 0.12));
        color: var(--interactive-icon-hover, var(--interactive-hover, #2e3338));
      }
      .icon:disabled { cursor: default; animation: pulse 1s ease-in-out infinite; }
      @keyframes pulse { 50% { opacity: 0.4; } }
      .menu {
        position: absolute; right: 0; bottom: 36px; border-radius: 8px;
        background: var(--background-floating, #fff); color: var(--text-normal, #1f2933);
        border: 1px solid var(--border-subtle, #e3e6ec);
        box-shadow: 0 8px 24px rgba(21, 26, 34, 0.22); font-size: 13px; line-height: 1.3;
      }
      .menu { min-width: 190px; padding: 6px; }
      .menu h4 { margin: 4px 8px 6px; font-size: 12px; font-weight: 500; color: var(--text-muted, #6b7280); }
      .item {
        display: flex; flex-direction: column; gap: 2px; width: 100%; margin: 0; padding: 7px 10px;
        border: 0; border-radius: 6px; background: transparent; color: inherit; text-align: left; cursor: pointer;
      }
      .item:hover { background: var(--background-modifier-hover, #eef3fb); }
      .item b { font-size: 13px; font-weight: 600; }
      .item.on b { color: var(--text-link, #1f4b99); }
      .item small { font-size: 11px; color: var(--text-muted, #6b7280); }
    `;
  }

  function ensureHost() {
    if (host?.isConnected) return host;
    host = document.createElement("div");
    host.setAttribute(HOST_ATTR, "");
    host.style.cssText = "position:fixed;z-index:2147483000;width:32px;height:32px;display:none;";
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = css();
    const wrap = document.createElement("div");
    wrap.className = "wrap";
    const icon = document.createElement("button");
    icon.type = "button";
    icon.className = "icon";
    icon.title = "翻译输入框为英文";
    icon.setAttribute("aria-expanded", "false");
    icon.innerHTML = ICON;
    icon.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      toggleMenu();
    });
    const menu = document.createElement("div");
    menu.className = "menu";
    menu.hidden = true;
    const title = document.createElement("h4");
    title.textContent = "翻译成英文";
    menu.append(title);
    for (const item of ENGINES) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "item";
      button.dataset.engine = item.id;
      button.innerHTML = `<b></b><small></small>`;
      button.querySelector("b").textContent = item.label;
      button.querySelector("small").textContent = item.hint;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void run(/** @type {"google" | "gpt"} */ (item.id));
      });
      menu.append(button);
    }
    wrap.append(icon, menu);
    shadow.append(style, wrap);
    // Keep focus in the Discord editor while clicking our UI.
    shadow.addEventListener("mousedown", (event) => event.preventDefault());
    (document.body || document.documentElement).append(host);
    paintEngine();
    return host;
  }

  function paintEngine() {
    shadow?.querySelectorAll(".item").forEach((el) => {
      el.classList.toggle("on", el instanceof HTMLElement && el.dataset.engine === engine);
    });
  }

  function menuEl() {
    return /** @type {HTMLElement | null} */ (shadow?.querySelector(".menu") || null);
  }

  function iconEl() {
    return /** @type {HTMLButtonElement | null} */ (shadow?.querySelector(".icon") || null);
  }

  /**
   * @param {boolean} open
   */
  function setMenu(open) {
    const menu = menuEl();
    if (!menu) return;
    menu.hidden = !open;
    iconEl()?.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) globalThis.FormantDiscordInputStrip?.hide();
  }

  /**
   * The translation is already in the input; the original is docked above it with an undo.
   * @type {{ source: string, text: string, engine: "google" | "gpt" } | null}
   */
  let pending = null;

  function closeStrip() {
    pending = null;
    globalThis.FormantDiscordInputStrip?.hide();
  }

  async function undo() {
    if (busy || !pending) return;
    const state = pending;
    const editor = findEditor();
    if (!editor || norm(readText(editor)) !== norm(state.text)) {
      toast("输入已变化，无法撤回", true);
      closeStrip();
      return;
    }
    setBusy(true);
    try {
      await replaceText(editor, state.source, state.text);
      if (!running) return;
      closeStrip();
      toast("已撤回");
    } catch (error) {
      if (running) toast(error instanceof Error ? error.message : String(error), true);
    } finally {
      setBusy(false);
    }
  }
  function toggleMenu() {
    const menu = menuEl();
    setMenu(Boolean(menu?.hidden));
  }

  /**
   * Status goes into the strip docked above the input (error stays red until ×).
   * @param {string} text
   * @param {boolean} [isError]
   */
  function toast(text, isError = false) {
    globalThis.FormantDiscordInputStrip?.status(text, isError ? "error" : "info");
    place();
  }

  /**
   * @param {boolean} on
   */
  function setBusy(on) {
    busy = on;
    const icon = iconEl();
    if (icon) icon.disabled = on;
    globalThis.FormantDiscordInputStrip?.setBusy(on);
  }

  /**
   * @param {"google" | "gpt"} next
   */
  async function run(next) {
    if (busy) return;
    engine = next;
    paintEngine();
    setMenu(false);
    closeStrip();
    void chrome.storage.local.set({ [PREF_KEY]: { engine } }).catch(() => {});
    const editor = findEditor();
    const source = editor ? readText(editor) : "";
    if (!editor || !source) {
      toast("输入框是空的", true);
      return;
    }
    setBusy(true);
    globalThis.FormantDiscordInputStrip?.status(`正在用 ${engine === "gpt" ? "GPT" : "Google"} 翻译…`, "loading");
    place();
    try {
      const result = await chrome.runtime.sendMessage({
        type: "FORMANT_DISCORD_INPUT_TRANSLATE",
        q: source,
        engine,
      });
      if (!running) return;
      if (!result?.ok) throw new Error(result?.error || "翻译失败");
      const text = String(result.text || "").trim();
      if (!text) throw new Error("翻译结果为空");
      if (!editor.isConnected || readText(editor) !== source) {
        toast("输入已变化，已放弃替换", true);
        return;
      }
      await replaceText(editor, text, source);
      if (!running) return;
      pending = { source, text, engine };
      globalThis.FormantDiscordInputStrip?.show(source, `原文 · ${engine === "gpt" ? "GPT" : "Google"}`, {
        onUndo: () => void undo(),
        onClose: closeStrip,
      });
      place();
    } catch (error) {
      if (running) toast(error instanceof Error ? error.message : String(error), true);
    } finally {
      setBusy(false);
    }
  }

  function place() {
    if (!running) return;
    const onChannels = location.pathname === "/channels" || location.pathname.startsWith("/channels/");
    const editor = onChannels ? findEditor() : null;
    if (!editor) {
      if (host) host.style.display = "none";
      setMenu(false);
      closeStrip();
      return;
    }
    // User edited / sent / switched channel: the strip is stale.
    if (pending && !busy && norm(readText(editor)) !== norm(pending.text)) closeStrip();
    const box = editor.closest('[class*="channelTextArea"]') || editor.closest("form") || editor.parentElement;
    const rect = (box || editor).getBoundingClientRect();
    const buttons = box?.querySelector('[class*="buttons"]');
    const buttonsRect = buttons instanceof Element ? buttons.getBoundingClientRect() : null;
    const right = buttonsRect && buttonsRect.width > 0 ? buttonsRect.left : rect.right - 8;
    const left = Math.max(0, Math.round(right - 36));
    const top = Math.max(0, Math.round(rect.bottom - 44));
    const key = `${left},${top}`;
    const el = ensureHost();
    if (el.style.display === "none" || key !== placed) {
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.display = "block";
      placed = key;
    }
    globalThis.FormantDiscordInputStrip?.place(rect);
  }

  /**
   * @param {MouseEvent} event
   */
  function onOutside(event) {
    if (host && event.composedPath().includes(host)) return;
    setMenu(false);
  }

  /**
   * @param {KeyboardEvent} event
   */
  function onKey(event) {
    if (event.key !== "Escape") return;
    if (menuEl() && !menuEl().hidden) setMenu(false);
    else if (pending) closeStrip();
  }

  async function start() {
    if (running) return;
    running = true;
    try {
      const data = await chrome.storage.local.get(PREF_KEY);
      if (data[PREF_KEY]?.engine === "gpt") engine = "gpt";
    } catch {
      // keep default
    }
    if (!running) return;
    document.addEventListener("mousedown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    place();
    timer = window.setInterval(place, 300);
  }

  function stop() {
    running = false;
    window.clearInterval(timer);
    timer = 0;
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", place);
    host?.remove();
    host = null;
    shadow = null;
    placed = "";
    busy = false;
    pending = null;
    globalThis.FormantDiscordInputStrip?.remove();
    document.querySelectorAll(`[${HOST_ATTR}]`).forEach((node) => node.remove());
  }

  globalThis.FormantDiscordInput = { start, stop };
})();
