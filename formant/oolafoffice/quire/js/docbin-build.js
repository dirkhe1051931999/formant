/* Quire — Word 97–2003 .doc helpers: pictures, TAP tables, header story. */
(function (root) {
  'use strict';
  const L = root.L, D = L.D, B = L.docbin;
  const tw = (n) => n / 20;

  B.picItem = function (data, fc, rPr) {
    if (!data || !L.media || fc < 0 || fc + 8 > data.length) return null;
    const dv = new DataView(data.buffer, data.byteOffset + fc, Math.min(68, data.length - fc));
    const lcb = dv.getUint32(0, true);
    const blob = data.subarray(fc, Math.min(data.length, fc + Math.max(lcb, 8)));
    let mime, a = -1, b = blob.length;
    for (let i = 0; i < blob.length - 8; i++) {
      if (blob[i] === 0x89 && blob[i + 1] === 0x50 && blob[i + 2] === 0x4E) {
        mime = 'image/png'; a = i;
        for (let j = i; j < blob.length - 7; j++) if (blob[j] === 0x49 && blob[j + 1] === 0x45 && blob[j + 2] === 0x4E && blob[j + 3] === 0x44) { b = j + 8; break; }
        break;
      }
      if (blob[i] === 0xFF && blob[i + 1] === 0xD8 && blob[i + 2] === 0xFF) {
        mime = 'image/jpeg'; a = i;
        for (let j = i; j < blob.length - 1; j++) if (blob[j] === 0xFF && blob[j + 1] === 0xD9) { b = j + 2; break; }
        break;
      }
    }
    if (!mime || a < 0) return null;
    const id = L.media.add(new Blob([blob.subarray(a, b)], { type: mime }), mime === 'image/png' ? 'image.png' : 'image.jpg');
    const dxa = dv.getUint16(28, true), dya = dv.getUint16(30, true);
    const mx = dv.getUint16(32, true) || 1000, my = dv.getUint16(34, true) || 1000;
    let w = dxa ? tw(dxa) * mx / 1000 : 160, h = dya ? tw(dya) * my / 1000 : 40;
    if (w > 240) { h *= 240 / w; w = 240; }
    if (h > 80) { w *= 80 / h; h = 80; }
    const clean = Object.assign({}, rPr);
    delete clean._picFc;
    return { t: 'img', media: id, w: L.round(w, 2), h: L.round(h, 2), natW: w, natH: h, rPr: clean };
  };

  B.makeTable = function (rows) {
    const near = (a, b) => Math.abs(a - b) < 0.6;
    const xs = [];
    for (const r of rows) if (r.tap) for (const x of r.tap.xs) if (!xs.some((y) => near(y, x))) xs.push(x);
    xs.sort((a, b) => a - b);
    const fallback = xs.length < 2;
    const grid = fallback ? null : xs.slice(1).map((x, i) => x - xs[i]);
    const out = [];
    let maxN = 1;
    for (const r of rows) maxN = Math.max(maxN, r.cells.length);
    const eq = 468 / maxN;
    for (const r of rows) {
      const cells = r.cells.slice();
      if (fallback || !r.tap) {
        while (cells.length < maxN) cells.push(D.cell([D.para()], { w: eq }));
        for (const c of cells) if (c.tcPr.w == null) c.tcPr.w = eq;
        out.push(D.row(cells));
        continue;
      }
      for (let i = 0; i < cells.length && i + 1 < r.tap.xs.length; i++) {
        const x0 = r.tap.xs[i], x1 = r.tap.xs[i + 1];
        let g0 = 0, g1 = xs.length - 1;
        for (let g = 0; g < xs.length; g++) { if (near(xs[g], x0)) g0 = g; if (near(xs[g], x1)) g1 = g; }
        const span = Math.max(1, g1 - g0);
        cells[i].tcPr.w = x1 - x0;
        if (span > 1) cells[i].tcPr.span = span;
      }
      out.push(D.row(cells));
    }
    const g = grid || Array.from({ length: maxN }, () => eq);
    const line = { val: 'single', sz: 0.5, color: '000000' };
    return D.table(out, g, { style: 'TableGrid', w: { type: 'dxa', v: g.reduce((s, x) => s + x, 0) }, ind: 5.4, borders: { top: line, left: line, bottom: line, right: line, insideH: line, insideV: line } });
  };
})(typeof window !== 'undefined' ? window : globalThis);
