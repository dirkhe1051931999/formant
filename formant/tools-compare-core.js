/**
 * 文件对比纯函数：行 diff、目录配对、像素差异。
 * 自研 Myers / 锚点对齐，不嵌入 WinMerge 或 Beyond Compare。
 */

/** @typedef {{ path: string, name: string, size: number, mtime: number, file: File }} CmpFile */
/** @typedef {"same" | "diff" | "left" | "right" | "pending"} CmpStatus */
/** @typedef {{ path: string, left: CmpFile | null, right: CmpFile | null, status: CmpStatus }} CmpRow */
/** @typedef {{ changed: boolean, text: string }} CmpSeg */
/** @typedef {"same" | "del" | "add" | "change"} TextKind */
/**
 * @typedef {{
 *   kind: TextKind,
 *   left: string,
 *   right: string,
 *   lnL: number,
 *   lnR: number,
 *   markL?: CmpSeg[],
 *   markR?: CmpSeg[],
 * }} TextRow
 */

export const MAX_FILES = 4000;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|avif)$/i;

/** @param {File | { name?: string, type?: string }} file */
export function fileKind(file) {
  const type = String(file.type || "");
  if (type.startsWith("image/")) return "image";
  if (IMAGE_EXT.test(String(file.name || ""))) return "image";
  return "file";
}

/** @param {string} text */
export function splitLines(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

/**
 * 行对比模型。相同行按段合并，不给每一行单独建对象，方便大文件。
 * @param {string} leftText
 * @param {string} rightText
 * @param {boolean} [ignoreWs]
 */
export function buildTextModel(leftText, rightText, ignoreWs = false) {
  const leftLines = splitLines(leftText);
  const rightLines = splitLines(rightText);
  const key = (line) => (ignoreWs ? line.replace(/[ \t]+/g, " ").trim() : line);
  let start = 0;
  const n = leftLines.length;
  const m = rightLines.length;
  while (start < n && start < m && key(leftLines[start]) === key(rightLines[start])) start += 1;
  let endA = n;
  let endB = m;
  while (endA > start && endB > start && key(leftLines[endA - 1]) === key(rightLines[endB - 1])) {
    endA -= 1;
    endB -= 1;
  }
  /** @type {TextHunk[]} */
  const hunks = [];
  const stats = { added: 0, removed: 0, changed: 0, capped: false };
  if (start) pushSame(hunks, start, 1, 1);
  if (endA > start || endB > start) {
    const midA = leftLines.slice(start, endA).map(key);
    const midB = rightLines.slice(start, endB).map(key);
    appendMiddle(hunks, midA, midB, start, start, stats);
  }
  const tail = n - endA;
  if (tail) pushSame(hunks, tail, endA + 1, endB + 1);
  let rowCount = 0;
  for (const hunk of hunks) rowCount += hunk.count;
  return { leftLines, rightLines, hunks, rowCount, capped: stats.capped, added: stats.added, removed: stats.removed, changed: stats.changed };
}

/**
 * @typedef {{ kind: TextKind, count: number, lnL: number, lnR: number }} TextHunk
 * @typedef {{ added: number, removed: number, changed: number, capped: boolean }} DiffStats
 */

/** @param {TextHunk[]} hunks @param {number} count @param {number} lnL @param {number} lnR */
function pushSame(hunks, count, lnL, lnR) {
  const prev = hunks[hunks.length - 1];
  if (prev && prev.kind === "same" && prev.lnL + prev.count === lnL && prev.lnR + prev.count === lnR) {
    prev.count += count;
    return;
  }
  hunks.push({ kind: "same", count, lnL, lnR });
}

/**
 * @param {TextHunk[]} hunks
 * @param {number} delN
 * @param {number} addN
 * @param {number} lnL
 * @param {number} lnR
 * @param {DiffStats} stats
 */
function pushEdit(hunks, delN, addN, lnL, lnR, stats) {
  const paired = Math.min(delN, addN);
  if (paired) {
    hunks.push({ kind: "change", count: paired, lnL, lnR });
    stats.changed += paired;
  }
  if (delN > paired) {
    hunks.push({ kind: "del", count: delN - paired, lnL: lnL + paired, lnR: 0 });
    stats.removed += delN - paired;
  }
  if (addN > paired) {
    hunks.push({ kind: "add", count: addN - paired, lnL: 0, lnR: lnR + paired });
    stats.added += addN - paired;
  }
}

/**
 * @param {Array<["=" | "-" | "+", number, number]>} ops
 * @param {TextHunk[]} hunks
 * @param {number} offI
 * @param {number} offJ
 * @param {DiffStats} stats
 */
function foldOps(ops, hunks, offI, offJ, stats) {
  let index = 0;
  while (index < ops.length) {
    const op = ops[index];
    if (op[0] === "=") {
      const lnL = op[1] + offI + 1;
      const lnR = op[2] + offJ + 1;
      let count = 0;
      while (index < ops.length && ops[index][0] === "=") {
        count += 1;
        index += 1;
      }
      pushSame(hunks, count, lnL, lnR);
      continue;
    }
    let delN = 0;
    let addN = 0;
    let lnL = 0;
    let lnR = 0;
    while (index < ops.length && ops[index][0] !== "=") {
      const cur = ops[index];
      if (cur[0] === "-") {
        if (!delN) lnL = cur[1] + offI + 1;
        delN += 1;
      } else {
        if (!addN) lnR = cur[2] + offJ + 1;
        addN += 1;
      }
      index += 1;
    }
    pushEdit(hunks, delN, addN, lnL, lnR, stats);
  }
}

/**
 * @param {TextHunk[]} hunks
 * @param {string[]} a
 * @param {string[]} b
 * @param {number} offI
 * @param {number} offJ
 * @param {DiffStats} stats
 */
function appendMiddle(hunks, a, b, offI, offJ, stats) {
  const sum = a.length + b.length;
  if (!sum) return;
  const ops = sum <= 5000 ? myersOps(a, b) : null;
  if (ops) {
    foldOps(ops, hunks, offI, offJ, stats);
    return;
  }
  const anchors = [[-1, -1], ...uniqueChain(a, b), [a.length, b.length]];
  for (let s = 0; s < anchors.length - 1; s += 1) {
    const i0 = anchors[s][0] + 1;
    const j0 = anchors[s][1] + 1;
    const i1 = anchors[s + 1][0];
    const j1 = anchors[s + 1][1];
    const gapA = a.slice(i0, i1);
    const gapB = b.slice(j0, j1);
    const gapSum = gapA.length + gapB.length;
    const aligned = gapSum > 0 && gapSum <= 2000 ? myersOps(gapA, gapB) : null;
    if (aligned) foldOps(aligned, hunks, offI + i0, offJ + j0, stats);
    else if (gapSum) {
      if (gapA.length && gapB.length) stats.capped = true;
      pushEdit(hunks, gapA.length, gapB.length, offI + i0 + 1, offJ + j0 + 1, stats);
    }
    if (i1 < a.length && j1 < b.length) pushSame(hunks, 1, offI + i1 + 1, offJ + j1 + 1);
  }
}

/** @param {string[]} a @param {string[]} b */
function uniqueChain(a, b) {
  const count = (lines) => {
    const map = new Map();
    for (const line of lines) map.set(line, (map.get(line) || 0) + 1);
    return map;
  };
  const ca = count(a);
  const cb = count(b);
  const bAt = new Map();
  b.forEach((line, j) => {
    if (cb.get(line) === 1) bAt.set(line, j);
  });
  /** @type {Array<[number, number]>} */
  const pairs = [];
  a.forEach((line, i) => {
    if (ca.get(line) === 1 && bAt.has(line)) pairs.push([i, /** @type {number} */ (bAt.get(line))]);
  });
  return lisPairs(pairs);
}

/** @param {Array<[number, number]>} pairs */
function lisPairs(pairs) {
  /** @type {number[]} */
  const tails = [];
  const prev = new Array(pairs.length).fill(-1);
  for (let i = 0; i < pairs.length; i += 1) {
    const j = pairs[i][1];
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tails[mid]][1] < j) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i;
  }
  /** @type {Array<[number, number]>} */
  const out = [];
  let cur = tails.length ? tails[tails.length - 1] : -1;
  while (cur >= 0) {
    out.push(pairs[cur]);
    cur = prev[cur];
  }
  out.reverse();
  return out;
}

