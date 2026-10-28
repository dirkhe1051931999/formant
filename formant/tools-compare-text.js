/** 左右对齐的行视图。相同行按段存放，滚动时只画可见行。 */

import { buildTextModel, inlineParts, neighborIndex, splitLines } from "./tools-compare-core.js";

/** @typedef {import("./tools-compare-core.js").TextHunk} TextHunk */
/**
 * @typedef {{
 *   leftLines: string[],
 *   rightLines: string[],
 *   hunks: TextHunk[],
 *   rowCount: number,
 *   capped: boolean,
 *   added: number,
 *   removed: number,
 *   changed: number,
 * }} TextModel
 */

const ROW_H = 22;

/** @param {TextModel} model */
export function textSummary(model) {
  const parts = [];
  if (model.changed) parts.push(`修改 ${model.changed}`);
  if (model.removed) parts.push(`仅左 ${model.removed}`);
  if (model.added) parts.push(`仅右 ${model.added}`);
  if (model.capped) parts.push("有一段按整块显示");
  return parts.join(" · ");
}

let worker = /** @type {Worker | null} */ (null);
let seq = 0;

/**
 * 后台对比。失败时退回当前线程。
 * @param {string} left
 * @param {string} right
 * @param {boolean} ignoreWs
 * @returns {Promise<TextModel>}
 */
export function diffTextAsync(left, right, ignoreWs) {
  const id = ++seq;
  return new Promise((resolve) => {
    const finish = (model) => {
      resolve(model);
    };
    let w;
    try {
      w = ensureWorker();
    } catch {
      finish(buildTextModel(left, right, ignoreWs));
      return;
    }
    const onMsg = (event) => {
      if (event.data?.id !== id) return;
      cleanup();
      if (!event.data.ok) {
        finish(buildTextModel(left, right, ignoreWs));
        return;
      }
      finish({
        leftLines: splitLines(left),
        rightLines: splitLines(right),
        hunks: event.data.hunks,
        rowCount: event.data.rowCount,
        capped: event.data.capped,
        added: event.data.added,
        removed: event.data.removed,
        changed: event.data.changed,
      });
    };
    const onErr = () => {
      cleanup();
      worker = null;
      finish(buildTextModel(left, right, ignoreWs));
    };
    const cleanup = () => {
      w.removeEventListener("message", onMsg);
      w.removeEventListener("error", onErr);
    };
    w.addEventListener("message", onMsg);
    w.addEventListener("error", onErr);
    try {
      w.postMessage({ id, left, right, ignoreWs });
    } catch {
      cleanup();
      finish(buildTextModel(left, right, ignoreWs));
    }
  });
}

function ensureWorker() {
  if (!worker) worker = new Worker(new URL("./tools-compare-worker.js", import.meta.url), { type: "module" });
  return worker;
}

/**
 * @param {HTMLElement} host
 * @param {TextModel} model
 * @param {boolean} [hideSame]
 */
export function mountTextView(host, model, hideSame = false) {
  host.replaceChildren();
  const visible = hideSame ? changedIndexes(model) : null;
  const count = visible ? visible.length : model.rowCount;
  if (!count) {
    host.replaceChildren(emptyNote(hideSame && model.rowCount ? "这两边一样" : "两边都没有内容"));
    return { jump() { return false; } };
  }
  const head = document.createElement("div");
  head.className = "cmp-text__head";
  head.innerHTML = "<span></span><span>左侧</span><span></span><span>右侧</span>";
  const scroller = document.createElement("div");
  scroller.className = "cmp-text";
  const spacer = document.createElement("div");
  spacer.style.height = `${count * ROW_H}px`;
  const layer = document.createElement("div");
  layer.className = "cmp-text__layer";
  scroller.append(spacer, layer);
  host.append(head, scroller);
  const starts = prefixStarts(model.hunks);
  const diffs = hideSame ? Array.from({ length: count }, (_, i) => i) : changedIndexes(model);
  let marked = -1;

  const paint = () => {
    const top = scroller.scrollTop;
    const viewH = scroller.clientHeight || 560;
    const start = Math.max(0, Math.floor(top / ROW_H) - 8);
    const end = Math.min(count, Math.ceil((top + viewH) / ROW_H) + 8);
    layer.style.transform = `translateY(${start * ROW_H}px)`;
    const frag = document.createDocumentFragment();
    for (let i = start; i < end; i += 1) {
      const at = visible ? visible[i] : i;
      const row = renderRow(rowAt(model, starts, at));
      if (i === marked) row.classList.add("is-current");
      frag.append(row);
    }
    layer.replaceChildren(frag);
  };
  scroller.addEventListener("scroll", paint, { passive: true });
  paint();
  return {
    jump(step) {
      const pos = Math.round(scroller.scrollTop / ROW_H);
      const target = neighborIndex(diffs, pos, step);
      if (target < 0) return false;
      marked = target;
      scroller.scrollTop = target * ROW_H;
      paint();
      return true;
    },
  };
}

