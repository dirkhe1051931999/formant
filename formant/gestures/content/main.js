(() => {
  "use strict";

  const FEATURES_KEY = "formantFeatures";
  const SETTINGS_KEY = "formantGestures";
  const HOST_ID = "formant-gestures-trail";
  const STEP_MIN = 16;
  const SECOND_WAIT_MS = 520;
  const ACTION_LABELS = {
    back: "后退",
    forward: "前进",
    reload: "刷新",
    closeTab: "关闭标签",
    scrollTop: "到顶",
    scrollBottom: "到底",
  };
  const DEFAULT_BINDINGS = {
    back: "L",
    forward: "R",
    reload: "UD",
    closeTab: "DR",
    scrollTop: "U",
    scrollBottom: "D",
  };

  const engine = globalThis.FormantGestureEngine;
  if (!engine) {
    console.warn("[formant] gesture engine missing");
    return;
  }

  let state = { enabled: false, minDistance: 10, bindings: { ...DEFAULT_BINDINGS } };
  let stroke = null;
  let pendingStrokes = [];
  let pendingTimer = 0;
  let suppressMenu = false;
  let host = null;
  let svg = null;
  let linesGroup = null;
  let label = null;

  function bindingPath(raw) {
    if (typeof raw === "string") return raw;
    if (raw && typeof raw === "object") return String(raw.path || "");
    return "";
  }

  function normalizePath(raw) {
    const text = String(raw || "")
      .toUpperCase()
      .replace(/\s+/g, "");
    if (!text) return "";
    if (text === "O" || text === "CIRCLE") return "O";
    if (text === "X" || text === "CROSS") return "X";
    const chars = text.replace(/[^LRUD]/g, "").split("");
    const out = [];
    for (const ch of chars) {
      if (out[out.length - 1] !== ch) out.push(ch);
    }
    return out.join("").slice(0, 8);
  }

  function actionForPath(path) {
    const key = engine.canonicalGesturePath(normalizePath(path));
    if (!key) return "";
    for (const action of Object.keys(state.bindings)) {
      if (engine.canonicalGesturePath(normalizePath(state.bindings[action])) === key) return action;
    }
    return "";
  }

  function hideTrail() {
    if (!host) return;
    host.hidden = true;
    if (linesGroup) linesGroup.replaceChildren();
    if (label) {
      label.hidden = true;
      label.textContent = "";
    }
  }

  function ensureTrail() {
    if (host && svg && linesGroup && label) return;
    host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      document.documentElement.appendChild(host);
    }
    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    if (!shadow.querySelector("style")) {
      const style = document.createElement("style");
      style.textContent = `
        :host { all: initial; pointer-events: none !important; }
        .root { position: fixed; inset: 0; z-index: 2147483646; pointer-events: none; }
        svg { width: 100%; height: 100%; }
        polyline { fill: none; stroke: #1f4b99; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
        .label {
          position: fixed; left: 16px; bottom: 18px; padding: 6px 10px; border-radius: 8px;
          background: #151a22; color: #fff; font: 650 12px/1.3 sans-serif;
        }
        .label[hidden] { display: none !important; }
      `;
      shadow.appendChild(style);
    }
    svg = shadow.querySelector("svg");
    if (!svg) {
      const root = document.createElement("div");
      root.className = "root";
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      linesGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      label = document.createElement("div");
      label.className = "label";
      label.hidden = true;
      svg.appendChild(linesGroup);
      root.append(svg, label);
      shadow.appendChild(root);
    } else {
      linesGroup = svg.querySelector("g") || svg;
      label = shadow.querySelector(".label");
    }
    host.hidden = true;
  }

  function paintTrail(strokes, action) {
    ensureTrail();
    if (!host || !svg || !linesGroup || !label) return;
    svg.setAttribute("viewBox", `0 0 ${Math.max(1, window.innerWidth)} ${Math.max(1, window.innerHeight)}`);
    host.hidden = false;
    linesGroup.replaceChildren();
    for (const points of strokes) {
      if (!points?.length) continue;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      line.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
      linesGroup.appendChild(line);
    }
    const text = action ? ACTION_LABELS[action] || action : "";
    label.hidden = !text;
    label.textContent = text;
  }

  function matchAction(strokes) {
    return actionForPath(engine.recognizeGesture(strokes, { stepMin: STEP_MIN }));
  }

  function load() {
    chrome.storage.local.get([FEATURES_KEY, SETTINGS_KEY], (data) => {
      const features = data[FEATURES_KEY] && typeof data[FEATURES_KEY] === "object" ? data[FEATURES_KEY] : {};
      const raw = data[SETTINGS_KEY] && typeof data[SETTINGS_KEY] === "object" ? data[SETTINGS_KEY] : {};
      const bindingsRaw = raw.bindings && typeof raw.bindings === "object" ? raw.bindings : {};
      const bindings = { ...DEFAULT_BINDINGS };
      for (const action of Object.keys(DEFAULT_BINDINGS)) {
        const path = normalizePath(bindingPath(bindingsRaw[action] ?? bindings[action]));
        if (path) bindings[action] = path;
        else bindings[action] = "";
      }
      const min = Number(raw.minDistance);
      state = {
        enabled: features.gestures?.enabled === true,
        minDistance: Number.isFinite(min) ? Math.min(40, Math.max(6, Math.round(min))) : 10,
        bindings,
      };
      if (!state.enabled) {
        stroke = null;
        pendingStrokes = [];
        window.clearTimeout(pendingTimer);
        pendingTimer = 0;
        suppressMenu = false;
        hideTrail();
      }
    });
  }

  function startStroke(event) {
    if (pendingStrokes.length && pendingTimer) {
      window.clearTimeout(pendingTimer);
      pendingTimer = 0;
    } else if (pendingStrokes.length) {
      commitPending();
    }
    stroke = {
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      suppress: false,
      points: [{ x: event.clientX, y: event.clientY }],
    };
  }

  function extendStroke(event) {
    if (!stroke) return;
    const point = { x: event.clientX, y: event.clientY };
    const step = Math.hypot(point.x - stroke.lastX, point.y - stroke.lastY);
    const fromStart = Math.hypot(point.x - stroke.x, point.y - stroke.y);
    if (fromStart >= state.minDistance) stroke.suppress = true;
    if (step < 2) return;
    if (step >= STEP_MIN) {
      stroke.lastX = point.x;
      stroke.lastY = point.y;
    }
    stroke.points.push(point);
    if (!stroke.suppress) return;
    const strokes = pendingStrokes.concat([stroke.points]);
    let action = "";
    try {
      action = matchAction(strokes);
    } catch {
      action = "";
    }
    paintTrail(strokes, action);
  }

  function commitPending() {
    window.clearTimeout(pendingTimer);
    const strokes = pendingStrokes;
    pendingStrokes = [];
    pendingTimer = 0;
    hideTrail();
    window.setTimeout(() => {
      suppressMenu = false;
    }, 80);
    if (!strokes.length) {
      suppressMenu = false;
      return;
    }
    const action = matchAction(strokes);
    if (!action) return;
    try {
      chrome.runtime.sendMessage({ type: "FORMANT_GESTURE_RUN", action });
    } catch {
      /* ignore */
    }
  }

  function finishStroke() {
    const current = stroke;
    stroke = null;
    if (!current?.suppress) {
      if (pendingStrokes.length) commitPending();
      else hideTrail();
      return;
    }
    suppressMenu = true;
    pendingStrokes.push(current.points);
    const pathGuess = engine.recognizeGesture(pendingStrokes, { stepMin: STEP_MIN });
    const waitForX =
      Boolean(actionForPath("X")) &&
      pendingStrokes.length < 2 &&
      pathGuess !== "O" &&
      pathGuess !== "X" &&
      engine.mightBeFirstStrokeOfX(current.points);
    if (!waitForX) {
      commitPending();
      return;
    }
    paintTrail(pendingStrokes, matchAction(pendingStrokes));
    pendingTimer = window.setTimeout(() => commitPending(), SECOND_WAIT_MS);
  }

  function isEditable(node) {
    if (!(node instanceof Element)) return false;
    return Boolean(node.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']"));
  }

  function onDown(event) {
    if (!state.enabled || event.button !== 2 || isEditable(event.target)) return;
    if (stroke) return;
    startStroke(event);
  }

  function onMove(event) {
    if (!state.enabled || !stroke) return;
    extendStroke(event);
  }

  function onUp(event) {
    if (!state.enabled || event.button !== 2) return;
    finishStroke();
  }

  function onContextMenu(event) {
    if (!state.enabled) return;
    if (stroke?.suppress || suppressMenu) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  window.addEventListener("pointerdown", onDown, true);
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("mousedown", onDown, true);
  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("mouseup", onUp, true);
  window.addEventListener("contextmenu", onContextMenu, true);
  window.addEventListener("blur", () => {
    stroke = null;
    pendingStrokes = [];
    window.clearTimeout(pendingTimer);
    pendingTimer = 0;
    suppressMenu = false;
    hideTrail();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "FORMANT_GESTURE_SCROLL") return;
    const top = message.edge === "top" ? 0 : document.documentElement.scrollHeight;
    window.scrollTo({ top, left: 0, behavior: "auto" });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || (!changes[FEATURES_KEY] && !changes[SETTINGS_KEY])) return;
    load();
  });

  load();
})();
