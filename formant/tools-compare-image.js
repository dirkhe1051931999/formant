/** 图片并排、像素差异、滑动对照。 */

import { diffPixels } from "./tools-compare-core.js";
import { formatBytes } from "./tools-dom.js";

const MAX_EDGE = 1200;
/** @type {string[]} */
let liveUrls = [];

/**
 * @param {HTMLElement} host
 * @param {File | null} leftFile
 * @param {File | null} rightFile
 * @param {() => boolean} [isStale]
 */
export async function mountImageView(host, leftFile, rightFile, isStale = () => false) {
  for (const url of liveUrls) URL.revokeObjectURL(url);
  liveUrls = [];
  host.replaceChildren();
  const bar = document.createElement("div");
  bar.className = "tl-row";
  const seg = document.createElement("div");
  seg.className = "tl-seg";
  seg.innerHTML = `<button type="button" class="is-active" data-mode="side">并排</button><button type="button" data-mode="diff">差异</button><button type="button" data-mode="slide">滑动</button>`;
  const meta = document.createElement("span");
  meta.className = "tl-meta";
  bar.append(seg, meta);
  const stage = document.createElement("div");
  host.append(bar, stage);

  const left = leftFile ? await loadImage(leftFile) : null;
  if (left) liveUrls.push(left.url);
  if (isStale()) return;
  const right = rightFile ? await loadImage(rightFile) : null;
  if (right) liveUrls.push(right.url);
  if (isStale()) return;
  meta.textContent = describe(leftFile, rightFile, left, right);

  /** @type {"side" | "diff" | "slide"} */
  let mode = "side";
  const paint = () => {
    stage.replaceChildren();
    if (mode === "diff") stage.append(renderDiff(left, right));
    else if (mode === "slide") stage.append(renderSlide(left, right));
    else stage.append(renderSide(left, right));
  };
  seg.addEventListener("click", (event) => {
    const btn = /** @type {HTMLElement} */ (event.target).closest("button");
    if (!btn || !seg.contains(btn)) return;
    mode = /** @type {"side" | "diff" | "slide"} */ (btn.dataset.mode || "side");
    for (const item of seg.querySelectorAll("button")) item.classList.toggle("is-active", item === btn);
    paint();
  });
  paint();
}

/** @param {File} file */
function loadImage(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, url, w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`无法读取图片 ${file.name}`));
    };
    img.src = url;
  });
}

/**
 * @param {File | null} file
 * @param {{ w: number, h: number } | null} image
 */
function sideText(file, image) {
  if (!file || !image) return "";
  return `${image.w}×${image.h} · ${formatBytes(file.size)}`;
}

function describe(leftFile, rightFile, left, right) {
  const parts = [];
  const l = sideText(leftFile, left);
  const r = sideText(rightFile, right);
  if (l) parts.push(`左 ${l}`);
  if (r) parts.push(`右 ${r}`);
  return parts.join(" · ");
}

/** @param {{ img: HTMLImageElement, url: string } | null} left @param {{ img: HTMLImageElement, url: string } | null} right */
function renderSide(left, right) {
  const wrap = document.createElement("div");
  wrap.className = "cmp-images";
  wrap.append(figure(left, "这边没有图片"), figure(right, "这边没有图片"));
  return wrap;
}

/** @param {{ img: HTMLImageElement, url: string } | null} image @param {string} empty */
function figure(image, empty) {
  const box = document.createElement("div");
  box.className = "cmp-images__box";
  if (!image) {
    const p = document.createElement("p");
    p.className = "cmp-empty";
    p.textContent = empty;
    box.append(p);
    return box;
  }
  const img = document.createElement("img");
  img.src = image.url;
  img.alt = "";
  box.append(img);
  return box;
}

function renderDiff(left, right) {
  const wrap = document.createElement("div");
  wrap.className = "cmp-diff";
  if (!left || !right) {
    const p = document.createElement("p");
    p.className = "cmp-empty";
    p.textContent = "两边都有图片时，才能看差异";
    wrap.append(p);
    return wrap;
  }
  const a = raster(left.img);
  const b = raster(right.img);
  const diff = diffPixels(a.data, a.w, a.h, b.data, b.w, b.h);
  const canvas = document.createElement("canvas");
  canvas.width = diff.width;
  canvas.height = diff.height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.putImageData(new ImageData(diff.pixels, diff.width, diff.height), 0, 0);
  }
  const pct = diff.total ? ((diff.changed / diff.total) * 100).toFixed(1) : "0";
  const note = document.createElement("p");
  note.className = "tl-meta";
  note.textContent = diff.changed ? `大约 ${pct}% 的像素不同` : "像素都一样";
  wrap.append(canvas, note);
  return wrap;
}

function renderSlide(left, right) {
  const wrap = document.createElement("div");
  wrap.className = "cmp-slide";
  if (!left || !right) {
    const p = document.createElement("p");
    p.className = "cmp-empty";
    p.textContent = "两边都有图片时，才能滑动对照";
    wrap.append(p);
    return wrap;
  }
  const back = document.createElement("img");
  back.src = right.url;
  back.alt = "";
  const front = document.createElement("img");
  front.src = left.url;
  front.alt = "";
  front.style.clipPath = "inset(0 50% 0 0)";
  const range = document.createElement("input");
  range.type = "range";
  range.min = "0";
  range.max = "100";
  range.value = "50";
  range.addEventListener("input", () => {
    front.style.clipPath = `inset(0 ${range.value}% 0 0)`;
  });
  wrap.append(back, front, range);
  return wrap;
}

/** @param {HTMLImageElement} img */
function raster(img) {
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight, 1));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { data: new Uint8ClampedArray(w * h * 4), w, h };
  ctx.drawImage(img, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}
