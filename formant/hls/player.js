import { isChannelListUrl, parseChannelList } from "./m3u-lib.js";
import { bindPanels, rememberFeed } from "./player-panels.js";

/** @typedef {{ rate: number, rotation: number }} HlsSettings */

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const ROTATIONS = [0, 90, 180, 270];

/** @param {string} sel @param {ParentNode} [root] */
const $ = (sel, root = document) => root.querySelector(sel);

const playerEl = /** @type {HTMLElement} */ ($("#player"));
const video = /** @type {HTMLVideoElement} */ ($("#video"));
const stage = /** @type {HTMLElement} */ ($("#stage"));
const titleEl = /** @type {HTMLElement} */ ($("#title"));
const rotateBtn = /** @type {HTMLButtonElement} */ ($("#rotate"));
const saveBtn = /** @type {HTMLButtonElement} */ ($("#save"));
const listBtn = /** @type {HTMLButtonElement} */ ($("#listBtn"));
const statusEl = /** @type {HTMLElement} */ ($("#status"));
const progressEl = /** @type {HTMLElement} */ ($("#progress"));
const loaderEl = /** @type {HTMLElement} */ ($("#loader"));
const playlistEl = /** @type {HTMLElement} */ ($("#playlist"));
const playlistHead = /** @type {HTMLElement} */ ($("#playlistHead"));
const playlistList = /** @type {HTMLElement} */ ($("#playlistList"));

/** @type {HlsSettings} */
let settings = { rate: 1, rotation: 0 };
/** @type {any} */
let hls = null;
let recoverDecodingAt = 0;
let recoverSwapAt = 0;
/** @type {AbortController | null} */
let saveTask = null;
/** @type {{ title: string, url: string, group?: string, sources?: string[] }[]} */
let playlistItems = [];
/** @type {{ title: string, url: string, group?: string, sources?: string[] } | null} */
let activeItem = null;
let sourceIndex = 0;
let playUrl = "";
let listUrl = "";
let playlistRaw = "";
let loadGen = 0;
let lastVolume = 1;

/**
 * @param {string} text
 */
function showStatus(text) {
  statusEl.hidden = !text;
  statusEl.textContent = text;
}

/**
 * @param {string} text
 */
function showProgress(text) {
  progressEl.hidden = !text;
  progressEl.textContent = text;
}

/**
 * @param {boolean} on
 */
function setLoading(on) {
  loaderEl.hidden = !on;
}

/**
 * @param {number} delta
 */
function seekBy(delta) {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  video.currentTime = Math.min(duration, Math.max(0, (video.currentTime || 0) + delta));
}

/**
 * @param {number} next
 */
function setVolume(next) {
  const value = Math.min(1, Math.max(0, next));
  if (value > 0) lastVolume = value;
  video.volume = value;
  video.muted = value === 0;
  playerEl.classList.toggle("is-muted", video.muted || value === 0);
}

function unmute() {
  setVolume(lastVolume || 1);
}

function togglePlay() {
  if (video.paused) void video.play();
  else video.pause();
}

function readSource() {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  if (!hash) return "";
  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}

function applyRate(rate) {
  const next = RATES.includes(rate) ? rate : 1;
  settings.rate = next;
  video.playbackRate = next;
  const ui = /** @type {any} */ (globalThis).formantHlsUi;
  if (ui && typeof ui.paintRate === "function") ui.paintRate(next);
}

function stepRate(dir) {
  const index = RATES.indexOf(settings.rate);
  const start = index < 0 ? RATES.indexOf(1) : index;
  applyRate(RATES[Math.min(RATES.length - 1, Math.max(0, start + dir))]);
}

function applyRotation(rotation) {
  const next = ROTATIONS.includes(rotation) ? rotation : 0;
  settings.rotation = next;
  rotateBtn.textContent = `旋转 ${next}°`;
  fit();
}

function rotateStep() {
  const index = ROTATIONS.indexOf(settings.rotation);
  applyRotation(ROTATIONS[(index < 0 ? 0 : index + 1) % ROTATIONS.length]);
}

function fit() {
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  if (sw < 2 || sh < 2) return;
  if (!settings.rotation) {
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "contain";
    video.style.transform = "";
    return;
  }
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const quarter = settings.rotation % 180 !== 0;
  const ew = quarter ? Math.min(sh, (sw * vw) / vh) : Math.min(sw, (sh * vw) / vh);
  video.style.objectFit = "fill";
  video.style.width = `${Math.max(1, Math.floor(ew))}px`;
  video.style.height = `${Math.max(1, Math.floor((ew * vh) / vw))}px`;
  video.style.transform = `rotate(${settings.rotation}deg)`;
}