/**
 * @param {string[]} a
 * @param {string[]} b
 * @returns {Array<["=" | "-" | "+", number, number]> | null}
 */
function myersOps(a, b) {
  const n = a.length;
  const m = b.length;
  if (!n && !m) return [];
  if (!n) return b.map((_, j) => ["+", -1, j]);
  if (!m) return a.map((_, i) => ["-", i, -1]);
  const max = n + m;
  /** @type {Record<number, number>} */
  let v = { 1: 0 };
  /** @type {Record<number, number>[]} */
  const trace = [];
  let found = false;
  for (let d = 0; d <= max && d <= 1500; d += 1) {
    trace.push({ ...v });
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[k - 1] < v[k + 1])) x = v[k + 1];
      else x = v[k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
    if (found) break;
  }
  if (!found) return null;
  return backtrack(trace, n, m);
}

/**
 * @param {Record<number, number>[]} trace
 * @param {number} n
 * @param {number} m
 */
function backtrack(trace, n, m) {
  let x = n;
  let y = m;
  /** @type {Array<["=" | "-" | "+", number, number]>} */
  const result = [];
  for (let d = trace.length - 1; d >= 0; d -= 1) {
    const v = trace[d];
    const k = x - y;
    const prevK = k === -d || (k !== d && v[k - 1] < v[k + 1]) ? k + 1 : k - 1;
    const prevX = v[prevK];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      result.push(["=", x - 1, y - 1]);
      x -= 1;
      y -= 1;
    }
    if (d > 0) {
      if (x === prevX) {
        result.push(["+", -1, y - 1]);
        y -= 1;
      } else {
        result.push(["-", x - 1, -1]);
        x -= 1;
      }
    }
    x = prevX;
    y = prevY;
  }
  result.reverse();
  return result;
}

