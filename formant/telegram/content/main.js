(() => {
  "use strict";

  const bootstrap = globalThis.FormantTelegramBootstrap;
  const overlay = globalThis.FormantTelegramOverlay;
  if (!bootstrap || !overlay) return;

  const CMD = "formant-telegram-cmd";
  const PROG = "formant-telegram-progress";
  const SCAN_MS = 400;
  const DOWNLOAD_ICON = "\ue979";
  const SKIP_CLOSEST = ".sticker, .emoji, .animated-emoji, .avatar, .Avatar, .reply, .replies, .quoted-message";

  /** @type {Map<string, { kind: "image" | "video", getUrl: () => string }>} */
  const targets = new Map();
  let enabled = false;
  let timer = 0;
  let jobSeq = 0;

  /**
   * @param {Record<string, unknown>} detail
   */
  function sendCmd(detail) {
    window.dispatchEvent(new CustomEvent(CMD, { detail }));
  }

  /**
   * @returns {"k" | "a" | "unknown"}
   */
  function flavor() {
    const path = location.pathname || "";
    const host = location.hostname || "";
    if (host.startsWith("webk.") || path.startsWith("/k")) return "k";
    if (host.startsWith("webz.") || path.startsWith("/a")) return "a";
    if (document.querySelector(".media-viewer-whole, .bubbles-inner")) return "k";
    if (document.querySelector("#MediaViewer, .messages-container")) return "a";
    return "unknown";
  }

  /**
   * @param {Element | null} el
   */
  function skipMedia(el) {
    return Boolean(el?.closest(SKIP_CLOSEST));
  }

  /**
   * @param {Element | null} el
   */
  function mediaUrl(el) {
    if (!el) return "";
    if (el instanceof HTMLVideoElement || el instanceof HTMLImageElement) {
      return String(el.currentSrc || el.src || el.querySelector("source")?.src || "").trim();
    }
    const video = el.querySelector("video");
    if (video) return String(video.currentSrc || video.src || video.querySelector("source")?.src || "").trim();
    let best = "";
    let area = 0;
    for (const img of el.querySelectorAll("img")) {
      if (skipMedia(img)) continue;
      const next = (img.naturalWidth || img.width) * (img.naturalHeight || img.height);
      if (next >= area && img.src) {
        area = next;
        best = img.src;
      }
    }
    return best;
  }

  /**
   * @param {Element} el
   */
  function kindOf(el) {
    if (el instanceof HTMLVideoElement || el.querySelector("video")) return "video";
    return "image";
  }

  /**
   * @param {Element} el
   */
  function inView(el) {
    const rect = el.getBoundingClientRect();
    return rect.width >= 72 && rect.height >= 72 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  }

  /**
   * @param {string} text
   */
  function looksDownload(text) {
    const value = String(text || "");
    return /download/i.test(value) || value.includes(DOWNLOAD_ICON);
  }

  /**
   * @param {Element | null} root
   */
  function officialVisible(root) {
    if (!root) return false;
    for (const btn of root.querySelectorAll("button")) {
      if (btn.classList.contains("hide") || btn.hidden) continue;
      if (looksDownload(btn.getAttribute("title") || "") || looksDownload(btn.getAttribute("aria-label") || "") || looksDownload(btn.textContent || "") || btn.classList.contains("tgico-download")) {
        return true;
      }
    }
    return false;
  }

  /**
   * @param {string} id
   * @param {Element} el
   * @param {DOMRectReadOnly} rect
   * @param {Array<{ id: string, top: number, left: number, title: string }>} items
   */
  function pushChip(id, el, rect, items) {
    const kind = kindOf(el);
    targets.set(id, { kind, getUrl: () => mediaUrl(el) });
    items.push({
      id,
      top: Math.max(8, rect.top + 8),
      left: Math.max(8, rect.right - 42),
      title: kind === "video" ? "下载视频" : "下载图片",
    });
  }

  /**
   * @param {Array<{ id: string, top: number, left: number, title: string }>} items
   */
  function scanViewerK(items) {
    const viewer = document.querySelector(".media-viewer-whole");
    if (!(viewer instanceof HTMLElement) || viewer.hidden || viewer.classList.contains("hide")) return false;
    overlay.mount(viewer);
    const buttons = viewer.querySelector(".media-viewer-buttons");
    if (officialVisible(buttons)) return true;
    const media = viewer.querySelector(".media-viewer-aspecter video, .media-viewer-aspecter img.thumbnail, .media-viewer-aspecter img.media-photo, .media-viewer-aspecter img");
    if (!(media instanceof Element) || skipMedia(media) || !mediaUrl(media)) return true;
    pushChip("viewer", media, (buttons || media).getBoundingClientRect(), items);
    return true;
  }

  /**
   * @param {Array<{ id: string, top: number, left: number, title: string }>} items
   */
  function scanViewerA(items) {
    const viewer = document.querySelector("#MediaViewer");
    if (!(viewer instanceof HTMLElement)) return false;
    overlay.mount(viewer);
    const actions = viewer.querySelector(".MediaViewerActions");
    if (officialVisible(actions)) return true;
    const slide = viewer.querySelector(".MediaViewerSlide--active") || viewer;
    const media = slide.querySelector(".VideoPlayer video, .MediaViewerContent video, .MediaViewerContent img, video, img");
    if (!(media instanceof Element) || skipMedia(media) || !mediaUrl(media)) return true;
    pushChip("viewer", media, (actions || media).getBoundingClientRect(), items);
    return true;
  }

  /**
   * @param {string} kind
   * @param {Array<{ id: string, top: number, left: number, title: string }>} items
   */
  function scanBubbles(kind, items) {
    const nodes =
      kind === "k"
        ? document.querySelectorAll(".bubble.no-forwards")
        : document.querySelectorAll(
            ".Message.protect, .Message--protected, .message.protect, [class*='Message'][class*='protect'], .bubble.no-forwards",
          );
    let count = 0;
    for (const bubble of nodes) {
      if (count >= 12) break;
      if (!(bubble instanceof Element)) continue;
      const media =
        bubble.querySelector("video") ||
        largestVisibleImage(bubble);
      if (!(media instanceof Element) || skipMedia(media) || !inView(media)) continue;
      const url = mediaUrl(media);
      if (!url) continue;
      const id = `b-${bubble.getAttribute("data-mid") || bubble.getAttribute("data-message-id") || count}-${Math.round(media.getBoundingClientRect().top)}`;
      pushChip(id, media, media.getBoundingClientRect(), items);
      count += 1;
    }
  }

  /**
   * @param {Element} root
   */
  function largestVisibleImage(root) {
    let best = null;
    let area = 0;
    for (const img of root.querySelectorAll("img")) {
      if (skipMedia(img) || !inView(img)) continue;
      const next = img.getBoundingClientRect();
      const size = next.width * next.height;
      if (size > area) {
        area = size;
        best = img;
      }
    }
    return best;
  }

  function scan() {
    if (!enabled) return;
    targets.clear();
    const items = [];
    const kind = flavor();
    const viewerOpen = kind === "a" ? scanViewerA(items) : scanViewerK(items);
    if (!viewerOpen) overlay.mount(document.documentElement);
    if (kind !== "unknown" && !viewerOpen) scanBubbles(kind === "a" ? "a" : "k", items);
    overlay.syncButtons(items);
  }

  overlay.onClick((id) => {
    const target = targets.get(id);
    if (!target) return;
    const url = target.getUrl();
    if (!url) return;
    jobSeq += 1;
    sendCmd({
      type: "DOWNLOAD",
      jobId: `tg-${jobSeq}`,
      kind: target.kind,
      url,
    });
  });

  window.addEventListener(PROG, (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (!detail || typeof detail !== "object") return;
    overlay.setProgress(String(detail.jobId || ""), {
      name: String(detail.name || ""),
      pct: Number(detail.pct) || 0,
      status: String(detail.status || "running"),
      message: String(detail.message || ""),
    });
  });

  function start() {
    if (timer) return;
    scan();
    timer = window.setInterval(scan, SCAN_MS);
  }

  function stop() {
    window.clearInterval(timer);
    timer = 0;
    targets.clear();
    overlay.clear();
  }

  /**
   * @param {{ enabled: boolean }} state
   */
  function apply(state) {
    enabled = state.enabled === true;
    sendCmd({ type: "SET_ENABLED", enabled });
    if (enabled) start();
    else stop();
  }

  void bootstrap.ready.then(apply);
  bootstrap.subscribe(apply);
})();
