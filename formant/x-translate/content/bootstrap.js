(() => {
  "use strict";

  const FEATURES_KEY = "formantFeatures";
  const SETTINGS_KEY = "formantXTranslate";
  const TARGET_KEY = "translateTarget";
  const listeners = new Set();

  /**
   * @param {unknown} raw
   */
  function isEnabled(raw) {
    const features = raw && typeof raw === "object" ? raw : {};
    return features.xTranslate?.enabled !== false;
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

  /**
   * @param {unknown} raw
   */
  function targetOf(raw) {
    const value = String(raw || "auto").trim();
    if (value === "zh-CN" || value === "en" || value === "auto") return value;
    if (value.toLowerCase().startsWith("zh")) return "zh-CN";
    return "auto";
  }

  let state = {
    enabled: true,
    color: "#8c8c8c",
    textSize: 14,
    target: "auto",
  };

  async function load() {
    const data = await chrome.storage.local.get([FEATURES_KEY, SETTINGS_KEY, TARGET_KEY]);
    const style = styleOf(data[SETTINGS_KEY]);
    state = {
      enabled: isEnabled(data[FEATURES_KEY]),
      color: style.color,
      textSize: style.textSize,
      target: targetOf(data[TARGET_KEY]),
    };
    return state;
  }

  function notify() {
    for (const listener of listeners) listener(state);
  }

  const ready = load().catch((error) => {
    console.warn("[formant] X translate settings unavailable", error);
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
    if (changes[TARGET_KEY]) {
      state.target = targetOf(changes[TARGET_KEY].newValue);
      dirty = true;
    }
    if (dirty) notify();
  });

  globalThis.FormantXTranslateBootstrap = {
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