/** @param {string} left @param {string} right */
export function inlineParts(left, right) {
  if (!left || !right || left === right) return null;
  if (left.length > 200 || right.length > 200) return null;
  const ops = myersOps([...left], [...right]);
  if (!ops) return null;
  /** @type {CmpSeg[]} */
  const L = [];
  /** @type {CmpSeg[]} */
  const R = [];
  /** @param {CmpSeg[]} arr @param {string} ch @param {boolean} changed */
  const push = (arr, ch, changed) => {
    const last = arr[arr.length - 1];
    if (last && last.changed === changed) last.text += ch;
    else arr.push({ changed, text: ch });
  };
  for (const [op, i, j] of ops) {
    if (op === "=") {
      push(L, left[i], false);
      push(R, right[j], false);
    } else if (op === "-") push(L, left[i], true);
    else push(R, right[j], true);
  }
  return { left: L, right: R };
}

/**
 * @param {CmpFile[]} leftFiles
 * @param {CmpFile[]} rightFiles
 * @returns {CmpRow[]}
 */
export function pairFiles(leftFiles, rightFiles) {
  /** @type {Map<string, CmpFile>} */
  const L = new Map(leftFiles.map((file) => [file.path, file]));
  /** @type {Map<string, CmpFile>} */
  const R = new Map(rightFiles.map((file) => [file.path, file]));
  const paths = [...new Set([...L.keys(), ...R.keys()])].sort((a, b) => a.localeCompare(b, "zh"));
  return paths.map((path) => {
    const left = L.get(path) || null;
    const right = R.get(path) || null;
    /** @type {CmpStatus} */
    let status = "same";
    if (!left) status = "right";
    else if (!right) status = "left";
    else if (left.size !== right.size) status = "diff";
    else status = "pending";
    return { path, left, right, status };
  });
}

/** @param {CmpRow[]} rows @param {"all" | "diff" | "side"} filter */
export function filterRows(rows, filter) {
  if (filter === "diff") return rows.filter((row) => row.status !== "same");
  if (filter === "side") return rows.filter((row) => row.status === "left" || row.status === "right");
  return rows;
}

/** @param {CmpRow[]} rows @param {string} query */
export function filterByName(rows, query) {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => row.path.toLowerCase().includes(q));
}

/** @param {CmpRow[]} rows */
export function diffListText(rows) {
  const label = { diff: "不同", left: "仅左", right: "仅右" };
  return rows
    .filter((row) => row.status === "diff" || row.status === "left" || row.status === "right")
    .map((row) => `${label[row.status]}\t${row.path}`)
    .join("\n");
}

/**
 * 从当前行走向下一处或上一处差异。找不到时返回 -1。
 * @param {number[]} indexes
 * @param {number} pos
 * @param {number} step
 */
export function neighborIndex(indexes, pos, step) {
  if (!indexes.length) return -1;
  if (step > 0) {
    const next = indexes.find((i) => i > pos);
    if (next != null) return next;
    if (indexes.includes(pos)) return -1;
    return indexes.find((i) => i >= pos) ?? -1;
  }
  for (let i = indexes.length - 1; i >= 0; i -= 1) {
    if (indexes[i] < pos) return indexes[i];
  }
  if (indexes.includes(pos)) return -1;
  for (let i = indexes.length - 1; i >= 0; i -= 1) {
    if (indexes[i] <= pos) return indexes[i];
  }
  return -1;
}

/** @param {Uint8Array} bytes */
export function hashBytes(bytes) {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ bytes.length;
  for (let i = 0; i < bytes.length; i += 1) {
    h1 ^= bytes[i];
    h1 = Math.imul(h1, 0x01000193);
    if ((i & 1) === 0) {
      h2 ^= bytes[i];
      h2 = Math.imul(h2, 0x01000193);
    }
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

/**
 * 两张已缩放过的 RGBA 图，按左上角重叠比较。尺寸不同的部分算差异。
 * @param {Uint8ClampedArray} a
 * @param {number} aw
 * @param {number} ah
 * @param {Uint8ClampedArray} b
 * @param {number} bw
 * @param {number} bh
 */
export function diffPixels(a, aw, ah, b, bw, bh) {
  const w = Math.max(aw, bw);
  const h = Math.max(ah, bh);
  const out = new Uint8ClampedArray(w * h * 4);
  let changed = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const pa = x < aw && y < ah ? (y * aw + x) * 4 : -1;
      const pb = x < bw && y < bh ? (y * bw + x) * 4 : -1;
      let delta = 255;
      if (pa >= 0 && pb >= 0) {
        delta = Math.abs(a[pa] - b[pb]) + Math.abs(a[pa + 1] - b[pb + 1]) + Math.abs(a[pa + 2] - b[pb + 2]);
      }
      const hot = delta > 18;
      if (hot) changed += 1;
      out[i] = hot ? 210 : 28;
      out[i + 1] = hot ? 48 : 28;
      out[i + 2] = hot ? 48 : 28;
      out[i + 3] = 255;
    }
  }
  return { pixels: out, width: w, height: h, changed, total: w * h };
}
