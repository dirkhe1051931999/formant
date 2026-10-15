(() => {
  "use strict";

  const FEATURES_KEY = "formantFeatures";
  const listeners = new Set();

  /**
   * @param {unknown} raw
   */
  function isEnabled(raw) {
    const features = raw && typeof raw === "object" ? raw : {};
    return features.linuxdo?.enabled !== false;
  }

  let state = { enabled: true };

  async function load() {
    const data = await chrome.storage.local.get(FEATURES_KEY);
    state = { enabled: isEnabled(data[FEATURES_KEY]) };
    return state;
  }

  function notify() {
    for (const listener of listeners) listener(state);
  }

  const ready = load().catch((error) => {
    console.warn("[formant] linux.do list settings unavailable", error);
    return state;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[FEATURES_KEY]) return;
    const next = isEnabled(changes[FEATURES_KEY].newValue);
    if (next === state.enabled) return;
    state.enabled = next;
    notify();
  });

  globalThis.FormantLinuxdoBootstrap = {
    FEATURES_KEY,
    ready,
    getState: () => state,
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
})();
