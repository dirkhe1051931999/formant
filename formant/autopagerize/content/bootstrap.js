(() => {
  "use strict";

  const FEATURES_KEY = "formantFeatures";
  const SETTINGS_KEY = "formantAutopagerize";
  const DEFAULT_SETTINGS = {
    displayMessageBar: true,
    excludePatterns: "",
    customSiteinfo: [],
  };
  const listeners = new Set();

  const MICROFORMAT = {
    url: ".*",
    nextLink: '//a[@rel="next"] | //link[@rel="next"]',
    insertBefore: '//*[contains(@class, "autopagerize_insert_before")]',
    pageElement: '//*[contains(@class, "autopagerize_page_element")]',
  };

  function normalizeSettings(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const customSiteinfo = Array.isArray(source.customSiteinfo) ? source.customSiteinfo : [];
    return {
      displayMessageBar: source.displayMessageBar !== false,
      excludePatterns: String(source.excludePatterns || ""),
      customSiteinfo: customSiteinfo.filter(
        (item) => item && typeof item === "object" && item.url && item.nextLink && item.pageElement,
      ),
    };
  }

  function isEnabled(raw) {
    const features = raw && typeof raw === "object" ? raw : {};
    return features.autopagerize?.enabled !== false;
  }

  let state = { enabled: true, settings: { ...DEFAULT_SETTINGS } };

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
    console.warn("[formant] AutoPagerize settings unavailable", error);
    return state;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || (!changes[FEATURES_KEY] && !changes[SETTINGS_KEY])) return;
    if (changes[FEATURES_KEY]) state.enabled = isEnabled(changes[FEATURES_KEY].newValue);
    if (changes[SETTINGS_KEY]) state.settings = normalizeSettings(changes[SETTINGS_KEY].newValue);
    notify();
  });

  function wildcardToRegex(str) {
    return "^" + str.replace(/([-()\[\]{}+?.$\^|,:#<!\\])/g, "\\$1").replace(/\x08/g, "\\x08").replace(/\*/g, ".*");
  }

  function isExcluded(patterns) {
    const items = String(patterns || "").split(/[\r\n ]+/).filter(Boolean);
    const regexp = /^\/(.+)\/$/;
    for (const item of items) {
      let pattern;
      if (regexp.test(item)) pattern = item.match(regexp)[1];
      else pattern = wildcardToRegex(item);
      try {
        if (new RegExp(pattern).test(location.href)) return true;
      } catch { continue; }
    }
    return false;
  }

  function relatedHostKind(url) {
    try {
      const next = new URL(url, location.href);
      if (next.origin === location.origin) return "same";
      const a = location.hostname.toLowerCase();
      const b = next.hostname.toLowerCase();
      if (a.includes("google.") && b.includes("google.")) return "google";
      if (a.includes("bing.") && b.includes("bing.")) return "bing";
      return "cross";
    } catch {
      return "cross";
    }
  }

  function fetchViaBackground(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: "FORMANT_AUTOPAGERIZE_FETCH", url },
        (response) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!response || !response.ok) return reject(new Error(response?.error || "fetch failed"));
          resolve({ html: response.html, finalUrl: response.finalUrl || url });
        },
      );
    });
  }

  /**
   * Same-origin next pages are fetched in the content script (tab cookies).
   * Cross-origin (including google.com ↔ google.com.hk) uses the SW bridge.
   */
  async function fetchPage(url) {
    if (relatedHostKind(url) === "same") {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { html: await response.text(), finalUrl: response.url || url };
    }
    return fetchViaBackground(url);
  }

  async function requestSiteinfo() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "FORMANT_AUTOPAGERIZE_SITEINFO", url: location.href },
        (response) => {
          if (chrome.runtime.lastError || !response || !response.ok) return resolve([]);
          resolve(response.siteinfo || []);
        },
      );
    });
  }

  async function launch() {
    if (!state.enabled) return;
    if (window !== window.parent) return;
    const host = location.hostname.toLowerCase();
    if (host === "linux.do" || host.endsWith(".linux.do")) return;
    const settings = state.settings;
    if (settings.excludePatterns && isExcluded(settings.excludePatterns)) return;

    const env = {
      settings: { ...settings, disable: false },
      fetchPage,
      ap: null,
    };

    const core = globalThis.FormantAutopagerizeCore;
    if (!core) return;

    const siteinfo = await requestSiteinfo();
    const builtin = globalThis.FormantAutopagerizeBuiltinSiteinfo || [];
    const lists = [
      Array.isArray(settings.customSiteinfo) ? settings.customSiteinfo : [],
      Array.isArray(builtin) ? builtin : [],
      Array.isArray(siteinfo) ? siteinfo : [],
      [MICROFORMAT],
    ];
    let launched = false;
    const tryLaunch = () => {
      if (env.ap) {
        launched = true;
        return;
      }
      for (const list of lists) {
        if (core.AutoPager.launchAutoPager(list, env)) {
          launched = true;
          break;
        }
      }
    };
    tryLaunch();
    if (!launched) setTimeout(tryLaunch, 2000);
  }

  function applyState(next) {
    state = next;
    if (state.enabled) void launch();
  }

  const api = {
    ready,
    getState: () => state,
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  globalThis.FormantAutopagerizeBootstrap = api;

  api.subscribe(applyState);
  void api.ready.then(applyState);
})();
