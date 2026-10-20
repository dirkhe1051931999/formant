/* Quire — Word 97–2003 binary document (.doc, MS-DOC) reader.
 * L.docbin.read(bytes) → Promise<{doc, warnings}>
 * Opens OLE WordDocument + 0Table/1Table. Saves go through Save As as .docx.
 */
(function (root) {
  'use strict';
  const L = root.L, D = L.D;
  const B = (L.docbin = {});
  const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';
  const ICO = [null, '000000', '0000FF', '00FFFF', '00FF00', 'FF00FF', 'FF0000', 'FFFF00', 'FFFFFF', '000080', '008080', '008000', '800080', '800000', '808000', '808080', 'C0C0C0'];
  const JC = ['left', 'center', 'right', 'both'];
  const STI = { 0: 'Normal', 1: 'Heading1', 2: 'Heading2', 3: 'Heading3', 4: 'Heading4', 5: 'Heading5', 6: 'Heading6', 7: 'Heading7', 8: 'Heading8', 9: 'Heading9', 31: 'Header', 32: 'Footer', 33: 'FootnoteText', 34: 'EndnoteText', 37: 'Caption', 46: 'Title', 47: 'Subtitle' };
  const hex2 = (n) => (n < 16 ? '0' : '') + (n & 255).toString(16).toUpperCase();
  const tw = (n) => n / 20;
  const i16 = (n) => (n &= 0xFFFF, n >= 0x8000 ? n - 0x10000 : n);
  const view = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const on = (v) => v === 1 || v === 0x81;
  const fail = (m, code) => { throw Object.assign(new Error(m), { code: code || 'doc' }); };
  const decByte = (b) => (b >= 0x80 && b < 0xa0 ? CP1252[b - 0x80] : String.fromCharCode(b));

  function sprmLen(sprm, buf, o) {
    if (sprm === 0xD608 || sprm === 0xD606) return o + 2 <= buf.length ? 2 + ((buf[o] | (buf[o + 1] << 8)) + 1) : 1;
    const spra = sprm >>> 13;
    return spra === 6 ? 1 + (buf[o] || 0) : [1, 1, 2, 4, 2, 2, 0, 3][spra] || 1;
  }
  function sprmOp(buf, o, n) {
    if (n === 1) return buf[o];
    if (n === 2) return buf[o] | (buf[o + 1] << 8);
    if (n === 3) return buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16);
    if (n === 4) return buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24);
    return 0;
  }
  function walkGrpprl(buf, o, end, fn) {
    while (o + 2 <= end) {
      const sprm = buf[o] | (buf[o + 1] << 8);
      o += 2;
      const n = sprmLen(sprm, buf, o);
      if (o + n > end) break;
      fn(sprm, sprmOp(buf, o, n), buf.subarray(o, o + n));
      o += n;
    }
  }

  function lidEnc(lid) {
    lid &= 0xFFFF;
    if (lid === 0x0804 || lid === 0x0004) return 'gbk';
    if (lid === 0x0404 || lid === 0x0c04 || lid === 0x1404) return 'big5';
    if (lid === 0x0411) return 'shift_jis';
    if (lid === 0x0412) return 'euc-kr';
    return 'windows-1252';
  }
  function decodeCompressed(bytes, enc) {
    if (!enc || enc === 'windows-1252') {
      const out = new Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) out[i] = decByte(bytes[i]);
      return out;
    }
    const out = [];
    let i = 0;
    const dec = new TextDecoder(enc);
    while (i < bytes.length) {
      if (i + 1 < bytes.length) {
        const pair = dec.decode(bytes.subarray(i, i + 2));
        if (pair.length === 1 && pair !== '\uFFFD') { out.push(pair, ''); i += 2; continue; }
      }
      out.push(dec.decode(bytes.subarray(i, i + 1)));
      i++;
    }
    return out;
  }

  function apply(sprm, op, rPr, pPr, fonts) {
    switch (sprm) {
      case 0x0835: if (on(op)) rPr.b = true; else if (op === 0) delete rPr.b; break;
      case 0x0836: if (on(op)) rPr.i = true; else if (op === 0) delete rPr.i; break;
      case 0x0837: if (on(op)) rPr.strike = true; else if (op === 0) delete rPr.strike; break;
      case 0x083A: if (on(op)) rPr.smallCaps = true; else if (op === 0) delete rPr.smallCaps; break;
      case 0x083B: if (on(op)) rPr.caps = true; else if (op === 0) delete rPr.caps; break;
      case 0x083C: if (on(op)) rPr.hidden = true; else if (op === 0) delete rPr.hidden; break;
      case 0x2A3E: if (!op) delete rPr.u; else rPr.u = op === 3 ? 'double' : op === 4 ? 'dotted' : 'single'; break;
      case 0x2A42: if (ICO[op]) rPr.color = ICO[op]; else delete rPr.color; break;
      case 0x2A48: if (op === 1) rPr.vert = 'superscript'; else if (op === 2) rPr.vert = 'subscript'; else delete rPr.vert; break;
      case 0x4A43: rPr.sz = op / 2; break;
      case 0x4A4F: case 0x4A50: case 0x4A51: if (fonts[op]) rPr.font = fonts[op]; break;
      case 0x6870: rPr.color = hex2(op) + hex2(op >> 8) + hex2(op >> 16); break;
      case 0x6A03: rPr._picFc = op; break;
      case 0x2403: case 0x2461: if (JC[op]) pPr.jc = JC[op]; break;
      case 0x4600: pPr._istd = op & 0xFFF; break;
      case 0x2416: pPr._inTable = !!op; break;
      case 0x2417: pPr._rowEnd = !!op; break;
      case 0x6649: pPr._itap = op; break;
      case 0x840F: case 0x845E: pPr.ind = Object.assign({}, pPr.ind, { l: tw(i16(op)) }); break;
      case 0x840E: case 0x845D: pPr.ind = Object.assign({}, pPr.ind, { r: tw(i16(op)) }); break;
      case 0x8411: case 0x8460: pPr.ind = Object.assign({}, pPr.ind, { fl: tw(i16(op)) }); break;
      case 0xA413: pPr.sp = Object.assign({}, pPr.sp, { b: tw(op) }); break;
      case 0xA414: pPr.sp = Object.assign({}, pPr.sp, { a: tw(op) }); break;
      case 0x6412: {
        const dya = i16(op & 0xFFFF), mult = (op >>> 16) & 0xFFFF;
        if (mult) pPr.sp = Object.assign({}, pPr.sp, { line: dya / 240, rule: 'auto' });
        else if (dya < 0) pPr.sp = Object.assign({}, pPr.sp, { line: tw(-dya), rule: 'exact' });
        else if (dya) pPr.sp = Object.assign({}, pPr.sp, { line: tw(dya), rule: 'atLeast' });
        break;
      }
    }
  }

  function parseTap(op) {
    if (!op || op.length < 5) return null;
    const cols = op[2];
    if (!cols || 3 + 2 * (cols + 1) > op.length) return null;
    const xs = [];
    for (let k = 0; k <= cols; k++) xs.push(tw(i16(op[3 + k * 2] | (op[3 + k * 2 + 1] << 8))));
    return { xs, cols };
  }

  function pair(dv, base, i) { return { fc: dv.getUint32(base + i * 8, true), lcb: dv.getUint32(base + i * 8 + 4, true) }; }

  function parseFib(word) {
    if (word.length < 68) fail('This file is not a Word 97–2003 document (.doc).');
    const dv = view(word);
    const wIdent = dv.getUint16(0, true), nFib = dv.getUint16(2, true), flags = dv.getUint16(10, true);
    if (wIdent !== 0xA5EC && wIdent !== 0xA5DC && wIdent !== 0xA5C0) fail('This file is not a Word 97–2003 document (.doc).');
    if (nFib && nFib < 0x00C1) fail('This is a Word 6.0 or Word 95 document. Save it as .doc (Word 97–2003) or .docx and open it again.');
    if (flags & 0x0100 || flags & 0x8000) fail('This .doc file is password-protected. Quire can open unprotected Word 97–2003 files; remove the password in Word or save the file as .docx.');
    const lid = dv.getUint16(6, true);
    const csw = dv.getUint16(32, true);
    const lidFE = csw >= 14 ? dv.getUint16(34 + 26, true) : 0;
    const cslwAt = 34 + csw * 2;
    if (cslwAt + 2 > word.length) fail('This Word document is damaged.');
    const cslw = dv.getUint16(cslwAt, true);
    const rgLw = cslwAt + 2;
    if (cslw < 6 || rgLw + cslw * 4 + 2 > word.length) fail('This Word document is damaged.');
    const ccpText = dv.getInt32(rgLw + 12, true), ccpFtn = dv.getInt32(rgLw + 16, true);
    const fcLcbAt = rgLw + cslw * 4;
    const cbRgFcLcb = dv.getUint16(fcLcbAt, true);
    const fcBase = fcLcbAt + 2;
    if (cbRgFcLcb < 34 || fcBase + cbRgFcLcb * 8 > word.length) fail('This Word document is damaged.');
    return {
      whichTable: !!(flags & 0x0200), farEast: !!(flags & 0x4000) || (lidFE & 0xFF00) === 0x0800 || lidFE === 0x0404,
      lid, lidFE, ccpText: ccpText > 0 ? ccpText : 0, ccpFtn: ccpFtn > 0 ? ccpFtn : 0,
      clx: pair(dv, fcBase, 33), chpx: pair(dv, fcBase, 12), papx: pair(dv, fcBase, 13),
      ffn: pair(dv, fcBase, 15), stsh: pair(dv, fcBase, 1), hdd: pair(dv, fcBase, 11),
    };
  }

  function readPieces(clx, table) {
    if (!clx.lcb || clx.fc + clx.lcb > table.length) fail('This Word document has no text table and could not be read.');
    const buf = table.subarray(clx.fc, clx.fc + clx.lcb);
    let p = 0;
    while (p < buf.length) {
      const t = buf[p];
      if (t === 1) { const cb = buf[p + 1] | (buf[p + 2] << 8); p += 3 + cb; continue; }
      if (t !== 2) break;
      const lcb = buf[p + 1] | (buf[p + 2] << 8) | (buf[p + 3] << 16) | (buf[p + 4] << 24);
      p += 5;
      const plc = buf.subarray(p, p + lcb);
      const n = (lcb - 4) / 12;
      if (n < 1 || n !== (n | 0) || plc.length < lcb) fail('This Word document is damaged.');
      const dv = view(plc);
      const out = [];
      for (let i = 0; i < n; i++) {
        const cp0 = dv.getInt32(i * 4, true), cp1 = dv.getInt32((i + 1) * 4, true);
        const o = (n + 1) * 4 + i * 8;
        const fcRaw = dv.getUint32(o + 2, true);
        const compressed = !!(fcRaw & 0x40000000);
        out.push({ cp0, cp1, compressed, fc: compressed ? (fcRaw & 0x3FFFFFFF) / 2 : fcRaw });
      }
      return out;
    }
    fail('This Word document has no text table and could not be read.');
  }

  function extractChars(word, pieces, enc) {
    const cps = [];
    for (const p of pieces) {
      const n = Math.max(0, p.cp1 - p.cp0);
      if (p.compressed) {
        const slice = decodeCompressed(word.subarray(p.fc, p.fc + n), enc);
        for (let i = 0; i < n; i++) cps.push(slice[i] || '');
      } else {
        const u = new TextDecoder('utf-16le').decode(word.subarray(p.fc, p.fc + n * 2));
        for (let i = 0; i < n; i++) cps.push(u[i] || '');
      }
    }
    return cps;
  }
  function fcAt(pieces, cp) {
    for (const p of pieces) {
      if (cp >= p.cp0 && cp < p.cp1) return p.fc + (cp - p.cp0) * (p.compressed ? 1 : 2);
    }
    return -1;
  }
  function fcToCp(pieces, fc) {
    for (const p of pieces) {
      const w = p.compressed ? 1 : 2;
      const end = p.fc + (p.cp1 - p.cp0) * w;
      if (fc >= p.fc && fc <= end) return p.cp0 + Math.floor((fc - p.fc) / w);
    }
    return -1;
  }

  function readPlcFkp(word, table, plc, bxSize, each) {
    if (!plc.lcb || plc.fc + plc.lcb > table.length) return;
    const buf = table.subarray(plc.fc, plc.fc + plc.lcb);
    const n = (plc.lcb - 4) / 8;
    if (n < 1 || n !== (n | 0)) return;
    const dv = view(buf);
    for (let i = 0; i < n; i++) {
      const pn = dv.getUint32((n + 1) * 4 + i * 4, true) & 0x3FFFFF;
      const page = word.subarray(pn * 512, pn * 512 + 512);
      if (page.length < 512) continue;
      const crun = page[511], pdv = view(page);
      for (let r = 0; r < crun; r++) {
        const fc0 = pdv.getUint32(r * 4, true), fc1 = pdv.getUint32((r + 1) * 4, true);
        each(fc0, fc1, page[4 * (crun + 1) + r * bxSize] * 2, page);
      }
    }
  }

  function readPapx(word, table, fib, fonts) {
    const out = [];
    readPlcFkp(word, table, fib.papx, 13, (fc0, fc1, off, page) => {
      const pPr = {}, rPr = {};
      let istd = 0;
      if (off && off + 3 < page.length) {
        let cb = page[off], o = off + 1;
        if (cb === 0) { cb = (page[o] || 0) * 2; o++; } else cb = 2 * cb - 1;
        istd = page[o] | (page[o + 1] << 8);
        walkGrpprl(page, o + 2, Math.min(page.length, o + cb), (s, v, raw) => {
          if (s === 0xD608) pPr._tap = parseTap(raw);
          else apply(s, v, rPr, pPr, fonts);
        });
      }
      out.push({ fc0, fc1, istd: pPr._istd != null ? pPr._istd : istd, pPr });
    });
    out.sort((a, b) => a.fc0 - b.fc0);
    return out;
  }
  function readChpx(word, table, fib, fonts) {
    const out = [];
    readPlcFkp(word, table, fib.chpx, 1, (fc0, fc1, off, page) => {
      const rPr = {}, pPr = {};
      if (off && off < page.length) {
        const cb = page[off];
        if (cb) walkGrpprl(page, off + 1, Math.min(page.length, off + 1 + cb), (s, v) => apply(s, v, rPr, pPr, fonts));
      }
      out.push({ fc0, fc1, rPr });
    });
    out.sort((a, b) => a.fc0 - b.fc0);
    return out;
  }
  function chpAt(chpx, fc) {
    let lo = 0, hi = chpx.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (chpx[m].fc1 <= fc) lo = m + 1; else hi = m;
    }
    const hit = chpx[lo];
    return hit && fc >= hit.fc0 && fc < hit.fc1 ? hit.rPr : {};
  }

  function readFonts(table, fib) {
    const fonts = [];
    const p = fib.ffn;
    if (!p.lcb || p.fc + p.lcb > table.length) return fonts;
    const buf = table.subarray(p.fc, p.fc + p.lcb);
    const ext = (buf[0] | (buf[1] << 8)) === 0xFFFF;
    let o = ext ? 6 : 4;
    const count = ext ? (buf[2] | (buf[3] << 8)) : (buf[0] | (buf[1] << 8));
    for (let i = 0; i < count && o < buf.length; i++) {
      const cb = (buf[o] || 0) + 1;
      if (o + cb > buf.length) break;
      if (cb > 40) {
        const name = new TextDecoder('utf-16le').decode(buf.subarray(o + 40, o + cb)).replace(/\u0000+$/, '').split('\u0000')[0];
        if (name) fonts[i] = name;
      }
      o += cb;
    }
    return fonts;
  }
  function readStyles(table, fib) {
    const map = {};
    const p = fib.stsh;
    if (!p.lcb || p.fc + 4 > table.length) return map;
    const buf = table.subarray(p.fc, Math.min(table.length, p.fc + p.lcb));
    const cbStshi = buf[0] | (buf[1] << 8);
    if (cbStshi + 4 > buf.length) return map;
    const cstd = buf[2] | (buf[3] << 8);
    const base = buf[4] | (buf[5] << 8);
    let o = 2 + cbStshi;
    for (let i = 0; i < cstd && o + 2 <= buf.length; i++) {
      const cb = buf[o] | (buf[o + 1] << 8);
      o += 2;
      if (!cb) continue;
      if (o + cb > buf.length) break;
      const sti = (buf[o] | (buf[o + 1] << 8)) & 0xFFF;
      map[i] = { id: STI[sti] || ('Style' + i), sti };
      o += cb;
    }
    return map;
  }
  function styleOf(istd, stmap) {
    const s = stmap[istd];
    if (s && s.sti && STI[s.sti] && s.sti !== 0) return STI[s.sti];
    return undefined;
  }

  function emitRuns(cps, pieces, chpx, a, b, data) {
    const runs = [];
    let i = a;
    while (i < b) {
      const code = (cps[i] || '').charCodeAt(0);
      if (code === 0x13) {
        while (i < b && (cps[i] || '').charCodeAt(0) !== 0x14 && (cps[i] || '').charCodeAt(0) !== 0x15) i++;
        if (i < b && (cps[i] || '').charCodeAt(0) === 0x14) i++;
        continue;
      }
      if (code === 0x14 || code === 0x15 || code === 0x0D || code === 0x07 || !code) { i++; continue; }
      const rPr = Object.assign({}, chpAt(chpx, fcAt(pieces, i)));
      if (code === 1) { const im = B.picItem && B.picItem(data, rPr._picFc, rPr); if (im) runs.push(im); i++; continue; }
      if (code === 9) { delete rPr._picFc; runs.push(D.item('tab', null, rPr)); i++; continue; }
      if (code === 0x0B) { delete rPr._picFc; runs.push(D.item('br', { type: 'line' }, rPr)); i++; continue; }
      if (code === 0x0C) { delete rPr._picFc; runs.push(D.item('br', { type: 'page' }, rPr)); i++; continue; }
      if (code < 32) { i++; continue; }
      delete rPr._picFc;
      let t = cps[i];
      i++;
      while (i < b) {
        const c = (cps[i] || '').charCodeAt(0);
        if (!c || c < 32 || c === 0x13) break;
        const nxt = Object.assign({}, chpAt(chpx, fcAt(pieces, i))); delete nxt._picFc;
        if (!D.sameRPr(rPr, nxt)) break;
        t += cps[i];
        i++;
      }
      runs.push(D.text(t, rPr));
    }
    return runs;
  }

  function attachHeader(doc, table, fib, cps, pieces, chpx, data) {
    const p = fib.hdd;
    if (!p.lcb || p.lcb < 16 || p.fc + p.lcb > table.length) return;
    const n = p.lcb / 4, dv = view(table.subarray(p.fc, p.fc + p.lcb));
    const rel = [];
    for (let i = 0; i < n; i++) rel.push(dv.getInt32(i * 4, true));
    const a = rel[7], b = rel[8];
    if (a == null || b == null || b <= a) return;
    const base = fib.ccpText + fib.ccpFtn;
    const runs = emitRuns(cps, pieces, chpx, base + a, Math.min(cps.length, base + b), data);
    if (!runs.length) return;
    doc.hf.h1 = { kind: 'hdr', id: 'h1', blocks: [D.para(runs, { style: 'Header' })] };
    doc.sect.refs.hdr.default = 'h1';
  }

  function buildDoc(cps, pieces, papx, chpx, stmap, fib, fonts, data, tbl) {
    const doc = D.newDoc();
    doc.main.blocks = [];
    if (fib.farEast) {
      doc.sect.pgW = 595.3;
      doc.sect.pgH = 841.9;
      doc.defaults.rPr = { font: fonts[0] || '宋体', sz: 12, lang: 'zh-CN' };
    } else if (fonts[0]) doc.defaults.rPr.font = fonts[0];
    attachHeader(doc, tbl, fib, cps, pieces, chpx, data);
    const out = doc.main.blocks;
    let rows = [], cells = [], cellBlocks = [], rowTap = null;
    const flushCell = () => { cells.push(D.cell(cellBlocks.length ? cellBlocks : [D.para()], {})); cellBlocks = []; };
    const flushRow = () => {
      if (cellBlocks.length) flushCell();
      if (cells.length) rows.push({ cells, tap: rowTap });
      cells = []; rowTap = null;
    };
    const flushTable = () => {
      flushRow();
      if (rows.length) out.push(B.makeTable(rows));
      rows = [];
    };
    const emitPara = (p, inTable, rowEnd, last, tap) => {
      if (rowEnd) { rowTap = tap || rowTap; flushRow(); return; }
      if (inTable) {
        if (p.runs.length) cellBlocks.push(p);
        if (last === 0x07) flushCell();
        return;
      }
      flushTable();
      out.push(p);
    };

    const paras = [];
    for (const rec of papx) {
      const a = fcToCp(pieces, rec.fc0), b = fcToCp(pieces, rec.fc1);
      if (a < 0 || b <= a || a >= fib.ccpText) continue;
      paras.push({ a, b: Math.min(b, fib.ccpText, cps.length), rec });
    }
    if (!paras.length) {
      let a = 0;
      for (let i = 0; i < Math.min(cps.length, fib.ccpText); i++) {
        const c = (cps[i] || '').charCodeAt(0);
        if (c === 0x0D || c === 0x07 || i === fib.ccpText - 1) {
          paras.push({ a, b: i + 1, rec: { istd: 0, pPr: { _inTable: c === 0x07 } } });
          a = i + 1;
        }
      }
    }
    for (const { a, b, rec } of paras) {
      const pPr = Object.assign({}, rec.pPr);
      const sid = styleOf(rec.istd, stmap);
      if (sid) pPr.style = sid;
      const inTable = !!pPr._inTable, rowEnd = !!pPr._rowEnd, tap = pPr._tap;
      delete pPr._istd; delete pPr._inTable; delete pPr._rowEnd; delete pPr._itap; delete pPr._tap;
      const last = (cps[b - 1] || '').charCodeAt(0);
      const p = D.para(emitRuns(cps, pieces, chpx, a, b, data), pPr);
      if (rowEnd) { emitPara(p, true, true, last, tap); continue; }
      if (!p.runs.length && !inTable && !out.length) continue;
      emitPara(p, inTable, false, last, tap);
    }
    flushTable();
    if (!out.length) out.push(D.para());
    return doc;
  }

  B.read = async function (bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (!L.officeCrypto || !L.officeCrypto.cfb) fail('Compound file reader is not loaded.');
    let file;
    try { file = L.officeCrypto.cfb(u8); }
    catch (e) { fail('This file is not a Word 97–2003 document (.doc).'); }
    const word = file.stream('WordDocument');
    if (!word) fail('This compound file does not contain a Word document.');
    const fib = parseFib(word);
    const table = file.stream(fib.whichTable ? '1Table' : '0Table') || file.stream('0Table') || file.stream('1Table');
    if (!table) fail('This Word document is missing its table stream.');
    const pieces = readPieces(fib.clx, table);
    const enc = lidEnc(fib.lidFE || fib.lid);
    const cps = extractChars(word, pieces, enc);
    const fonts = readFonts(table, fib);
    const stmap = readStyles(table, fib);
    const papx = readPapx(word, table, fib, fonts);
    const chpx = readChpx(word, table, fib, fonts);
    const data = file.stream('Data');
    const doc = buildDoc(cps, pieces, papx, chpx, stmap, fib, fonts, data, table);
    doc.ooxmlFormat = 'docx';
    doc.wasBinary = true;
    return { doc, warnings: [] };
  };
})(typeof window !== 'undefined' ? window : globalThis);
