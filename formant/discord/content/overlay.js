(() => {
  "use strict";

  const HOST_ATTR = "data-formant-discord-translate";
  const BTN_ATTR = "data-formant-discord-translate-btn";
  /** @type {Set<HTMLElement>} */
  const hosts = new Set();
  /** @type {HTMLElement | null} */
  let buttonHost = null;
  /** @type {(() => void) | null} */
  let onClick = null;
  let color = "#8c8c8c";
  let textSize = 14;

  /**
   * @returns {string}
   */
  function textCss() {
    return `
      :host {
        all: initial;
        display: block;
        margin: 4px 0 2px;
      }
      .t {
        margin: 0;
        color: ${color};
        font-size: ${textSize}px;
        line-height: 1.45;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
    `;
  }

  function buttonCss() {
    return `
      :host { all: initial; }
      button {
        margin: 0;
        border: 0;
        border-radius: 999px;
        padding: 8px 14px;
        background: #1f4b99;
        color: #fff;
        font: 600 13px/1.2 "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        letter-spacing: 0.02em;
        cursor: pointer;
        box-shadow: 0 8px 20px rgba(21, 26, 34, 0.28);
      }
      button:disabled {
        cursor: default;
        opacity: 0.72;
      }
    `;
  }

  /**
   * @param {HTMLElement} host
   */
  function paintHost(host) {
    const style = host.shadowRoot?.querySelector("style");
    if (style) style.textContent = textCss();
  }

  /**
   * @param {HTMLElement} message
   * @returns {HTMLElement}
   */
  function ensureHost(message) {
    const next = message.nextElementSibling;
    if (next instanceof HTMLElement && next.hasAttribute(HOST_ATTR)) {
      hosts.add(next);
      return next;
    }
    const host = document.createElement("div");
    host.setAttribute(HOST_ATTR, "");
    host.style.display = "block";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = textCss();
    const p = document.createElement("p");
    p.className = "t";
    shadow.append(style, p);
    message.after(host);
    hosts.add(host);
    return host;
  }

  /**
   * @param {HTMLElement} message
   * @param {string} text
   */
  function show(message, text) {
    const host = ensureHost(message);
    const p = host.shadowRoot?.querySelector(".t");
    if (p) p.textContent = text;
  }

  /**
   * @param {HTMLElement} message
   */
  function hide(message) {
    const next = message.nextElementSibling;
    if (!(next instanceof HTMLElement) || !next.hasAttribute(HOST_ATTR)) return;
    hosts.delete(next);
    next.remove();
  }

  function clearTranslations() {
    for (const host of [...hosts]) host.remove();
    hosts.clear();
    document.querySelectorAll(`[${HOST_ATTR}]`).forEach((node) => node.remove());
  }

  function ensureButton() {
    if (buttonHost?.isConnected) return buttonHost;
    const host = document.createElement("div");
    host.setAttribute(BTN_ATTR, "");
    host.style.position = "fixed";
    host.style.right = "24px";
    host.style.bottom = "100px";
    host.style.zIndex = "2147483000";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = buttonCss();
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "翻译";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick?.();
    });
    shadow.append(style, button);
    (document.body || document.documentElement).append(host);
    buttonHost = host;
    return host;
  }

  function showButton() {
    const host = ensureButton();
    host.hidden = false;
  }

  function hideButton() {
    if (!buttonHost) return;
    buttonHost.hidden = true;
  }

  /**
   * @param {string} label
   */
  function setLabel(label) {
    const button = ensureButton().shadowRoot?.querySelector("button");
    if (button) button.textContent = label;
  }

  /**
   * @param {boolean} busy
   */
  function setBusy(busy) {
    const button = buttonHost?.shadowRoot?.querySelector("button");
    if (button) button.disabled = busy;
  }

  /**
   * @param {string} nextColor
   * @param {number} nextSize
   */
  function setStyle(nextColor, nextSize) {
    color = nextColor;
    textSize = nextSize;
    for (const host of hosts) paintHost(host);
  }

  /**
   * @param {() => void} listener
   */
  function bindClick(listener) {
    onClick = listener;
  }

  globalThis.FormantDiscordOverlay = {
    show,
    hide,
    clearTranslations,
    showButton,
    hideButton,
    setLabel,
    setBusy,
    setStyle,
    bindClick,
  };
})();
