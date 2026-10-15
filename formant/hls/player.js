/** @typedef {{ rate: number, rotation: number }} HlsSettings */

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const ROTATIONS = [0, 90, 180, 270];

/** @param {string} sel @param {ParentNode} [root] */
const $ = (sel, root = document) => root.querySelector(sel);

const video = /** @type {HTMLVideoElement} */ ($("#video"));
const playBtn = /** @type {HTMLButtonElement} */ ($("#play"));
const seek = /** @type {HTMLInputElement} */ ($("#seek"));
const timeEl = /** @type {HTMLElement} */ ($("#time"));
const volume = /** @type {HTMLInputElement} */ ($("#volume"));
const rateSel = /** @type {HTMLSelectElement} */ ($("#rate"));
const rotateBtn = /** @type {HTMLButtonElement} */ ($("#rotate"));
const saveBtn = /** @type {HTMLButtonElement} */ ($("#save"));
const statusEl = /** @type {HTMLElement} */ ($("#status"));
const progressEl = /** @type {HTMLElement} */ ($("#progress"));
const stage = /** @type {HTMLElement} */ ($(".stage"));

/** @type {HlsSettings} */
let settings = { rate: 1, rotation: 0 };
/** @type {any} */
let hls = null;
let recoverDecodingAt = 0;
let recoverSwapAt = 0;
let scrubbing = false;
/** @type {AbortController | null} */
let saveTask = null;

for (const rate of RATES) {
  const opt = document.createElement("option");
  opt.value = String(rate);
  opt.textContent = `${rate}x`;
  rateSel.appendChild(opt);
}

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
 * @param {number} delta
 */
function seekBy(delta) {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  const next = Math.min(duration, Math.max(0, (video.currentTime || 0) + delta));
  video.currentTime = next;
  scrubbing = false;
  paintTime();
}

/**
 * @param {number} sec
 */
function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const whole = Math.floor(sec);
  const s = whole % 60;
  const m = Math.floor(whole / 60) % 60;
  const h = Math.floor(whole / 3600);
  const pad = (n) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
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
  rateSel.value = String(next);
}

function stepRate(dir) {
  const index = RATES.indexOf(settings.rate);
  const start = index < 0 ? RATES.indexOf(1) : index;
  const next = RATES[Math.min(RATES.length - 1, Math.max(0, start + dir))];
  applyRate(next);
}

function applyRotation(rotation) {
  const next = ROTATIONS.includes(rotation) ? rotation : 0;
  settings.rotation = next;
  rotateBtn.textContent = `旋转 ${next}°`;
  fit();
}

function rotateStep() {
  const index = ROTATIONS.indexOf(settings.rotation);
  const next = ROTATIONS[(index < 0 ? 0 : index + 1) % ROTATIONS.length];
  applyRotation(next);
}

/** Size the element so the rotated picture stays fully inside the stage. */
function fit() {
  const sw = stage.clientWidth;
  const sh = stage.clientHeight;
  if (sw < 2 || sh < 2) return;
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const quarter = settings.rotation % 180 !== 0;
  const ew = quarter ? Math.min(sh, (sw * vw) / vh) : Math.min(sw, (sh * vw) / vh);
  const eh = (ew * vh) / vw;
  video.style.width = `${Math.max(1, Math.floor(ew))}px`;
  video.style.height = `${Math.max(1, Math.floor(eh))}px`;
  video.style.transform = `rotate(${settings.rotation}deg)`;
}

function paintTime() {
  const duration = video.duration;
  const live = !Number.isFinite(duration);
  seek.disabled = live || !duration;
  if (!scrubbing && !live) {
    seek.max = String(duration || 0);
    seek.value = String(video.currentTime || 0);
  }
  const total = live ? "直播" : formatTime(duration);
  timeEl.textContent = `${formatTime(video.currentTime)} / ${total}`;
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
  showStatus("解码失败，无法恢复");
}

function playSource(raw) {
  showStatus("");
  document.title = raw || "HLS";
  if (hls) {
    hls.destroy();
    hls = null;
  }
  video.removeAttribute("src");
  video.load();
  if (!raw) {
    showStatus("没有可播放的地址");
    return;
  }
  const HlsCtor = /** @type {any} */ (globalThis).Hls;
  if (!HlsCtor || !HlsCtor.isSupported()) {
    showStatus("当前浏览器无法播放 HLS");
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
    if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
      handleMediaError(hls);
      return;
    }
    if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) {
      showStatus("网络错误，无法继续加载");
      return;
    }
    showStatus("无法播放这个地址");
    hls.destroy();
    hls = null;
  });
  hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
    video.playbackRate = settings.rate;
    void video.play().catch(() => {
      playBtn.textContent = "播放";
    });
  });
  hls.loadSource(raw);
  hls.attachMedia(video);
}

playBtn.addEventListener("click", () => {
  if (video.paused) {
    void video.play();
  } else {
    video.pause();
  }
});

video.addEventListener("play", () => {
  playBtn.textContent = "暂停";
});

video.addEventListener("pause", () => {
  playBtn.textContent = "播放";
});

video.addEventListener("timeupdate", paintTime);
video.addEventListener("durationchange", paintTime);
video.addEventListener("loadedmetadata", () => {
  video.playbackRate = settings.rate;
  fit();
  paintTime();
});

seek.addEventListener("input", () => {
  scrubbing = true;
  if (!Number.isFinite(video.duration)) return;
  video.currentTime = Number(seek.value);
});

seek.addEventListener("change", () => {
  scrubbing = false;
});

volume.addEventListener("input", () => {
  video.volume = Number(volume.value);
  video.muted = video.volume === 0;
});

rateSel.addEventListener("change", () => {
  applyRate(Number(rateSel.value));
});

rotateBtn.addEventListener("click", rotateStep);

window.addEventListener("keydown", (event) => {
  const tag = event.target instanceof HTMLElement ? event.target.tagName : "";
  const typing = tag === "SELECT" || tag === "TEXTAREA" || event.target === volume;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if (typing) return;
    seekBy((event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 30 : 5));
    event.preventDefault();
    return;
  }
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  if (event.key === "[") {
    stepRate(-1);
    event.preventDefault();
  } else if (event.key === "]") {
    stepRate(1);
    event.preventDefault();
  } else if (event.key === "r" || event.key === "R") {
    rotateStep();
    event.preventDefault();
  }
});

saveBtn.addEventListener("click", () => {
  if (saveTask) {
    saveTask.abort();
    return;
  }
  const source = readSource();
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
  saveBtn.textContent = "取消";
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
      saveBtn.textContent = "存 MP4";
    });
});

window.addEventListener("hashchange", () => {
  playSource(readSource());
});

window.addEventListener("resize", fit);

if (typeof ResizeObserver === "function") {
  new ResizeObserver(fit).observe(stage);
}

void chrome.storage.local.remove("formantHls");
rateSel.value = "1";
rotateBtn.textContent = "旋转 0°";
video.playbackRate = 1;
fit();
playSource(readSource());
