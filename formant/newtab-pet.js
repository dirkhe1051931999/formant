import { resolveWeatherIconKey } from "./weather-icons.js";

const PUG_SVG = `<svg class="pug-svg" viewBox="0 0 90 78" aria-hidden="true">
  <ellipse class="pug-shadow" cx="45" cy="74" rx="22" ry="3.2"/>
  <g class="pug-figure">
    <g class="pug-tail">
      <path d="M16 52c-8 1-10-10-2-13 6-2 9 5 7 10-1 4-4 4-5 3z"/>
      <path d="M15 44c1 3.4 1 7.2-.4 10" fill="none" stroke="#a56b36" stroke-width="1.4" stroke-linecap="round"/>
    </g>
    <g class="pug-leg pug-leg--hf">
      <rect x="24" y="52" width="8" height="16" rx="4"/>
      <ellipse cx="27.2" cy="68" rx="5.2" ry="2.4"/>
    </g>
    <g class="pug-leg pug-leg--hn">
      <rect x="35" y="52" width="8" height="16" rx="4"/>
      <ellipse cx="38.2" cy="68" rx="5.2" ry="2.4"/>
    </g>
    <ellipse class="pug-torso" cx="42" cy="54" rx="22" ry="13"/>
    <ellipse class="pug-belly" cx="44" cy="58" rx="14" ry="8"/>
    <g class="pug-leg pug-leg--ff">
      <rect x="44" y="54" width="7.2" height="16" rx="3.6"/>
      <ellipse cx="47.2" cy="70" rx="5.2" ry="2.4"/>
    </g>
    <g class="pug-leg pug-leg--fn">
      <rect x="55" y="54" width="7.2" height="16" rx="3.6"/>
      <ellipse cx="58.2" cy="70" rx="5.2" ry="2.4"/>
    </g>
    <g class="pug-head">
      <ellipse class="pug-ear" cx="26" cy="24" rx="4.6" ry="5.8" transform="rotate(-32 26 24)"/>
      <ellipse class="pug-ear" cx="74" cy="24" rx="4.6" ry="5.8" transform="rotate(32 74 24)"/>
      <ellipse class="pug-skull" cx="50" cy="26" rx="23" ry="21"/>
      <ellipse class="pug-mask" cx="40" cy="31" rx="5.6" ry="6"/>
      <ellipse class="pug-mask" cx="60" cy="31" rx="5.6" ry="6"/>
      <ellipse class="pug-muzzle" cx="50" cy="42" rx="9.2" ry="5.8"/>
      <ellipse class="pug-eye-w" cx="40" cy="30.6" rx="3.6" ry="4.2"/>
      <ellipse class="pug-eye-w" cx="60" cy="30.6" rx="3.6" ry="4.2"/>
      <circle class="pug-pupil" cx="40.7" cy="31.3" r="1.8"/>
      <circle class="pug-pupil" cx="60.7" cy="31.3" r="1.8"/>
      <circle class="pug-glint" cx="41.3" cy="30.4" r=".5"/>
      <circle class="pug-glint" cx="61.3" cy="30.4" r=".5"/>
      <path class="pug-eye-shut" d="M36.6 31.4c2.2 2.4 4.6 2.4 6.8 0"/>
      <path class="pug-eye-shut" d="M56.6 31.4c2.2 2.4 4.6 2.4 6.8 0"/>
      <ellipse class="pug-nose" cx="50" cy="40.4" rx="3.8" ry="2.5"/>
      <path class="pug-smile" d="M44.6 45.4c3.6 2.8 7.2 2.8 10.8 0"/>
      <path class="pug-tongue" d="M45.8 45.2c2.4 8.2 7.6 8.2 10 0"/>
    </g>
  </g>
</svg>`;

