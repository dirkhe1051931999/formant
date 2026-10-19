(() => {
  "use strict";

  const FEATURES_KEY = "formantFeatures";
  const TOKEN_KEY = "formantUsToken";
  const ENGINE_KEY = "formantUsEngine";
  const HOST_ID = "formant-us-menu";

  let token = "";
  let enabled = true;
  /** @type {{ id: string, caption: string, scriptId: string }[]} */
  let menus = [];
  let host = null;
  /** @type {ShadowRoot | null} */
  let shadow = null;

  function isOn(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const tools = src.userscript && typeof src.userscript === "object" ? src.userscript : {};
    return tools.enabled !== false;
  }

  function send(type, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, ...payload }, (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        if (!res || res.ok === false) {
          reject(new Error((res && res.error) || "请求失败"));
          return;
        }
        resolve(res);
      });
    });
  }

  function hello() {
    window.postMessage({ __formantGm: 1, dir: "hello", token }, "*");
  }

  const booted = boot();

  async function onGmReq(data) {
    await booted;
    if (!enabled || data.token !== token) return;
    try {
      const res = await send("FORMANT_US_GM", {
        scriptId: data.scriptId,
        method: data.method,
        args: data.args || [],
      });
      const result = res.result;
      if (result && result.clipboard) {
        try {
          await navigator.clipboard.writeText(String(result.text || ""));
        } catch {
          /* 页面自己再试 */
        }
        window.postMessage({ __formantGm: 1, dir: "res", id: data.id, result: true }, "*");
        return;
      }
      if (data.method === "registerMenu") {
        const [menuId, caption] = data.args || [];
        menus = menus.filter((item) => item.id !== menuId);
        menus.push({ id: String(menuId), caption: String(caption || ""), scriptId: String(data.scriptId) });
        paintMenu();
      }
      if (data.method === "unregisterMenu") {
        menus = menus.filter((item) => item.id !== data.args?.[0]);
        paintMenu();
      }
      window.postMessage({ __formantGm: 1, dir: "res", id: data.id, result }, "*");
    } catch (error) {
      window.postMessage(
        { __formantGm: 1, dir: "res", id: data.id, error: error instanceof Error ? error.message : String(error) },
        "*",
      );
    }
  }

  function paintMenu() {
    if (!menus.length) {
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
          .fab {
            position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
            min-width: 36px; height: 36px; padding: 0 10px;
            border: 0; border-radius: 18px;
            background: #1f4b99; color: #fff; font: 12px/36px "Segoe UI", sans-serif;
            box-shadow: 0 4px 16px rgba(21, 26, 34, 0.2); cursor: pointer;
          }
          .list {
            position: fixed; right: 16px; bottom: 60px; z-index: 2147483646;
            min-width: 200px; max-width: 280px; padding: 6px;
            border-radius: 10px; background: #fff; color: #151a22;
            box-shadow: 0 8px 28px rgba(21, 26, 34, 0.18);
            font: 13px/1.4 "Segoe UI", "Microsoft YaHei", sans-serif;
            display: none;
          }
          .list.is-open { display: block; }
          button.item {
            display: block; width: 100%; text-align: left;
            border: 0; background: transparent; color: inherit;
            padding: 8px 10px; border-radius: 8px; cursor: pointer;
          }
          button.item:hover { background: #e8eef9; color: #1f4b99; }
        </style>
        <button type="button" class="fab" data-fab>油猴</button>
        <div class="list" data-list></div>
      `;
      const fab = shadow.querySelector("[data-fab]");
      const list = shadow.querySelector("[data-list]");
      fab?.addEventListener("click", () => list?.classList.toggle("is-open"));
      list?.addEventListener("click", (event) => {
        const btn = event.target instanceof HTMLElement ? event.target.closest("[data-mid]") : null;
        if (!btn) return;
        const menuId = btn.getAttribute("data-mid") || "";
        const scriptId = btn.getAttribute("data-sid") || "";
        window.postMessage({ __formantGm: 1, dir: "menu", menuId, scriptId }, "*");
        list.classList.remove("is-open");
      });
      (document.documentElement || document.body)?.appendChild(host);
    }
    const list = shadow?.querySelector("[data-list]");
    if (!list) return;
    list.textContent = "";
    for (const item of menus) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "item";
      btn.dataset.mid = item.id;
      btn.dataset.sid = item.scriptId;
      btn.textContent = item.caption;
      list.appendChild(btn);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__formantGm !== 1 || data.dir !== "req") return;
    void onGmReq(data);
  });

  async function boot() {
    const stored = await chrome.storage.local.get([FEATURES_KEY, TOKEN_KEY, ENGINE_KEY]);
    enabled = isOn(stored[FEATURES_KEY]);
    token = String(stored[TOKEN_KEY] || "");
    if (!enabled) return;
    hello();
    if (stored[ENGINE_KEY] === "content") {
      void send("FORMANT_US_INJECT", { url: location.href }).catch(() => {});
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[FEATURES_KEY]) enabled = isOn(changes[FEATURES_KEY].newValue);
    if (changes[TOKEN_KEY]) token = String(changes[TOKEN_KEY].newValue || "");
    if (enabled) hello();
  });
})();
