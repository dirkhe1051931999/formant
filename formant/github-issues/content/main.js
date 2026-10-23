(() => {
  "use strict";

  const bootstrap = globalThis.FormantGithubIssuesBootstrap;
  const overlay = globalThis.FormantGithubIssuesOverlay;
  if (!bootstrap || !overlay) return;

  const RETRY_MS = 20000;
  const SCAN_MS = 700;
  const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
  const LETTER = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0600-\u06FF\u3040-\u30FF\uAC00-\uD7AF]/;

  /** @type {WeakMap<Element, { source: string, status: "done" | "busy" | "skip" | "fail", at: number, gen: number }>} */
  const memory = new WeakMap();
  /** @type {Element[]} */
  const queue = [];
  /** @type {Set<Element>} */
  const queued = new Set();
  let busy = false;
  let enabled = false;
  let gen = 0;
  let timer = 0;
  let scanSoon = 0;
  let lastPath = "";
  /** @type {MutationObserver | null} */
  let observer = null;

  /**
   * @returns {"" | "list" | "detail"}
   */
  function pageKind() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (/\/issues\/new(\/|$)/.test(path)) return "";
    const repo = path.match(/^\/[^/]+\/[^/]+\/issues(?:\/(\d+))?$/);
    if (repo) return repo[1] ? "detail" : "list";
    if (path === "/issues" || path.startsWith("/issues/")) return "list";
    return "";
  }

  /**
   * Only pure foreign text. Chinese-only and mixed CJK+foreign are skipped.
   * @param {string} text
   */
  function isPureForeign(text) {
    if (!text || CJK.test(text)) return false;
    return LETTER.test(text);
  }

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
      if (node.hasAttribute(overlay.HOST_ATTR)) return;
      const tag = node.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "PRE") return;
      if (node.matches(".highlight, .blob-wrapper, .zeroclipboard-container")) return;
      if (tag === "IMG") {
        out += node.getAttribute("alt") || "";
        return;
      }
      if (tag === "BR") out += "\n";
      for (const child of node.childNodes) walk(child);
    };
    walk(el);
    return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  }

  /**
   * @param {Element} el
   */
  function inView(el) {
    const rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight + 240 && rect.right > 0 && rect.left < innerWidth;
  }

  /**
   * @param {Element} el
   */
  function isWritable(el) {
    return Boolean(
      el.closest("form, textarea, [contenteditable='true'], .js-preview-body, [data-testid*='editor']"),
    );
  }

  /**
   * @param {Element} el
   */
  function mountNode(el) {
    if (el.matches('[data-testid="issue-listitem-title-link"], a[id^="issue_"]')) {
      return el.closest("h3") || el.parentElement || el;
    }
    if (el.matches('[data-testid="issue-title"], .js-issue-title')) {
      return el.closest("h1") || el;
    }
    return el;
  }

  /**
   * @param {Element} el
   * @param {Set<Element>} seen
   */
  function addTarget(el, seen) {
    if (!(el instanceof Element) || seen.has(el)) return;
    if (el.closest(`[${overlay.HOST_ATTR}]`)) return;
    if (isWritable(el)) return;
    seen.add(el);
  }

  /**
   * @returns {Element[]}
   */
  function targets() {
    const kind = pageKind();
    /** @type {Set<Element>} */
    const seen = new Set();
    if (kind === "list") {
      document.querySelectorAll('[data-testid="issue-listitem-title-link"]').forEach((el) => addTarget(el, seen));
      document.querySelectorAll('a[id^="issue_"][data-hovercard-type="issue"]').forEach((el) => addTarget(el, seen));
      document.querySelectorAll(".js-issue-row a[data-hovercard-type='issue']").forEach((el) => addTarget(el, seen));
    } else if (kind === "detail") {
      const title = document.querySelector('[data-testid="issue-title"]');
      if (title) addTarget(title, seen);
      document.querySelectorAll(".js-issue-title").forEach((el) => {
        if (el.closest("[data-testid='issue-title-sticky'], .gh-header-sticky")) return;
        addTarget(el, seen);
      });
      document.querySelectorAll('[data-testid="markdown-body"]').forEach((el) => {
        if (
          el.closest('[data-testid="issue-body-viewer"]') ||
          el.closest('[data-testid^="comment-viewer-outer-box-"]')
        ) {
          addTarget(el, seen);
        }
      });
      document.querySelectorAll(".js-comment-body").forEach((el) => addTarget(el, seen));
    }
    return [...seen];
  }

  /**
   * @param {Element} el
   */
  function enqueue(el) {
    if (queued.has(el)) return;
    const prev = memory.get(el);
    if (prev && prev.gen === gen && prev.status === "busy") return;
    queued.add(el);
    queue.push(el);
    pump();
  }

  function pump() {
    if (busy || !enabled) return;
    const el = queue.shift();
    if (!el) return;
    queued.delete(el);
    busy = true;
    void translateOne(el).finally(() => {
      busy = false;
      pump();
    });
  }

  /**
   * @param {Element} el
   */
  async function translateOne(el) {
    if (!enabled || !el.isConnected) return;
    const source = plainText(el);
    if (!source || source.length < 2 || !isPureForeign(source)) {
      const host = overlay.hostOf(mountNode(el));
      if (host) overlay.detach(host);
      memory.set(el, { source: source || "", status: "skip", at: Date.now(), gen });
      return;
    }
    const prev = memory.get(el);
    if (prev && prev.gen === gen && prev.source === source && (prev.status === "done" || prev.status === "skip")) return;
    if (prev && prev.gen === gen && prev.status === "fail" && Date.now() - prev.at < RETRY_MS) return;

    memory.set(el, { source, status: "busy", at: Date.now(), gen });
    try {
      const result = await chrome.runtime.sendMessage({
        type: "FORMANT_GITHUB_ISSUES_TRANSLATE",
        q: source,
      });
      if (!enabled || !el.isConnected) return;
      if (memory.get(el)?.gen !== gen) return;
      if (!result?.ok) throw new Error(result?.error || "翻译失败");
      const text = String(result.text || "").trim();
      if (!text || text === source || !isPureForeign(source)) {
        const host = overlay.hostOf(mountNode(el));
        if (host) overlay.detach(host);
        memory.set(el, { source, status: "skip", at: Date.now(), gen });
        return;
      }
      const host = overlay.attach(mountNode(el));
      overlay.setText(host, text);
      memory.set(el, { source, status: "done", at: Date.now(), gen });
    } catch {
      memory.set(el, { source, status: "fail", at: Date.now(), gen });
    }
  }

  function resetPage() {
    queue.length = 0;
    queued.clear();
    gen += 1;
    overlay.clearAll();
  }

  function scan() {
    if (!enabled) return;
    const path = `${location.pathname}${location.search}`;
    if (path !== lastPath) {
      lastPath = path;
      resetPage();
    }
    if (!pageKind()) return;
    for (const el of targets()) {
      if (!inView(el)) continue;
      const source = plainText(el);
      if (!source || source.length < 2 || !isPureForeign(source)) continue;
      const prev = memory.get(el);
      if (prev && prev.gen === gen && prev.source === source && (prev.status === "done" || prev.status === "skip")) continue;
      if (prev && prev.gen === gen && prev.status === "fail" && Date.now() - prev.at < RETRY_MS) continue;
      enqueue(el);
    }
  }

  function start() {
    if (timer) return;
    lastPath = `${location.pathname}${location.search}`;
    observer = new MutationObserver(() => {
      window.clearTimeout(scanSoon);
      scanSoon = window.setTimeout(scan, 80);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scan();
    timer = window.setInterval(scan, SCAN_MS);
  }

  function stop() {
    window.clearInterval(timer);
    timer = 0;
    window.clearTimeout(scanSoon);
    scanSoon = 0;
    observer?.disconnect();
    observer = null;
    lastPath = "";
    resetPage();
  }

  /**
   * @param {{ enabled: boolean, color: string, textSize: number }} state
   */
  function apply(state) {
    overlay.setStyle(state.color, state.textSize);
    const on = state.enabled === true;
    if (on === enabled) return;
    enabled = on;
    if (enabled) start();
    else stop();
  }

  void bootstrap.ready.then(apply);
  bootstrap.subscribe(apply);
})();