/** @param {string} text */
export function emptyNote(text) {
  const p = document.createElement("p");
  p.className = "cmp-empty";
  p.textContent = text;
  return p;
}

/** @param {TextModel} model */
function changedIndexes(model) {
  /** @type {number[]} */
  const out = [];
  let acc = 0;
  for (const hunk of model.hunks) {
    if (hunk.kind !== "same") {
      for (let k = 0; k < hunk.count; k += 1) out.push(acc + k);
    }
    acc += hunk.count;
  }
  return out;
}

/** @param {TextHunk[]} hunks */
function prefixStarts(hunks) {
  const starts = new Array(hunks.length);
  let acc = 0;
  for (let i = 0; i < hunks.length; i += 1) {
    starts[i] = acc;
    acc += hunks[i].count;
  }
  return starts;
}

/**
 * @param {TextModel} model
 * @param {number[]} starts
 * @param {number} index
 */
function rowAt(model, starts, index) {
  let lo = 0;
  let hi = model.hunks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  const hunk = model.hunks[lo];
  const k = index - starts[lo];
  if (hunk.kind === "del") {
    return { kind: hunk.kind, left: model.leftLines[hunk.lnL - 1 + k] ?? "", right: "", lnL: hunk.lnL + k, lnR: 0 };
  }
  if (hunk.kind === "add") {
    return { kind: hunk.kind, left: "", right: model.rightLines[hunk.lnR - 1 + k] ?? "", lnL: 0, lnR: hunk.lnR + k };
  }
  const left = model.leftLines[hunk.lnL - 1 + k] ?? "";
  const right = model.rightLines[hunk.lnR - 1 + k] ?? "";
  /** @type {{ kind: string, left: string, right: string, lnL: number, lnR: number, markL?: import("./tools-compare-core.js").CmpSeg[], markR?: import("./tools-compare-core.js").CmpSeg[] }} */
  const row = { kind: hunk.kind, left, right, lnL: hunk.lnL + k, lnR: hunk.lnR + k };
  if (hunk.kind === "change") {
    const marks = inlineParts(left, right);
    if (marks) {
      row.markL = marks.left;
      row.markR = marks.right;
    }
  }
  return row;
}

/** @param {{ kind: string, left: string, right: string, lnL: number, lnR: number, markL?: import("./tools-compare-core.js").CmpSeg[], markR?: import("./tools-compare-core.js").CmpSeg[] }} row */
function renderRow(row) {
  const el = document.createElement("div");
  el.className = `cmp-text__row cmp-text__row--${row.kind}`;
  el.append(gutter(row.lnL), cell(row.left, row.markL), gutter(row.lnR), cell(row.right, row.markR));
  return el;
}

/** @param {number} n */
function gutter(n) {
  const el = document.createElement("span");
  el.className = "cmp-text__no";
  el.textContent = n ? String(n) : "";
  return el;
}

/** @param {string} text @param {import("./tools-compare-core.js").CmpSeg[] | undefined} marks */
function cell(text, marks) {
  const el = document.createElement("span");
  el.className = "cmp-text__cell";
  el.title = text.length > 400 ? `${text.slice(0, 400)}…` : text;
  if (!marks) {
    el.textContent = text;
    return el;
  }
  for (const seg of marks) {
    if (!seg.changed) {
      el.append(document.createTextNode(seg.text));
      continue;
    }
    const mark = document.createElement("mark");
    mark.textContent = seg.text;
    el.append(mark);
  }
  return el;
}
