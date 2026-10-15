import { mightBeFirstStrokeOfX, recognizeGesture } from "./gestures-shape.js";

const SECOND_WAIT_MS = 520;

/**
 * @param {{
 *   pad: HTMLElement,
 *   hint: HTMLElement,
 *   strokesEl: SVGGElement,
 *   onCommit: (action: string, strokes: Array<Array<{ x: number, y: number, svgX: number, svgY: number }>>, path: string) => void,
 *   onToast: (text: string) => void,
 *   actionLabel: (action: string) => string,
 * }} options
 */
export function createGesturePad(options) {
  const { pad, hint, strokesEl, onCommit, onToast, actionLabel } = options;
  /** @type {string} */
  let capturing = "";
  /** @type {Array<Array<{ x: number, y: number, svgX: number, svgY: number }>>} */
  let strokes = [];
  /** @type {Array<{ x: number, y: number, svgX: number, svgY: number }>} */
  let live = [];
  let waitingSecond = false;
  let waitTimer = 0;

  function pointFromEvent(event) {
    const rect = pad.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return { x, y, svgX: (x / width) * 100, svgY: (y / height) * 100 };
  }

  function paintStrokes() {
    strokesEl.replaceChildren();
    for (const stroke of [...strokes, live]) {
      if (stroke.length < 1) continue;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      line.setAttribute("points", stroke.map((p) => `${p.svgX},${p.svgY}`).join(" "));
      strokesEl.appendChild(line);
    }
  }

  function paintHint() {
    pad.classList.toggle("is-capturing", Boolean(capturing));
    const drawing = live.length > 1 || strokes.some((s) => s.length > 1);
    hint.hidden = drawing;
    if (!capturing) {
      hint.textContent = "点「添加」或「绘制」后在此划动";
      return;
    }
    if (waitingSecond) {
      hint.hidden = false;
      hint.textContent = "可再画一笔组成 ✕，或稍等完成";
      return;
    }
    hint.textContent = `正在为「${actionLabel(capturing)}」绘制：按住左键或右键划动，圈不必闭合；✕ 可两笔。Esc 取消`;
  }

  function clearWait() {
    window.clearTimeout(waitTimer);
    waitTimer = 0;
    waitingSecond = false;
  }

  function resetInk() {
    strokes = [];
    live = [];
    paintStrokes();
  }

  function stop() {
    capturing = "";
    clearWait();
    resetInk();
    paintHint();
  }

  /**
   * @param {string} action
   */
  function start(action) {
    capturing = action;
    clearWait();
    resetInk();
    paintHint();
    pad.focus?.();
  }

  function commit() {
    const packed = strokes.filter((s) => s.length >= 2);
    const action = capturing;
    clearWait();
    if (!action) return;
    const path = recognizeGesture(packed);
    if (!path) {
      resetInk();
      paintHint();
      onToast("划动距离太短，请再画一次");
      return;
    }
    capturing = "";
    paintHint();
    onCommit(action, packed, path);
  }

  function finishLiveStroke() {
    if (!capturing || live.length < 2) {
      live = [];
      paintStrokes();
      return;
    }
    strokes.push(live);
    live = [];
    paintStrokes();
    const path = recognizeGesture(strokes);
    if (path === "O" || path === "X" || !mightBeFirstStrokeOfX(strokes[0]) || strokes.length >= 2) {
      commit();
      return;
    }
    waitingSecond = true;
    paintHint();
    waitTimer = window.setTimeout(() => commit(), SECOND_WAIT_MS);
  }

  let drawingId = 0;

  function isDrawButton(button) {
    return button === 0 || button === 2;
  }

  pad.addEventListener("pointerdown", (event) => {
    if (!isDrawButton(event.button)) return;
    if (!capturing) {
      onToast("请先点「添加」或某条手势的「绘制」");
      return;
    }
    event.preventDefault();
    drawingId = event.pointerId;
    pad.setPointerCapture(event.pointerId);
    if (waitingSecond) clearWait();
    live = [pointFromEvent(event)];
    paintStrokes();
    paintHint();
  });

  pad.addEventListener("pointermove", (event) => {
    if (!capturing || event.pointerId !== drawingId || !live.length) return;
    live.push(pointFromEvent(event));
    paintStrokes();
    paintHint();
  });

  pad.addEventListener("pointerup", (event) => {
    if (!capturing || event.pointerId !== drawingId) return;
    drawingId = 0;
    finishLiveStroke();
  });

  pad.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== drawingId) return;
    drawingId = 0;
    if (capturing) stop();
  });

  pad.addEventListener("contextmenu", (event) => {
    if (capturing) event.preventDefault();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && capturing) {
      event.preventDefault();
      stop();
    }
  });

  return {
    start,
    stop,
    isCapturing: () => capturing,
    paintHint,
  };
}
