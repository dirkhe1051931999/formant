/** 小型 MD5（输入字节，输出 32 位小写 hex）。 */

const SHIFTS = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

/** @param {number} i */
function shiftFor(i) {
  return SHIFTS[(i >> 4) * 4 + (i % 4)];
}

/** @param {number} x @param {number} n */
const rotl = (x, n) => (x << n) | (x >>> (32 - n));

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function md5(bytes) {
  const len = bytes.length;
  const total = (((len + 8) >>> 6) + 1) * 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[len] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, (len << 3) >>> 0, true);
  view.setUint32(total - 4, len >>> 29, true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89 | 0;
  let c0 = 0x98badcfe | 0;
  let d0 = 0x10325476;

  for (let off = 0; off < total; off += 64) {
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i += 1) {
      let F;
      let g;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + view.getUint32(off + g * 4, true)) | 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotl(F, shiftFor(i))) | 0;
    }
    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }

  const out = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((v, i) => out.setUint32(i * 4, v >>> 0, true));
  return Array.from(new Uint8Array(out.buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}