/**
 * @param {any} player
 */
function handleMediaError(player) {
  const now = performance.now();
  if (!recoverDecodingAt || now - recoverDecodingAt > 3000) {
    recoverDecodingAt = now;
    player.recoverMediaError();
    return;
  }
  if (!recoverSwapAt || now - recoverSwapAt > 3000) {
    recoverSwapAt = now;
    player.swapAudioCodec();
    player.recoverMediaError();
    return;
  }
  setLoading(false);
  if (tryNextSource()) return;
  showStatus("解码失败，无法恢复");
}

function currentSources() {
  if (activeItem && activeItem.sources && activeItem.sources.length) return activeItem.sources;
  return playUrl ? [playUrl] : [];
}

function sourceLabel() {
  const sources = currentSources();
  if (sources.length < 2) return "";
  return `切源 ${sourceIndex + 1}/${sources.length}`;
}

function hidePlaylist() {
  playlistItems = [];
  activeItem = null;
  sourceIndex = 0;
  playlistEl.hidden = true;
  playlistEl.classList.remove("is-open");
  playlistList.replaceChildren();
  listBtn.hidden = true;
}

/**
 * @param {boolean} [force]
 */
function togglePlaylist(force) {
  if (!playlistItems.length) return;
  const open = typeof force === "boolean" ? force : !playlistEl.classList.contains("is-open");
  playlistEl.hidden = false;
  playlistEl.classList.toggle("is-open", open);
}

function renderPlaylist() {
  const empty = playlistItems.length === 0;
  listBtn.hidden = empty;
  playlistEl.hidden = empty;
  playlistHead.textContent = `频道 ${playlistItems.length}`;
  playlistList.replaceChildren();
  let lastGroup = "";
  for (const item of playlistItems) {
    const group = item.group || "";
    if (group && group !== lastGroup) {
      lastGroup = group;
      const head = document.createElement("div");
      head.className = "playlist__group";
      head.textContent = group;
      playlistList.appendChild(head);
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "playlist__item";
    if (item === activeItem) btn.classList.add("is-active");
    const name = document.createElement("span");
    name.className = "playlist__name";
    name.textContent = item.title;
    btn.appendChild(name);
    const count = item.sources ? item.sources.length : 1;
    if (count > 1) {
      const badge = document.createElement("span");
      badge.className = "playlist__badge";
      badge.textContent = `${count}`;
      btn.appendChild(badge);
    }
    btn.addEventListener("click", () => {
      playItem(item);
    });
    playlistList.appendChild(btn);
  }
  const active = playlistList.querySelector(".is-active");
  if (active) active.scrollIntoView({ block: "nearest" });
  panels.paintInfo();
}

/**
 * @param {{ title: string, url: string, sources?: string[] }} item
 * @param {number} [index]
 */
function playItem(item, index = 0) {
  activeItem = item;
  const sources = item.sources && item.sources.length ? item.sources : [item.url];
  sourceIndex = Math.min(Math.max(0, index), sources.length - 1);
  playUrl = sources[sourceIndex] || "";
  renderPlaylist();
  playSource(playUrl, item.title);
}

/**
 * @param {number} dir
 */
function stepChannel(dir) {
  if (!playlistItems.length) return;
  const index = playlistItems.indexOf(activeItem);
  const start = index < 0 ? 0 : index;
  const next = playlistItems[Math.min(playlistItems.length - 1, Math.max(0, start + dir))];
  if (next && next !== activeItem) playItem(next);
}

/**
 * @param {boolean} [wrap]
 */
function tryNextSource(wrap) {
  const sources = currentSources();
  if (sources.length < 2) return false;
  if (sourceIndex + 1 >= sources.length) {
    if (!wrap) return false;
    sourceIndex = 0;
  } else {
    sourceIndex += 1;
  }
  playUrl = sources[sourceIndex];
  showProgress(`切源 ${sourceIndex + 1}/${sources.length}`);
  renderPlaylist();
  playSource(playUrl, activeItem ? activeItem.title : "");
  return true;
}

/**
 * @param {string} raw
 * @param {string} [title]
 */
function playSource(raw, title) {
  playUrl = raw;
  showStatus("");
  const label = sourceLabel();
  titleEl.textContent = label && title ? `${title} · ${label}` : title || "";
  document.title = title || raw || "HLS";
  if (hls) {
    hls.destroy();
    hls = null;
  }
  video.removeAttribute("src");
  video.load();
  if (!raw) {
    setLoading(false);
    showStatus("没有可播放的地址");
    return;
  }
  const HlsCtor = /** @type {any} */ (globalThis).Hls;
  if (!HlsCtor || !HlsCtor.isSupported()) {
    setLoading(false);
    showStatus("当前浏览器无法播放 HLS");
    return;
  }
  setLoading(true);
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
    if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
      handleMediaError(hls);
      return;
    }
    hls.destroy();
    hls = null;
    if (tryNextSource()) return;
    setLoading(false);
    showStatus(data.type === HlsCtor.ErrorTypes.NETWORK_ERROR ? "网络错误，无法继续加载" : "无法播放这个地址");
  });
  hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
    video.playbackRate = settings.rate;
    void video.play().catch(() => {
      setLoading(false);
    });
  });
  hls.loadSource(raw);
  hls.attachMedia(video);
}

