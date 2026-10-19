/** 本机 Web Audio 棋声：选子 / 走子 / 吃子 / 将军 / 胜负。不引用远端文件。 */

let ctx = null;
let enabled = true;

export function setSoundOn(on) {
  enabled = Boolean(on);
}

export function isSoundOn() {
  return enabled;
}

function audio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq, dur, type, vol, slide) {
  const ac = audio();
  if (!ac || !enabled) return;
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(slide, 30), t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function tap(freq, dur, vol) {
  tone(freq, dur, "sine", vol);
  tone(freq * 2.1, dur * 0.45, "triangle", vol * 0.35);
}

export function playSelect() {
  tone(620, 0.055, "sine", 0.07);
}

export function playMove() {
  tap(210, 0.09, 0.11);
}

export function playCapture() {
  tone(140, 0.16, "sine", 0.14, 70);
  tone(320, 0.08, "square", 0.03);
}

export function playCheck() {
  tone(880, 0.09, "sine", 0.09);
  window.setTimeout(() => tone(660, 0.12, "sine", 0.08), 90);
}

export function playWin() {
  tone(523, 0.12, "sine", 0.08);
  window.setTimeout(() => tone(659, 0.12, "sine", 0.08), 110);
  window.setTimeout(() => tone(784, 0.18, "sine", 0.09), 220);
}

export function playLose() {
  tone(392, 0.14, "sine", 0.08, 247);
}

export function playUndo() {
  tone(360, 0.1, "triangle", 0.06, 240);
}

export function playNew() {
  tone(523, 0.08, "sine", 0.07);
  window.setTimeout(() => tone(784, 0.1, "sine", 0.06), 80);
}

export function playIllegal() {
  tone(110, 0.07, "square", 0.04);
}
