(() => {
  "use strict";

  const bootstrap = globalThis.FormantElitepvpersBootstrap;
  const overlay = globalThis.FormantElitepvpersOverlay;
  if (!bootstrap || !overlay) return;

  const RETRY_MS = 20000;
  const SCAN_MS = 700;

  /** @type {WeakMap<Element, { source: string, status: "done" | "busy" | "skip" | "fail", at: number, gen: number }>} */
  const memory = new WeakMap();
  /** @type {Element[]} */
  const queue = [];
  /** @type {Set<Element>} */
  const queued = new Set();
  let busy = false;
  let enabled = false;
  let target = "auto";
  let gen = 0;
  let timer = 0;
  let scanSoon = 0;
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
      if (node.hasAttribute(overlay.HOST_ATTR)) return;
      const tag = node.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return;
      if (node.classList.contains("signature")) return;
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
   * @param {Set<Element>} seen
   */
  function addTarget(el, seen) {
    if (!(el instanceof Element) || seen.has(el)) return;
    if (el.closest(`[${overlay.HOST_ATTR}]`)) return;
    seen.add(el);
  }

  /**
   * @returns {Element[]}
   */
  function targets() {
    /** @type {Set<Element>} */
    const seen = new Set();
    document.querySelectorAll('a[id^="thread_title_"]').forEach((el) => addTarget(el, seen));
    const headlines = document.querySelectorAll('h1[itemprop="headline"]');
    headlines.forEach((el) => addTarget(el, seen));
    if (!headlines.length) {
      document.querySelectorAll("div.cwhead").forEach((el) => {
        if (plainText(el).length > 240) return;
        addTarget(el, seen);
      });
    }
    document.querySelectorAll('td[id^="td_post_"] > div.smallfont').forEach((el) => {
      if (!el.querySelector(":scope > strong")) return;
      if (el.closest('div[id^="post_message_"]')) return;
      addTarget(el, seen);
    });
    const messages = document.querySelectorAll('div[id^="post_message_"]');
    messages.forEach((el) => addTarget(el, seen));
    if (!messages.length) {
      document.querySelectorAll('table[id^="post"]').forEach((table) => {
        for (const td of table.querySelectorAll("td.alt1")) {
          if (td.getAttribute("width") === "175" || td.querySelector("a.bigusername")) continue;
          addTarget(td, seen);
          break;
        }
      });
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
    if (!source || source.length < 2) {
      memory.set(el, { source: "", status: "skip", at: Date.now(), gen });
      return;
    }
    const prev = memory.get(el);
    if (prev && prev.gen === gen && prev.source === source && (prev.status === "done" || prev.status === "skip")) return;
    if (prev && prev.gen === gen && prev.status === "fail" && Date.now() - prev.at < RETRY_MS) return;

    memory.set(el, { source, status: "busy", at: Date.now(), gen });
    try {
      const result = await chrome.runtime.sendMessage({
        type: "FORMANT_ELITEPVPERS_TRANSLATE",
        q: source,
        target,
      });
      if (!enabled || !el.isConnected) return;
      if (memory.get(el)?.gen !== gen) return;
      if (!result?.ok) throw new Error(result?.error || "翻译失败");
      const text = String(result.text || "").trim();
      if (!text || text === source) {
        const host = el.nextElementSibling;
        if (host instanceof HTMLElement && host.hasAttribute(overlay.HOST_ATTR)) overlay.detach(host);
        memory.set(el, { source, status: "skip", at: Date.now(), gen });
        return;
      }
      const host = overlay.attach(el);
      overlay.setText(host, text);
      memory.set(el, { source, status: "done", at: Date.now(), gen });
    } catch {
      memory.set(el, { source, status: "fail", at: Date.now(), gen });
    }
  }

  function scan() {
    if (!enabled) return;
    for (const el of targets()) {
      if (!inView(el)) continue;
      const source = plainText(el);
      if (!source || source.length < 2) continue;
      const prev = memory.get(el);
      if (prev && prev.gen === gen && prev.source === source && (prev.status === "done" || prev.status === "skip")) continue;
      if (prev && prev.gen === gen && prev.status === "fail" && Date.now() - prev.at < RETRY_MS) continue;
      enqueue(el);
    }
  }

  function start() {
    if (timer) return;
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
    queue.length = 0;
    queued.clear();
    gen += 1;
    overlay.clearAll();
  }

  /**
   * @param {{ enabled: boolean, color: string, textSize: number, target: string }} state
   */
  function apply(state) {
    overlay.setStyle(state.color, state.textSize);
    const nextTarget = state.target || "auto";
    if (nextTarget !== target) {
      target = nextTarget;
      gen += 1;
      queue.length = 0;
      queued.clear();
      overlay.clearAll();
      if (enabled) scan();
    } else {
      target = nextTarget;
    }
    const on = state.enabled === true;
    if (on === enabled) return;
    enabled = on;
    if (enabled) start();
    else stop();
  }

  void bootstrap.ready.then(apply);
  bootstrap.subscribe(apply);
})();
