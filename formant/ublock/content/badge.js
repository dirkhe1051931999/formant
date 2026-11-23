(() => {
  if (window.__FORMANT_UBLOCK_BADGE__) return;
  window.__FORMANT_UBLOCK_BADGE__ = true;

  const HOST_ID = "formant-ublock-badge";
  /** @type {HTMLDivElement | null} */
  let host = null;
  /** @type {ShadowRoot | null} */
  let shadow = null;
  let count = 0;

  function usMenuPresent() {
    return Boolean(document.getElementById("formant-us-menu"));
  }

  function paint() {
    if (count <= 0) {
      host?.remove();
      host = null;
      shadow = null;
      return;
    }
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      shadow = host.attachShadow({ mode: "closed" });
      shadow.innerHTML = `
        <style>
          :host { all: initial; }
          .pill {
            position: fixed;
            right: 16px;
            bottom: 16px;
            z-index: 2147483644;
            min-width: 36px;
            height: 32px;
            padding: 0 10px;
            border: 0;
            border-radius: 16px;
            background: rgba(21, 26, 34, 0.88);
            color: #fff;
            font: 12px/32px "Segoe UI", "Microsoft YaHei", sans-serif;
            box-shadow: 0 4px 16px rgba(21, 26, 34, 0.22);
            pointer-events: none;
            white-space: nowrap;
          }
          .pill.is-up { bottom: 64px; }
        </style>
        <div class="pill"></div>
      `;
      (document.documentElement || document.body)?.append(host);
    }
    const pill = shadow?.querySelector(".pill");
    if (!pill) return;
    pill.classList.toggle("is-up", usMenuPresent());
    pill.textContent = `已拦截 ${count}`;
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "FORMANT_UBLOCK_SET_ENABLED" && message.enabled === false) {
      count = 0;
      paint();
      return;
    }
    if (message?.type !== "FORMANT_UBLOCK_COUNT") return;
    const next = Number(message.count) || 0;
    if (next === count && host) return;
    count = next;
    paint();
  });

  chrome.runtime.sendMessage({ type: "FORMANT_UBLOCK_GET_COUNT" }, (res) => {
    if (chrome.runtime.lastError) return;
    if (res?.ok) {
      count = Number(res.count) || 0;
      paint();
    }
  });
})();
