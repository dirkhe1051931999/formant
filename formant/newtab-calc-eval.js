/**
 * 聊天计算器求值。只解析数字和四则运算，不使用 eval / Function。
 */

const MAX_LENGTH = 200;

/**
 * @param {string} raw
 * @returns {number}
 */
export function evaluateExpression(raw) {
  const src = normalizeExpression(raw);
  if (!src) throw new Error("请输入算式");
  if (src.length > MAX_LENGTH) throw new Error("算式太长");

  let index = 0;

  const peek = () => src[index] || "";

  const parseExpression = () => {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = src[index++];
      const right = parseTerm();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };

  const parseTerm = () => {
    let value = parseUnary();
    while (peek() === "*" || peek() === "/") {
      const op = src[index++];
      const right = parseUnary();
      if (op === "/" && right === 0) throw new Error("不能除以 0");
      value = op === "*" ? value * right : value / right;
    }
    return value;
  };

  const parseUnary = () => {
    if (peek() === "+") {
      index += 1;
      return parseUnary();
    }
    if (peek() === "-") {
      index += 1;
      return -parseUnary();
    }
    return parsePrimary();
  };

  const parsePrimary = () => {
    if (peek() === "(") {
      index += 1;
      const value = parseExpression();
      if (peek() !== ")") throw new Error("算式无法计算");
      index += 1;
      return applyPercent(value);
    }
    const match = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(src.slice(index));
    if (!match) throw new Error("算式无法计算");
    index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) throw new Error("算式无法计算");
    return applyPercent(value);
  };

  const applyPercent = (value) => {
    if (peek() !== "%") return value;
    index += 1;
    return value / 100;
  };

  const result = parseExpression();
  if (index !== src.length) throw new Error("算式无法计算");
  if (!Number.isFinite(result)) throw new Error("结果超出范围");
  return result;
}

/**
 * @param {number} value
 * @returns {string}
 */
export function formatCalcResult(value) {
  if (!Number.isFinite(value)) throw new Error("结果超出范围");
  const rounded = Object.is(value, -0) ? 0 : Number(value.toPrecision(12));
  if (!Number.isFinite(rounded)) throw new Error("结果超出范围");
  if (rounded === 0) return "0";
  const abs = Math.abs(rounded);
  if (abs >= 1e12 || abs < 1e-8) {
    return rounded.toExponential(6).replace(/\.?0+(?=e)/, "").replace("e+", "e");
  }
  return String(rounded);
}

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeExpression(raw) {
  let text = String(raw ?? "").trim();
  text = text.replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xff10));
  text = text
    .replace(/＋/g, "+")
    .replace(/[－−]/g, "-")
    .replace(/[×＊]/g, "*")
    .replace(/[÷／]/g, "/")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/％/g, "%")
    .replace(/\s+/g, "");
  text = text.replace(/[,，](?=\d{3}(?:\D|$))/g, "");
  return text;
}
