(() => {
  "use strict";

  const HOST_ATTR = "data-formant-gh-issues-translate";
  /** @type {Set<HTMLElement>} */
  const hosts = new Set();
  let color = "#8c8c8c";
  let textSize = 14;

  /**
   * @returns {string}
   */
  function css() {
    return `
      :host {
        all: initial;
        display: block;
        margin: 4px 0 6px;
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

  /**
   * @param {HTMLElement} host
   */
  function paintHost(host) {
    const shadow = host.shadowRoot;
    const style = shadow?.querySelector("style");
    if (style) style.textContent = css();
  }

  /**
   * @param {Element} source
   * @returns {HTMLElement}
   */
  function attach(source) {
    const next = source.nextElementSibling;
    if (next instanceof HTMLElement && next.hasAttribute(HOST_ATTR)) {
      hosts.add(next);
      return next;
    }
    const host = document.createElement("div");
    host.setAttribute(HOST_ATTR, "");
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = css();
    const p = document.createElement("p");
    p.className = "t";
    shadow.append(style, p);
    source.after(host);
    hosts.add(host);
    return host;
  }

  /**
   * @param {Element} source
   * @returns {HTMLElement | null}
   */
  function hostOf(source) {
    const next = source.nextElementSibling;
    if (next instanceof HTMLElement && next.hasAttribute(HOST_ATTR)) return next;
    return null;
  }

  /**
   * @param {HTMLElement} host
   * @param {string} text
   */
  function setText(host, text) {
    const p = host.shadowRoot?.querySelector(".t");
    if (p) p.textContent = text;
  }

  /**
   * @param {HTMLElement} host
   */
  function detach(host) {
    hosts.delete(host);
    host.remove();
  }

  function clearAll() {
    for (const host of [...hosts]) detach(host);
    document.querySelectorAll(`[${HOST_ATTR}]`).forEach((node) => {
      if (node instanceof HTMLElement) node.remove();
    });
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

  globalThis.FormantGithubIssuesOverlay = {
    HOST_ATTR,
    attach,
    hostOf,
    setText,
    detach,
    clearAll,
    setStyle,
  };
})();
