import { FEATURES_KEY, isHlsEnabled, loadFeatures, normalizeFeatures } from "./features.js";
import { isChannelListUrl, parseChannelList } from "./hls/m3u-lib.js";
import { HLS_SESSION_KEY, loadHlsSession, saveHlsSession } from "./hls/session-store.js";
import { hlsPlayerPageUrl, loadSourceStore } from "./hls/sources-store.js";

const PREV_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.5 5.5 8 12l7.5 6.5V5.5z"/></svg>`;
const NEXT_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.5 5.5v13L16 12 8.5 5.5z"/></svg>`;
const PLAY_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>`;
const VOL_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 9v6h4l5 5V4L9 9H5zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>`;
const MUTE_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.5 12a4.5 4.5 0 0 0-2.5-4v2.2l2.5 2.5V12zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25L19.73 21 21 19.73 4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>`;
const OPEN_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z"/></svg>`;

/** @type {HTMLElement | null} */
let liveCard = null;
/** @type {any} */
let hls = null;
/** @type {Promise<any> | null} */
let hlsLib = null;
let loadGen = 0;
/** @type {{ title: string, url: string, sources?: string[] }[]} */
let channels = [];
let channelIndex = 0;
let sourceIndex = 0;
let feedUrl = "";
let lastPlayId = 0;
const DEFAULT_VOLUME = 0.8;

function ensureHlsLib() {
  if (globalThis.Hls) return Promise.resolve(globalThis.Hls);
  if (hlsLib) return hlsLib;
  hlsLib = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = chrome.runtime.getURL("hls/hls.min.js");
    el.onload = () => resolve(globalThis.Hls);
    el.onerror = () => {
      hlsLib = null;
      reject(new Error("无法加载播放器"));
    };
    document.head.appendChild(el);
  });
  return hlsLib;
}

function destroyHls() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
}

export function renderHlsWidget() {
  if (liveCard?.isConnected) return liveCard;
  const card = document.createElement("article");
  card.className = "widget widget--hls";
  card.dataset.widget = "hls";
  card.innerHTML = `
    <div class="widget__head">
      <h2 class="widget__title">HLS</h2>
    </div>
    <p class="empty-status" data-ph>暂无播放</p>
    <div class="hls-mini" data-root>
      <video data-video playsinline></video>
      <div class="hls-mini__hud" data-hud hidden>
        <div class="hls-mini__top">
          <span class="hls-mini__title" data-title></span>
          <button type="button" class="hls-mini__btn" data-open title="打开播放页" aria-label="打开播放页">${OPEN_ICON}</button>
        </div>
        <div class="hls-mini__bar">
          <button type="button" class="hls-mini__btn" data-prev title="上一台" aria-label="上一台">${PREV_ICON}</button>
          <button type="button" class="hls-mini__btn" data-toggle title="播放/暂停" aria-label="播放/暂停">${PAUSE_ICON}</button>
          <button type="button" class="hls-mini__btn" data-next title="下一台" aria-label="下一台">${NEXT_ICON}</button>
          <button type="button" class="hls-mini__btn" data-mute title="静音" aria-label="静音">${VOL_ICON}</button>
          <input class="hls-mini__vol" data-vol type="range" min="0" max="100" value="80" aria-label="音量" />
        </div>
      </div>
    </div>`;
  liveCard = card;
  bindHlsWidget(card);
  return card;
}

/**
 * @param {HTMLElement} card
 */