const MOOD = {
  sunny: { speed: 42, sit: 0.12, idle: 0.22, label: "晴天蹦跶" },
  calm: { speed: 30, sit: 0.16, idle: 0.32, label: "散步" },
  fog: { speed: 16, sit: 0.28, idle: 0.4, label: "雾里慢慢走" },
  rain: { speed: 18, sit: 0.28, idle: 0.3, label: "下雨了" },
  snow: { speed: 16, sit: 0.32, idle: 0.3, label: "下雪了" },
  cold: { speed: 12, sit: 0.48, idle: 0.28, label: "好冷在发抖" },
  hot: { speed: 16, sit: 0.4, idle: 0.32, label: "好热在喘气" },
  thunder: { speed: 24, sit: 0.18, idle: 0.42, label: "打雷会吓一跳" },
};

/**
 * @param {{ iconDay?: unknown, text?: unknown, temp?: unknown } | null | undefined} weather
 */
export function resolvePugMood(weather) {
  if (!weather || typeof weather !== "object") return "calm";
  const sky = resolveWeatherIconKey(weather.iconDay, String(weather.text || ""));
  const temp = Number(weather.temp);
  const hot = Number.isFinite(temp) && temp >= 30;
  const cold = Number.isFinite(temp) && temp <= 5;
  if (sky === "thunder") return "thunder";
  if (sky === "rain") return "rain";
  if (sky === "snow") return "snow";
  if (cold) return "cold";
  if (hot) return "hot";
  if (sky === "sunny") return "sunny";
  if (sky === "fog") return "fog";
  return "calm";
}

/**
 * @param {HTMLElement} yard
 * @param {{ iconDay?: unknown, text?: unknown, temp?: unknown } | null} [weather]
 */
