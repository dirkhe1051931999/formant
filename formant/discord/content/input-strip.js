(() => {
  "use strict";

  const ATTR = "data-formant-discord-input-strip";
  /** @type {HTMLElement | null} */
  let host = null;
  /** @type {ShadowRoot | null} */
  let shadow = null;

  function css() {
    return `
      :host { all: initial; }
      * { box-sizing: border-box; font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
      .strip {
        display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 6px 12px;
        border: 1px solid var(--border-subtle, #e3e6ec); border-bottom: 0; border-radius: 8px 8px 0 0;
        background: var(--background-secondary, #f2f3f5); color: var(--text-muted, #6b7280);
        font-size: 12px; line-height: 1.45;
      }
      .lab { flex: none; font-weight: 600; }
      .src {
        flex: 1; min-width: 0; margin: 0; max-height: 58px; overflow: auto;
        white-space: pre-wrap; word-break: break-word;
      }
      .acts { flex: none; display: flex; gap: 4px; }
      .btn {
        margin: 0; padding: 0 6px; border: 0; border-radius: 4px; background: transparent;
        color: var(--text-link, #1f4b99); font-size: 12px; line-height: 1.45; cursor: pointer;
      }
      .btn:hover { background: var(--background-modifier-hover, rgba(78, 80, 88, 0.12)); }
      .btn.x { color: var(--text-muted, #6b7280); }
      .btn:disabled { opacity: 0.5; cursor: default; }
      .strip.error { color: #d92d20; }
      .strip.error .src { color: #d92d20; }
      .spin {
        display: inline-block; width: 12px; height: 12px; margin-top: 2px; border-radius: 50%;
        border: 2px solid var(--text-link, #1f4b99); border-right-color: transparent;
        animation: spin 0.7s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    `;
  }

  let statusTimer = 0;

  /**
   * Transient status in the same strip: loading (spinner) / error (red) / info.
   * @param {string} text
   * @param {"loading" | "error" | "info"} kind
   * @param {() => void} [onClose]
   */
  function status(text, kind, onClose) {
    const el = ensure();
    if (!shadow) return;
    window.clearTimeout(statusTimer);
    const strip = shadow.querySelector(".strip");
    strip.classList.toggle("error", kind === "error");
    const lab = shadow.querySelector(".lab");
    lab.replaceChildren();
    if (kind === "loading") {
      const spin = document.createElement("span");
      spin.className = "spin";
      lab.append(spin);
    } else {
      lab.textContent = kind === "error" ? "失败" : "提示";
    }
    shadow.querySelector(".src").textContent = text;
    const acts = shadow.querySelector(".acts");
    acts.replaceChildren();
    if (kind !== "loading") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn x";
      button.textContent = "×";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        hide();
        onClose?.();
      });
      acts.append(button);
      statusTimer = window.setTimeout(hide, kind === "error" ? 8000 : 1800);
    }
    el.style.display = "block";
  }

  function ensure() {
    if (host?.isConnected) return host;
    host = document.createElement("div");
    host.setAttribute(ATTR, "");
    host.style.cssText = "position:fixed;z-index:2147483000;display:none;";
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = css();
    const strip = document.createElement("div");
    strip.className = "strip";
    strip.innerHTML = '<span class="lab"></span><p class="src"></p><div class="acts"></div>';
    shadow.append(style, strip);
    // Keep focus in the Discord editor while clicking our UI.
    shadow.addEventListener("mousedown", (event) => event.preventDefault());
    (document.body || document.documentElement).append(host);
    return host;
  }

  /**
   * Original text docked right above the input; the translation already sits in the input.
   * @param {string} source
   * @param {string} label
   * @param {{ onUndo: () => void, onClose: () => void }} actions
   */
  function show(source, label, actions) {
    const el = ensure();
    if (!shadow) return;
    window.clearTimeout(statusTimer);
    shadow.querySelector(".strip").classList.remove("error");
    shadow.querySelector(".lab").textContent = label;
    shadow.querySelector(".src").textContent = source;
    const acts = shadow.querySelector(".acts");
    acts.replaceChildren();
    for (const [text, cls, fn] of [
      ["撤回", "btn", actions.onUndo],
      ["×", "btn x", actions.onClose],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = cls;
      button.textContent = text;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fn();
      });
      acts.append(button);
    }
    el.style.display = "block";
  }

  function hide() {
    window.clearTimeout(statusTimer);
    if (host) host.style.display = "none";
  }

  /**
   * @param {boolean} on
   */
  function setBusy(on) {
    shadow?.querySelectorAll(".btn").forEach((el) => {
      if (el instanceof HTMLButtonElement) el.disabled = on;
    });
  }

  /**
   * Dock the strip to the top edge of the input box.
   * @param {DOMRect} rect
   */
  function place(rect) {
    if (!host || host.style.display === "none") return;
    host.style.left = `${Math.round(rect.left)}px`;
    host.style.width = `${Math.round(rect.width)}px`;
    host.style.bottom = `${Math.round(window.innerHeight - rect.top)}px`;
  }

  function remove() {
    host?.remove();
    host = null;
    shadow = null;
    document.querySelectorAll(`[${ATTR}]`).forEach((node) => node.remove());
  }

  globalThis.FormantDiscordInputStrip = { show, status, hide, place, setBusy, remove };
})();
