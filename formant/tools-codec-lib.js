import { md5 } from "./tools-md5.js";

/**
 * @typedef {string | { table: { head: string[], rows: string[][] }, info?: string[] }} CodecResult
 * @typedef {{ id: string, label: string, hint?: string, group: "encode" | "decode", run: (text: string) => CodecResult | Promise<CodecResult> }} CodecMethod
 */

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: false });

/** @param {string} text */
const toBytes = (text) => enc.encode(text);

/** @param {Uint8Array} bytes */
export function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** @param {string} text 标准或 URL-safe Base64 */
export function base64ToBytes(text) {
  let s = String(text).replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  s = s.padEnd(Math.ceil(s.length / 4) * 4, "=");
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** @param {Uint8Array} bytes */
const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** @param {string} text */
export function hexToBytes(text) {
  const hex = String(text).replace(/0x|\\x|[\s,:-]/gi, "");
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error("不是有效的十六进制字节串");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** @param {string} name @param {Uint8Array} bytes */
async function digest(name, bytes) {
  return toHex(new Uint8Array(await crypto.subtle.digest(name, bytes)));
}

/** @param {"gzip"} kind @param {Uint8Array} bytes @param {"compress" | "decompress"} mode */
async function pipe(kind, bytes, mode) {
  const Stream = mode === "compress" ? CompressionStream : DecompressionStream;
  const stream = new Blob([bytes]).stream().pipeThrough(new Stream(kind));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** @param {string} text */
function htmlDecode(text) {
  return new DOMParser().parseFromString(text, "text/html").documentElement.textContent || "";
}

/** @param {string} part */
function decodeJwtPart(part) {
  const json = dec.decode(base64ToBytes(part));
  return JSON.parse(json);
}

/** @param {unknown} value */
const jwtTime = (value) =>
  typeof value === "number" ? `${value}（${new Date(value * 1000).toLocaleString()}）` : String(value);

/** @type {CodecMethod[]} */
export const METHODS = [
  {
    id: "uniEncode",
    label: "Unicode 编码",
    hint: "\\uXXXX",
    group: "encode",
    run: (t) => t.replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`),
  },
  {
    id: "urlEncode",
    label: "URL 编码",
    hint: "%XX",
    group: "encode",
    run: (t) => encodeURIComponent(t),
  },
  {
    id: "x16Encode",
    label: "UTF-16 转义",
    hint: "\\xHH / \\uXXXX",
    group: "encode",
    run: (t) =>
      Array.from(t, (c) => {
        const code = c.charCodeAt(0);
        if (c.length > 1) return Array.from({ length: c.length }, (_, i) => `\\u${c.charCodeAt(i).toString(16).padStart(4, "0")}`).join("");
        return code < 256 ? `\\x${code.toString(16).padStart(2, "0")}` : `\\u${code.toString(16).padStart(4, "0")}`;
      }).join(""),
  },
  {
    id: "base64Encode",
    label: "Base64 编码",
    group: "encode",
    run: (t) => bytesToBase64(toBytes(t)),
  },
  {
    id: "hexEncode",
    label: "十六进制编码",
    hint: "UTF-8 字节",
    group: "encode",
    run: (t) => toHex(toBytes(t)),
  },
  {
    id: "htmlEncode",
    label: "HTML 普通转义",
    hint: "& < > \" '",
    group: "encode",
    run: (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"),
  },
  {
    id: "htmlFullEncode",
    label: "HTML 深度转义",
    hint: "&#xHH;",
    group: "encode",
    run: (t) => Array.from(t, (c) => `&#x${c.codePointAt(0)?.toString(16)};`).join(""),
  },
  {
    id: "stringEscape",
    label: "字符串转义",
    group: "encode",
    run: (t) => JSON.stringify(t).slice(1, -1),
  },
  { id: "md5", label: "MD5", group: "encode", run: (t) => md5(toBytes(t)) },
  { id: "sha1", label: "SHA-1", group: "encode", run: (t) => digest("SHA-1", toBytes(t)) },
  { id: "sha256", label: "SHA-256", group: "encode", run: (t) => digest("SHA-256", toBytes(t)) },
  {
    id: "gzipEncode",
    label: "Gzip 压缩",
    hint: "输出 Base64",
    group: "encode",
    run: async (t) => bytesToBase64(await pipe("gzip", toBytes(t), "compress")),
  },

  {
    id: "uniDecode",
    label: "Unicode 解码",
    hint: "\\uXXXX",
    group: "decode",
    run: (t) => t.replace(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})/gi, (_, a, b) => String.fromCodePoint(parseInt(a || b, 16))),
  },
  {
    id: "urlDecode",
    label: "URL 解码",
    hint: "%XX",
    group: "decode",
    run: (t) => {
      try {
        return decodeURIComponent(t);
      } catch {
        return unescape(t);
      }
    },
  },
  {
    id: "x16Decode",
    label: "UTF-16 反转义",
    hint: "\\xHH / \\uXXXX",
    group: "decode",
    run: (t) =>
      t
        .replace(/\\x([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))),
  },
  {
    id: "base64Decode",
    label: "Base64 解码",
    hint: "支持 URL-safe",
    group: "decode",
    run: (t) => dec.decode(base64ToBytes(t)),
  },
  {
    id: "hexDecode",
    label: "十六进制解码",
    hint: "按 UTF-8 还原",
    group: "decode",
    run: (t) => dec.decode(hexToBytes(t)),
  },
  {
    id: "htmlDecode",
    label: "HTML 实体解码",
    group: "decode",
    run: (t) => htmlDecode(t),
  },
  {
    id: "urlParams",
    label: "URL 参数解析",
    hint: "表格展示",
    group: "decode",
    run: (t) => {
      const raw = t.trim();
      let url;
      try {
        url = new URL(raw);
      } catch {
        url = new URL(raw.startsWith("?") || raw.includes("=") ? `http://x/?${raw.replace(/^\?/, "")}` : `http://${raw}`);
      }
      const info = /^http:\/\/x\//.test(url.href) ? [] : [`协议：${url.protocol}`, `主机：${url.host}`, `路径：${url.pathname}`];
      if (url.hash) info.push(`Hash：${url.hash}`);
      const rows = Array.from(url.searchParams.entries()).map(([k, v]) => [k, v]);
      return { table: { head: ["参数名", "参数值"], rows }, info };
    },
  },
  {
    id: "jwtDecode",
    label: "JWT 解码",
    hint: "仅解码，不验签",
    group: "decode",
    run: (t) => {
      const parts = t.trim().replace(/^Bearer\s+/i, "").split(".");
      if (parts.length < 2) throw new Error("JWT 应为 header.payload.signature");
      const header = decodeJwtPart(parts[0]);
      const payload = decodeJwtPart(parts[1]);
      for (const key of ["exp", "iat", "nbf"]) if (key in payload) payload[`${key}（时间）`] = jwtTime(payload[key]);
      return `// Header\n${JSON.stringify(header, null, 2)}\n\n// Payload\n${JSON.stringify(payload, null, 2)}\n\n// Signature\n${parts[2] || "(无)"}`;
    },
  },
  {
    id: "stringUnescape",
    label: "字符串反转义",
    group: "decode",
    run: (t) => {
      const body = t.trim().replace(/^(["'`])([\s\S]*)\1$/, "$2").replace(/(?<!\\)"/g, '\\"');
      try {
        return JSON.parse(`"${body}"`);
      } catch {
        return t.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r").replace(/\\(["'\\])/g, "$1");
      }
    },
  },
  {
    id: "gzipDecode",
    label: "Gzip 解压",
    hint: "输入 Base64",
    group: "decode",
    run: async (t) => dec.decode(await pipe("gzip", base64ToBytes(t), "decompress")),
  },
];
