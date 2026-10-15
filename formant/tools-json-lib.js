/** JSON 工具纯函数：大整数无损、容错解析、排序、嵌套解析。 */

const BIG_PREFIX = "__FBIG__";
const BIG_RE = new RegExp(`"${BIG_PREFIX}(-?\\d+)__"`, "g");
const NUMBER_RE = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

/**
 * 把字符串外、超出安全范围的整数改成带标记的字符串，避免 JSON.parse 丢精度。
 * @param {string} text
 */
export function protectBigInts(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (ch === "-" || (ch >= "0" && ch <= "9")) {
      NUMBER_RE.lastIndex = i;
      const m = NUMBER_RE.exec(text);
      if (!m) {
        out += ch;
        i += 1;
        continue;
      }
      const token = m[0];
      const isInt = /^-?\d+$/.test(token);
      out += isInt && !Number.isSafeInteger(Number(token)) ? `"${BIG_PREFIX}${token}__"` : token;
      i += token.length;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

/** 把格式化后文本里的标记还原成原始整数。 */
export const restoreBigInts = (text) => text.replace(BIG_RE, "$1");

/** 树视图用：标记字符串还原为数字字面量文本（作为字符串显示）。 */
export function reviveForTree(value) {
  if (typeof value === "string") {
    const m = value.match(new RegExp(`^${BIG_PREFIX}(-?\\d+)__$`));
    return m ? m[1] : value;
  }
  if (Array.isArray(value)) return value.map(reviveForTree);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, reviveForTree(v)]));
  }
  return value;
}

/**
 * @param {string} text
 * @param {number} pos
 */
function lineCol(text, pos) {
  const head = text.slice(0, pos);
  const line = head.split("\n").length;
  return { line, col: pos - head.lastIndexOf("\n") };
}

/**
 * 极简 JSON 语法扫描，返回第一个错误位置；合法返回 -1。
 * 新版 V8 的报错信息不带行列，这里自己定位。
 * @param {string} s
 */
export function findErrorPos(s) {
  let i = 0;
  const ws = () => {
    while (i < s.length && " \t\r\n".includes(s[i])) i += 1;
  };
  const fail = () => {
    throw i;
  };
  const str = () => {
    i += 1;
    while (i < s.length && s[i] !== '"') {
      if (s[i] === "\\") i += 1;
      else if (s[i] < " ") fail();
      i += 1;
    }
    if (i >= s.length) fail();
    i += 1;
  };
  const atom = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;
  const value = () => {
    ws();
    const c = s[i];
    if (c === "{" || c === "[") {
      const close = c === "{" ? "}" : "]";
      i += 1;
      ws();
      if (s[i] === close) {
        i += 1;
        return;
      }
      for (;;) {
        ws();
        if (c === "{") {
          if (s[i] !== '"') fail();
          str();
          ws();
          if (s[i] !== ":") fail();
          i += 1;
        }
        value();
        ws();
        if (s[i] === ",") {
          i += 1;
          continue;
        }
        if (s[i] === close) {
          i += 1;
          return;
        }
        fail();
      }
    }
    if (c === '"') return str();
    atom.lastIndex = i;
    const m = atom.exec(s);
    if (!m) fail();
    i += /** @type {RegExpExecArray} */ (m)[0].length;
  };
  try {
    value();
    ws();
    if (i < s.length) fail();
  } catch (error) {
    if (typeof error === "number") return error;
    throw error;
  }
  return -1;
}

/**
 * 解析 JSON；兼容 BOM、JSONP 包裹。失败抛出带行列的 Error。
 * @param {string} input
 */
