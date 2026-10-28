/** 文件夹对比：左右两列对齐，同一行是同一个相对路径。 */

import { neighborIndex } from "./tools-compare-core.js";
import { formatBytes } from "./tools-dom.js";

/** @typedef {import("./tools-compare-core.js").CmpFile} CmpFile */
/** @typedef {import("./tools-compare-core.js").CmpRow} CmpRow */
/** @typedef {import("./tools-compare-core.js").CmpStatus} CmpStatus */

const ROW_H = 32;

/**
 * @param {{ same: number, diff: number, left: number, right: number, pending: number }} counts
 * @param {boolean} cut
 * @param {boolean} hideSame
 */
export function folderSummary(counts, cut, hideSame) {
  const parts = [];
  if (counts.diff) parts.push(`不同 ${counts.diff}`);
  if (counts.left) parts.push(`仅左 ${counts.left}`);
  if (counts.right) parts.push(`仅右 ${counts.right}`);
  if (counts.pending) parts.push(`${counts.pending} 个还在比较`);
  if (!hideSame && counts.same && parts.length) parts.push(`相同 ${counts.same}`);
  if (cut) parts.push("只列出前 4000 个");
  if (parts.length) return parts.join(" · ");
  return counts.same ? "这些文件都一样" : "";
}

/**
 * @param {{ same: number, diff: number, left: number, right: number, pending: number }} counts
 * @param {number} shown
 * @param {"all" | "diff" | "side"} filter
 * @param {boolean} hideSame
 */
export function folderEmpty(counts, shown, filter, hideSame) {
  if (shown) return "";
  if (counts.same && !counts.diff && !counts.left && !counts.right) return "这些文件都一样";
  if (filter === "side" || hideSame) return "没有需要看的差异";
  return "文件夹是空的";
}

/** @param {CmpRow[]} rows */
export function countRows(rows) {
  const counts = { same: 0, diff: 0, left: 0, right: 0, pending: 0 };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/**
 * @param {HTMLElement} host
 * @param {CmpRow[]} rows
 * @param {(row: CmpRow) => void} onOpen
 * @param {string} [emptyText]
 */
export function mountFolderView(host, rows, onOpen, emptyText = "文件夹是空的") {
  const prev = host.querySelector(".cmp-folder");
  const keep = prev instanceof HTMLElement ? prev.scrollTop : 0;
  host.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "cmp-empty";
    empty.textContent = emptyText;
    host.append(empty);
    return { jump() { return false; } };
  }

  const scroller = document.createElement("div");
  scroller.className = "cmp-folder";
  const sheet = document.createElement("div");
  sheet.className = "cmp-folder__sheet";
  const head = document.createElement("div");
  head.className = "cmp-folder__head";
  head.append(sideHead(), gap(), sideHead());
  const body = document.createElement("div");
  body.className = "cmp-folder__body";
  body.style.height = `${rows.length * ROW_H}px`;
  const layer = document.createElement("div");
  layer.className = "cmp-folder__layer";
  body.append(layer);
  sheet.append(head, body);
  scroller.append(sheet);
  host.append(scroller);

  const diffs = [];
  rows.forEach((row, index) => {
    if (row.status === "diff" || row.status === "left" || row.status === "right") diffs.push(index);
  });
  let marked = -1;
  let cursor = -1;

  const paint = () => {
    const headH = head.offsetHeight || 28;
    const top = Math.max(0, scroller.scrollTop - headH);
    const viewH = Math.max(ROW_H, (scroller.clientHeight || 480) - headH);
    const start = Math.max(0, Math.floor(top / ROW_H) - 6);
    const end = Math.min(rows.length, Math.ceil((top + viewH) / ROW_H) + 6);
    layer.style.transform = `translateY(${start * ROW_H}px)`;
    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i += 1) frag.append(renderRow(rows[i], onOpen, i === marked));
    layer.replaceChildren(frag);
  };
  scroller.addEventListener("scroll", () => {
    if (cursor >= 0 && Math.abs(scroller.scrollTop - cursor * ROW_H) > ROW_H) cursor = -1;
    paint();
  }, { passive: true });
  paint();
  scroller.scrollTop = keep;
  return {
    jump(step) {
      const pos = cursor >= 0 ? cursor : Math.floor(scroller.scrollTop / ROW_H);
      const target = neighborIndex(diffs, pos, step);
      if (target < 0) return false;
      marked = target;
      cursor = target;
      scroller.scrollTop = target * ROW_H;
      paint();
      return true;
    },
  };
}

function sideHead() {
  const side = document.createElement("div");
  side.className = "cmp-folder__side";
  for (const label of ["名称", "大小", "日期"]) {
    const span = document.createElement("span");
    span.textContent = label;
    side.append(span);
  }
  return side;
}

function gap() {
  const el = document.createElement("span");
  el.className = "cmp-folder__gap";
  return el;
}

/** @param {CmpRow} row @param {(row: CmpRow) => void} onOpen @param {boolean} [current] */
function renderRow(row, onOpen, current = false) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = current ? "cmp-folder__row is-current" : "cmp-folder__row";
  btn.append(sideCells(row.left, row.path, tint(row.status, "left")), gap(), sideCells(row.right, row.path, tint(row.status, "right")));
  btn.addEventListener("click", () => onOpen(row));
  return btn;
}

/**
 * @param {CmpStatus} status
 * @param {"left" | "right"} which
 */
function tint(status, which) {
  if (status === "pending") return "pending";
  if (status === "diff") return which === "left" ? "del" : "add";
  if (status === which) return which === "left" ? "del" : "add";
  return "";
}

/**
 * @param {CmpFile | null} file
 * @param {string} path
 * @param {string} tone
 */
function sideCells(file, path, tone) {
  const side = document.createElement("span");
  side.className = tone ? `cmp-folder__side is-${tone}` : "cmp-folder__side";
  if (!file) {
    side.append(span(""), span(""), span(""));
    return side;
  }
  const name = span(path);
  name.className = "cmp-folder__name";
  name.title = path;
  const size = span(formatBytes(file.size));
  size.className = "cmp-folder__size";
  const date = span(file.mtime ? timeLabel(file.mtime) : "");
  date.className = "cmp-folder__date";
  side.append(name, size, date);
  return side;
}

/** @param {string} text */
function span(text) {
  const el = document.createElement("span");
  el.textContent = text;
  return el;
}

/** @param {number} ms */
function timeLabel(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