function bindHlsWidget(card) {
  const video = /** @type {HTMLVideoElement} */ (card.querySelector("[data-video]"));
  const ph = /** @type {HTMLElement} */ (card.querySelector("[data-ph]"));
  const hud = /** @type {HTMLElement} */ (card.querySelector("[data-hud]"));
  const titleEl = /** @type {HTMLElement} */ (card.querySelector("[data-title]"));
  const prevBtn = /** @type {HTMLButtonElement} */ (card.querySelector("[data-prev]"));
  const nextBtn = /** @type {HTMLButtonElement} */ (card.querySelector("[data-next]"));
  const toggleBtn = /** @type {HTMLButtonElement} */ (card.querySelector("[data-toggle]"));
  const muteBtn = /** @type {HTMLButtonElement} */ (card.querySelector("[data-mute]"));
  const openBtn = /** @type {HTMLButtonElement} */ (card.querySelector("[data-open]"));
  const volEl = /** @type {HTMLInputElement} */ (card.querySelector("[data-vol]"));

  function paintIdle(text) {
    destroyHls();
    video.removeAttribute("src");
    video.load();
    feedUrl = "";
    channels = [];
    channelIndex = 0;
    card.classList.remove("is-on");
    hud.hidden = true;
    ph.textContent = text;
  }

  function paintHud() {
    const item = channels[channelIndex];
    titleEl.textContent = item ? item.title : feedUrl;
    const hasList = channels.length > 1;
    prevBtn.hidden = !hasList;
    nextBtn.hidden = !hasList;
    toggleBtn.innerHTML = video.paused ? PLAY_ICON : PAUSE_ICON;
    muteBtn.innerHTML = video.muted || video.volume === 0 ? MUTE_ICON : VOL_ICON;
    volEl.value = String(Math.round((video.muted ? 0 : video.volume) * 100));
  }

  /**
   * @param {string[]} sources
   * @param {string} title
   */
  function playSource(sources, title, index = 0) {
    const list = sources.filter(Boolean);
    sourceIndex = Math.min(Math.max(0, index), Math.max(0, list.length - 1));
    const raw = list[sourceIndex] || "";
    destroyHls();
    video.removeAttribute("src");
    video.load();
    titleEl.textContent = title || raw;
    if (!raw) return;
    const HlsCtor = globalThis.Hls;
    if (!HlsCtor?.isSupported?.()) {
      paintIdle("当前浏览器无法播放 HLS");
      return;
    }
    hls = new HlsCtor({
      xhrSetup(xhr) {
        xhr.withCredentials = true;
      },
      fetchSetup(context, initParams) {
        initParams.credentials = "include";
        return new Request(context.url, initParams);
      },
    });
    hls.on(HlsCtor.Events.ERROR, (_event, data) => {
      if (!data || !data.fatal) return;
      hls?.destroy();
      hls = null;
      if (sourceIndex + 1 < list.length) {
        playSource(list, title, sourceIndex + 1);
        return;
      }
      paintIdle("无法播放这个地址");
    });
    hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
      void video.play().catch(() => {});
    });
    hls.loadSource(raw);
    hls.attachMedia(video);
  }

  /**
   * @param {string} url
   */
  async function startFeed(url) {
    card.classList.add("is-on");
    hud.hidden = false;
    video.volume = DEFAULT_VOLUME;
    video.muted = false;
    volEl.value = String(Math.round(DEFAULT_VOLUME * 100));
    feedUrl = url;
    channels = [];
    channelIndex = 0;
    const gen = ++loadGen;
    try {
      await ensureHlsLib();
      if (gen !== loadGen) return;
      if (!isChannelListUrl(feedUrl)) {
        channels = [{ title: feedUrl, url: feedUrl, sources: [feedUrl] }];
        playSource([feedUrl], feedUrl);
        paintHud();
        return;
      }
      const res = await fetch(feedUrl, { credentials: "include" });
      if (gen !== loadGen) return;
      if (!res.ok) throw new Error(`列表加载失败 ${res.status}`);
      const parsed = parseChannelList(await res.text(), feedUrl);
      if (parsed.kind === "hls" || !parsed.items.length) {
        channels = [{ title: feedUrl, url: feedUrl, sources: [feedUrl] }];
        playSource([feedUrl], feedUrl);
        paintHud();
        return;
      }
      channels = parsed.items;
      const item = channels[0];
      playSource(item.sources?.length ? item.sources : [item.url], item.title);
      paintHud();
    } catch (error) {
      if (gen !== loadGen) return;
      paintIdle(error instanceof Error ? error.message : String(error));
    }
  }

  async function applySession() {
    const [session, features] = await Promise.all([loadHlsSession(), loadFeatures()]);
    if (!isHlsEnabled(features)) {
      lastPlayId = session.playId;
      paintIdle("HLS 播放已关闭");
      return;
    }
    if (session.pendingUrl && session.playId !== lastPlayId) {
      lastPlayId = session.playId;
      void saveHlsSession({ pendingUrl: "" });
      await startFeed(session.pendingUrl);
      return;
    }
    if (session.playId === lastPlayId && lastPlayId !== 0) return;
    lastPlayId = session.playId;
    const store = await loadSourceStore();
    paintIdle(store.items.length ? "暂无播放" : "暂无播放源");
  }

  /**
   * @param {number} dir
   */
  function stepChannel(dir) {
    if (channels.length < 2) return;
    channelIndex = (channelIndex + dir + channels.length) % channels.length;
    const item = channels[channelIndex];
    playSource(item.sources?.length ? item.sources : [item.url], item.title);
    paintHud();
  }

  prevBtn.addEventListener("click", () => stepChannel(-1));
  nextBtn.addEventListener("click", () => stepChannel(1));
  toggleBtn.addEventListener("click", () => {
    if (video.paused) void video.play();
    else video.pause();
  });
  muteBtn.addEventListener("click", () => {
    video.muted = !video.muted;
    paintHud();
  });
  volEl.addEventListener("input", () => {
    const volume = Number(volEl.value) / 100;
    video.volume = volume;
    video.muted = volume === 0;
    paintHud();
  });
  openBtn.addEventListener("click", () => {
    if (!feedUrl) return;
    void chrome.tabs.create({ url: hlsPlayerPageUrl(feedUrl) });
  });
  video.addEventListener("play", paintHud);
  video.addEventListener("pause", paintHud);
  video.addEventListener("volumechange", paintHud);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[HLS_SESSION_KEY] || changes[FEATURES_KEY]) {
      if (changes[FEATURES_KEY] && !isHlsEnabled(normalizeFeatures(changes[FEATURES_KEY].newValue))) {
        paintIdle("HLS 播放已关闭");
        return;
      }
      void applySession();
    }
  });

  void applySession();
}