export function parseJson(input) {
  let text = String(input ?? "").replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("请输入 JSON");
  const jsonp = text.match(/^[\w$.]+\s*\(([\s\S]*)\)\s*;?$/);
  if (jsonp) text = jsonp[1].trim();
  const safe = protectBigInts(text);
  try {
    return JSON.parse(safe);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const lc = message.match(/line (\d+) column (\d+)/);
    if (lc) throw new Error(`第 ${lc[1]} 行第 ${lc[2]} 列：${message}`);
    const pos = message.match(/position (\d+)/);
    const at = pos ? Number(pos[1]) : findErrorPos(text);
    if (at >= 0) {
      const { line, col } = lineCol(text, at);
      const tail = at >= text.length ? "（内容意外结束）" : `（附近：${JSON.stringify(text.slice(at, at + 12))}）`;
      throw new Error(`第 ${line} 行第 ${col} 列语法错误${tail}`);
    }
    throw new Error(message);
  }
}

/**
 * @param {unknown} value
 * @param {1 | -1 | 0} dir 1 升序，-1 降序，0 保持原序
 */
export function sortKeys(value, dir) {
  if (!dir) return value;
  if (Array.isArray(value)) return value.map((v) => sortKeys(v, dir));
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort((a, b) => (a < b ? -dir : a > b ? dir : 0));
    return Object.fromEntries(keys.map((k) => [k, sortKeys(/** @type {any} */ (value)[k], dir)]));
  }
  return value;
}

/**
 * 字符串值本身是 JSON 时递归展开（接口里常见的“JSON 套 JSON”）。
 * @param {unknown} value
 * @param {number} [depth]
 */
export function expandNested(value, depth = 0) {
  if (depth > 8) return value;
  if (typeof value === "string") {
    const s = value.trim();
    if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
      try {
        return expandNested(JSON.parse(protectBigInts(s)), depth + 1);
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => expandNested(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expandNested(v, depth + 1)]));
  }
  return value;
}

/**
 * @param {string} input
 * @param {{ indent: number | "tab" | 0, sort: 1 | -1 | 0, nested: boolean }} opt
 * @returns {{ value: unknown, text: string }}
 */
export function formatJson(input, opt) {
  let value = parseJson(input);
  if (opt.nested) {
    value = expandNested(value);
    if (typeof value === "string") value = expandNested(JSON.parse(protectBigInts(value)));
  }
  value = sortKeys(value, opt.sort);
  const space = opt.indent === "tab" ? "\t" : opt.indent;
  return { value, text: restoreBigInts(JSON.stringify(value, null, space || undefined)) };
}

/**
 * 文本里的 \uXXXX 转成真实字符；引号、反斜杠和控制字符保持转义，避免破坏 JSON 结构。
 * @param {string} text
 */
export const unicodeToText = (text) =>
  text.replace(/\\u([0-9a-f]{4})/gi, (all, h) => {
    const code = parseInt(h, 16);
    if (code === 0x22) return '\\"';
    if (code === 0x5c) return "\\\\";
    if (code < 0x20) return all;
    return String.fromCharCode(code);
  });

/** @param {string} text */
export const urlDecodeText = (text) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return unescape(text);
  }
};

const HL_RE = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const HL_LIMIT = 400000;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * 格式化后的 JSON 文本 → 带颜色的 HTML（类名复用 viewer 的 oolaf-json-*）。过大时只转义不上色。
 * @param {string} text
 */
export function highlightJson(text) {
  if (text.length > HL_LIMIT) return esc(text);
  let html = "";
  let last = 0;
  for (const m of text.matchAll(HL_RE)) {
    html += esc(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1] !== undefined) {
      html += m[2] !== undefined
        ? `<span class="oolaf-json-key">${esc(m[1])}</span>${esc(m[2])}`
        : `<span class="oolaf-json-string">${esc(m[1])}</span>`;
    } else if (m[3] !== undefined) html += `<span class="oolaf-json-boolean">${m[0]}</span>`;
    else if (m[0] === "null") html += `<span class="oolaf-json-null">null</span>`;
    else html += `<span class="oolaf-json-number">${m[0]}</span>`;
  }
  return html + esc(text.slice(last));
}

