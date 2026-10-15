(() => {
  "use strict";

  const HOST_ID = "formant-telegram-overlay";
  const DOWNLOAD_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3a1 1 0 0 1 1 1v9.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42L11 13.59V4a1 1 0 0 1 1-1Zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z"/></svg>';

  /** @type {HTMLElement | null} */
  let host = null;
  /** @type {ShadowRoot | null} */
  let shadow = null;
  /** @type {HTMLElement | null} */
  let layer = null;
  /** @type {HTMLElement | null} */
  let progressRoot = null;
  /** @type {(id: string) => void} */
  let clickHandler = () => {};

  function ensure() {
    if (host && shadow && layer && progressRoot) return;
    host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
    }
    shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    shadow.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2147483645;
      }
      .layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483645; }
      .chip {
        position: fixed;
        width: 34px;
        height: 34px;
        border: 0;
        border-radius: 999px;
        padding: 0;
        display: grid;
        place-items: center;
        pointer-events: auto;
        cursor: pointer;
        color: #fff;
        background: rgba(21, 26, 34, 0.78);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
      }
      .chip:hover { background: rgba(31, 75, 153, 0.92); }
      .chip svg { width: 18px; height: 18px; }
      .progress {
        position: fixed;
        right: 12px;
        bottom: 12px;
        width: 240px;
        max-width: calc(100vw - 24px);
        pointer-events: auto;
        z-index: 2147483646;
      }
      .job {
        margin-top: 8px;
        padding: 10px 12px;
        border-radius: 10px;
        background: rgba(21, 26, 34, 0.88);
        color: #fff;
        font: 12px/1.4 "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      .job__head { display: flex; justify-content: space-between; gap: 8px; }
      .job__name { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .job__close {
        border: 0; background: transparent; color: #c9cdd4; cursor: pointer; font-size: 16px; line-height: 1;
      }
      .bar {
        position: relative;
        margin-top: 8px;
        height: 16px;
        overflow: hidden;
        border-radius: 999px;
        background: #e2e2e2;
      }
      .bar__fill { height: 100%; width: 0; background: #6093b5; }
      .bar__text {
        position: absolute; inset: 0; display: grid; place-items: center;
        color: #151a22; font-size: 11px;
      }
      .job.is-done .bar__fill { background: #7aa33a; }
      .job.is-error .bar__fill { background: #c44; width: 100%; }
    `;
    layer = document.createElement("div");
    layer.className = "layer";
    progressRoot = document.createElement("div");
    progressRoot.className = "progress";
    shadow.append(style, layer, progressRoot);
    if (!host.isConnected) document.documentElement.append(host);
  }

  /**
   * @param {ParentNode | null | undefined} target
   */
  function mount(target) {
    ensure();
    const next = target instanceof Element ? target : document.documentElement;
    if (host.parentElement !== next) next.append(host);
  }

  /**
   * @param {Array<{ id: string, top: number, left: number, title: string }>} items
   */
  function syncButtons(items) {
    ensure();
    const seen = new Set();
    for (const item of items) {
      const id = String(item.id || "");
      if (!id) continue;
      seen.add(id);
      let btn = layer.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (!btn) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip";
        btn.dataset.id = id;
        btn.innerHTML = DOWNLOAD_SVG;
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          clickHandler(id);
        });
        layer.append(btn);
      }
      btn.title = item.title || "下载";
      btn.setAttribute("aria-label", item.title || "下载");
      btn.style.top = `${Math.round(item.top)}px`;
      btn.style.left = `${Math.round(item.left)}px`;
    }
    for (const el of [...layer.querySelectorAll(".chip")]) {
      if (!seen.has(el.getAttribute("data-id") || "")) el.remove();
    }
  }

  /**
   * @param {string} jobId
   * @param {{ name?: string, pct?: number, status?: string, message?: string }} info
   */
  function setProgress(jobId, info) {
    ensure();
    const id = String(jobId || "");
    if (!id) return;
    let job = progressRoot.querySelector(`[data-job="${CSS.escape(id)}"]`);
    if (!job) {
      job = document.createElement("div");
      job.className = "job";
      job.dataset.job = id;
      job.innerHTML =
        '<div class="job__head"><p class="job__name"></p><button class="job__close" type="button" aria-label="关闭">×</button></div><div class="bar"><div class="bar__fill"></div><div class="bar__text">0%</div></div>';
      job.querySelector(".job__close")?.addEventListener("click", () => job.remove());
      progressRoot.append(job);
    }
    const status = String(info.status || "running");
    job.classList.toggle("is-done", status === "done");
    job.classList.toggle("is-error", status === "error");
    const name = job.querySelector(".job__name");
    if (name && info.name) name.textContent = info.name;
    const pct = Math.max(0, Math.min(100, Number(info.pct) || 0));
    const fill = job.querySelector(".bar__fill");
    const text = job.querySelector(".bar__text");
    if (fill instanceof HTMLElement) fill.style.width = `${status === "error" ? 100 : pct}%`;
    if (text) {
      text.textContent =
        status === "done" ? "完成" : status === "error" ? info.message || "失败" : `${pct}%`;
    }
  }

  function clear() {
    if (!host) return;
    layer?.replaceChildren();
    progressRoot?.replaceChildren();
    host.remove();
    host = null;
    shadow = null;
    layer = null;
    progressRoot = null;
  }

  globalThis.FormantTelegramOverlay = {
    mount,
    syncButtons,
    setProgress,
    clear,
    onClick(handler) {
      clickHandler = typeof handler === "function" ? handler : () => {};
    },
  };
})();
