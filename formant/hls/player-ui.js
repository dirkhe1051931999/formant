/** Overlay controls. Interaction follows DPlayer; the code is formant's. */
(function () {
  /** @param {string} sel @param {ParentNode} [root] */
  const $ = (sel, root = document) => root.querySelector(sel);

  const player = /** @type {HTMLElement} */ ($("#player"));
  const video = /** @type {HTMLVideoElement} */ ($("#video"));
  const mask = /** @type {HTMLElement} */ ($("#mask"));
  const playBtn = /** @type {HTMLButtonElement} */ ($("#play"));
  const muteBtn = /** @type {HTMLButtonElement} */ ($("#mute"));
  const fullBtn = /** @type {HTMLButtonElement} */ ($("#full"));
  const listBtn = /** @type {HTMLButtonElement} */ ($("#listBtn"));
  const settingBtn = /** @type {HTMLButtonElement} */ ($("#settingBtn"));
  const settingPanel = /** @type {HTMLElement} */ ($("#settingPanel"));
  const rateList = /** @type {HTMLElement} */ ($("#rateList"));
  const rotateBtn = /** @type {HTMLButtonElement} */ ($("#rotate"));
  const playlistClose = /** @type {HTMLButtonElement} */ ($("#playlistClose"));
  const barWrap = /** @type {HTMLElement} */ ($("#barWrap"));
  const barPlayed = /** @type {HTMLElement} */ ($("#barPlayed"));
  const barLoaded = /** @type {HTMLElement} */ ($("#barLoaded"));
  const barTime = /** @type {HTMLElement} */ ($("#barTime"));
  const timeEl = /** @type {HTMLElement} */ ($("#time"));
  const liveEl = /** @type {HTMLElement} */ ($("#live"));
  const volTrack = /** @type {HTMLElement} */ ($("#volTrack"));
  const volFill = /** @type {HTMLElement} */ ($("#volFill"));
  const bezel = /** @type {HTMLElement} */ ($("#bezel"));
  const bezelIcon = /** @type {HTMLElement} */ ($("#bezelIcon"));
  const loader = /** @type {HTMLElement} */ ($("#loader"));

  let hideTimer = 0;
  let clickTimer = 0;
  let scrubbing = false;
  let volDrag = false;

  /** @returns {any} */
  function core() {
    return globalThis.formantHlsCore;
  }

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

  function showCtrl() {
    player.classList.remove("is-hide");
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (video.paused || settingPanel.hidden === false || scrubbing || volDrag) return;
      player.classList.add("is-hide");
      settingPanel.hidden = true;
    }, 3000);
  }

  function paintRate(rate) {
    for (const btn of rateList.querySelectorAll("button")) {
      btn.classList.toggle("is-on", Number(btn.dataset.rate) === rate);
    }
  }

  function paintVolume() {
    const value = video.muted ? 0 : video.volume;
    volFill.style.width = `${Math.round(value * 100)}%`;
    player.classList.toggle("is-muted", value === 0);
  }

  function paintFull() {
    player.classList.toggle("is-full", Boolean(document.fullscreenElement));
  }

  function paintTime() {
    const duration = video.duration;
    const live = !Number.isFinite(duration) || duration <= 0;
    player.classList.toggle("is-live", live);
    liveEl.hidden = !live;
    if (live) {
      timeEl.textContent = `${formatTime(video.currentTime)} / 直播`;
      barPlayed.style.width = "0";
      barLoaded.style.width = "0";
      return;
    }
    if (!scrubbing) {
      barPlayed.style.width = `${(video.currentTime / duration) * 100}%`;
    }
    let loaded = 0;
    if (video.buffered.length) {
      loaded = video.buffered.end(video.buffered.length - 1) / duration;
    }
    barLoaded.style.width = `${Math.min(100, loaded * 100)}%`;
    timeEl.textContent = `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
  }

  function barRatio(clientX) {
    const rect = barWrap.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function showBarTip(clientX) {
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      barTime.hidden = true;
      return;
    }
    const ratio = barRatio(clientX);
    const rect = barWrap.getBoundingClientRect();
    barTime.hidden = false;
    barTime.textContent = formatTime(ratio * duration);
    barTime.style.left = `${ratio * rect.width}px`;
  }

  function seekRatio(ratio) {
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    video.currentTime = ratio * duration;
    barPlayed.style.width = `${ratio * 100}%`;
    paintTime();
  }

  function volRatio(clientX) {
    const rect = volTrack.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function flashBezel(paused) {
    bezelIcon.innerHTML = paused
      ? '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
    bezel.hidden = false;
    bezelIcon.style.animation = "none";
    void bezelIcon.offsetWidth;
    bezelIcon.style.animation = "";
    window.setTimeout(() => {
      bezel.hidden = true;
    }, 420);
  }

  function toggleFull() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void player.requestFullscreen();
  }

  function buildRates() {
    const api = core();
    const rates = api && api.RATES ? api.RATES : [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
    rateList.replaceChildren();
    for (const rate of rates) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.rate = String(rate);
      btn.textContent = `${rate}x`;
      btn.addEventListener("click", () => {
        core()?.applyRate(rate);
      });
      rateList.appendChild(btn);
    }
    paintRate(api && api.settings ? api.settings.rate : 1);
  }

  player.addEventListener("mousemove", showCtrl);
  player.addEventListener("click", showCtrl);
  function userToggle() {
    const api = core();
    if (!api) return;
    const willPlay = video.paused;
    api.togglePlay();
    flashBezel(!willPlay);
  }

  playBtn.addEventListener("click", userToggle);
  mask.addEventListener("click", () => {
    clearTimeout(clickTimer);
    clickTimer = window.setTimeout(userToggle, 200);
  });
  mask.addEventListener("dblclick", (event) => {
    event.preventDefault();
    clearTimeout(clickTimer);
    toggleFull();
  });

  barWrap.addEventListener("mousedown", (event) => {
    if (player.classList.contains("is-live")) return;
    scrubbing = true;
    player.classList.add("is-scrub");
    seekRatio(barRatio(event.clientX));
  });
  barWrap.addEventListener("mousemove", (event) => {
    showBarTip(event.clientX);
  });
  barWrap.addEventListener("mouseleave", () => {
    if (!scrubbing) barTime.hidden = true;
  });
  window.addEventListener("mousemove", (event) => {
    if (!scrubbing) return;
    seekRatio(barRatio(event.clientX));
    showBarTip(event.clientX);
  });
  window.addEventListener("mouseup", () => {
    if (!scrubbing) return;
    scrubbing = false;
    player.classList.remove("is-scrub");
    barTime.hidden = true;
    showCtrl();
  });

  muteBtn.addEventListener("click", () => {
    const api = core();
    if (!api) return;
    if (video.muted || video.volume === 0) api.unmute();
    else api.setVolume(0);
    paintVolume();
  });
  volTrack.addEventListener("mousedown", (event) => {
    volDrag = true;
    player.classList.add("is-vol");
    core()?.setVolume(volRatio(event.clientX));
    paintVolume();
  });
  window.addEventListener("mousemove", (event) => {
    if (!volDrag) return;
    core()?.setVolume(volRatio(event.clientX));
    paintVolume();
  });
  window.addEventListener("mouseup", () => {
    if (!volDrag) return;
    volDrag = false;
    player.classList.remove("is-vol");
    showCtrl();
  });

  settingBtn.addEventListener("click", () => {
    settingPanel.hidden = !settingPanel.hidden;
    showCtrl();
  });
  rotateBtn.addEventListener("click", () => {
    core()?.rotateStep();
  });
  listBtn.addEventListener("click", () => {
    core()?.togglePlaylist();
  });
  playlistClose.addEventListener("click", () => {
    core()?.togglePlaylist(false);
  });
  fullBtn.addEventListener("click", toggleFull);
  document.addEventListener("fullscreenchange", () => {
    paintFull();
    core()?.fit?.();
    showCtrl();
  });

  video.addEventListener("play", () => {
    player.classList.add("is-playing");
    playBtn.setAttribute("aria-label", "暂停");
    showCtrl();
  });
  video.addEventListener("pause", () => {
    player.classList.remove("is-playing");
    playBtn.setAttribute("aria-label", "播放");
    showCtrl();
  });
  video.addEventListener("timeupdate", paintTime);
  video.addEventListener("progress", paintTime);
  video.addEventListener("durationchange", paintTime);
  video.addEventListener("loadedmetadata", paintTime);
  video.addEventListener("volumechange", paintVolume);
  video.addEventListener("waiting", () => {
    loader.hidden = false;
  });
  video.addEventListener("playing", () => {
    loader.hidden = true;
  });
  video.addEventListener("canplay", () => {
    loader.hidden = true;
  });

  window.addEventListener("keydown", (event) => {
    const tag = event.target instanceof HTMLElement ? event.target.tagName : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const api = core();
    if (!api) return;
    showCtrl();
    if (event.key === " " || event.key === "k" || event.key === "K") {
      userToggle();
      event.preventDefault();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      api.seekBy((event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 30 : 5));
      event.preventDefault();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const cur = video.muted ? 0 : video.volume;
      api.setVolume(cur + (event.key === "ArrowUp" ? 0.05 : -0.05));
      paintVolume();
      event.preventDefault();
    } else if (event.key === "PageUp" || event.key === "PageDown" || event.key === "n" || event.key === "N" || event.key === "p" || event.key === "P") {
      api.stepChannel(event.key === "PageUp" || event.key === "p" || event.key === "P" ? -1 : 1);
      event.preventDefault();
    } else if (event.key === "[") {
      api.stepRate(-1);
    } else if (event.key === "]") {
      api.stepRate(1);
    } else if (event.key === "r" || event.key === "R") {
      api.rotateStep();
    } else if (event.key === "f" || event.key === "F") {
      toggleFull();
      event.preventDefault();
    } else if (event.key === "m" || event.key === "M") {
      if (video.muted || video.volume === 0) api.unmute();
      else api.setVolume(0);
      paintVolume();
    } else if (event.key === "l" || event.key === "L") {
      api.togglePlaylist();
    } else if (event.key === "Escape") {
      settingPanel.hidden = true;
      api.closePanels?.();
      api.togglePlaylist(false);
    }
  });

  globalThis.formantHlsUi = { paintRate, paintTime, showCtrl };
  buildRates();
  paintVolume();
  paintTime();
  paintFull();
  showCtrl();
})();