/**
 * @param {string} raw
 */
async function openEntry(raw) {
  const gen = ++loadGen;
  hidePlaylist();
  listUrl = "";
  playlistRaw = "";
  if (!raw) {
    playSource("");
    panels.paintInfo();
    return;
  }
  if (!isChannelListUrl(raw)) {
    playSource(raw);
    panels.paintInfo();
    return;
  }
  setLoading(true);
  showStatus("正在加载播放列表…");
  try {
    const res = await fetch(raw, { credentials: "include" });
    if (gen !== loadGen) return;
    if (!res.ok) throw new Error(`列表加载失败 ${res.status}`);
    const text = await res.text();
    if (gen !== loadGen) return;
    const parsed = parseChannelList(text, raw);
    if (parsed.kind === "hls") {
      showStatus("");
      playSource(raw);
      return;
    }
    if (!parsed.items.length) {
      setLoading(false);
      showStatus("播放列表是空的，或站点拦了列表请求");
      playSource("");
      return;
    }
    showStatus("");
    listUrl = raw;
    playlistRaw = text;
    playlistItems = parsed.items;
    void rememberFeed(raw);
    togglePlaylist(true);
    playItem(parsed.items[0]);
  } catch (error) {
    if (gen !== loadGen) return;
    setLoading(false);
    showStatus(error instanceof Error ? error.message : String(error));
    playSource("");
  }
}

saveBtn.addEventListener("click", () => {
  if (saveTask) {
    saveTask.abort();
    return;
  }
  const source = playUrl || readSource();
  if (!source) {
    showStatus("没有可保存的地址");
    return;
  }
  const save = /** @type {any} */ (globalThis).formantSaveHlsMp4;
  if (typeof save !== "function") {
    showStatus("保存功能没有加载");
    return;
  }
  const controller = new AbortController();
  saveTask = controller;
  saveBtn.setAttribute("aria-label", "取消保存");
  showStatus("");
  showProgress("正在准备保存…");
  void save(source, {
    signal: controller.signal,
    onProgress: showProgress,
  })
    .then((message) => {
      showProgress(typeof message === "string" ? message : "已开始下载 MP4");
    })
    .catch((error) => {
      showProgress("");
      if (error && error.name === "AbortError") return;
      showStatus(error instanceof Error ? error.message : String(error));
    })
    .finally(() => {
      saveTask = null;
      saveBtn.setAttribute("aria-label", "存 MP4");
    });
});

window.addEventListener("hashchange", () => {
  void openEntry(readSource());
});

window.addEventListener("resize", fit);

if (typeof ResizeObserver === "function") {
  new ResizeObserver(fit).observe(stage);
}

const panels = bindPanels({
  onOpenFeed(url) {
    location.hash = encodeURIComponent(url);
  },
  getListUrl: () => listUrl,
  getPlayUrl: () => playUrl,
  getRaw: () => playlistRaw,
  getSourceLabel: sourceLabel,
  onNextSource: () => {
    tryNextSource(true);
  },
});

globalThis.formantHlsCore = {
  playerEl,
  video,
  settings,
  RATES,
  togglePlay,
  seekBy,
  applyRate,
  stepRate,
  rotateStep,
  setVolume,
  unmute,
  stepChannel,
  togglePlaylist,
  hasPlaylist: () => playlistItems.length > 0,
  closePanels: () => panels.close(),
  fit,
};

try {
  void chrome.storage.local.remove("formantHls");
} catch {
  /* extension page only */
}
video.playbackRate = 1;
setVolume(1);
fit();
void openEntry(readSource());
