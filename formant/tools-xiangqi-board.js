/** 实物风格棋盘 SVG：双线边框、炮位/兵林、九宫、双圈棋子。 */

import { FILES, NAMES, RANKS } from "./tools-xiangqi-lib.js";

export const CELL = 54;
export const PAD = 42;
export const VIEW_W = PAD * 2 + CELL * 8;
export const VIEW_H = PAD * 2 + CELL * 9;
export const ANIM_MS = 240;

export function px(x) {
  return PAD + x * CELL;
}

export function py(y) {
  return PAD + y * CELL;
}

const MARKS = [
  [1, 2],
  [7, 2],
  [1, 7],
  [7, 7],
  [0, 3],
  [2, 3],
  [4, 3],
  [6, 3],
  [8, 3],
  [0, 6],
  [2, 6],
  [4, 6],
  [6, 6],
  [8, 6],
];

function line(x1, y1, x2, y2) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
}

function corner(cx, cy, dx, dy) {
  const gap = 5;
  const arm = 8;
  const ox = cx + dx * gap;
  const oy = cy + dy * gap;
  return line(ox, oy, ox + dx * arm, oy) + line(ox, oy, ox, oy + dy * arm);
}

function marks() {
  let svg = "";
  for (const [x, y] of MARKS) {
    const cx = px(x);
    const cy = py(y);
    if (x > 0 && y > 0) svg += corner(cx, cy, -1, -1);
    if (x < 8 && y > 0) svg += corner(cx, cy, 1, -1);
    if (x > 0 && y < 9) svg += corner(cx, cy, -1, 1);
    if (x < 8 && y < 9) svg += corner(cx, cy, 1, 1);
  }
  return svg;
}

function grid() {
  let svg = "";
  const x0 = px(0);
  const x8 = px(8);
  const y0 = py(0);
  const y4 = py(4);
  const y5 = py(5);
  const y9 = py(9);
  for (let y = 0; y < RANKS; y++) svg += line(x0, py(y), x8, py(y));
  for (let x = 0; x < FILES; x++) {
    const xx = px(x);
    svg += line(xx, y0, xx, y4) + line(xx, y5, xx, y9);
    if (x === 0 || x === 8) svg += line(xx, y4, xx, y5);
  }
  svg += line(px(3), py(0), px(5), py(2));
  svg += line(px(5), py(0), px(3), py(2));
  svg += line(px(3), py(7), px(5), py(9));
  svg += line(px(5), py(7), px(3), py(9));
  return svg;
}

function frame() {
  const x = px(0);
  const y = py(0);
  const w = px(8) - x;
  const h = py(9) - y;
  return (
    `<rect class="xq-wood" x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" rx="10" />` +
    `<rect class="xq-frame-outer" x="${x - 14}" y="${y - 14}" width="${w + 28}" height="${h + 28}" />` +
    `<rect class="xq-frame-inner" x="${x - 8}" y="${y - 8}" width="${w + 16}" height="${h + 16}" />`
  );
}

function river() {
  const mid = (py(4) + py(5)) / 2;
  return (
    `<rect class="xq-river-band" x="${px(0)}" y="${py(4)}" width="${px(8) - px(0)}" height="${CELL}" />` +
    `<text class="xq-river" x="${(px(1) + px(3)) / 2}" y="${mid + 6}">楚 河</text>` +
    `<text class="xq-river" x="${(px(5) + px(7)) / 2}" y="${mid + 6}">汉 界</text>`
  );
}

function pieceGroup(piece, x, y, cls, style) {
  const red = piece === piece.toUpperCase();
  const side = red ? "is-red" : "is-black";
  const extra = cls ? ` ${cls}` : "";
  const st = style ? ` style="${style}"` : ` transform="translate(${px(x)},${py(y)})"`;
  return (
    `<g class="xq-piece ${side}${extra}" data-pt="${x},${y}"${st}>` +
    `<circle class="xq-disc" r="22" />` +
    `<circle class="xq-ring" r="16.5" />` +
    `<text y="1.2">${NAMES[piece] || ""}</text></g>`
  );
}

/**
 * @param {{
 *   board: (string|null)[][],
 *   selected?: {x:number,y:number}|null,
 *   last?: {fx:number,fy:number,tx:number,ty:number}|null,
 *   legal?: {tx:number,ty:number,captured?: string|null}[],
 *   fly?: {piece:string,fx:number,fy:number,tx:number,ty:number}|null,
 *   fade?: {piece:string,x:number,y:number}|null,
 *   checkAt?: {x:number,y:number}|null,
 * }} view
 */
export function renderBoard(view) {
  const selected = view.selected;
  const last = view.last;
  const legal = view.legal || [];
  const fly = view.fly;
  const fade = view.fade;
  const checkAt = view.checkAt;
  let overlay = "";
  if (last && !fly) {
    for (const [x, y] of [
      [last.fx, last.fy],
      [last.tx, last.ty],
    ]) {
      overlay += `<circle class="xq-last" cx="${px(x)}" cy="${py(y)}" r="24" />`;
    }
  }
  for (const move of legal) {
    overlay += move.captured
      ? `<circle class="xq-cap" cx="${px(move.tx)}" cy="${py(move.ty)}" r="22" />`
      : `<circle class="xq-dot" cx="${px(move.tx)}" cy="${py(move.ty)}" r="5" />`;
  }
  if (view.hint && !fly) {
    overlay += `<circle class="xq-hint" cx="${px(view.hint.fx)}" cy="${py(view.hint.fy)}" r="24" />`;
    overlay += `<circle class="xq-hint is-to" cx="${px(view.hint.tx)}" cy="${py(view.hint.ty)}" r="20" />`;
  }
  let hits = "";
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) {
      hits += `<circle class="xq-hit" data-pt="${x},${y}" cx="${px(x)}" cy="${py(y)}" r="24" />`;
    }
  }
  let pieces = "";
  if (fade) pieces += pieceGroup(fade.piece, fade.x, fade.y, "is-fade");
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) {
      const piece = view.board[y][x];
      if (!piece) continue;
      if (fly && x === fly.tx && y === fly.ty) continue;
      const on = selected && selected.x === x && selected.y === y ? " is-on" : "";
      const chk = checkAt && checkAt.x === x && checkAt.y === y ? " is-check" : "";
      pieces += pieceGroup(piece, x, y, (on + chk).trim());
    }
  }
  if (fly) {
    const start = `transform:translate(${px(fly.fx)}px,${py(fly.fy)}px)`;
    pieces += pieceGroup(fly.piece, fly.tx, fly.ty, "is-fly", start);
  }
  return (
    `<svg class="xq-svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}" width="${VIEW_W}" height="${VIEW_H}" role="img" aria-label="象棋棋盘">` +
    `${frame()}${river()}<g class="xq-lines">${grid()}${marks()}</g>${overlay}${hits}${pieces}</svg>`
  );
}

export function reduceMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

export function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
