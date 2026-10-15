/** 对比纯函数：行级 diff（左右对齐）+ JSON 结构 diff。 */

/** @typedef {{ type: "same" | "add" | "del" | "pad", text: string }} DiffCell */
/** @typedef {{ left: DiffCell, right: DiffCell }} DiffRow */
/** @typedef {{ op: "add" | "remove" | "replace", path: string, from?: unknown, to?: unknown, note?: string }} JsonChange */

const LCS_CELL_LIMIT = 6_000_000;

/** @param {string} text */
export function splitLines(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
}

/**
 * 求出 a→b 的操作序列：=（相同）-（删除）+（新增）。
 * @param {string[]} a
 * @param {string[]} b
 * @returns {Array<["=" | "-" | "+", string]>}
 */
function lineOps(a, b) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  /** @type {Array<["=" | "-" | "+", string]>} */
  const ops = a.slice(0, start).map((l) => ["=", l]);

  const n = midA.length;
  const m = midB.length;
  if (n * m > LCS_CELL_LIMIT) {
    // 过大：放弃精细对齐，整块视为替换
    for (const l of midA) ops.push(["-", l]);
    for (const l of midB) ops.push(["+", l]);
  } else {
    const w = m + 1;
    const table = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        table[i * w + j] = midA[i] === midB[j] ? table[(i + 1) * w + j + 1] + 1 : Math.max(table[(i + 1) * w + j], table[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        ops.push(["=", midA[i]]);
        i += 1;
        j += 1;
      } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) {
        ops.push(["-", midA[i]]);
        i += 1;
      } else {
        ops.push(["+", midB[j]]);
        j += 1;
      }
    }
    for (; i < n; i += 1) ops.push(["-", midA[i]]);
    for (; j < m; j += 1) ops.push(["+", midB[j]]);
  }
  for (const l of a.slice(endA)) ops.push(["=", l]);
  return ops;
}

/**
 * 左右对齐的行 diff；相邻的删除块与新增块按行配对成“修改”。
 * @param {string} left
 * @param {string} right
 * @returns {{ rows: DiffRow[], added: number, removed: number }}
 */
export function diffText(left, right) {
  const ops = lineOps(splitLines(left), splitLines(right));
  /** @type {DiffRow[]} */
  const rows = [];
  let added = 0;
  let removed = 0;
  /** @type {string[]} */
  let dels = [];
  /** @type {string[]} */
  let adds = [];
  const flush = () => {
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k += 1) {
      rows.push({
        left: k < dels.length ? { type: "del", text: dels[k] } : { type: "pad", text: "" },
        right: k < adds.length ? { type: "add", text: adds[k] } : { type: "pad", text: "" },
      });
    }
    removed += dels.length;
    added += adds.length;
    dels = [];
    adds = [];
  };
  for (const [op, text] of ops) {
    if (op === "=") {
      flush();
      rows.push({ left: { type: "same", text }, right: { type: "same", text } });
    } else if (op === "-") dels.push(text);
    else adds.push(text);
  }
  flush();
  return { rows, added, removed };
}

/** @param {string} key */
const pathKey = (key) => (/^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`);

/** @param {unknown} v */
function kind(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/**
 * 结构 diff：对象按键，数组按下标。
 * @param {unknown} a
 * @param {unknown} b
 * @param {string} [path]
 * @param {JsonChange[]} [out]
 * @returns {JsonChange[]}
 */
export function diffJson(a, b, path = "$", out = []) {
  const ka = kind(a);
  const kb = kind(b);
  if (ka !== kb) {
    out.push({ op: "replace", path, from: a, to: b, note: `类型 ${ka} → ${kb}` });
  } else if (ka === "array") {
    const x = /** @type {unknown[]} */ (a);
    const y = /** @type {unknown[]} */ (b);
    const n = Math.max(x.length, y.length);
    for (let i = 0; i < n; i += 1) {
      if (i >= x.length) out.push({ op: "add", path: `${path}[${i}]`, to: y[i] });
      else if (i >= y.length) out.push({ op: "remove", path: `${path}[${i}]`, from: x[i] });
      else diffJson(x[i], y[i], `${path}[${i}]`, out);
    }
  } else if (ka === "object") {
    const x = /** @type {Record<string, unknown>} */ (a);
    const y = /** @type {Record<string, unknown>} */ (b);
    for (const key of Object.keys(x)) {
      if (!(key in y)) out.push({ op: "remove", path: path + pathKey(key), from: x[key] });
      else diffJson(x[key], y[key], path + pathKey(key), out);
    }
    for (const key of Object.keys(y)) {
      if (!(key in x)) out.push({ op: "add", path: path + pathKey(key), to: y[key] });
    }
  } else if (a !== b) {
    out.push({ op: "replace", path, from: a, to: b });
  }
  return out;
}
