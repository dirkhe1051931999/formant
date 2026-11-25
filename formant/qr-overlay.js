(() => {
  if (globalThis.__formantQrOverlayReady) return;
  globalThis.__formantQrOverlayReady = true;

  const HOST_ID = "formant-qr-overlay-host";
  const MARGIN = 3;
  const TARGET_SIZE = 260;

  let activeCleanup = null;

  /**
   * Draw QR code onto the target canvas using UTF-8 byte mode.
   * @param {HTMLCanvasElement} canvas
   * @param {string} text
   */
  function renderQrCanvas(canvas, text) {
    const qrcode = globalThis.qrcode;
    if (typeof qrcode !== "function") {
      throw new Error("二维码引擎未加载");
    }
    if (qrcode.stringToBytesFuncs?.["UTF-8"]) {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
    }
    const qr = qrcode(0, "M");
    qr.addData(text, "Byte");
    qr.make();

    const count = qr.getModuleCount();
    const cell = Math.max(2, Math.round(TARGET_SIZE / (count + MARGIN * 2)));
    const side = cell * (count + MARGIN * 2);
    canvas.width = side;
    canvas.height = side;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 初始化失败");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, side, side);
    ctx.fillStyle = "#111827";
    for (let r = 0; r < count; r += 1) {
      for (let c = 0; c < count; c += 1) {
        if (qr.isDark(r, c)) {
          ctx.fillRect((c + MARGIN) * cell, (r + MARGIN) * cell, cell, cell);
        }
      }
    }
  }

  /**
   * Derive a safe PNG filename from the current URL.
   * @param {string} rawUrl
   */
  function buildFilename(rawUrl) {
    try {
      const host = new URL(rawUrl).hostname.replace(/[^a-zA-Z0-9.-]+/g, "_");
      if (host) return `qr-${host}.png`;
    } catch {
      // Fallback for non-URL text edited by the user
    }
    return "qr-page.png";
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @returns {Promise<Blob>}
   */
  function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("生成 PNG 失败"));
      }, "image/png");
    });
  }

  function closeOverlay() {
    if (typeof activeCleanup === "function") {
      activeCleanup();
      activeCleanup = null;
    }
  }

  /**
   * @param {string} url
   * @param {string} title
   */
  function openOverlay(url, title) {
    closeOverlay();

    const oldHost = document.getElementById(HOST_ID);
    if (oldHost) oldHost.remove();

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;";

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .backdrop {
          position: fixed; inset: 0; background: rgba(15, 23, 42, 0.52);
          display: flex; align-items: center; justify-content: center; padding: 16px;
        }
        .card {
          width: min(360px, 100%); background: #ffffff; color: #111827;
          border-radius: 14px; padding: 16px 18px 18px;
          box-shadow: 0 20px 50px rgba(15, 23, 42, 0.28);
          display: flex; flex-direction: column; gap: 12px;
        }
        .head { display: flex; align-items: center; justify-content: space-between; }
        .title { margin: 0; font-size: 15px; font-weight: 600; color: #111827; }
        .close {
          width: 28px; height: 28px; border: 0; border-radius: 8px;
          background: transparent; color: #6b7280; font-size: 20px; line-height: 1;
          cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
        }
        .close:hover { background: #f3f4f6; color: #111827; }
        .stage {
          display: flex; align-items: center; justify-content: center;
          padding: 12px; border-radius: 10px; background: #f8fafc; border: 1px solid #e5e7eb;
          min-height: 220px;
        }
        canvas { max-width: 260px; max-height: 260px; width: auto; height: auto; border-radius: 4px; }
        .error { margin: 0; font-size: 12px; color: #dc2626; text-align: center; display: none; }
        .error.visible { display: block; }
        .url-input {
          width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px;
          font-size: 12px; color: #111827; background: #ffffff; outline: none;
        }
        .url-input:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15); }
        .page-title {
          margin: -4px 0 0; font-size: 12px; color: #6b7280;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .actions { display: flex; gap: 8px; }
        .btn {
          flex: 1; height: 34px; border-radius: 8px; font-size: 13px; font-weight: 500;
          cursor: pointer; border: 1px solid #d1d5db; background: #ffffff; color: #111827;
        }
        .btn:hover:not(:disabled) { background: #f3f4f6; }
        .btn-primary { background: #2563eb; border-color: #2563eb; color: #ffffff; }
        .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .status { margin: -4px 0 0; font-size: 12px; color: #6b7280; text-align: center; min-height: 16px; }
      </style>
      <div class="backdrop" role="dialog" aria-modal="true" aria-label="网页二维码">
        <div class="card">
          <div class="head">
            <h2 class="title">网页二维码</h2>
            <button type="button" class="close" aria-label="关闭">&times;</button>
          </div>
          <div class="stage">
            <canvas></canvas>
            <p class="error"></p>
          </div>
          <input type="text" class="url-input" aria-label="二维码网址" />
          <p class="page-title"></p>
          <div class="actions">
            <button type="button" class="btn btn-primary" data-copy>复制图片</button>
            <button type="button" class="btn" data-download>下载 PNG</button>
          </div>
          <p class="status" role="status"></p>
        </div>
      </div>
    `;

    const backdrop = /** @type {HTMLElement} */ (shadow.querySelector(".backdrop"));
    const closeBtn = /** @type {HTMLButtonElement} */ (shadow.querySelector(".close"));
    const canvas = /** @type {HTMLCanvasElement} */ (shadow.querySelector("canvas"));
    const errorEl = /** @type {HTMLElement} */ (shadow.querySelector(".error"));
    const input = /** @type {HTMLInputElement} */ (shadow.querySelector(".url-input"));
    const titleEl = /** @type {HTMLElement} */ (shadow.querySelector(".page-title"));
    const copyBtn = /** @type {HTMLButtonElement} */ (shadow.querySelector("[data-copy]"));
    const downloadBtn = /** @type {HTMLButtonElement} */ (shadow.querySelector("[data-download]"));
    const statusEl = /** @type {HTMLElement} */ (shadow.querySelector(".status"));

    input.value = url;
    if (title) {
      titleEl.textContent = title;
      titleEl.title = title;
    } else {
      titleEl.style.display = "none";
    }

    let hasValidQr = false;
    let statusTimer = 0;

    function setStatus(msg) {
      clearTimeout(statusTimer);
      statusEl.textContent = msg;
      if (msg) {
        statusTimer = window.setTimeout(() => {
          statusEl.textContent = "";
        }, 2500);
      }
    }

    function updateQr() {
      const value = input.value.trim();
      if (!value) {
        hasValidQr = false;
        canvas.style.display = "none";
        errorEl.textContent = "请输入网址或文本";
        errorEl.classList.add("visible");
        copyBtn.disabled = true;
        downloadBtn.disabled = true;
        return;
      }
      try {
        renderQrCanvas(canvas, value);
        hasValidQr = true;
        canvas.style.display = "block";
        errorEl.textContent = "";
        errorEl.classList.remove("visible");
        copyBtn.disabled = false;
        downloadBtn.disabled = false;
      } catch {
        hasValidQr = false;
        canvas.style.display = "none";
        errorEl.textContent = "内容过长或不支持，无法生成二维码";
        errorEl.classList.add("visible");
        copyBtn.disabled = true;
        downloadBtn.disabled = true;
      }
    }

    const onBackdropClick = (event) => {
      if (event.target === backdrop) closeOverlay();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeOverlay();
    };
    const onCopy = async () => {
      if (!hasValidQr) return;
      try {
        const blob = await canvasToPngBlob(canvas);
        if (!navigator.clipboard?.write || typeof ClipboardItem !== "function") {
          throw new Error("Clipboard API unavailable");
        }
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setStatus("已复制二维码图片");
      } catch {
        setStatus("复制失败，请使用下载");
      }
    };
    const onDownload = async () => {
      if (!hasValidQr) return;
      try {
        const blob = await canvasToPngBlob(canvas);
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = buildFilename(input.value.trim());
        link.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      } catch {
        setStatus("下载失败");
      }
    };

    backdrop.addEventListener("click", onBackdropClick);
    closeBtn.addEventListener("click", closeOverlay);
    input.addEventListener("input", updateQr);
    copyBtn.addEventListener("click", onCopy);
    downloadBtn.addEventListener("click", onDownload);
    document.addEventListener("keydown", onKeyDown, true);

    activeCleanup = () => {
      clearTimeout(statusTimer);
      backdrop.removeEventListener("click", onBackdropClick);
      closeBtn.removeEventListener("click", closeOverlay);
      input.removeEventListener("input", updateQr);
      copyBtn.removeEventListener("click", onCopy);
      downloadBtn.removeEventListener("click", onDownload);
      document.removeEventListener("keydown", onKeyDown, true);
      host.remove();
    };

    updateQr();
    (document.body || document.documentElement).appendChild(host);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "FORMANT_SHOW_QR") return false;
    openOverlay(String(message.url || ""), String(message.title || ""));
    sendResponse({ ok: true });
    return false;
  });
})();
