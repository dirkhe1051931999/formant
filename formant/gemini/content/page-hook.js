(() => {
  const SETTINGS = "formant-gemini-settings";
  const ASK = "formant-gemini-get-settings";
  const PROCESS = "formant-gemini-process";
  const RESULT = "formant-gemini-result";

  let enabled = true;
  let seq = 0;
  /** @type {Map<string, { resolve: (value: { buffer: ArrayBuffer, mime?: string }) => void, reject: (error: Error) => void }>} */
  const pending = new Map();
  const originalFetch = window.fetch.bind(window);

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
   * Upgrade a resized Gemini CDN url to the full image (`=s0`).
   * @param {string} url
   */
  function fullSizeUrl(url) {
    if (!isGeminiImage(url)) return url;
    try {
      const parsed = new URL(url);
      const path = parsed.pathname;
      const side = /=(?:s|w|h)\d+([^/]*)$/i;
      if (side.test(path)) {
        parsed.pathname = path.replace(side, "=s0$1");
        return parsed.toString();
      }
      const box = /=w\d+-h\d+([^/]*)$/i;
      if (box.test(path)) {
        parsed.pathname = path.replace(box, "=s0$1");
        return parsed.toString();
      }
      if (/=[^=/]*$/.test(path)) return url;
      parsed.pathname = `${path}=s0`;
      return parsed.toString();
    } catch {
      return url;
    }
  }

  /**
   * @param {string} url
   */
  function requestProcessed(url) {
    const requestId = `formant-gemini-${Date.now()}-${(seq += 1)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("timeout"));
      }, 30000);
      pending.set(requestId, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      window.postMessage({ type: PROCESS, requestId, url }, "*");
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data.type !== "string") return;
    if (data.type === SETTINGS) {
      enabled = data.enabled !== false;
      return;
    }
    if (data.type !== RESULT) return;
    const job = pending.get(data.requestId);
    if (!job) return;
    pending.delete(data.requestId);
    if (data.ok && data.buffer) job.resolve(data);
    else job.reject(new Error("skip"));
  });

  window.fetch = async function formantGeminiFetch(...args) {
    if (!enabled) return originalFetch(...args);
    const input = args[0];
    const url = typeof input === "string" ? input : input?.url;
    if (!url || !isGeminiImage(url)) return originalFetch(...args);
    try {
      const result = await requestProcessed(fullSizeUrl(url));
      return new Response(result.buffer, {
        status: 200,
        headers: { "content-type": result.mime || "image/png" },
      });
    } catch {
      return originalFetch(...args);
    }
  };

  window.postMessage({ type: ASK }, "*");
})();
