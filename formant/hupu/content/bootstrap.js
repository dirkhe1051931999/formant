(() => {
  "use strict";

  const FEATURES_KEY = "formantFeatures";
  const ROOT_CLASS = "formant-hupu";
  const THREAD_CLASS = "formant-hupu-thread";
  const OFF_CLASS = "formant-hupu-off";
  const THREAD_PATH_RE = /^\/\d+(?:-\d+)?\.html/i;
  const listeners = new Set();

  /**
   * 默认开启：首屏就挂 class，不等 storage。关了再标 formant-hupu-off。
   * @param {boolean} on
   */
  function paintClasses(on) {
    const html = document.documentElement;
    html.classList.toggle(OFF_CLASS, !on);
    html.classList.toggle(ROOT_CLASS, on);
    html.classList.toggle(THREAD_CLASS, on && THREAD_PATH_RE.test(location.pathname));
  }

  paintClasses(true);

  /**
   * @param {unknown} raw
   */
  function isEnabled(raw) {
    const features = raw && typeof raw === "object" ? raw : {};
    return features.hupu?.enabled !== false;
  }

  let state = { enabled: true };

  async function load() {
    const data = await chrome.storage.local.get(FEATURES_KEY);
    state = { enabled: isEnabled(data[FEATURES_KEY]) };
    paintClasses(state.enabled);
    return state;
  }

  function notify() {
    for (const listener of listeners) listener(state);
  }

  const ready = load().catch((error) => {
    console.warn("[formant] hupu settings unavailable", error);
    return state;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[FEATURES_KEY]) return;
    const next = isEnabled(changes[FEATURES_KEY].newValue);
    if (next === state.enabled) return;
    state.enabled = next;
    paintClasses(next);
    notify();
  });

  globalThis.FormantHupuBootstrap = {
    FEATURES_KEY,
    ROOT_CLASS,
    THREAD_CLASS,
    OFF_CLASS,
    ready,
    getState: () => state,
    paintClasses,
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
})();
