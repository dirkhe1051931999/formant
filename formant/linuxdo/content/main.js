(() => {
  "use strict";

  const bootstrap = globalThis.FormantLinuxdoBootstrap;
  if (!bootstrap) return;

  const ROOT_CLASS = "formant-linuxdo";
  const LIST_CLASS = "formant-linuxdo-list";
  const TOPIC_CLASS = "formant-linuxdo-topic";
  const DARK_CLASS = "formant-linuxdo-dark";
  const LABEL_CLASS = "formant-linuxdo-col";
  const HIDE_CLASS = "formant-linuxdo-hide";
  const REPLY_FAB_CLASS = "formant-linuxdo-reply";
  const NATIVE_REPLY_SEL = [
    ".topic-navigation button.create",
    ".timeline-footer-controls button.create",
    "#topic-progress-wrapper button.create",
    "#topic-footer-buttons button.create",
    "#topic-footer-buttons .btn-primary.create",
    ".topic-post .post-menu-area button.reply",
    ".topic-post .post-menu-area button.create",
  ].join(", ");
  const LOCALE_RE = /^(ZH|EN|JA|KO|CN|TW|语言)$/i;
  const COLUMN_LABELS = [
    ["th.default, th.main-link", "标题"],
    ["th.posters", "所有者"],
    ["th.posts", "回复"],
    ["th.views", "浏览"],
    ["th.activity", "最近活跃"],
  ];

  let enabled = false;
  let scheduled = false;
  let watching = false;
  /** @type {MutationObserver | null} */
  let observer = null;
  /** @type {MediaQueryList | null} */
  let colorMedia = null;

  function isTopicPath() {
    return /^\/t\//i.test(location.pathname);
  }

  function isSearchPath() {
    return /^\/search/i.test(location.pathname);
  }

  function hasTopicList() {
    return Boolean(document.querySelector(".topic-list"));
  }

  function hasSearchUi() {
    return Boolean(
      document.querySelector(
        ".search-menu .results, .search-menu-panel .results, .search-menu-container .results, .fps-result, .search-container .search-results",
      ),
    );
  }

  function isDarkMode() {
    const darkLink = document.querySelector("link.dark-scheme");
    if (!darkLink) return false;
    if (darkLink.media === "all") return true;
    if (darkLink.media === "none") return false;
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  }

  function makeColumnLabels() {
    for (const [selector, label] of COLUMN_LABELS) {
      for (const cell of document.querySelectorAll(`.topic-list-header ${selector}`)) {
        let span = cell.querySelector(`:scope > .${LABEL_CLASS}`);
        if (!span) {
          span = document.createElement("span");
          span.className = LABEL_CLASS;
          cell.prepend(span);
        }
        if (span.textContent !== label) span.textContent = label;
      }
    }
  }

  function clearColumnLabels() {
    document.querySelectorAll(`.${LABEL_CLASS}`).forEach((node) => node.remove());
  }

  function clearHideMarks() {
    document.querySelectorAll(`.${HIDE_CLASS}`).forEach((node) => node.classList.remove(HIDE_CLASS));
  }

  /**
   * @param {Element} node
   */
  function compactText(node) {
    return (node.textContent || "").replace(/\s+/g, " ").trim();
  }

  function markHeaderLocale() {
    for (const node of document.querySelectorAll(".d-header button, .d-header a")) {
      const text = compactText(node).replace(/\s+/g, "");
      if (!LOCALE_RE.test(text)) continue;
      const wrap = node.closest("li, .header-dropdown-toggle") || node;
      wrap.classList.add(HIDE_CLASS);
    }
  }

  function markTopicChrome() {
    for (const node of document.querySelectorAll(".topic-body span, .topic-body a, .topic-meta-data span")) {
      const text = compactText(node);
      if (text !== "TOPIC OWNER" && text !== "楼主") continue;
      node.classList.add(HIDE_CLASS);
    }

    for (const node of document.querySelectorAll("h2, h3")) {
      if (node.closest(".cooked, .d-header, .sidebar-wrapper, #reply-control")) continue;
      if (!compactText(node).includes("相关话题")) continue;
      const wrap =
        node.closest(
          "#suggested-topics, .suggested-topics, .more-topics, .more-topics__container, .related-topics, section, aside",
        ) || node;
      if (wrap !== document.body) wrap.classList.add(HIDE_CLASS);
    }

    for (const node of document.querySelectorAll("#main-outlet span, #main-outlet p, #main-outlet a, .cooked span, .cooked p, .cooked a")) {
      if (node.closest(".d-header, .sidebar-wrapper, #reply-control, .topic-list")) continue;
      const text = compactText(node);
      if (text.length > 40) continue;
      if (
        (text.includes("LINUX DO") && text.includes("能力越大")) ||
        (text.includes("能力越大") && text.includes("责任越大"))
      ) {
        (node.closest("p, a, aside, figure") || node.parentElement || node).classList.add(HIDE_CLASS);
      }
    }

    for (const img of document.querySelectorAll(".topic-body img, #topic-title img")) {
      if (img.closest(".topic-avatar, .d-header, .sidebar-wrapper")) continue;
      const alt = String(img.getAttribute("alt") || "");
      const src = String(img.getAttribute("src") || "");
      if (/能力越大|责任越大|LINUX DO/i.test(`${alt} ${src}`)) {
        (img.closest("p, a, figure, div.lightbox-wrapper") || img).classList.add(HIDE_CLASS);
        continue;
      }
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w >= 300 && h > 0 && h <= 180 && w / h >= 4) {
        (img.closest("p, a, figure, div.lightbox-wrapper") || img).classList.add(HIDE_CLASS);
      }
    }

    for (const img of document.querySelectorAll(".topic-post img.avatar")) {
      if (img.closest(".topic-avatar, .cooked, .d-header, .names, .post-menu-area")) continue;
      const wrap = img.closest("button, a, li") || img.parentElement;
      if (!wrap) continue;
      const row = wrap.parentElement;
      if (row && compactText(row).length < 160) row.classList.add(HIDE_CLASS);
      else wrap.classList.add(HIDE_CLASS);
    }

    for (const icon of document.querySelectorAll(
      ".topic-body .d-icon-rocket, #topic-title .d-icon-rocket, .topic-body .fa-rocket, .topic-body [data-icon='rocket']",
    )) {
      if (icon.closest(".cooked, .post-menu-area")) continue;
      const wrap = icon.closest("button, a, li") || icon.parentElement;
      wrap?.classList.add(HIDE_CLASS);
    }
  }

  function markSidebarChrome() {
    for (const node of document.querySelectorAll(
      ".sidebar-wrapper a, .sidebar-wrapper button, .sidebar-footer-wrapper a, .sidebar-footer-wrapper button",
    )) {
      const text = compactText(node);
      if (!/^聊天/.test(text) && !/^Default\b/i.test(text)) continue;
      const wrap = node.closest(".sidebar-section-link-wrapper, li, .select-kit, .combo-box") || node;
      wrap.classList.add(HIDE_CLASS);
    }
  }

  function nativeReplyButton() {
    return document.querySelector(NATIVE_REPLY_SEL);
  }

  function removeReplyFab() {
    document.querySelectorAll(`button.${REPLY_FAB_CLASS}`).forEach((node) => node.remove());
  }

  /**
   * @param {MouseEvent} event
   */
  function onReplyFabClick(event) {
    event.preventDefault();
    event.stopPropagation();
    nativeReplyButton()?.click();
  }

  function ensureReplyFab() {
    if (!enabled || !isTopicPath()) {
      removeReplyFab();
      return;
    }
    if (document.querySelector(`button.${REPLY_FAB_CLASS}`)) return;
    const fab = document.createElement("button");
    fab.type = "button";
    fab.className = REPLY_FAB_CLASS;
    fab.textContent = "回复";
    fab.setAttribute("aria-label", "回复");
    fab.addEventListener("click", onReplyFabClick);
    (document.body || document.documentElement).appendChild(fab);
  }

  function teardownSkin() {
    document.documentElement.classList.remove(ROOT_CLASS, LIST_CLASS, TOPIC_CLASS, DARK_CLASS);
    clearColumnLabels();
    clearHideMarks();
    removeReplyFab();
  }

  /** 列表行 + 顶栏/全页搜索结果（不含分类/用户等非帖子链） */
  const TOPIC_OPEN_SCOPE =
    ".topic-list-item, .search-menu, .search-menu-panel, .search-menu-container, .header-search, .fps-result, .search-results";

  /**
   * @param {HTMLAnchorElement} anchor
   */
  function topicOpenHref(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) return "";
    if (!anchor.closest(TOPIC_OPEN_SCOPE)) return "";
    const href = String(anchor.getAttribute("href") || "");
    if (!/^\/t\//i.test(href) && !/^https?:\/\/[^/]+\/t\//i.test(href)) return "";
    return anchor.href || "";
  }

  /**
   * 列表 / 搜索点帖子：window.open _blank，避免 Discourse SPA 同页跳转。
   * @param {MouseEvent} event
   */
  function onTopicOpenClick(event) {
    if (!enabled) return;
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a");
    if (!anchor) return;
    const url = topicOpenHref(anchor);
    if (!url) return;
    event.preventDefault();
    event.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function apply() {
    if (!enabled) {
      teardownSkin();
      return;
    }
    const onTopic = isTopicPath();
    const onList = !onTopic && hasTopicList();
    const onSearch = isSearchPath() || hasSearchUi();
    const active = onList || onTopic || onSearch;
    document.documentElement.classList.toggle(ROOT_CLASS, active);
    document.documentElement.classList.toggle(LIST_CLASS, onList);
    document.documentElement.classList.toggle(TOPIC_CLASS, onTopic);
    document.documentElement.classList.toggle(DARK_CLASS, active && isDarkMode());
    if (onList) makeColumnLabels();
    else clearColumnLabels();
    if (active) {
      markHeaderLocale();
      markSidebarChrome();
      if (onTopic) markTopicChrome();
    } else {
      clearHideMarks();
    }
    if (onTopic) ensureReplyFab();
    else removeReplyFab();
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }

  function onColorChange() {
    scheduleApply();
  }

  function startWatchers() {
    if (watching) return;
    watching = true;
    observer = new MutationObserver(scheduleApply);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    try {
      colorMedia = window.matchMedia("(prefers-color-scheme: dark)");
      if (colorMedia.addEventListener) colorMedia.addEventListener("change", onColorChange);
      else if (colorMedia.addListener) colorMedia.addListener(onColorChange);
    } catch {
      colorMedia = null;
    }
    document.addEventListener("click", onTopicOpenClick, true);
    window.addEventListener("popstate", scheduleApply);
    window.addEventListener("hashchange", scheduleApply);
  }

  function stopWatchers() {
    if (!watching) return;
    watching = false;
    observer?.disconnect();
    observer = null;
    if (colorMedia) {
      if (colorMedia.removeEventListener) colorMedia.removeEventListener("change", onColorChange);
      else if (colorMedia.removeListener) colorMedia.removeListener(onColorChange);
      colorMedia = null;
    }
    document.removeEventListener("click", onTopicOpenClick, true);
    window.removeEventListener("popstate", scheduleApply);
    window.removeEventListener("hashchange", scheduleApply);
  }

  /**
   * @param {{ enabled: boolean }} state
   */
  function sync(state) {
    enabled = Boolean(state.enabled);
    if (enabled) {
      startWatchers();
      scheduleApply();
      return;
    }
    stopWatchers();
    teardownSkin();
  }

  bootstrap.subscribe(sync);
  void bootstrap.ready.then(sync);
})();
