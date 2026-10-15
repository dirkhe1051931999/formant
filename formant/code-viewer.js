(() => {
  "use strict";

  const SEARCH_DEBOUNCE_MS = 120;

  /**
   * @param {HTMLElement} container
   * @param {{ kind: "js" | "css", sourceText: string, prettyText: string }} payload
   * @param {{ showToolbar?: boolean }} [options]
   */
  function render(container, payload, options = {}) {
    container.textContent = "";
    container.classList.add("oolaf-json-body");

    const kindLabel = payload.kind === "css" ? "CSS" : "JavaScript";
    const state = {
      kind: payload.kind,
      sourceText: payload.sourceText,
      prettyText: payload.prettyText,
      view: "pretty",
      searchRawQuery: "",
      searchIndex: -1,
      matches: [],
      searchTimer: 0,
      searchCount: null,
      downloadName: options.downloadName || "",
      showToolbar: options.showToolbar !== false,
    };

    const app = createElement("main", "oolaf-json-app oolaf-code-app");
    const pretty = createElement("pre", "oolaf-json-raw oolaf-code-raw");
    const raw = createElement("pre", "oolaf-json-raw oolaf-code-raw");
    raw.hidden = true;
    paintRaw(state, raw);

    if (state.showToolbar) app.append(createToolbar(state, pretty, raw, kindLabel));
    app.append(pretty, raw);
    container.appendChild(app);
    paintPretty(state, pretty);
  }

  /**
   * @param {typeof arguments[0]} state
   * @param {HTMLElement} pretty
   * @param {HTMLElement} raw
   * @param {string} kindLabel
   */
  function createToolbar(state, pretty, raw, kindLabel) {
    const toolbar = createElement("header", "oolaf-json-toolbar");
    const left = createElement("div", "oolaf-json-title-wrap");
    left.append(
      createElement("strong", "oolaf-json-title", kindLabel),
      createElement(
        "span",
        "oolaf-json-meta",
        `${formatBytes(state.sourceText.length)} → ${formatBytes(state.prettyText.length)}`,
      ),
    );

    const controls = createElement("div", "oolaf-json-controls");
    const searchWrap = createElement("label", "oolaf-json-search");
    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.placeholder = "Search";
    searchInput.autocomplete = "off";
    const searchCount = createElement("span", "oolaf-json-search-count", "0/0");
    state.searchCount = searchCount;
    const prev = createButton("Prev");
    const next = createButton("Next");
    searchWrap.append(searchInput);
    controls.append(searchWrap, prev, next, searchCount);

    const right = createElement("div", "oolaf-json-actions");
    const prettyBtn = createButton("Pretty");
    const rawBtn = createButton("Raw");
    const copyPretty = createButton("Copy pretty");
    const downloadBtn = createButton("Download");
    const copyRaw = createButton("Copy raw");
    right.append(prettyBtn, rawBtn, copyPretty, downloadBtn, copyRaw);

    const rerenderSearch = () => {
      if (state.view !== "pretty") return;
      paintPretty(state, pretty);
    };

    searchInput.addEventListener("input", () => {
      state.searchRawQuery = searchInput.value;
      state.searchIndex = state.searchRawQuery ? 0 : -1;
      window.clearTimeout(state.searchTimer);
      state.searchTimer = window.setTimeout(rerenderSearch, SEARCH_DEBOUNCE_MS);
    });
    searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      (event.shiftKey ? prev : next).click();
    });
    prev.addEventListener("click", () => stepMatch(state, -1));
    next.addEventListener("click", () => stepMatch(state, 1));
    prettyBtn.addEventListener("click", () => {
      state.view = "pretty";
      pretty.hidden = false;
      raw.hidden = true;
      paintPretty(state, pretty);
    });
    rawBtn.addEventListener("click", () => {
      state.view = "raw";
      pretty.hidden = true;
      raw.hidden = false;
      state.matches = [];
      updateCount(state);
    });
    copyPretty.addEventListener("click", () => copyText(state.prettyText, copyPretty));
    downloadBtn.addEventListener("click", () => {
      const ext = state.kind === "css" ? "css" : "js";
      downloadText(state.prettyText, downloadFileName(state.downloadName, ext));
      downloadBtn.textContent = "Saved";
      window.setTimeout(() => {
        downloadBtn.textContent = downloadBtn.dataset.label || "Download";
      }, 1200);
    });
    copyRaw.addEventListener("click", () => copyText(state.sourceText, copyRaw));

    document.addEventListener(
      "keydown",
      (event) => {
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "f") return;
        event.preventDefault();
        event.stopPropagation();
        searchInput.focus();
        searchInput.select();
      },
      true,
    );

    toolbar.append(left, controls, right);
    return toolbar;
  }

  /**
   * @param {{ prettyText: string, searchRawQuery: string, searchIndex: number, matches: HTMLElement[], searchCount: HTMLElement | null }} state
   * @param {HTMLElement} pretty
   */
  function paintPretty(state, pretty) {
    pretty.textContent = "";
    state.matches = [];
    const query = state.searchRawQuery;
    const highlighter = window.FormantCodeHighlight;
    if (highlighter) {
      if (!state.prettyTokens) state.prettyTokens = highlighter.tokenize(state.kind, state.prettyText);
      highlighter.paint(pretty, state.prettyTokens, query, state.matches);
    } else if (!query) {
      pretty.textContent = state.prettyText;
    } else {
      appendSearchPlain(pretty, state.prettyText, query, state.matches);
    }
    if (state.matches.length === 0) state.searchIndex = -1;
    else if (state.searchIndex < 0) state.searchIndex = 0;
    else if (state.searchIndex >= state.matches.length) state.searchIndex = state.matches.length - 1;
    updateActive(state);
    updateCount(state);
  }

  function paintRaw(state, raw) {
    raw.textContent = "";
    const highlighter = window.FormantCodeHighlight;
    if (highlighter) highlighter.paint(raw, highlighter.tokenize(state.kind, state.sourceText), "", []);
    else raw.textContent = state.sourceText;
  }

  function appendSearchPlain(root, source, query, matches) {
    const lower = source.toLowerCase();
    const needle = query.toLowerCase();
    let offset = 0;
    let index = lower.indexOf(needle, offset);
    while (index !== -1) {
      if (index > offset) root.appendChild(document.createTextNode(source.slice(offset, index)));
      const mark = createElement("mark", "oolaf-json-keyword-hit oolaf-code-hit", source.slice(index, index + query.length));
      root.appendChild(mark);
      matches.push(mark);
      offset = index + needle.length;
      index = lower.indexOf(needle, offset);
    }
    if (offset < source.length) root.appendChild(document.createTextNode(source.slice(offset)));
  }

  /**
   * @param {{ searchIndex: number, matches: HTMLElement[] }} state
   * @param {number} delta
   */
  function stepMatch(state, delta) {
    if (state.matches.length === 0) return;
    state.searchIndex = (state.searchIndex + delta + state.matches.length) % state.matches.length;
    updateActive(state);
    updateCount(state);
    state.matches[state.searchIndex]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function updateActive(state) {
    state.matches.forEach((el, index) => {
      el.classList.toggle("oolaf-json-match-current", index === state.searchIndex);
    });
  }

  function updateCount(state) {
    if (!state.searchCount) return;
    const total = state.matches.length;
    const current = total > 0 ? state.searchIndex + 1 : 0;
    state.searchCount.textContent = `${current}/${total}`;
  }

  /**
   * @param {string} text
   * @param {HTMLButtonElement} button
   */
  async function copyText(text, button) {
    const original = button.dataset.label || button.textContent;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else fallbackCopy(text);
      button.textContent = "Copied";
    } catch {
      fallbackCopy(text);
      button.textContent = "Copied";
    }
    window.setTimeout(() => {
      button.textContent = original;
    }, 1200);
  }

  function fallbackCopy(text) {
    const textarea = createElement("textarea", "oolaf-json-copy-buffer");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadFileName(hint, ext) {
    let base = "";
    try {
      const url = new URL(String(hint || location.href), location.href);
      base = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
    } catch {
      base = "";
    }
    base = base.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
    if (!base || /^(panel|viewer)\.html$/i.test(base)) base = "pretty";
    if (new RegExp(`\\.${ext}$`, "i").test(base)) return base;
    return `${base.replace(/\.[a-z0-9]{1,8}$/i, "")}.${ext}`;
  }

  function createButton(label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "oolaf-json-button";
    button.textContent = label;
    button.dataset.label = label;
    return button;
  }

  function createElement(tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function formatBytes(length) {
    if (length < 1024) return `${length} B`;
    const kb = length / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  }

  globalThis.FormantCodeViewer = { render };
})();
