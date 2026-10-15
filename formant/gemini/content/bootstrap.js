(() => {
  const FEATURES_KEY = "formantFeatures";
  const SETTINGS = "formant-gemini-settings";
  const ASK = "formant-gemini-get-settings";
  const PROCESS = "formant-gemini-process";
  const RESULT = "formant-gemini-result";

  let enabled = true;
  /** @type {Map<string, Promise<Blob>>} */
  const inflight = new Map();

  /**
   * @param {unknown} raw
   */
  function isEnabled(raw) {
    const features = raw && typeof raw === "object" ? raw : {};
    return features.gemini?.enabled !== false;
  }

  function publish() {
    window.postMessage({ type: SETTINGS, enabled }, "*");
  }

  async function load() {
    const data = await chrome.storage.local.get(FEATURES_KEY);
    enabled = isEnabled(data[FEATURES_KEY]);
    publish();
  }

  /**
   * @param {string} url
   */
  function isGeminiImage(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") return false;
      const host = parsed.hostname;
      if (host !== "googleusercontent.com" && !host.endsWith(".googleusercontent.com")) return false;
      const segment = parsed.pathname.split("/").filter(Boolean)[0] || "";
      return segment === "gg" || segment.startsWith("gg-") || segment.startsWith("rd-");
    } catch {
      return false;
    }
  }

  /**
   * @param {string} url
   */
  function processUrl(url) {
    const existing = inflight.get(url);
    if (existing) return existing;
    const job = (async () => {
      const fetched = await chrome.runtime.sendMessage({ type: "FORMANT_GEMINI_FETCH", url });
      if (!fetched?.ok || !fetched.buffer) {
        throw new Error(fetched?.error || "拉取成图失败");
      }
      const blob = new Blob([fetched.buffer], { type: fetched.mime || "image/png" });
      return globalThis.FormantGeminiRemove.removeFromBlob(blob);
    })().finally(() => {
      if (inflight.get(url) === job) inflight.delete(url);
    });
    inflight.set(url, job);
    return job;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[FEATURES_KEY]) return;
    const next = isEnabled(changes[FEATURES_KEY].newValue);
    if (next === enabled) return;
    enabled = next;
    publish();
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data.type !== "string") return;
    if (data.type === ASK) {
      publish();
      return;
    }
    if (data.type !== PROCESS) return;
    const requestId = typeof data.requestId === "string" ? data.requestId : "";
    const url = typeof data.url === "string" ? data.url : "";
    if (!requestId) return;

    if (!enabled || !isGeminiImage(url)) {
      window.postMessage({ type: RESULT, requestId, ok: false }, "*");
      return;
    }

    void processUrl(url)
      .then(async (blob) => {
        const buffer = await blob.arrayBuffer();
        const payload = { type: RESULT, requestId, ok: true, mime: "image/png", buffer };
        try {
          window.postMessage(payload, "*", [buffer]);
        } catch {
          window.postMessage(payload, "*");
        }
      })
      .catch((error) => {
        console.warn("[formant] gemini watermark removal failed", error);
        window.postMessage({ type: RESULT, requestId, ok: false }, "*");
      });
  });

  void load().catch((error) => {
    console.warn("[formant] gemini settings unavailable", error);
    publish();
  });
})();
