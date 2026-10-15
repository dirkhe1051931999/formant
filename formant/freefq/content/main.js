(() => {
  "use strict";

  const bootstrap = globalThis.FormantFreefqBootstrap;
  if (!bootstrap) return;

  const HOST_ID = "formant-freefq-export";
  const STYLE_ID = "formant-freefq-unlock";
  /** User XPath fallback: /html/body/table[4]/tbody/tr/td[1]/table[2] → article box. */
  const XPATH_ARTICLE =
    "/html/body/table[4]/tbody/tr/td[1]/table[2] | /html/body/table[4]/tr/td[1]/table[2]";

  let enabled = false;
  let busy = false;
  /** @type {HTMLElement | null} */
  let host = null;
  /** @type {ShadowRoot | null} */
  let shadow = null;
  /** @type {HTMLButtonElement | null} */
  let button = null;
  /** @type {(() => void) | null} */
  let restoreCopy = null;

  /**
   * @param {string} xpath
   * @returns {Element | null}
   */
  function queryXPath(xpath) {
    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      );
      const node = result.singleNodeValue;
      return node instanceof Element ? node : null;
    } catch {
      return null;
    }
  }

  /**
   * @returns {Element | null}
   */
  function findBodyRoot() {
    const desktop = document.getElementById("text");
    if (desktop) return desktop;
    const mobile = document.querySelector("div.wz");
    if (mobile) return mobile;
    const viaPath = queryXPath(XPATH_ARTICLE);
    if (!viaPath) return null;
    return viaPath.querySelector("#text, .wz, td#text") || viaPath;
  }

  function isArticlePage() {
    if (findBodyRoot()) return true;
    return Boolean(
      document.querySelector(".title_info h1, h3.bt, body.showpage.news"),
    );
  }

  /**
   * @param {Element} root
   */
  function plainFromRoot(root) {
    const clone = /** @type {HTMLElement} */ (root.cloneNode(true));
    clone.querySelectorAll("script, style, iframe, noscript, .advertisement").forEach((node) => {
      node.remove();
    });
    clone.querySelectorAll("br").forEach((br) => {
      br.replaceWith("\n");
    });
    clone.querySelectorAll("p, div, tr, li, h1, h2, h3, h4").forEach((el) => {
      el.append("\n");
    });
    let text = clone.innerText || clone.textContent || "";
    text = text
      .replace(/\u00a0/g, " ")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return text;
  }

  /**
   * @returns {{ title: string, meta: string, body: string, url: string } | null}
   */
  function extractArticle() {
    const root = findBodyRoot();
    if (!root) return null;
    const title =
      document.querySelector(".title_info h1, h3.bt")?.textContent?.trim() ||
      document.title.replace(/\s*[-_|].*$/, "").trim() ||
      "freefq-article";
    const metaEl = document.querySelector("td.info_text, .info_text, p.sj");
    let meta = "";
    if (metaEl) {
      const metaClone = /** @type {HTMLElement} */ (metaEl.cloneNode(true));
      metaClone.querySelectorAll("script, style, a").forEach((node) => node.remove());
      meta = (metaClone.innerText || metaClone.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
    }
    const body = plainFromRoot(root);
    if (!body) return null;
    return { title, meta, body, url: location.href };
  }

  /**
   * @param {string} title
   */
  function filenameFromTitle(title) {
    const cleaned = String(title || "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100);
    return `${cleaned || "freefq-article"}.txt`;
  }

  const BLOCK_EVENTS = ["copy", "cut", "contextmenu", "selectstart", "dragstart"];
  const ATTR_KILL = [
    "onselectstart",
    "oncontextmenu",
    "oncopy",
    "oncut",
    "ondragstart",
    "onmousedown",
  ];

  /**
   * freefq 页尾脚本会再次绑 onmousedown / onselectstart；捕获阶段拦住后站点禁选失效。
   * @param {Event} event
   */
  function allowSelectEvent(event) {
    event.stopPropagation();
  }

  function clearPageHooks() {
    const doc = document;
    doc.oncontextmenu = null;
    doc.onselectstart = null;
    doc.onmousedown = null;
    doc.oncopy = null;
    doc.oncut = null;
    doc.ondragstart = null;
    for (const el of doc.querySelectorAll("body, #text, .wz, .title_info, .info_text")) {
      if (!(el instanceof HTMLElement)) continue;
      for (const name of ATTR_KILL) el.removeAttribute(name);
      el.onselectstart = null;
      el.oncontextmenu = null;
      el.onmousedown = null;
      el.oncopy = null;
      el.oncut = null;
      el.ondragstart = null;
    }
  }

  function ensureUnlockStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        html.formant-freefq-unlock,
        html.formant-freefq-unlock body,
        html.formant-freefq-unlock body * {
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          user-select: text !important;
        }
      `;
      (document.head || document.documentElement).append(style);
    }
    document.documentElement.classList.add("formant-freefq-unlock");
  }

  function clearUnlockStyle() {
    document.documentElement.classList.remove("formant-freefq-unlock");
    document.getElementById(STYLE_ID)?.remove();
  }

  function unlockCopy() {
    if (restoreCopy) return;
    clearPageHooks();
    ensureUnlockStyle();
    for (const type of BLOCK_EVENTS) {
      document.addEventListener(type, allowSelectEvent, true);
    }
    /** @type {number} */
    let ticks = 0;
    const timer = window.setInterval(() => {
      clearPageHooks();
      ticks += 1;
      if (ticks >= 20) window.clearInterval(timer);
    }, 500);

    restoreCopy = () => {
      window.clearInterval(timer);
      for (const type of BLOCK_EVENTS) {
        document.removeEventListener(type, allowSelectEvent, true);
      }
      clearUnlockStyle();
      restoreCopy = null;
    };
  }

  function relockCopy() {
    restoreCopy?.();
  }

  function ensureUi() {
    if (host && shadow && button) return;
    host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
    }
    shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    shadow.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
        position: fixed;
        right: 16px;
        bottom: 20px;
        z-index: 2147483645;
        pointer-events: none;
      }
      .btn {
        pointer-events: auto;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        cursor: pointer;
        color: #fff;
        background: rgba(31, 75, 153, 0.92);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
        font: 600 13px/1.2 "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      .btn:hover { background: rgba(31, 75, 153, 1); }
      .btn:disabled { opacity: 0.72; cursor: default; }
      .btn.is-ok { background: rgba(20, 108, 67, 0.92); }
      .btn.is-err { background: rgba(180, 35, 24, 0.92); }
      .btn svg { width: 16px; height: 16px; flex: 0 0 auto; }
    `;
    button = document.createElement("button");
    button.type = "button";
    button.className = "btn";
    button.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3a1 1 0 0 1 1 1v9.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42L11 13.59V4a1 1 0 0 1 1-1Zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z"/></svg><span>导出 TXT</span>';
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void exportTxt();
    });
    shadow.append(style, button);
    if (!host.isConnected) document.documentElement.append(host);
  }

  /**
   * @param {string} label
   * @param {"idle" | "busy" | "ok" | "err"} state
   */
  function setButtonState(label, state) {
    ensureUi();
    if (!button) return;
    const span = button.querySelector("span");
    if (span) span.textContent = label;
    button.disabled = state === "busy";
    button.classList.toggle("is-ok", state === "ok");
    button.classList.toggle("is-err", state === "err");
  }

  async function exportTxt() {
    if (busy || !enabled) return;
    const article = extractArticle();
    if (!article) {
      setButtonState("未找到正文", "err");
      window.setTimeout(() => setButtonState("导出 TXT", "idle"), 1800);
      return;
    }
    busy = true;
    setButtonState("导出中…", "busy");
    const lines = [article.title];
    if (article.meta) lines.push(article.meta);
    lines.push(article.url, "", article.body);
    const text = `${lines.join("\n")}\n`;
    const filename = filenameFromTitle(article.title);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "FORMANT_FREEQ_EXPORT_TXT",
        text,
        filename,
      });
      if (!response?.ok) throw new Error(response?.error || "导出失败");
      setButtonState("已导出", "ok");
    } catch (error) {
      setButtonState(error instanceof Error ? error.message.slice(0, 18) : "导出失败", "err");
    } finally {
      busy = false;
      window.setTimeout(() => {
        if (!busy) setButtonState("导出 TXT", "idle");
      }, 1800);
    }
  }

  function mount() {
    if (!isArticlePage()) {
      clear();
      return;
    }
    unlockCopy();
    ensureUi();
    setButtonState("导出 TXT", "idle");
  }

  function clear() {
    relockCopy();
    host?.remove();
    host = null;
    shadow = null;
    button = null;
    busy = false;
  }

  /**
   * @param {{ enabled: boolean }} state
   */
  function apply(state) {
    enabled = state.enabled === true;
    if (enabled) mount();
    else clear();
  }

  void bootstrap.ready.then(apply);
  bootstrap.subscribe(apply);
})();
