(() => {
  "use strict";

  const NAV_KEY = "formantHupuNav";
  const MAX_FETCH_PAGES = 10;
  const CACHE_MS = 2 * 60 * 60 * 1000;
  const THREAD_HREF_RE = /^\/(\d+)(?:-\d+)?\.html/i;

  /**
   * @param {string} href
   */
  function tidFromHref(href) {
    const path = String(href || "").replace(/^https?:\/\/bbs\.hupu\.com/i, "");
    const match = path.match(THREAD_HREF_RE);
    return match ? match[1] : "";
  }

  /**
   * @param {string} pathname
   * @returns {{ board: string, sort: string, page: number } | null}
   */
  function parseBoardPath(pathname) {
    const raw = decodeURIComponent(String(pathname || "")).replace(/\/+$/, "");
    if (!raw || raw === "/") return null;
    if (THREAD_HREF_RE.test(raw)) return null;
    const segs = raw.slice(1).split("-").filter(Boolean);
    if (!segs.length) return null;
    let page = 1;
    let parts = segs;
    if (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 1])) {
      page = Number(parts[parts.length - 1]);
      parts = parts.slice(0, -1);
    }
    let sort = "";
    const last = parts[parts.length - 1];
    if (last === "postdate" || last === "hot") {
      sort = last;
      parts = parts.slice(0, -1);
    }
    const board = parts.join("-");
    if (!board || /^all-/i.test(board)) return null;
    return { board, sort, page };
  }

  /**
   * @param {string} board
   * @param {string} sort
   * @param {number} page
   */
  function boardUrl(board, sort, page) {
    let path = `/${board}`;
    if (sort === "postdate") path += "-postdate";
    else if (sort === "hot") path += "-hot";
    if (page > 1) path += `-${page}`;
    return path;
  }

  /**
   * @param {ParentNode} root
   */
  function collectThreads(root) {
    /** @type {{ tid: string, title: string, url: string }[]} */
    const threads = [];
    const seen = new Set();
    for (const node of root.querySelectorAll("a.p-title[href]")) {
      const href = node.getAttribute("href") || "";
      const tid = tidFromHref(href);
      if (!tid || seen.has(tid)) continue;
      seen.add(tid);
      threads.push({
        tid,
        title: (node.textContent || "").replace(/\s+/g, " ").trim(),
        url: href.startsWith("http") ? href : `https://bbs.hupu.com${href}`,
      });
    }
    return threads;
  }

  /**
   * @param {ParentNode} root
   */
  function readActivePage(root) {
    const active = root.querySelector(".hupu-rc-pagination-item-active");
    const n = active ? Number((active.textContent || "").replace(/\D/g, "")) : 0;
    return n > 0 ? n : 0;
  }

  /**
   * @param {ParentNode} root
   */
  function boardFromCrumbs(root) {
    const crumbs = [...root.querySelectorAll("[class*='breadcrumb'] a[href]")];
    for (let i = crumbs.length - 1; i >= 0; i -= 1) {
      const href = crumbs[i].getAttribute("href") || "";
      const parsed = parseBoardPath(href.replace(/^https?:\/\/bbs\.hupu\.com/i, ""));
      if (parsed) return parsed.board;
    }
    return "";
  }

  /**
   * @returns {Promise<{ board: string, sort: string, pages: Record<string, {tid:string,title:string,url:string}[]>, savedAt: number } | null>}
   */
  async function loadCache() {
    const data = await chrome.storage.local.get(NAV_KEY);
    const raw = data[NAV_KEY];
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.board !== "string" || !raw.board) return null;
    if (typeof raw.savedAt !== "number" || Date.now() - raw.savedAt > CACHE_MS) return null;
    const pages = raw.pages && typeof raw.pages === "object" ? raw.pages : {};
    return {
      board: raw.board,
      sort: typeof raw.sort === "string" ? raw.sort : "",
      pages: /** @type {Record<string, any>} */ (pages),
      savedAt: raw.savedAt,
    };
  }

  /**
   * @param {{ board: string, sort: string, pages: Record<string, any[]>, savedAt: number }} cache
   */
  async function saveCache(cache) {
    await chrome.storage.local.set({ [NAV_KEY]: cache });
  }

  /**
   * @param {string} board
   * @param {string} sort
   * @param {number} page
   */
  async function fetchBoardPage(board, sort, page) {
    const path = boardUrl(board, sort, page);
    const res = await fetch(path, { credentials: "same-origin" });
    if (!res.ok) return [];
    const html = await res.text();
    return collectThreads(new DOMParser().parseFromString(html, "text/html"));
  }

  /**
   * @param {{ pages: Record<string, any[]> }} cache
   * @param {string} tid
   */
  function findInCache(cache, tid) {
    const nums = Object.keys(cache.pages)
      .map(Number)
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    for (const page of nums) {
      const list = cache.pages[String(page)];
      if (!Array.isArray(list)) continue;
      const index = list.findIndex((item) => item && item.tid === tid);
      if (index >= 0) return { page, index, list };
    }
    return null;
  }

  /**
   * @param {{ board: string, sort: string, pages: Record<string, any[]>, savedAt: number }} cache
   * @param {number} page
   */
  async function ensurePage(cache, page) {
    const key = String(page);
    if (Array.isArray(cache.pages[key]) && cache.pages[key].length) return cache.pages[key];
    const list = await fetchBoardPage(cache.board, cache.sort, page);
    cache.pages[key] = list;
    cache.savedAt = Date.now();
    return list;
  }

  /**
   * 详情页没有列表上下文时，按板块「最新回复」往下翻页，直到找到当前 tid。
   * @param {string} board
   * @param {string} sort
   * @param {string} tid
   */
  async function resolveNeighbors(board, sort, tid) {
    let cache = await loadCache();
    if (cache && cache.board === board) {
      sort = sort || cache.sort || "";
      cache.sort = sort;
    } else {
      cache = { board, sort: sort || "", pages: {}, savedAt: Date.now() };
    }
    let hit = findInCache(cache, tid);
    if (!hit) {
      for (let page = 1; page <= MAX_FETCH_PAGES; page += 1) {
        await ensurePage(cache, page);
        hit = findInCache(cache, tid);
        if (hit) break;
      }
    }
    if (!hit) {
      await saveCache(cache);
      return {
        prev: null,
        next: { tid: "", title: "打开板块列表", url: `https://bbs.hupu.com${boardUrl(board, sort, 1)}` },
        found: false,
        board,
        sort,
      };
    }
    let prev = hit.index > 0 ? hit.list[hit.index - 1] : null;
    let next = hit.index < hit.list.length - 1 ? hit.list[hit.index + 1] : null;
    if (!prev && hit.page > 1) {
      const older = await ensurePage(cache, hit.page - 1);
      prev = older.length ? older[older.length - 1] : null;
    }
    if (!next) {
      const newer = await ensurePage(cache, hit.page + 1);
      next = newer.length ? newer[0] : null;
    }
    await saveCache(cache);
    return { prev, next, found: true, board, sort };
  }

  /**
   * @param {Document} root
   */
  async function persistVisibleList(root) {
    const parsed = parseBoardPath(location.pathname);
    if (!parsed) return;
    const threads = collectThreads(root);
    if (!threads.length) return;
    const page = readActivePage(root) || parsed.page;
    let cache = await loadCache();
    if (!cache || cache.board !== parsed.board || cache.sort !== parsed.sort) {
      cache = { board: parsed.board, sort: parsed.sort, pages: {}, savedAt: Date.now() };
    }
    cache.pages[String(page)] = threads;
    cache.savedAt = Date.now();
    await saveCache(cache);
  }

  globalThis.FormantHupuNavLib = {
    NAV_KEY,
    tidFromHref,
    parseBoardPath,
    boardUrl,
    collectThreads,
    boardFromCrumbs,
    persistVisibleList,
    resolveNeighbors,
  };
})();
