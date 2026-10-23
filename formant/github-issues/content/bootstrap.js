(() => {
  "use strict";

  const FEATURES_KEY = "formantFeatures";
  const SETTINGS_KEY = "formantXTranslate";
  const listeners = new Set();

  /**
   * @param {unknown} raw
   */
  function isEnabled(raw) {
    const features = raw && typeof raw === "object" ? raw : {};
    return features.githubIssues?.enabled !== false;
  }

  /**
   * @param {unknown} raw
   */
  function styleOf(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const color = typeof src.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(src.color) ? src.color.toLowerCase() : "#8c8c8c";
    const size = Math.round(Number(src.textSize));
    const textSize = Number.isFinite(size) ? Math.min(24, Math.max(10, size)) : 14;
    return { color, textSize };
  }

  let state = {
    enabled: true,
    color: "#8c8c8c",
    textSize: 14,
  };

  async function load() {
    const data = await chrome.storage.local.get([FEATURES_KEY, SETTINGS_KEY]);
    const style = styleOf(data[SETTINGS_KEY]);
    state = {
      enabled: isEnabled(data[FEATURES_KEY]),
      color: style.color,
      textSize: style.textSize,
    };
    return state;
  }

  function notify() {
    for (const listener of listeners) listener(state);
  }

  const ready = load().catch((error) => {
    console.warn("[formant] GitHub issues translate settings unavailable", error);
    return state;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let dirty = false;
    if (changes[FEATURES_KEY]) {
      state.enabled = isEnabled(changes[FEATURES_KEY].newValue);
      dirty = true;
    }
    if (changes[SETTINGS_KEY]) {
      const style = styleOf(changes[SETTINGS_KEY].newValue);
      state.color = style.color;
      state.textSize = style.textSize;
      dirty = true;
    }
    if (dirty) notify();
  });

  globalThis.FormantGithubIssuesBootstrap = {
    FEATURES_KEY,
    SETTINGS_KEY,
    ready,
    getState: () => state,
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
})();
