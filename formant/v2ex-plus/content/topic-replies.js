(() => {
  "use strict";

  const MAX_PAGES = 100;
  const FETCH_CONCURRENCY = 4;
  const TOPIC_RE = /\/t\/(\d+)/;

  function topicId() {
    return location.pathname.match(TOPIC_RE)?.[1] || "";
  }

  function currentPage() {
    return Math.max(1, Number(new URLSearchParams(location.search).get("p") || 1) || 1);
  }

  /**
   * @param {string} href
   * @param {string} id
   */
  function pageFromHref(href, id) {
    try {
      const url = new URL(href, location.href);
      if (!url.pathname.includes(`/t/${id}`)) return 0;
      return Math.max(1, Number(url.searchParams.get("p") || 1) || 1);
    } catch {
      return 0;
    }
  }

  function detectPageCount() {
    const id = topicId();
    let max = currentPage();
    for (const anchor of document.querySelectorAll("#Main a[href]")) {
      const page = pageFromHref(anchor.getAttribute("href") || "", id);
      if (page > max) max = page;
    }
    const input = document.querySelector("#Main input.page_input");
    const declared = Number(input?.getAttribute("max") || input?.max || 0);
    if (declared > max) max = declared;
    const gray = document.querySelector("#Main span.gray")?.textContent || "";
    const replies = Number(gray.match(/(\d+)\s*条回复/)?.[1] || 0);
    if (replies > 0) max = Math.max(max, Math.ceil(replies / 100));
    return Math.min(Math.max(1, max), MAX_PAGES);
  }

  /**
   * @param {Element} cell
   */
  function floorOf(cell) {
    return Number(cell.querySelector(".no")?.textContent || 0) || Number.MAX_SAFE_INTEGER;
  }

  /**
   * @param {Element} cell
   */
  function lazyImages(cell) {
    for (const image of cell.querySelectorAll("img")) {
      image.loading = "lazy";
      image.decoding = "async";
    }
  }

  /**
   * @param {number} page
   * @param {string} id
   */
  async function fetchPageCells(page, id) {
    const response = await fetch(`/t/${id}?p=${page}`, { credentials: "include" });
    if (!response.ok) return [];
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script, iframe, object, embed").forEach((node) => node.remove());
    const runtime = globalThis.__formantV2ex;
    const cells = [];
    for (const cell of doc.querySelectorAll("#Main div[id^='r_']")) {
      const adopted = document.importNode(cell, true);
      if (runtime?.mark) runtime.mark(adopted);
      lazyImages(adopted);
      cells.push(adopted);
    }
    return cells;
  }

  /**
   * @template T
   * @param {T[]} items
   * @param {number} limit
   * @param {(item: T, index: number) => Promise<void>} worker
   */
  async function mapPool(items, limit, worker) {
    let cursor = 0;
    async function run() {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await worker(items[index], index);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
    const n = Math.max(1, Math.min(limit, items.length));
    await Promise.all(Array.from({ length: n }, () => run()));
  }

  /**
   * @param {string} text
   */
  function setStatus(text) {
    let status = document.querySelector("[data-formant-v2ex-reply-status]");
    if (!(status instanceof HTMLElement)) {
      status = document.createElement("div");
      status.dataset.formantV2exReplyStatus = "true";
      status.className = "formant-v2ex-reply-status";
      const first = document.querySelector("#Main div[id^='r_']");
      first?.parentElement?.insertBefore(status, first);
    }
    status.textContent = text;
    return status;
  }

  function hidePagerLinks() {
    for (const node of document.querySelectorAll(
      "#Main a.page_normal, #Main a.page_current, #Main input.page_input",
    )) {
      if (node instanceof HTMLElement) node.hidden = true;
      if (node instanceof HTMLAnchorElement) node.removeAttribute("href");
    }
  }

  async function expandAll() {
    if (!TOPIC_RE.test(location.pathname)) return;
    const id = topicId();
    if (!id) return;

    const existing = new Map();
    for (const cell of document.querySelectorAll("#Main div[id^='r_']")) {
      existing.set(cell.id, cell);
      lazyImages(cell);
    }
    const parent = existing.size ? existing.values().next().value.parentElement : null;
    if (!parent) return;

    const total = detectPageCount();
    const here = currentPage();
    if (total <= 1) return;

    const missing = [];
    for (let page = 1; page <= total; page += 1) {
      if (page !== here) missing.push(page);
    }
    setStatus(`正在并发加载其余 ${missing.length} 页回复…`);

    let done = 0;
    await mapPool(missing, FETCH_CONCURRENCY, async (page) => {
      try {
        const cells = await fetchPageCells(page, id);
        for (const cell of cells) {
          if (cell.id && !existing.has(cell.id)) existing.set(cell.id, cell);
        }
      } catch (error) {
        console.warn("[formant] V2EX reply page failed", page, error);
      }
      done += 1;
      setStatus(`正在加载回复 ${done}/${missing.length} 页（${FETCH_CONCURRENCY} 路并发）…`);
    });

    const ordered = [...existing.values()].sort((a, b) => floorOf(a) - floorOf(b));
    const firstLive = parent.querySelector("div[id^='r_']");
    const marker = document.createComment("formant-v2ex-replies");
    if (firstLive) parent.insertBefore(marker, firstLive);
    else parent.append(marker);
    const fragment = document.createDocumentFragment();
    for (const cell of ordered) fragment.append(cell);
    marker.after(fragment);
    marker.remove();

    hidePagerLinks();
    setStatus(`已展开全部回复 · ${total} 页 / ${ordered.length} 条（并发拉取，未逐页插入）`);
  }

  globalThis.FormantV2exReplyPages = { expandAll };
})();