export function mountPug(yard, weather = null) {
  if (!(yard instanceof HTMLElement) || yard.dataset.pugMounted === "1") return;
  yard.dataset.pugMounted = "1";
  yard.classList.add("weather-pet");
  const mood = resolvePugMood(weather);
  const spec = MOOD[mood] || MOOD.calm;
  const hint = `巴哥：${spec.label}。按住抚摸，点一下挑逗`;
  yard.innerHTML = `<button type="button" class="pug is-mood-${mood}" aria-label="${hint}" title="${hint}">
    <span class="pug-bark" aria-hidden="true">汪</span>
    <div class="pug-inner">
      <span class="pug-sky" aria-hidden="true">
        <svg class="pug-cloud" viewBox="0 0 32 14">
          <ellipse cx="10" cy="9" rx="7" ry="5"/>
          <ellipse cx="16" cy="6.5" rx="8" ry="6"/>
          <ellipse cx="23" cy="9" rx="7" ry="5"/>
        </svg>
        <span class="pug-drop"></span>
        <span class="pug-drop"></span>
        <span class="pug-drop"></span>
        <span class="pug-flake"></span>
        <span class="pug-flake"></span>
        <span class="pug-flake"></span>
      </span>
      ${PUG_SVG}
    </div>
  </button>`;

  const pug = yard.querySelector(".pug");
  if (!(pug instanceof HTMLElement)) return;

  /** @type {"walk" | "idle" | "sit" | "pet" | "tease"} */
  let mode = "walk";
  let x = 8 + Math.random() * 24;
  let dir = Math.random() < 0.5 ? -1 : 1;
  let until = performance.now() + 1800 + Math.random() * 1200;
  /** @type {number | null} */
  let target = null;
  let last = performance.now();
  let holdTimer = 0;
  let holding = false;
  let heartAt = 0;
  let nextAct = performance.now() + 900 + Math.random() * 800;

  function yardActive() {
    if (!yard.isConnected || document.hidden) return false;
    const face = yard.closest(".wx-flip__face--weather");
    if (face?.getAttribute("aria-hidden") === "true") return false;
    return yard.clientWidth > 8;
  }

  function reduced() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function maxX() {
    return Math.max(0, yard.clientWidth - pug.offsetWidth);
  }

  function setMode(next, ms = 0) {
    mode = next;
    until = ms ? performance.now() + ms : 0;
    if (next !== "walk") target = null;
  }

  function spawnHeart() {
    const heart = document.createElement("span");
    heart.className = "pug-heart";
    heart.textContent = "♥";
    heart.style.left = `${38 + Math.random() * 28}%`;
    pug.append(heart);
    heart.addEventListener("animationend", () => heart.remove());
  }

  function tease() {
    setMode("tease", 720);
    dir = Math.random() < 0.5 ? -dir : dir;
  }

  function pet() {
    setMode("pet");
    spawnHeart();
    heartAt = performance.now();
  }

  function frame(now) {
    if (!yard.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const active = yardActive();
    const reduce = reduced();
    const limit = maxX();
    x = Math.max(0, Math.min(limit, x));

    if (active && mode === "pet" && now - heartAt > 240) {
      spawnHeart();
      heartAt = now;
    }

    if (active && mode !== "pet" && !reduce) {
      if (until && now >= until) {
        until = 0;
        if (mode === "tease") setMode("walk", 1400 + Math.random() * 1600);
        else if (mode === "walk" && target == null) {
          const roll = Math.random();
          if (roll < spec.idle) setMode("idle", 700 + Math.random() * 1100);
          else if (roll < spec.idle + spec.sit) setMode("sit", 1200 + Math.random() * 1800);
          else {
            if (Math.random() < 0.45) dir *= -1;
            setMode("walk", 1600 + Math.random() * 2400);
          }
        } else if (mode === "idle" || mode === "sit") {
          dir = Math.random() < 0.5 ? -1 : 1;
          setMode("walk", 1800 + Math.random() * 2600);
        }
      }

      if (mode === "walk" || mode === "tease") {
        if (target != null) {
          const goal = Math.max(0, Math.min(limit, target));
          if (Math.abs(goal - x) < 1.8) {
            x = goal;
            target = null;
            setMode("idle", 640);
          } else dir = goal > x ? 1 : -1;
        }
        x += dir * (mode === "tease" ? 96 : spec.speed) * dt;
        if (x <= 0) {
          x = 0;
          dir = 1;
          target = null;
        } else if (x >= limit) {
          x = limit;
          dir = -1;
          target = null;
        }
      }
    } else if (reduce && mode !== "pet" && mode !== "tease") {
      mode = "sit";
    }

    if (active && !reduce && mode !== "pet" && mode !== "tease" && now >= nextAct) {
      if (mood === "thunder") {
        pug.classList.add("is-flinch");
        nextAct = now + 1600 + Math.random() * 1400;
        window.setTimeout(() => pug.classList.remove("is-flinch"), 560);
      } else {
        nextAct = now + 4000;
      }
    }

    pug.style.left = `${x}px`;
    pug.classList.toggle("is-left", dir < 0);
    pug.classList.toggle("is-walk", mode === "walk" && !reduce);
    pug.classList.toggle("is-sit", mode === "sit");
    pug.classList.toggle("is-idle", mode === "idle");
    pug.classList.toggle("is-pet", mode === "pet");
    pug.classList.toggle("is-tease", mode === "tease");
    requestAnimationFrame(frame);
  }

  yard.addEventListener("pointerdown", (event) => {
    if (!yardActive() || event.button !== 0) return;
    const onPug = event.target instanceof Element && Boolean(event.target.closest(".pug"));
    if (!onPug) return;
    event.preventDefault();
    holding = true;
    try {
      pug.setPointerCapture(event.pointerId);
    } catch {
      /* ignore when the pointer id is synthetic */
    }
    holdTimer = window.setTimeout(() => {
      if (holding) pet();
    }, 280);
  });

  yard.addEventListener("pointerup", (event) => {
    if (!holding) {
      if (event.button !== 0 || !yardActive()) return;
      if (event.target instanceof Element && event.target.closest(".pug")) return;
      const rect = yard.getBoundingClientRect();
      target = event.clientX - rect.left - pug.offsetWidth / 2;
      setMode("walk", 4000);
      return;
    }
    holding = false;
    window.clearTimeout(holdTimer);
    if (mode === "pet") setMode("idle", 700);
    else tease();
  });

  yard.addEventListener("pointercancel", () => {
    holding = false;
    window.clearTimeout(holdTimer);
    if (mode === "pet") setMode("idle", 400);
  });

  requestAnimationFrame(frame);
}
