(() => {
  "use strict";

  const bootstrap = globalThis.FormantHupuBootstrap;
  if (!bootstrap) return;

  const ROOT_CLASS = bootstrap.ROOT_CLASS || "formant-hupu";
  const THREAD_CLASS = bootstrap.THREAD_CLASS || "formant-hupu-thread";
  const OFF_CLASS = bootstrap.OFF_CLASS || "formant-hupu-off";
  const IMG_CLASSES = ["formant-hupu-emoji", "formant-hupu-sticker", "formant-hupu-photo"];
  const THREAD_PATH_RE = /^\/\d+(?:-\d+)?\.html/i;
  /** 帖子正文 / 引用里的图片；头像、占位图、站点图标不处理 */
  const CONTENT_IMG_SELECTOR = ".thread-content-detail img, [class*='simple-detail'] img";
  const SKIP_IMG_SELECTOR = ".seo-dom, .placeholder-img, .avatar-placeholder";

  /** 最长边小于它：当行内小表情 */
  const EMOJI_MAX_SIDE = 64;
  /** 最长边不超过它且长宽比不夸张：当表情包，统一高度 */
  const STICKER_MAX_SIDE = 480;
  const STICKER_MAX_RATIO = 2;

  let enabled = true;
  let scheduled = false;
  let watching = false;
  /** @type {MutationObserver | null} */
  let observer = null;

  function isThreadPath() {
    return THREAD_PATH_RE.test(location.pathname);
  }

  /**
   * @param {HTMLImageElement} img
   */
  function classifyImage(img) {
    if (img.closest(SKIP_IMG_SELECTOR)) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!img.complete || !w || !h) return;
    const side = Math.max(w, h);
    const ratio = side / Math.min(w, h);
    let next = "formant-hupu-photo";
    if (img.classList.contains("hupu-custom-emoji") || side < EMOJI_MAX_SIDE) {
      next = "formant-hupu-emoji";
    } else if (side <= STICKER_MAX_SIDE && ratio <= STICKER_MAX_RATIO) {
      next = "formant-hupu-sticker";
    }
    if (img.classList.contains(next)) return;
    img.classList.remove(...IMG_CLASSES);
    img.classList.add(next);
  }

  function classifyImages() {
    for (const img of document.querySelectorAll(CONTENT_IMG_SELECTOR)) {
      if (img instanceof HTMLImageElement) classifyImage(img);
    }
  }

  function clearImageMarks() {
    for (const cls of IMG_CLASSES) {
      document.querySelectorAll(`.${cls}`).forEach((node) => node.classList.remove(cls));
    }
  }

  function teardownSkin() {
    document.documentElement.classList.add(OFF_CLASS);
    document.documentElement.classList.remove(ROOT_CLASS, THREAD_CLASS);
    clearImageMarks();
  }

  /**
   * 图片是懒加载的，load 不冒泡，只能捕获阶段接。
   * @param {Event} event
   */
  function onImageLoad(event) {
    if (!enabled) return;
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;
    if (!target.matches(CONTENT_IMG_SELECTOR)) return;
    classifyImage(target);
  }

  function apply() {
    if (!enabled) {
      teardownSkin();
      return;
    }
    const onThread = isThreadPath();
    document.documentElement.classList.remove(OFF_CLASS);
    document.documentElement.classList.add(ROOT_CLASS);
    document.documentElement.classList.toggle(THREAD_CLASS, onThread);
    if (onThread) classifyImages();
    else clearImageMarks();
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }

  function startWatchers() {
    if (watching) return;
    watching = true;
    observer = new MutationObserver(scheduleApply);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener("load", onImageLoad, true);
    window.addEventListener("popstate", scheduleApply);
  }

  function stopWatchers() {
    if (!watching) return;
    watching = false;
    observer?.disconnect();
    observer = null;
    document.removeEventListener("load", onImageLoad, true);
    window.removeEventListener("popstate", scheduleApply);
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

  startWatchers();
  apply();
  bootstrap.subscribe(sync);
  void bootstrap.ready.then(sync);
})();
