(() => {
  "use strict";

  const HOST_ID = "formant-autopagerize-bar";
  let host = null;
  let shadow = null;
  let bar = null;
  let hideTimer = 0;

  function ensure() {
    if (host && host.shadowRoot) return bar;
    host = document.createElement("div");
    host.id = HOST_ID;
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .bar {
        position: fixed;
        left: 0;
        bottom: 0;
        width: 100%;
        box-sizing: border-box;
        padding: 5px 12px;
        font: 12px/1.4 "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        text-align: center;
        z-index: 2147483646;
        transition: opacity 0.25s ease;
        opacity: 0;
        pointer-events: none;
      }
      .bar.is-visible { opacity: 1; }
      .bar--loading { color: #fff; background: rgba(31, 75, 153, 0.92); }
      .bar--error { color: #fff; background: rgba(180, 35, 24, 0.92); }
      .bar--info { color: #fff; background: rgba(21, 26, 34, 0.88); }
    `;
    bar = document.createElement("div");
    bar.className = "bar bar--loading";
    bar.hidden = true;
    shadow.append(style, bar);
    document.documentElement.append(host);
    return bar;
  }

  function show(text, kind = "loading", duration = 0) {
    if (!text) {
      hide();
      return;
    }
    const el = ensure();
    el.hidden = false;
    el.textContent = text;
    el.className = `bar bar--${kind} is-visible`;
    window.clearTimeout(hideTimer);
    if (duration > 0) {
      hideTimer = window.setTimeout(hide, duration);
    }
  }

  function hide() {
    if (!bar) return;
    window.clearTimeout(hideTimer);
    bar.classList.remove("is-visible");
    hideTimer = window.setTimeout(() => {
      if (bar) bar.hidden = true;
    }, 260);
  }

  globalThis.FormantAutopagerizeBar = { show, hide };
})();
