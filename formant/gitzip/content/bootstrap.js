(() => {
  "use strict";

  const FEATURES_KEY = "formantFeatures";
  const SETTINGS_KEY = "formantGitzip";
  const DEFAULT_SETTINGS = {
    selectBehaviour: "both",
    theme: "default",
  };
  const listeners = new Set();

  /**
   * @param {unknown} raw
   */
  function normalizeSettings(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const selectBehaviour = ["both", "single-check", "double-click"].includes(source.selectBehaviour)
      ? source.selectBehaviour
      : DEFAULT_SETTINGS.selectBehaviour;
    const theme = ["default", "light", "dark"].includes(source.theme)
      ? source.theme
      : DEFAULT_SETTINGS.theme;
    return { selectBehaviour, theme };
  }

  /**
   * @param {unknown} raw
   */
  function isEnabled(raw) {
    const features = raw && typeof raw === "object" ? raw : {};
    return features.gitzip?.enabled !== false;
  }

  let state = {
    enabled: true,
    settings: { ...DEFAULT_SETTINGS },
  };

  async function load() {
    const data = await chrome.storage.local.get([FEATURES_KEY, SETTINGS_KEY]);
    state = {
      enabled: isEnabled(data[FEATURES_KEY]),
      settings: normalizeSettings(data[SETTINGS_KEY]),
    };
    return state;
  }

  function notify() {
    for (const listener of listeners) listener(state);
  }

  const ready = load().catch((error) => {
    console.warn("[formant] GitZip settings unavailable", error);
    return state;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || (!changes[FEATURES_KEY] && !changes[SETTINGS_KEY])) return;
    if (changes[FEATURES_KEY]) state.enabled = isEnabled(changes[FEATURES_KEY].newValue);
    if (changes[SETTINGS_KEY]) state.settings = normalizeSettings(changes[SETTINGS_KEY].newValue);
    notify();
  });

  globalThis.FormantGitzipBootstrap = {
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
