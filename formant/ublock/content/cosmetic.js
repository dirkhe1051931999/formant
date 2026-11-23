(() => {
  if (window.__FORMANT_UBO_COSMETIC__) return;
  window.__FORMANT_UBO_COSMETIC__ = true;

  let enabled = true;
  let genericEnabled = false;
  const knownKeys = new Set();
  const styles = new Map();
  let pendingKeys = new Set();
  let scheduled = false;
  let observer;

  function send(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response);
      });
    });
  }

  function setCss(id, css) {
    if (!css || !enabled) return;
    let style = styles.get(id);
    if (!style) {
      style = document.createElement("style");
      style.dataset.formantUbo = id;
      styles.set(id, style);
    }
    style.textContent += css;
    if (!style.isConnected) (document.head || document.documentElement)?.append(style);
  }

  function collectKeys(node) {
    if (!(node instanceof Element) || !genericEnabled) return;
    const add = (el) => {
      if (el.id && !knownKeys.has(`#${el.id}`)) pendingKeys.add(`#${el.id}`);
      for (const name of el.classList) {
        if (!knownKeys.has(`.${name}`)) pendingKeys.add(`.${name}`);
      }
    };
    add(node);
    node.querySelectorAll("[id], [class]").forEach(add);
  }

  async function flushKeys() {
    scheduled = false;
    if (!enabled || pendingKeys.size === 0) return;
    const keys = [...pendingKeys].slice(0, 1000);
    for (const key of keys) {
      pendingKeys.delete(key);
      knownKeys.add(key);
    }
    const response = await send({ type: "FORMANT_UBLOCK_GENERIC", keys });
    if (enabled && response?.css) setCss("generic", response.css);
    if (pendingKeys.size) schedule();
  }

  function schedule() {
    if (scheduled || !enabled) return;
    scheduled = true;
    setTimeout(flushKeys, 120);
  }

  async function loadRules() {
    const response = await send({ type: "FORMANT_UBLOCK_PAGE_RULES" });
    if (!enabled || !response?.ok) return;
    genericEnabled = response.genericEnabled;
    setCss("specific", response.specific);
    setCss("generic-high", response.genericHigh);
    if (genericEnabled && document.documentElement) {
      collectKeys(document.documentElement);
      schedule();
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "FORMANT_UBLOCK_RULES_UPDATED" && enabled) {
      for (const style of styles.values()) style.remove();
      styles.clear();
      knownKeys.clear();
      pendingKeys.clear();
      void loadRules();
      return;
    }
    if (message?.type !== "FORMANT_UBLOCK_SET_ENABLED") return;
    enabled = Boolean(message.enabled);
    if (!enabled) {
      observer?.disconnect();
      for (const style of styles.values()) style.remove();
      styles.clear();
      knownKeys.clear();
      pendingKeys.clear();
      return;
    }
    observe();
    void loadRules();
  });

  function observe() {
    if (!document.documentElement) return;
    observer?.disconnect();
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") collectKeys(mutation.target);
        for (const node of mutation.addedNodes) collectKeys(node);
      }
      schedule();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "id"],
    });
  }

  function start() {
    observe();
    void loadRules();
  }
  if (document.documentElement) start();
  else document.addEventListener("readystatechange", start, { once: true });
})();
