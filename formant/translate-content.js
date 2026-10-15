(() => {
  if (window.__formantTranslateLoaded) return;
  window.__formantTranslateLoaded = true;

  const HOST_ID = "formant-translate-host";
  let host = null;
  let shadow = null;
  let iconEl = null;
  let panelEl = null;
  let pinned = false;
  let lastText = "";
  let lastRect = null;
  let translateSeq = 0;
  /** @type {"auto" | "google" | "gpt" | "all"} */
  let translateMode = "auto";
  const MODE_KEY = "translateMode";
  const MODE_LABELS = { auto: "自动", google: "Google", gpt: "GPT", all: "全部" };

  /** @type {{ enabled: boolean, selection: boolean, contextMenu: boolean }} */
  let translateFeatures = { enabled: true, selection: true, contextMenu: true };

  function canUseSelectionTranslate() {
    return translateFeatures.enabled && translateFeatures.selection;
  }

  function canOpenTranslatePanel() {
    return (
      translateFeatures.enabled &&
      (translateFeatures.selection || translateFeatures.contextMenu)
    );
  }

  async function refreshTranslateFeatures() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "GET_FEATURES" });
      const t = res?.features?.translate;
      if (!t) return;
      translateFeatures = {
        enabled: t.enabled !== false,
        selection: t.selection !== false,
        contextMenu: t.contextMenu !== false,
      };
    } catch {
      /* keep previous */
    }
    if (!canUseSelectionTranslate()) {
      hideIcon();
      if (!canOpenTranslatePanel()) closePanel();
    }
  }

  void refreshTranslateFeatures();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.formantFeatures) return;
    void refreshTranslateFeatures();
  });

  const STYLES = `
    :host, * { box-sizing: border-box; font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
    .ft-icon {
      position: fixed;
      z-index: 2147483646;
      width: 34px;
      height: 34px;
      border-radius: 9px;
      border: 1px solid rgba(20, 30, 45, 0.14);
      background: #fff;
      box-shadow: 0 6px 18px rgba(20, 30, 45, 0.16);
      display: none;
      place-items: center;
      cursor: pointer;
      color: #1f2937;
      padding: 0;
    }
    .ft-icon.is-open { display: grid; }
    .ft-icon svg { width: 18px; height: 18px; display: block; }
    .ft-icon:hover { background: #f7f9fc; }
    .ft-panel {
      position: fixed;
      z-index: 2147483647;
      width: min(360px, calc(100vw - 24px));
      max-height: min(420px, calc(100vh - 24px));
      display: none;
      flex-direction: column;
      border-radius: 12px;
      border: 1px solid rgba(20, 30, 45, 0.12);
      background: #f4f6f9;
      box-shadow: 0 16px 40px rgba(20, 30, 45, 0.2);
      overflow: hidden;
      color: #151a22;
    }
    .ft-panel.is-open { display: flex; }
    .ft-panel__arrow {
      position: absolute;
      top: -6px;
      left: 24px;
      width: 12px;
      height: 12px;
      background: #fff;
      border-left: 1px solid rgba(20, 30, 45, 0.12);
      border-top: 1px solid rgba(20, 30, 45, 0.12);
      transform: rotate(45deg);
      pointer-events: none;
    }
    .ft-toolbar {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      background: #fff;
      border-bottom: 1px solid #e8edf3;
      position: relative;
      z-index: 1;
    }
    .ft-toolbar__right, .ft-toolbar__left { display: flex; gap: 4px; }
    .ft-tool {
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: #667084;
      cursor: pointer;
      display: inline-grid;
      place-items: center;
      padding: 0;
    }
    .ft-tool:hover, .ft-tool.is-on { background: #eef2f7; color: #151a22; }
    .ft-tool svg { width: 15px; height: 15px; }
    .ft-query {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #fff;
      border-bottom: 1px solid #e8edf3;
      min-width: 0;
    }
    .ft-query__text {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 14px;
      font-weight: 600;
      color: #151a22;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ft-speak {
      flex: 0 0 auto;
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: #667084;
      cursor: pointer;
      display: inline-grid;
      place-items: center;
      padding: 0;
    }
    .ft-speak:hover { background: #eef2f7; color: #151a22; }
    .ft-speak svg { width: 15px; height: 15px; display: block; }
    .ft-speak.is-speaking,
    .ft-speak-result.is-speaking {
      color: #1f4b99;
      background: rgba(31, 75, 153, 0.1);
    }
    .ft-speak.is-speaking svg,
    .ft-speak-result.is-speaking svg {
      animation: ft-speak-pulse 0.9s ease-in-out infinite;
    }
    .ft-speak.is-speaking svg path:last-of-type,
    .ft-speak-result.is-speaking svg path:last-of-type {
      animation: ft-speak-waves 0.9s ease-in-out infinite;
    }
    @keyframes ft-speak-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.08); }
    }
    @keyframes ft-speak-waves {
      0%, 100% { opacity: 0.28; }
      50% { opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      .ft-speak.is-speaking svg,
      .ft-speak-result.is-speaking svg,
      .ft-speak.is-speaking svg path:last-of-type,
      .ft-speak-result.is-speaking svg path:last-of-type { animation: none; }
    }
    .ft-result-row {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .ft-result-text {
      flex: 1 1 auto;
      min-width: 0;
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .ft-speak-result {
      flex: 0 0 auto;
      width: 28px;
      height: 28px;
      margin: -4px -4px 0 0;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: #667084;
      cursor: pointer;
      display: inline-grid;
      place-items: center;
      padding: 0;
    }
    .ft-speak-result:hover { background: #eef2f7; color: #151a22; }
    .ft-speak-result svg { width: 15px; height: 15px; display: block; }
    .ft-mode {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 3px;
      margin: 0;
      padding: 6px 8px;
      background: #fff;
      border-bottom: 1px solid #e8edf3;
    }
    .ft-mode__btn {
      appearance: none;
      border: 0;
      border-radius: 7px;
      background: #eef2f7;
      color: #667084;
      font: inherit;
      font-size: 11px;
      font-weight: 550;
      padding: 5px 2px;
      cursor: pointer;
      line-height: 1.2;
    }
    .ft-mode__btn.is-active {
      background: #1f4b99;
      color: #fff;
    }
    .ft-route-hint {
      flex: 0 0 auto;
      margin: 0;
      padding: 4px 12px 6px;
      background: #fff;
      border-bottom: 1px solid #e8edf3;
      font-size: 11px;
      color: #667084;
      line-height: 1.35;
    }
    .ft-route-hint[hidden] { display: none !important; }
    .ft-card.is-dimmed { opacity: 0.72; }
    .ft-skipped { margin: 0; color: #667084; font-size: 12px; line-height: 1.45; }
    .ft-skipped__action {
      margin-left: 8px;
      border: 0;
      padding: 0;
      background: transparent;
      color: #1f4b99;
      font: inherit;
      font-size: 12px;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .ft-body {
      flex: 1 1 auto;
      min-height: 0;
      /* Cap the scrollport so long Google+GPT results scroll here, not the phonetic line. */
      max-height: min(340px, calc(100vh - 120px));
      padding: 8px;
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      display: block;
    }
    .ft-card {
      background: #fff;
      border: 1px solid #e5eaf0;
      border-radius: 10px;
      overflow: visible;
      min-width: 0;
    }
    .ft-card + .ft-card { margin-top: 8px; }
    .ft-card__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      border-bottom: 1px solid #eef2f6;
      font-size: 12px;
      font-weight: 600;
    }
    .ft-brand { display: flex; align-items: center; gap: 6px; }
    .ft-logo {
      width: 16px; height: 16px; border-radius: 4px;
      display: inline-grid; place-items: center; font-size: 10px; font-weight: 700;
    }
    .ft-logo.g { background: #e8f0fe; color: #1a73e8; }
    .ft-logo.gpt { background: #e7f8f1; color: #0f7b53; }
    .ft-logo.deeplx { background: #e7eef5; color: #0b3a5b; }
    .ft-card__badge {
      font-size: 10px;
      font-weight: 600;
      color: #2932e1;
      background: #e8f1ff;
      border-radius: 999px;
      padding: 2px 7px;
      line-height: 1.3;
    }
    .ft-card__badge[hidden] { display: none !important; }
    .ft-fallback-note {
      margin: 0 0 6px;
      font-size: 11px;
      color: #2932e1;
      line-height: 1.35;
      white-space: normal;
    }
    .ft-card__body {
      padding: 12px 14px 14px;
      font-size: 13px;
      line-height: 1.5;
      min-height: 48px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .ft-muted {
      color: #667084;
      font-size: 12px;
      margin: 0 0 6px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .ft-error { color: #b42318; margin: 0; padding: 2px 0; font-size: 12px; line-height: 1.45; word-break: break-word; }
    .ft-loading { color: #667084; margin: 0; font-size: 12px; }
    .ft-footer {
      flex: 0 0 auto;
      display: flex;
      gap: 14px;
      justify-content: center;
      padding: 8px 10px 10px;
      border-top: 1px solid #e8edf3;
      background: #fff;
    }
    .ft-footer a {
      color: #1f4b99;
      text-decoration: none;
      font-size: 12px;
    }
    .ft-footer a:hover { text-decoration: underline; }
  `;

  function ensureHost() {
    if (host && document.documentElement.contains(host)) return;
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    shadow.appendChild(style);

    iconEl = document.createElement("button");
    iconEl.type = "button";
    iconEl.className = "ft-icon";
    iconEl.title = "翻译";
    iconEl.innerHTML = `
      <svg viewBox="0 0 25 25" fill="none" aria-hidden="true">
        <path fill-rule="evenodd" clip-rule="evenodd" fill="currentColor" d="M9.4 5.4H4V6.6H13.2189C13.1612 6.78478 13.0895 6.99578 13.0025 7.22211C12.7032 8.00031 12.2402 8.91125 11.5757 9.57574L10 11.1515L9.42426 10.5757C8.72102 9.8725 8.25297 9.16987 7.96199 8.64611C7.81668 8.38455 7.71617 8.16874 7.65305 8.02146C7.62151 7.94787 7.59937 7.89154 7.5857 7.85534C7.57886 7.83725 7.57415 7.8242 7.57144 7.81657L7.56886 7.80922C7.56886 7.80922 7.56921 7.81026 7 8C6.43079 8.18974 6.43091 8.19009 6.43091 8.19009L6.43133 8.19135L6.43206 8.19351L6.4341 8.19948L6.44052 8.21786C6.44587 8.23292 6.45336 8.25357 6.46313 8.27942C6.48266 8.33112 6.5113 8.40369 6.55008 8.49416C6.62758 8.67501 6.74582 8.92795 6.91301 9.22889C7.24703 9.83013 7.77898 10.6275 8.57574 11.4243L9.15147 12L4.57964 16.5718L4.57655 16.5749L4.57577 16.5757L5.4243 17.4242L5.42688 17.4216L10.0368 12.8117L12.6159 14.9609L13.3841 14.0391L10.8888 11.9597L12.4243 10.4243C13.2598 9.58875 13.7968 8.49969 14.1225 7.65289C14.2818 7.23863 14.395 6.87072 14.4696 6.6H16V5.4H10.6V4H9.4V5.4ZM17.4405 10L21.553 19.7672H20.2509L19.1279 17.1H14.8721L13.7491 19.7672H12.447L16.5595 10H17.4405ZM15.3773 15.9H18.6227L17 12.0462L15.3773 15.9Z"/>
      </svg>`;
    iconEl.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    iconEl.addEventListener("mouseup", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    iconEl.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void openPanel(lastText, lastRect);
    });

    panelEl = document.createElement("div");
    panelEl.className = "ft-panel";
    panelEl.innerHTML = `
      <div class="ft-panel__arrow"></div>
      <div class="ft-toolbar">
        <div class="ft-toolbar__left">
          <button type="button" class="ft-tool" data-action="pin" title="钉住">
            <svg viewBox="0 0 24 24"><path d="M12 3v10M9 6.5h6M10 13l-2.5 7h9L14 13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="ft-toolbar__right">
          <button type="button" class="ft-tool" data-action="close" title="关闭">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
      <div class="ft-query">
        <span class="ft-query__text" data-role="query-text"></span>
        <button type="button" class="ft-speak" data-action="speak-query" title="发音" aria-label="发音">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4.5 9.5v5h3.2L12 18.8V5.2L7.7 9.5H4.5Z" fill="currentColor"/>
            <path d="M15.2 8.8a4.2 4.2 0 0 1 0 6.4M17.6 6.2a7.2 7.2 0 0 1 0 11.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="ft-mode" data-role="mode" role="tablist" aria-label="翻译引擎">
        <button type="button" class="ft-mode__btn is-active" data-mode="auto">自动</button>
        <button type="button" class="ft-mode__btn" data-mode="google">Google</button>
        <button type="button" class="ft-mode__btn" data-mode="gpt">GPT</button>
        <button type="button" class="ft-mode__btn" data-mode="all">全部</button>
      </div>
      <p class="ft-route-hint" data-role="route-hint" hidden></p>
      <div class="ft-body">
        <article class="ft-card" data-provider="google">
          <header class="ft-card__head"><div class="ft-brand"><span class="ft-logo g">G</span><span>谷歌翻译</span></div></header>
          <div class="ft-card__body" data-role="google"><p class="ft-loading">等待翻译…</p></div>
        </article>
        <article class="ft-card" data-provider="gpt">
          <header class="ft-card__head"><div class="ft-brand"><span class="ft-logo gpt">✦</span><span>ChatGPT</span></div></header>
          <div class="ft-card__body" data-role="gpt"><p class="ft-loading">等待翻译…</p></div>
        </article>
        <article class="ft-card" data-provider="deeplx">
          <header class="ft-card__head">
            <div class="ft-brand"><span class="ft-logo deeplx">D</span><span>DeepLX</span></div>
            <span class="ft-card__badge" data-role="deeplx-badge" hidden>备用</span>
          </header>
          <div class="ft-card__body" data-role="deeplx"><p class="ft-loading">Google 不可用时自动启用</p></div>
        </article>
      </div>
      <footer class="ft-footer">
        <a data-role="google-link" href="#" target="_blank" rel="noreferrer">谷歌搜索</a>
        <a data-role="wiki-link" href="#" target="_blank" rel="noreferrer">维基百科</a>
        <a data-role="dict-link" href="#" target="_blank" rel="noreferrer">剑桥词典</a>
      </footer>`;

    panelEl.querySelector('[data-action="close"]')?.addEventListener("click", () => closePanel());
    panelEl.querySelector('[data-action="pin"]')?.addEventListener("click", (event) => {
      pinned = !pinned;
      /** @type {HTMLElement} */ (event.currentTarget).classList.toggle("is-on", pinned);
    });
    panelEl.querySelector('[data-action="speak-query"]')?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const btn = /** @type {HTMLElement} */ (event.currentTarget);
      void speakText(lastText, undefined, btn);
    });
    panelEl.querySelector('[data-role="mode"]')?.addEventListener("click", (event) => {
      const btn = /** @type {HTMLElement | null} */ (
        event.target instanceof Element ? event.target.closest("[data-mode]") : null
      );
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      void applyTranslateMode(btn.getAttribute("data-mode") || "auto");
    });
    panelEl.addEventListener("click", (event) => {
      const speakBtn = /** @type {HTMLElement | null} */ (
        event.target instanceof Element ? event.target.closest('[data-action="speak-result"]') : null
      );
      if (speakBtn) {
        event.preventDefault();
        event.stopPropagation();
        const row = speakBtn.closest(".ft-result-row");
        const text = row?.querySelector(".ft-result-text")?.textContent?.trim() || "";
        if (!text) return;
        const lang = speakBtn.getAttribute("data-speak-lang") || guessSpeakLang(text);
        void speakText(text, lang, speakBtn);
        return;
      }

      const btn = /** @type {HTMLElement | null} */ (
        event.target instanceof Element ? event.target.closest("[data-force-mode]") : null
      );
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      void applyTranslateMode(btn.getAttribute("data-force-mode") || "auto");
    });
    void loadTranslateMode().then((mode) => setModeUi(mode));
    // Keep wheel/trackpad scroll inside the panel instead of the page.
    panelEl.addEventListener(
      "wheel",
      (event) => {
        event.stopPropagation();
      },
      { passive: true },
    );

    shadow.append(iconEl, panelEl);
  }

  function hideIcon() {
    if (iconEl) iconEl.classList.remove("is-open");
  }

  function closePanel() {
    pinned = false;
    if (panelEl) {
      panelEl.classList.remove("is-open");
      panelEl.querySelector('[data-action="pin"]')?.classList.remove("is-on");
    }
  }

  function escapeHtml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  /** @type {HTMLAudioElement | null} */
  let speakAudio = null;

  /**
   * @param {string} text
   */
  function guessSpeakLang(text) {
    const s = String(text || "");
    if (/[\u4e00-\u9fff]/.test(s)) return "zh-CN";
    if (/[\u3040-\u30ff]/.test(s)) return "ja";
    if (/[\uac00-\ud7af]/.test(s)) return "ko";
    if (/[çğıöşüÇĞİÖŞÜ]/.test(s)) return "tr";
    return "en";
  }

  const SPEAK_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M4.5 9.5v5h3.2L12 18.8V5.2L7.7 9.5H4.5Z" fill="currentColor"/>
    <path d="M15.2 8.8a4.2 4.2 0 0 1 0 6.4M17.6 6.2a7.2 7.2 0 0 1 0 11.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
  </svg>`;

  /** @type {HTMLElement | null} */
  let activeSpeakBtn = null;

  function clearSpeakingUi() {
    if (!activeSpeakBtn) return;
    activeSpeakBtn.classList.remove("is-speaking");
    activeSpeakBtn.removeAttribute("aria-busy");
    activeSpeakBtn = null;
  }

  /**
   * @param {HTMLElement | null | undefined} button
   */
  function setSpeakingUi(button) {
    clearSpeakingUi();
    if (!(button instanceof HTMLElement)) return;
    activeSpeakBtn = button;
    button.classList.add("is-speaking");
    button.setAttribute("aria-busy", "true");
  }

  /**
   * @param {string} text
   * @param {string} [lang]
   * @param {HTMLElement | null} [button]
   */
  async function speakText(text, lang, button) {
    const q = String(text || "").trim();
    if (!q) return;
    const raw = String(lang || guessSpeakLang(q)).replace("_", "-");
    const tl = raw.toLowerCase().startsWith("zh") ? "zh-CN" : raw.split("-")[0] || "en";
    const clip = q.slice(0, 200);

    if (speakAudio) {
      const prev = speakAudio;
      speakAudio = null;
      try {
        prev.pause();
        prev.removeAttribute("src");
        prev.load();
      } catch {
        // ignore
      }
    }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    setSpeakingUi(button);

    try {
      const url =
        "https://translate.googleapis.com/translate_tts" +
        `?client=gtx&ie=UTF-8&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(clip)}`;
      const audio = new Audio(url);
      speakAudio = audio;
      const done = () => {
        if (speakAudio !== audio) return;
        speakAudio = null;
        clearSpeakingUi();
      };
      audio.addEventListener("ended", done);
      audio.addEventListener("error", done);
      await audio.play();
      return;
    } catch {
      // fall through
    }
    if (typeof speechSynthesis === "undefined") {
      clearSpeakingUi();
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clip);
    utterance.lang = tl === "zh-CN" ? "zh-CN" : tl;
    utterance.onend = () => clearSpeakingUi();
    utterance.onerror = () => clearSpeakingUi();
    speechSynthesis.speak(utterance);
  }

  /**
   * Prefer pointer / last line end — not the full selection bounding box center
   * (wide multi-line selections otherwise put the icon in empty middle space).
   * @param {Range} range
   * @param {{ clientX?: number, clientY?: number } | null} [point]
   */
  function getSelectionAnchorRect(range, point = null) {
    const rects = Array.from(range.getClientRects()).filter(
      (r) => r.width > 0 || r.height > 0,
    );

    if (point && Number.isFinite(point.clientX) && Number.isFinite(point.clientY)) {
      if (rects.length) {
        let best = rects[rects.length - 1];
        let bestDist = Infinity;
        for (const r of rects) {
          const cx = (r.left + r.right) / 2;
          const cy = (r.top + r.bottom) / 2;
          const d =
            (cx - point.clientX) * (cx - point.clientX) +
            (cy - point.clientY) * (cy - point.clientY);
          if (d < bestDist) {
            bestDist = d;
            best = r;
          }
        }
        const x = Math.min(Math.max(point.clientX, best.left), best.right || best.left);
        return {
          left: x,
          top: best.top,
          right: x,
          bottom: best.bottom,
          width: 0,
          height: best.height,
        };
      }
      return {
        left: point.clientX,
        top: point.clientY,
        right: point.clientX,
        bottom: point.clientY,
        width: 0,
        height: 0,
      };
    }

    if (rects.length) {
      const last = rects[rects.length - 1];
      return {
        left: last.right,
        top: last.top,
        right: last.right,
        bottom: last.bottom,
        width: 0,
        height: last.height,
      };
    }

    const box = range.getBoundingClientRect();
    return {
      left: box.left + box.width / 2,
      top: box.top,
      right: box.left + box.width / 2,
      bottom: box.bottom,
      width: 0,
      height: box.height,
    };
  }

  function placeNearRect(el, rect, offsetY = 8) {
    const width = el.offsetWidth || 34;
    const height = el.offsetHeight || 34;
    // Anchor at the point/end (width often 0), slightly to the right of the caret.
    const anchorX = rect.width > 0 ? rect.left + Math.min(rect.width, 28) : rect.left;
    let left = anchorX - width / 2;
    let top = rect.bottom + offsetY;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - height - offsetY);
    }
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  function updateFooter(q) {
    const encoded = encodeURIComponent(q);
    const google = panelEl.querySelector('[data-role="google-link"]');
    const wiki = panelEl.querySelector('[data-role="wiki-link"]');
    const dict = panelEl.querySelector('[data-role="dict-link"]');
    if (google) google.href = `https://www.google.com/search?q=${encoded}`;
    if (wiki) wiki.href = `https://zh.wikipedia.org/w/index.php?search=${encoded}`;
    if (dict) dict.href = `https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${encoded}`;
  }

  /**
   * @param {unknown} value
   * @returns {"auto" | "google" | "gpt" | "all"}
   */
  function normalizeMode(value) {
    const mode = String(value || "auto");
    if (mode === "google" || mode === "gpt" || mode === "all" || mode === "auto") return mode;
    return "auto";
  }

  async function loadTranslateMode() {
    const data = await chrome.storage.local.get(MODE_KEY);
    return normalizeMode(data[MODE_KEY]);
  }

  /**
   * @param {"auto" | "google" | "gpt" | "all"} mode
   */
  function setModeUi(mode) {
    translateMode = normalizeMode(mode);
    panelEl?.querySelectorAll(".ft-mode__btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-mode") === translateMode);
    });
  }

  /**
   * @param {string} [summary]
   */
  function setRouteHint(summary) {
    const el = panelEl?.querySelector('[data-role="route-hint"]');
    if (!el) return;
    if (!summary) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = summary;
  }

  /**
   * @param {"google" | "gpt"} provider
   * @param {boolean} dimmed
   */
  function setCardDimmed(provider, dimmed) {
    panelEl?.querySelector(`[data-provider="${provider}"]`)?.classList.toggle("is-dimmed", dimmed);
  }

  /**
   * @param {unknown} mode
   */
  async function applyTranslateMode(mode) {
    const next = normalizeMode(mode);
    setModeUi(next);
    await chrome.storage.local.set({ [MODE_KEY]: next });
    if (lastText) void openPanel(lastText, lastRect);
  }

  /**
   * @param {HTMLElement | null} el
   * @param {"google" | "gpt" | "deeplx"} provider
   * @param {{ ok: boolean, data?: { text?: string, phonetic?: string, target?: string, fallbackFrom?: string }, error?: string, skipped?: boolean }} result
   */
  function paint(el, provider, result) {
    if (!el) return;
    const badge = panelEl?.querySelector('[data-role="deeplx-badge"]');
    if (provider === "deeplx" && badge) {
      badge.hidden = !(result?.ok && result.data?.fallbackFrom === "google");
    }
    if (result?.skipped) {
      if (provider === "deeplx") {
        el.innerHTML = `<p class="ft-skipped">${escapeHtml(result.error || "已跳过")}</p>`;
        setCardDimmed(provider, true);
        return;
      }
      const forceMode = provider === "gpt" ? "gpt" : "google";
      el.innerHTML = `<p class="ft-skipped">${escapeHtml(result.error || "已跳过")} <button type="button" class="ft-skipped__action" data-force-mode="${forceMode}">改用 ${MODE_LABELS[forceMode]}</button></p>`;
      setCardDimmed(provider, true);
      return;
    }
    setCardDimmed(provider, false);
    if (!result?.ok) {
      el.innerHTML = `<p class="ft-error">${escapeHtml(result?.error || "翻译失败")}</p>`;
      return;
    }
    // Long Google transliterations for paragraphs are noise — only show short phonetics.
    const text = String(result.data?.text || "").trim();
    const phoneticRaw = String(result.data?.phonetic || "").trim();
    const phonetic =
      phoneticRaw && phoneticRaw.length <= 80
        ? `<p class="ft-muted">/${escapeHtml(phoneticRaw)}/</p>`
        : "";
    const fallbackNote =
      provider === "deeplx" && result.data?.fallbackFrom === "google"
        ? `<p class="ft-fallback-note">Google 不可用，已用 DeepLX 备用</p>`
        : "";
    const speakLang = String(result.data?.target || "").trim() || guessSpeakLang(text);
    const speakBtn = text
      ? `<button type="button" class="ft-speak-result" data-action="speak-result" data-speak-lang="${escapeHtml(speakLang)}" title="发音" aria-label="发音">${SPEAK_ICON_SVG}</button>`
      : "";
    el.innerHTML = `${fallbackNote}${phonetic}<div class="ft-result-row"><div class="ft-result-text">${escapeHtml(text)}</div>${speakBtn}</div>`;
  }

  async function openPanel(text, rect) {
    ensureHost();
    const q = String(text || "").trim();
    if (!q) return;
    lastText = q;
    hideIcon();
    panelEl.classList.add("is-open");
    const queryText = panelEl.querySelector('[data-role="query-text"]');
    if (queryText) queryText.textContent = q;
    updateFooter(q);
    setRouteHint("");
    setCardDimmed("google", false);
    setCardDimmed("gpt", false);
    setCardDimmed("deeplx", false);
    const deeplxBadge = panelEl.querySelector('[data-role="deeplx-badge"]');
    if (deeplxBadge) /** @type {HTMLElement} */ (deeplxBadge).hidden = true;

    const box = rect || {
      left: window.innerWidth / 2 - 80,
      top: 80,
      right: window.innerWidth / 2 + 80,
      bottom: 120,
      width: 160,
      height: 40,
    };
    // Temporarily show to measure
    placeNearRect(panelEl, box, 10);

    const googleEl = panelEl.querySelector('[data-role="google"]');
    const gptEl = panelEl.querySelector('[data-role="gpt"]');
    const deeplxEl = panelEl.querySelector('[data-role="deeplx"]');
    if (googleEl) googleEl.innerHTML = `<p class="ft-loading">翻译中…</p>`;
    if (gptEl) gptEl.innerHTML = `<p class="ft-loading">翻译中…</p>`;
    if (deeplxEl) deeplxEl.innerHTML = `<p class="ft-loading">待机…</p>`;

    const seq = ++translateSeq;
    try {
      translateMode = await loadTranslateMode();
      setModeUi(translateMode);
      let target;
      try {
        const stored = await chrome.storage.local.get("translateTarget");
        const raw = String(stored.translateTarget || "auto").trim();
        if (raw === "zh-CN" || raw === "en") target = raw;
      } catch {
        /* ignore */
      }
      const response = await chrome.runtime.sendMessage({
        type: "TRANSLATE",
        q,
        source: "auto",
        target,
        mode: translateMode,
        seq,
      });
      if (seq !== translateSeq) return;
      if (!response?.ok) throw new Error(response?.error || "翻译失败");
      if (response.result?.plan?.summary) setRouteHint(response.result.plan.summary);
      // Partial updates may have already painted; final response is a safety net.
      paint(/** @type {HTMLElement} */ (googleEl), "google", response.result?.google);
      paint(/** @type {HTMLElement} */ (gptEl), "gpt", response.result?.gpt);
      paint(/** @type {HTMLElement} */ (deeplxEl), "deeplx", response.result?.deeplx);
    } catch (error) {
      if (seq !== translateSeq) return;
      const msg = error instanceof Error ? error.message : String(error);
      for (const el of [googleEl, gptEl, deeplxEl]) {
        if (!el?.querySelector(".ft-loading")) continue;
        el.innerHTML = `<p class="ft-error">${escapeHtml(msg)}</p>`;
      }
    }
  }

  /**
   * @param {{ clientX?: number, clientY?: number } | null} [point]
   */
  function showIconForSelection(point = null) {
    if (!canUseSelectionTranslate()) {
      hideIcon();
      return;
    }
    if (pinned && panelEl?.classList.contains("is-open")) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim() || "";
    if (!text || !selection || selection.rangeCount === 0) {
      hideIcon();
      return;
    }
    // Ignore huge selections
    if (text.length > 2000) {
      hideIcon();
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = getSelectionAnchorRect(range, point);
    if (!Number.isFinite(rect?.left) || !Number.isFinite(rect?.bottom)) {
      hideIcon();
      return;
    }
    ensureHost();
    const prevText = lastText;
    lastText = text;
    lastRect = rect;
    iconEl.classList.add("is-open");
    placeNearRect(iconEl, rect, 6);
    // Only dismiss an open panel when the selection actually changed.
    // Otherwise mouseup after clicking the icon would close the panel instantly.
    if (
      !pinned &&
      panelEl?.classList.contains("is-open") &&
      text !== prevText
    ) {
      closePanel();
    }
  }

  document.addEventListener(
    "mouseup",
    (event) => {
      // Ignore right-button release; contextmenu handler owns that path.
      if (event.button === 2) return;
      const path = event.composedPath();
      if (host && path.includes(host)) return;
      const point = { clientX: event.clientX, clientY: event.clientY };
      window.setTimeout(() => showIconForSelection(point), 10);
    },
    true,
  );

  // Right-click with selection → show floating translate icon (and keep browser menu).
  document.addEventListener(
    "contextmenu",
    (event) => {
      const text = window.getSelection()?.toString().trim() || "";
      if (!text) return;
      showIconForSelection({ clientX: event.clientX, clientY: event.clientY });
    },
    true,
  );

  document.addEventListener(
    "mousedown",
    (event) => {
      // Don't dismiss on right-click — otherwise the translate icon vanishes.
      if (event.button === 2) return;
      const path = event.composedPath();
      if (host && path.includes(host)) return;
      if (!pinned) {
        hideIcon();
        closePanel();
      }
    },
    true,
  );

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideIcon();
      if (!pinned) closePanel();
    }
  });

  window.addEventListener(
    "scroll",
    () => {
      // Selection icon is anchored to page text; hide it on scroll.
      // Keep the translate panel open (fixed in viewport) so right-click results don't vanish.
      hideIcon();
    },
    true,
  );

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "FORMANT_PING") {
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === "FORMANT_TRANSLATE_ROUTE") {
      if (!panelEl?.classList.contains("is-open")) return false;
      if (message.seq != null && message.seq !== translateSeq) return false;
      if (message.plan?.summary) setRouteHint(String(message.plan.summary));
      const deeplxEl = panelEl.querySelector('[data-role="deeplx"]');
      if (deeplxEl) {
        if (message.plan?.runDeeplx) {
          deeplxEl.innerHTML = `<p class="ft-loading">翻译中…</p>`;
        } else if (message.plan?.deeplxFallback) {
          deeplxEl.innerHTML = `<p class="ft-loading">等待 Google…</p>`;
        } else {
          deeplxEl.innerHTML = `<p class="ft-loading">跳过中…</p>`;
        }
      }
      return false;
    }
    if (message?.type === "FORMANT_TRANSLATE_PARTIAL") {
      if (!panelEl?.classList.contains("is-open")) return false;
      if (message.seq != null && message.seq !== translateSeq) return false;
      const provider =
        message.provider === "gpt"
          ? "gpt"
          : message.provider === "deeplx"
            ? "deeplx"
            : "google";
      const el = panelEl.querySelector(`[data-role="${provider}"]`);
      if (el) paint(/** @type {HTMLElement} */ (el), provider, message.result);
      return false;
    }
    if (message?.type === "FORMANT_SHOW_TRANSLATE") {
      const q = String(message.q || "").trim();
      if (!q) return false;
      void refreshTranslateFeatures().then(() => {
        if (!canOpenTranslatePanel()) {
          sendResponse({ ok: false, error: "翻译功能已关闭" });
          return;
        }
        const selection = window.getSelection();
        let rect = null;
        if (selection && selection.rangeCount > 0 && selection.toString().trim()) {
          rect = selection.getRangeAt(0).getBoundingClientRect();
        }
        void openPanel(q, rect);
        sendResponse({ ok: true });
      });
      return true;
    }
    return false;
  });
})();
