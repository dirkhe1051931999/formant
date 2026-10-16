/* Ledger — Excel 97–2003 binary workbook (.xls, BIFF8) reader.
 * L.xls.read(bytes) → Promise<Workbook>
 * Opens OLE compound files with a Workbook/Book stream. Saves go through Save As as .xlsx.
 */
(function (root) {
  'use strict';
  const L = root.L;
  const M = L.model, F = L.formula, NF = L.numfmt;
  const X = (L.xls = {});

  const ERR_BY = { 0x00: '#NULL!', 0x07: '#DIV/0!', 0x0F: '#VALUE!', 0x17: '#REF!', 0x1D: '#NAME?', 0x24: '#NUM!', 0x2A: '#N/A' };
  const BORDER = ['none', 'thin', 'medium', 'dashed', 'dotted', 'thick', 'double', 'hair', 'mediumDashed', 'dashDot', 'mediumDashDot', 'dashDotDot', 'mediumDashDotDot', 'slantDashDot'];
  const FILL = [null, 'solid', 'mediumGray', 'darkGray', 'lightGray', 'darkHorizontal', 'darkVertical', 'darkDown', 'darkUp', 'darkGrid', 'darkTrellis', 'lightHorizontal', 'lightVertical', 'lightDown', 'lightUp', 'lightGrid', 'lightTrellis', 'gray125', 'gray0625'];
  const HALIGN = [null, 'left', 'center', 'right', 'fill', 'justify', 'centerContinuous', 'distributed'];
  const VALIGN = ['top', 'center', 'bottom', 'justify', 'distributed'];
  const BUILTIN_NAME = { 0: 'Consolidate_Area', 1: 'Auto_Open', 2: 'Auto_Close', 3: 'Extract', 4: 'Database', 5: 'Criteria', 6: 'Print_Area', 7: 'Print_Titles', 8: 'Recorder', 9: 'Data_Form', 10: 'Auto_Activate', 11: 'Auto_Deactivate', 12: 'Sheet_Title', 13: '_FilterDatabase' };

  /* ptgFunc / ptgFuncVar ids → [name, fixedArgc|-1] (MS-XLS Ftab); missing ids fall back to F<id> */
  const FTAB = [];
  (function () {
    const v = (id, n) => { FTAB[id] = [n, -1]; };
    const f = (id, n, a) => { FTAB[id] = [n, a]; };
    v(0, 'COUNT'); v(1, 'IF'); f(2, 'ISNA', 1); f(3, 'ISERROR', 1); v(4, 'SUM'); v(5, 'AVERAGE'); v(6, 'MIN'); v(7, 'MAX');
    v(8, 'ROW'); v(9, 'COLUMN'); f(10, 'NA', 0); v(11, 'NPV'); v(12, 'STDEV'); f(13, 'DOLLAR', 2); v(14, 'FIXED');
    f(15, 'SIN', 1); f(16, 'COS', 1); f(17, 'TAN', 1); f(18, 'ATAN', 1); f(19, 'PI', 0); f(20, 'SQRT', 1); f(21, 'EXP', 1);
    f(22, 'LN', 1); f(23, 'LOG10', 1); f(24, 'ABS', 1); f(25, 'INT', 1); f(26, 'SIGN', 1); f(27, 'ROUND', 2); v(28, 'LOOKUP');
    v(29, 'INDEX'); f(30, 'REPT', 2); f(31, 'MID', 3); f(32, 'LEN', 1); f(33, 'VALUE', 1); f(34, 'TRUE', 0); f(35, 'FALSE', 0);
    v(36, 'AND'); v(37, 'OR'); f(38, 'NOT', 1); f(39, 'MOD', 2); v(40, 'DCOUNT'); v(41, 'DSUM'); v(42, 'DAVERAGE'); v(43, 'DMIN');
    v(44, 'DMAX'); v(45, 'DSTDEV'); v(46, 'VAR'); v(47, 'DVAR'); f(48, 'TEXT', 2); v(49, 'LINEST'); v(50, 'TREND'); v(51, 'LOGEST');
    v(52, 'GROWTH'); v(56, 'PV'); v(57, 'FV'); v(58, 'NPER'); v(59, 'PMT'); v(60, 'RATE'); f(61, 'MIRR', 3); v(62, 'IRR');
    f(63, 'RAND', 0); v(64, 'MATCH'); f(65, 'DATE', 3); f(66, 'TIME', 3); f(67, 'DAY', 1); f(68, 'MONTH', 1); f(69, 'YEAR', 1);
    v(70, 'WEEKDAY'); f(71, 'HOUR', 1); f(72, 'MINUTE', 1); f(73, 'SECOND', 1); f(74, 'NOW', 0); f(75, 'AREAS', 1); f(76, 'ROWS', 1);
    f(77, 'COLUMNS', 1); v(78, 'OFFSET'); v(82, 'SEARCH'); f(83, 'TRANSPOSE', 1); f(86, 'TYPE', 1); f(97, 'ATAN2', 2);
    f(98, 'ASIN', 1); f(99, 'ACOS', 1); v(100, 'CHOOSE'); v(101, 'HLOOKUP'); v(102, 'VLOOKUP'); f(105, 'ISREF', 1); v(109, 'LOG');
    f(111, 'CHAR', 1); f(112, 'LOWER', 1); f(113, 'UPPER', 1); f(114, 'PROPER', 1); v(115, 'LEFT'); v(116, 'RIGHT'); f(117, 'EXACT', 2);
    f(118, 'TRIM', 1); f(119, 'REPLACE', 4); v(120, 'SUBSTITUTE'); f(121, 'CODE', 1); v(124, 'FIND'); v(125, 'CELL'); f(126, 'ISERR', 1);
    f(127, 'ISTEXT', 1); f(128, 'ISNUMBER', 1); f(129, 'ISBLANK', 1); f(130, 'T', 1); f(131, 'N', 1); f(140, 'DATEVALUE', 1);
    f(141, 'TIMEVALUE', 1); f(142, 'SLN', 3); f(143, 'SYD', 4); v(144, 'DDB'); v(148, 'INDIRECT'); f(162, 'CLEAN', 1);
    f(163, 'MDETERM', 1); f(164, 'MINVERSE', 1); f(165, 'MMULT', 2); v(167, 'IPMT'); v(168, 'PPMT'); v(169, 'COUNTA');
    v(183, 'PRODUCT'); f(184, 'FACT', 1); v(189, 'DPRODUCT'); f(190, 'ISNONTEXT', 1); v(193, 'STDEVP'); v(194, 'VARP');
    v(195, 'DSTDEVP'); v(196, 'DVARP'); v(197, 'TRUNC'); f(198, 'ISLOGICAL', 1); v(199, 'DCOUNTA'); v(204, 'USDOLLAR');
    v(205, 'FINDB'); v(206, 'SEARCHB'); f(207, 'REPLACEB', 4); v(208, 'LEFTB'); v(209, 'RIGHTB'); f(210, 'MIDB', 3); f(211, 'LENB', 1);
    f(212, 'ROUNDUP', 2); f(213, 'ROUNDDOWN', 2); v(216, 'RANK'); v(219, 'ADDRESS'); v(220, 'DAYS360'); f(221, 'TODAY', 0);
    v(222, 'VDB'); v(227, 'MEDIAN'); v(228, 'SUMPRODUCT'); f(229, 'SINH', 1); f(230, 'COSH', 1); f(231, 'TANH', 1);
    f(232, 'ASINH', 1); f(233, 'ACOSH', 1); f(234, 'ATANH', 1); v(235, 'DGET'); f(244, 'INFO', 1); f(252, 'FREQUENCY', 2);
    f(261, 'ERROR.TYPE', 1); v(269, 'AVEDEV'); v(270, 'BETADIST'); f(271, 'GAMMALN', 1); v(272, 'BETAINV'); f(273, 'BINOMDIST', 4);
    f(274, 'CHIDIST', 2); f(275, 'CHIINV', 2); f(276, 'COMBIN', 2); f(277, 'CONFIDENCE', 3); f(278, 'CRITBINOM', 3); f(279, 'EVEN', 1);
    f(280, 'EXPONDIST', 3); f(281, 'FDIST', 3); f(282, 'FINV', 3); f(283, 'FISHER', 1); f(284, 'FISHERINV', 1); f(285, 'FLOOR', 2);
    f(286, 'GAMMADIST', 4); f(287, 'GAMMAINV', 3); f(288, 'CEILING', 2); f(289, 'HYPGEOMDIST', 4); f(290, 'LOGNORMDIST', 3);
    f(291, 'LOGINV', 3); f(292, 'NEGBINOMDIST', 3); f(293, 'NORMDIST', 4); f(294, 'NORMSDIST', 1); f(295, 'NORMINV', 3);
    f(296, 'NORMSINV', 1); f(297, 'STANDARDIZE', 3); f(298, 'ODD', 1); f(299, 'PERMUT', 2); f(300, 'POISSON', 3); f(301, 'TDIST', 3);
    f(302, 'WEIBULL', 4); f(303, 'SUMXMY2', 2); f(304, 'SUMX2MY2', 2); f(305, 'SUMX2PY2', 2); f(306, 'CHITEST', 2); f(307, 'CORREL', 2);
    f(308, 'COVAR', 2); f(309, 'FORECAST', 3); f(310, 'FTEST', 2); f(311, 'INTERCEPT', 2); f(312, 'PEARSON', 2); f(313, 'RSQ', 2);
    f(314, 'STEYX', 2); f(315, 'SLOPE', 2); f(316, 'TTEST', 4); v(317, 'PROB'); v(318, 'DEVSQ'); v(319, 'GEOMEAN'); v(320, 'HARMEAN');
    v(321, 'SUMSQ'); v(322, 'KURT'); v(323, 'SKEW'); v(324, 'ZTEST'); f(325, 'LARGE', 2); f(326, 'SMALL', 2); f(327, 'QUARTILE', 2);
    f(328, 'PERCENTILE', 2); v(329, 'PERCENTRANK'); v(330, 'MODE'); f(331, 'TRIMMEAN', 2); f(332, 'TINV', 2); v(336, 'CONCATENATE');
    f(337, 'POWER', 2); f(342, 'RADIANS', 1); f(343, 'DEGREES', 1); v(344, 'SUBTOTAL'); v(345, 'SUMIF'); f(346, 'COUNTIF', 2);
    f(347, 'COUNTBLANK', 1); v(354, 'ROMAN'); v(359, 'HYPERLINK'); v(361, 'AVERAGEA'); v(362, 'MAXA'); v(363, 'MINA');
    v(364, 'STDEVPA'); v(365, 'VARPA'); v(366, 'STDEVA'); v(367, 'VARA');
  })();

  function latin1(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return s;
  }
  function utf16(u8) { return new TextDecoder('utf-16le').decode(u8); }
  /* ------------------------------------------------------------ OLE */
  function workbookStream(bytes) {
    if (!L.officeCrypto || !L.officeCrypto.cfb) throw new Error('Compound file reader is not loaded.');
    let file;
    try { file = L.officeCrypto.cfb(bytes); }
    catch (e) { throw Object.assign(new Error('This file is not a binary Excel workbook (.xls).'), { code: 'format' }); }
    const stream = file.stream('Workbook') || file.stream('Book');
    if (!stream) throw Object.assign(new Error('This compound file does not contain an Excel workbook stream.'), { code: 'format' });
    return stream;
  }

  /* ------------------------------------------------------------ BIFF records */
  function records(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const out = [];
    let p = 0;
    while (p + 4 <= u8.length) {
      const id = dv.getUint16(p, true), len = dv.getUint16(p + 2, true);
      const start = p;
      p += 4;
      if (p + len > u8.length) break;
      out.push({ id, data: u8.subarray(p, p + len), start });
      p += len;
    }
    return out;
  }
  function view(u8) { return new DataView(u8.buffer, u8.byteOffset, u8.byteLength); }
  function u16(dv, o) { return dv.getUint16(o, true); }
  function u32(dv, o) { return dv.getUint32(o, true); }
  function i16(n) { return n >= 0x8000 ? n - 0x10000 : n; }
  function i14(n) { n &= 0x3FFF; return n >= 0x2000 ? n - 0x4000 : n; }

  /* XLUnicodeString inside one buffer; cchBytes 1 or 2 */
  function xlStr(dv, u8, o, cchBytes) {
    const cch = cchBytes === 1 ? u8[o] : u16(dv, o);
    o += cchBytes;
    if (o >= u8.length) return { text: '', o };
    const flags = u8[o++];
    const wide = flags & 1;
    const rich = flags & 8;
    const phonetic = flags & 4;
    let runs = 0, ext = 0;
    if (rich) { runs = u16(dv, o); o += 2; }
    if (phonetic) { ext = u32(dv, o); o += 4; }
    const nbytes = cch * (wide ? 2 : 1);
    const slice = u8.subarray(o, o + nbytes);
    const text = wide ? utf16(slice) : latin1(slice);
    o += nbytes + runs * 4 + ext;
    return { text, o };
  }

  /* SST + CONTINUE: encoding flag repeats at each CONTINUE that splits a string */
  function readSST(first, conts) {
    const parts = [first].concat(conts);
    let pi = 0, po = 0;
    const cur = () => parts[pi];
    const left = () => cur().length - po;
    function bump() { pi++; po = 0; return pi < parts.length; }
    function need() {
      if (left() > 0) return true;
      return bump();
    }
    function ru8() {
      if (!need()) throw new Error('truncated');
      return cur()[po++];
    }
    function ru16() { return ru8() | (ru8() << 8); }
    function ru32() { return ru16() | (ru16() << 16); }
    function skip(n) { while (n > 0) { if (!need()) return; const t = Math.min(n, left()); po += t; n -= t; } }
    function chars(cch, wide) {
      let s = '', leftChars = cch, w = wide;
      while (leftChars > 0) {
        /* CONTINUE that splits rgb starts with a new fHighByte. Do not bump via
         * need()/ru8() — that would treat the flag as the next character. */
        if (left() === 0 || (w && left() === 1)) {
          if (!bump()) break;
          w = !!(cur()[po++] & 1);
          continue;
        }
        const n = Math.min(leftChars, Math.floor(left() / (w ? 2 : 1)));
        if (n === 0) break;
        const bytes = n * (w ? 2 : 1);
        const sl = cur().subarray(po, po + bytes);
        s += w ? utf16(sl) : latin1(sl);
        po += bytes;
        leftChars -= n;
      }
      return s;
    }
    const unique = (ru32(), ru32());
    const sst = [];
    for (let i = 0; i < unique; i++) {
      try {
        const cch = ru16(), flags = ru8();
        const wide = flags & 1, rich = flags & 8, phonetic = flags & 4;
        let runs = 0, ext = 0;
        if (rich) runs = ru16();
        if (phonetic) ext = ru32();
        const text = chars(cch, wide);
        skip(runs * 4 + ext);
        sst.push(text);
      } catch (e) { break; }
    }
    return sst;
  }

  function rk(v) {
    const div100 = v & 1;
    let n;
    if (v & 2) n = (v | 0) >> 2;
    else {
      const buf = new ArrayBuffer(8);
      const d = new DataView(buf);
      d.setUint32(4, v & 0xFFFFFFFC, true);
      d.setUint32(0, 0, true);
      n = d.getFloat64(0, true);
    }
    return div100 ? n / 100 : n;
  }
  function ieee(dv, o) { return dv.getFloat64(o, true); }
  function formulaValue(dv) {
    if (u16(dv, 6) === 0xFFFF) {
      const k = dv.getUint8(0);
      if (k === 0) return { kind: 'str' };
      if (k === 1) return { kind: 'bool', v: !!dv.getUint8(2) };
      if (k === 2) return { kind: 'err', v: M.err(ERR_BY[dv.getUint8(2)] || '#N/A') };
      return { kind: 'blank', v: null };
    }
    return { kind: 'num', v: ieee(dv, 0) };
  }
  function icvColor(icv) {
    if (icv == null || icv === 64) return { auto: true };
    if (icv === 65) return { indexed: 65 };
    return { indexed: icv };
  }

  /* ------------------------------------------------------------ styles */
  function fontRec(data) {
    const dv = view(data);
    const f = { sz: u16(dv, 0) / 20 };
    const flags = u16(dv, 2);
    if (flags & 2) f.i = true;
    if (flags & 8) f.strike = true;
    const icv = u16(dv, 4);
    if (icv && icv !== 0x7FFF) f.color = icvColor(icv);
    if (u16(dv, 6) >= 700) f.b = true;
    const sss = u16(dv, 8);
    if (sss === 1) f.vert = 'superscript';
    else if (sss === 2) f.vert = 'subscript';
    const ul = data[10];
    if (ul === 1 || ul === 0x21) f.u = 'single';
    else if (ul === 2 || ul === 0x22) f.u = 'double';
    else if (ul) f.u = 'single';
    if (data[11]) f.family = data[11];
    if (data[12]) f.charset = data[12];
    const name = xlStr(dv, data, 14, 1).text;
    if (name) f.name = name;
    else f.name = 'Arial';
    return f;
  }
  function xfToStyle(data, fonts, formats) {
    if (data.length < 20) return M.defaultStyle();
    const dv = view(data);
    let ifnt = u16(dv, 0);
    if (ifnt >= 4) ifnt -= 1;
    const ifmt = u16(dv, 2);
    const flags = u16(dv, 4);
    const alc = data[6];
    const trot = data[7];
    const indent = data[8];
    const border1 = u32(dv, 10);
    const border2 = u32(dv, 14);
    const fillw = u16(dv, 18);
    const st = { font: Object.assign({}, fonts[ifnt] || fonts[0] || { name: 'Arial', sz: 10 }), fill: null, border: null, align: null, nf: formats[ifmt] || NF.BUILTIN[ifmt] || 'General', prot: null };
    const locked = !(flags & 1) ? false : undefined;
    const hidden = flags & 2 ? true : undefined;
    if (locked === false || hidden) st.prot = Object.assign({}, locked === false ? { locked: false } : {}, hidden ? { hidden: true } : {});
    const a = {};
    const h = HALIGN[alc & 7]; if (h) a.h = h;
    if (alc & 8) a.wrap = true;
    const v = VALIGN[(alc >> 4) & 7]; if (v && v !== 'bottom') a.v = v;
    if (trot) a.rot = trot;
    const ind = indent & 0x0F; if (ind) a.indent = ind;
    if (indent & 0x10) a.shrink = true;
    const ro = (indent >> 6) & 3; if (ro === 2) a.rtl = true;
    if (Object.keys(a).length) st.align = a;
    const b = {};
    const side = (style, icv, k) => { if (!style) return; const line = { style: BORDER[style] || 'thin' }; if (icv && icv !== 64) line.color = icvColor(icv); b[k] = line; };
    side(border1 & 0xF, (border1 >> 16) & 0x7F, 'l');
    side((border1 >> 4) & 0xF, (border1 >> 23) & 0x7F, 'r');
    side((border1 >> 8) & 0xF, border2 & 0x7F, 't');
    side((border1 >> 12) & 0xF, (border2 >> 7) & 0x7F, 'b');
    const diagStyle = (border2 >> 21) & 0xF;
    if (diagStyle) {
      const line = { style: BORDER[diagStyle] || 'thin' };
      const icv = (border2 >> 14) & 0x7F;
      if (icv && icv !== 64) line.color = icvColor(icv);
      b.d = line;
      const g = (border1 >> 30) & 3;
      if (g & 1) b.dd = true;
      if (g & 2) b.du = true;
    }
    if (Object.keys(b).length) st.border = b;
    const pat = (border2 >> 26) & 0x3F;
    const fg = fillw & 0x7F, bg = (fillw >> 7) & 0x7F;
    const pName = FILL[pat];
    if (pName) {
      st.fill = pName === 'solid' ? { pattern: 'solid', fg: icvColor(fg) } : { pattern: pName, fg: icvColor(fg), bg: icvColor(bg) };
    }
    return st;
  }

  /* ------------------------------------------------------------ formulas */
  function quoteName(n) { return F.quoteSheet(n); }
  function cellA1(r, c, ra, ca) { return (ca ? '$' : '') + F.colName(c) + (ra ? '$' : '') + (r + 1); }
  function areaA1(r1, c1, r2, c2, ra1, ca1, ra2, ca2) {
    if (r1 === 0 && r2 >= 65535) return (ca1 ? '$' : '') + F.colName(c1) + ':' + (ca2 ? '$' : '') + F.colName(c2);
    if (c1 === 0 && c2 >= 255 && r2 < 65535) return (ra1 ? '$' : '') + (r1 + 1) + ':' + (ra2 ? '$' : '') + (r2 + 1);
    return cellA1(r1, c1, ra1, ca1) + ':' + cellA1(r2, c2, ra2, ca2);
  }
  function sheetPre(ctx, ixti) {
    const xti = ctx.xti && ctx.xti[ixti];
    if (!xti) return '';
    const names = ctx.sheets || [];
    const a = names[xti.a], b = names[xti.b];
    if (!a) return '';
    if (xti.a === xti.b || !b) return quoteName(a) + '!';
    return quoteName(a + ':' + b) + '!';
  }
  function parseRef(dv, o, row, col, rel) {
    const rw = u16(dv, o), cg = u16(dv, o + 2);
    const c = cg & 0x3FFF, ca = !(cg & 0x4000), ra = !(cg & 0x8000);
    let r = rw, cc = c;
    if (rel) {
      if (!ra) r = row + i16(rw);
      if (!ca) cc = col + i14(c);
    }
    return { r: Math.max(0, r), c: Math.max(0, cc), ra, ca };
  }
  /* PtgArea / PtgAreaN: rwFirst, rwLast, colFirst, colLast (not two PtgRef cells) */
  function parseArea(dv, o, row, col, rel) {
    const rw1 = u16(dv, o), rw2 = u16(dv, o + 2);
    const cg1 = u16(dv, o + 4), cg2 = u16(dv, o + 6);
    const c1 = cg1 & 0x3FFF, c2 = cg2 & 0x3FFF;
    const ca1 = !(cg1 & 0x4000), ra1 = !(cg1 & 0x8000);
    const ca2 = !(cg2 & 0x4000), ra2 = !(cg2 & 0x8000);
    let r1 = rw1, r2 = rw2, cc1 = c1, cc2 = c2;
    if (rel) {
      if (!ra1) r1 = row + i16(rw1);
      if (!ra2) r2 = row + i16(rw2);
      if (!ca1) cc1 = col + i14(c1);
      if (!ca2) cc2 = col + i14(c2);
    }
    return { r1: Math.max(0, r1), r2: Math.max(0, r2), c1: Math.max(0, cc1), c2: Math.max(0, cc2), ra1, ca1, ra2, ca2 };
  }
  function decompile(u8, row, col, ctx) {
    const dv = view(u8);
    const stack = [];
    let p = 0;
    const push = (s) => stack.push(s);
    const pop = () => (stack.length ? stack.pop() : '');
    const bin = (op) => { const b = pop(), a = pop(); push(a + op + b); };
    const fnName = (id) => (FTAB[id] && FTAB[id][0]) || ('F' + id);
    const fnCall = (name, n) => {
      const args = [];
      for (let i = 0; i < n; i++) args.push(pop());
      args.reverse();
      push(name + '(' + args.join(',') + ')');
    };
    while (p < u8.length) {
      const ptg = u8[p++];
      if (ptg === 0x01) { /* ptgExp: shared / array — caller resolves */ return null; }
      if (ptg === 0x02) { p += 4; continue; }
      if (ptg === 0x03) { bin('+'); continue; }
      if (ptg === 0x04) { bin('-'); continue; }
      if (ptg === 0x05) { bin('*'); continue; }
      if (ptg === 0x06) { bin('/'); continue; }
      if (ptg === 0x07) { bin('^'); continue; }
      if (ptg === 0x08) { bin('&'); continue; }
      if (ptg === 0x09) { bin('<'); continue; }
      if (ptg === 0x0A) { bin('<='); continue; }
      if (ptg === 0x0B) { bin('='); continue; }
      if (ptg === 0x0C) { bin('>='); continue; }
      if (ptg === 0x0D) { bin('>'); continue; }
      if (ptg === 0x0E) { bin('<>'); continue; }
      if (ptg === 0x0F) { bin(' '); continue; }
      if (ptg === 0x10) { bin(','); continue; }
      if (ptg === 0x11) { bin(':'); continue; }
      if (ptg === 0x12) { push('+' + pop()); continue; }
      if (ptg === 0x13) { push('-' + pop()); continue; }
      if (ptg === 0x14) { push(pop() + '%'); continue; }
      if (ptg === 0x15) { push('(' + pop() + ')'); continue; }
      if (ptg === 0x16) { push(''); continue; }
      if (ptg === 0x17) {
        const sl = xlStr(dv, u8, p, 1);
        push('"' + sl.text.replace(/"/g, '""') + '"');
        p = sl.o;
        continue;
      }
      if (ptg === 0x19) {
        const flag = u8[p++], w = u16(dv, p); p += 2;
        if (flag & 0x04) { /* choose: extra offsets */ p += w * 2; }
        else if (flag & 0x10) fnCall('SUM', 1);
        continue;
      }
      if (ptg === 0x1C) { push(ERR_BY[u8[p++]] || '#N/A'); continue; }
      if (ptg === 0x1D) { push(u8[p++] ? 'TRUE' : 'FALSE'); continue; }
      if (ptg === 0x1E) { push(String(u16(dv, p))); p += 2; continue; }
      if (ptg === 0x1F) { const n = ieee(dv, p); p += 8; push(String(n)); continue; }
      const cls = ptg & 0x60, base = ptg & 0x1F;
      if (!cls && ptg >= 0x20) break;
      if (base === 0x01) { /* Func */ const id = u16(dv, p); p += 2; const t = FTAB[id]; fnCall(fnName(id), t && t[1] >= 0 ? t[1] : 1); continue; }
      if (base === 0x02) { /* FuncVar */ const n = u8[p] & 0x7F; p += 1; const id = u16(dv, p); p += 2;
        if (id === 255) {
          const args = [];
          for (let i = 0; i < n; i++) args.push(pop());
          args.reverse();
          const name = String(args.shift() || 'F255').replace(/^"|"$/g, '');
          push(name + '(' + args.join(',') + ')');
        } else fnCall(fnName(id), n);
        continue;
      }
      if (base === 0x03) { /* Name */ const ilbl = u16(dv, p); p += 4; push((ctx.names && ctx.names[ilbl - 1] && ctx.names[ilbl - 1].name) || ('NAME' + ilbl)); continue; }
      if (base === 0x04 || base === 0x0C) {
        const rel = base === 0x0C;
        const rf = parseRef(dv, p, row, col, rel); p += 4;
        push(cellA1(rf.r, rf.c, rf.ra, rf.ca));
        continue;
      }
      if (base === 0x05 || base === 0x0D) {
        const a = parseArea(dv, p, row, col, base === 0x0D); p += 8;
        push(areaA1(a.r1, a.c1, a.r2, a.c2, a.ra1, a.ca1, a.ra2, a.ca2));
        continue;
      }
      if (base === 0x06 || base === 0x07 || base === 0x08 || base === 0x09) { p += 6; continue; } /* mem* */
      if (base === 0x0A) { p += 4; push('#REF!'); continue; }
      if (base === 0x0B) { p += 8; push('#REF!'); continue; }
      if (base === 0x19) { /* NameX */ const ixti = u16(dv, p), ilbl = u16(dv, p + 2); p += 6; push((ctx.names && ctx.names[ilbl - 1] && ctx.names[ilbl - 1].name) || ('NAME' + ilbl)); void ixti; continue; }
      if (base === 0x1A || base === 0x1C) {
        const ixti = u16(dv, p); p += 2;
        const rf = parseRef(dv, p, row, col, false); p += 4;
        push((base === 0x1C ? '#REF!' : sheetPre(ctx, ixti) + cellA1(rf.r, rf.c, rf.ra, rf.ca)));
        continue;
      }
      if (base === 0x1B || base === 0x1D) {
        const ixti = u16(dv, p); p += 2;
        const a = parseArea(dv, p, row, col, false); p += 8;
        push(base === 0x1D ? '#REF!' : sheetPre(ctx, ixti) + areaA1(a.r1, a.c1, a.r2, a.c2, a.ra1, a.ca1, a.ra2, a.ca2));
        continue;
      }
      break;
    }
    return stack.length === 1 ? stack[0] : (stack.length ? stack[stack.length - 1] : null);
  }

  /* ------------------------------------------------------------ sheet */
  function putCell(sh, r, c, v, sIdx, extra) {
    const cell = sh.cell(r, c);
    if (v !== undefined) cell.v = v;
    if (sIdx) cell.s = sIdx;
    if (extra) Object.assign(cell, extra);
    if (cell.v == null && cell.f == null && !cell.s) {
      const row = sh.rows[r];
      if (row) delete row.cells[c];
    }
  }
  function lastString(recs, from) {
    for (let i = from; i < recs.length; i++) {
      if (recs[i].id === 0x0207) {
        const d = recs[i].data, dv = view(d);
        return xlStr(dv, d, 0, 2).text;
      }
      if (recs[i].id !== 0x003C) break;
    }
    return '';
  }
  function readSheet(recs, sh, ctx) {
    const xf = ctx.xf, sst = ctx.sst;
    const shared = new Map();
    let pendingExp = [];
    let lastFormula = null;
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i], d = rec.data, dv = view(d), id = rec.id;
      if (id === 0x0225 && d.length >= 4) { /* DEFAULTROWHEIGHT */ sh.defRowH = u16(dv, 2) / 20; continue; }
      if (id === 0x0055 && d.length >= 2) { sh.baseColW = u16(dv, 0); continue; }
      if (id === 0x007D && d.length >= 10) {
        const c1 = u16(dv, 0), c2 = u16(dv, 2), coldx = u16(dv, 4), ixfe = u16(dv, 6), gr = u16(dv, 8);
        for (let c = c1; c <= c2; c++) {
          const o = sh.colObj(c);
          o.w = coldx / 256;
          o.custom = true;
          if (gr & 1) o.hidden = true;
          if (ixfe) o.s = xf[ixfe] || undefined;
        }
        continue;
      }
      if (id === 0x0208 && d.length >= 16) {
        const r = u16(dv, 0), miy = u16(dv, 6), gr = u16(dv, 12), ixfe = u16(dv, 14);
        const customH = !!(gr & 0x80), hidden = !!(gr & 0x20), hasXf = !!(gr & 0x100) && ixfe;
        /* Excel writes ROW for the whole used band; skip default-height rows so we don't allocate 65k empties */
        if (!customH && !hidden) continue;
        const row = sh.rowObj(r);
        if (customH) { row.ht = miy / 20; row.customHeight = true; }
        if (hidden) row.hidden = true;
        if (hasXf) row.s = xf[ixfe] || undefined;
        continue;
      }
      if (id === 0x00E5) {
        const n = u16(dv, 0);
        for (let k = 0; k < n; k++) {
          const o = 2 + k * 8;
          sh.merges.push({ r1: u16(dv, o), r2: u16(dv, o + 2), c1: u16(dv, o + 4), c2: u16(dv, o + 6) });
        }
        continue;
      }
      if (id === 0x023E && d.length >= 10) {
        const gr = u16(dv, 0);
        sh.view.grid = !!(gr & 2);
        if (!(gr & 4)) sh.view.headings = false;
        if (gr & 16) sh.view.zeros = false;
        sh.view.top = { r: u16(dv, 2), c: u16(dv, 4) };
        continue;
      }
      if (id === 0x0041 && d.length >= 10) {
        const rwTop = u16(dv, 4), colLeft = u16(dv, 6);
        sh.view.freeze = { r: rwTop, c: colLeft, top: { r: rwTop, c: colLeft } };
        continue;
      }
      if (id === 0x00A0 && d.length >= 4) {
        const n = u16(dv, 0), den = u16(dv, 2) || 1;
        sh.view.zoom = Math.round((n / den) * 100) || 100;
        continue;
      }
      if (id === 0x001D && d.length >= 9) {
        const r = u16(dv, 1), c = u16(dv, 3), cref = u16(dv, 7);
        const ranges = [];
        for (let k = 0; k < cref; k++) {
          const o = 9 + k * 8;
          if (o + 8 > d.length) break;
          ranges.push({ r1: u16(dv, o), r2: u16(dv, o + 2), c1: u16(dv, o + 4), c2: u16(dv, o + 6) });
        }
        if (!ranges.length) ranges.push({ r1: r, c1: c, r2: r, c2: c });
        sh.view.sel = { r, c, ranges };
        continue;
      }
      if (id === 0x0201 && d.length >= 6) { putCell(sh, u16(dv, 0), u16(dv, 2), null, xf[u16(dv, 4)]); continue; }
      if (id === 0x0203 && d.length >= 14) { putCell(sh, u16(dv, 0), u16(dv, 2), ieee(dv, 6), xf[u16(dv, 4)]); continue; }
      if (id === 0x027E && d.length >= 10) { putCell(sh, u16(dv, 0), u16(dv, 2), rk(u32(dv, 6)), xf[u16(dv, 4)]); continue; }
      if (id === 0x00BD && d.length >= 6) {
        const r = u16(dv, 0), c0 = u16(dv, 2), last = u16(dv, d.length - 2);
        let o = 4, c = c0;
        while (c <= last && o + 6 <= d.length - 2) { putCell(sh, r, c, rk(u32(dv, o + 2)), xf[u16(dv, o)]); o += 6; c++; }
        continue;
      }
      if (id === 0x00BE && d.length >= 6) {
        const r = u16(dv, 0), c0 = u16(dv, 2), last = u16(dv, d.length - 2);
        let o = 4, c = c0;
        while (c <= last && o + 2 <= d.length - 2) { putCell(sh, r, c, null, xf[u16(dv, o)]); o += 2; c++; }
        continue;
      }
      if (id === 0x00FD && d.length >= 10) {
        const r = u16(dv, 0), c = u16(dv, 2), isst = u32(dv, 6);
        const v = sst[isst];
        putCell(sh, r, c, v == null ? '' : (typeof v === 'string' ? v : v.text || ''), xf[u16(dv, 4)]);
        continue;
      }
      if (id === 0x0204 && d.length >= 8) {
        const r = u16(dv, 0), c = u16(dv, 2);
        putCell(sh, r, c, xlStr(dv, d, 6, 2).text, xf[u16(dv, 4)]);
        continue;
      }
      if (id === 0x0205 && d.length >= 8) {
        const r = u16(dv, 0), c = u16(dv, 2), b = d[6], err = d[7];
        putCell(sh, r, c, err ? M.err(ERR_BY[b] || '#N/A') : !!b, xf[u16(dv, 4)]);
        continue;
      }
      if (id === 0x0006 && d.length >= 20) {
        const r = u16(dv, 0), c = u16(dv, 2), sIdx = xf[u16(dv, 4)];
        const res = formulaValue(new DataView(d.buffer, d.byteOffset + 6, 8));
        let v = res.v;
        if (res.kind === 'str') v = lastString(recs, i + 1);
        const cce = u16(dv, 20);
        const rgce = d.subarray(22, 22 + cce);
        const extra = {};
        let text = null;
        if (rgce.length && rgce[0] === 0x01) {
          const er = u16(view(rgce), 1), ec = u16(view(rgce), 3);
          extra._exp = er + ',' + ec;
          pendingExp.push({ r, c, er, ec });
        } else {
          try { text = decompile(rgce, r, c, ctx); } catch (e) { text = null; }
        }
        if (text) extra.f = text;
        lastFormula = { r, c };
        putCell(sh, r, c, v === undefined ? null : v, sIdx, extra);
        continue;
      }
      if ((id === 0x04BC || id === 0x00BC) && lastFormula && d.length >= 8) {
        const cce = u16(dv, 6);
        const rgce = d.subarray(8, 8 + cce);
        shared.set(lastFormula.r + ',' + lastFormula.c, rgce);
        continue;
      }
      if (id === 0x0221 && lastFormula && d.length >= 12) {
        const r1 = u16(dv, 0), r2 = u16(dv, 2), c1 = d[4], c2 = d[5];
        const cce = u16(dv, 12);
        const rgce = d.subarray(14, 14 + cce);
        shared.set(lastFormula.r + ',' + lastFormula.c, rgce);
        const cell = sh.get(lastFormula.r, lastFormula.c);
        if (cell) cell.af = { r1, c1, r2, c2 };
        continue;
      }
    }
    for (const p of pendingExp) {
      const rgce = shared.get(p.er + ',' + p.ec) || shared.get(p.r + ',' + p.c);
      if (!rgce) continue;
      let text = null;
      try { text = decompile(rgce, p.r, p.c, ctx); } catch (e) { text = null; }
      if (text) {
        const cell = sh.get(p.r, p.c);
        if (cell) { cell.f = text; delete cell._exp; }
      }
    }
  }

  function sliceSheet(all, start) {
    const out = [];
    for (let i = 0; i < all.length; i++) {
      if (all[i].start < start) continue;
      out.push(all[i]);
      if (all[i].id === 0x000A && out.length > 1) break;
    }
    return out;
  }

  /* ------------------------------------------------------------ workbook */
  X.read = async function (input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const stream = workbookStream(bytes);
    const all = records(stream);
    const fonts = [], formats = Object.assign({}, NF.BUILTIN), xfs = [];
    const bounds = [];
    const names = [];
    const supbooks = [];
    let xti = [];
    let date1904 = false, active = 0, codepage = 1252;
    let sst = [];
    let bof = null;
    for (let i = 0; i < all.length; i++) {
      const rec = all[i], d = rec.data, dv = view(d), id = rec.id;
      if (id === 0x0809) { bof = { vers: u16(dv, 0), dt: u16(dv, 2) }; continue; }
      if (id === 0x000A) break; /* globals EOF */
      if (id === 0x002F) throw Object.assign(new Error('This .xls workbook is password-protected. Ledger can open unprotected Excel 97–2003 files; remove the password in Excel or save the file as .xlsx.'), { code: 'unsupported' });
      if (id === 0x0042 && d.length >= 2) { codepage = u16(dv, 0); void codepage; continue; }
      if (id === 0x0022 && d.length >= 2) { date1904 = !!u16(dv, 0); continue; }
      if (id === 0x003D && d.length >= 12) { active = u16(dv, 10); continue; }
      if (id === 0x0031) { fonts.push(fontRec(d)); continue; }
      if (id === 0x041E && d.length >= 4) {
        const ifmt = u16(dv, 0);
        formats[ifmt] = xlStr(dv, d, 2, 2).text || formats[ifmt];
        continue;
      }
      if (id === 0x00E0) { xfs.push(d); continue; }
      if (id === 0x0092 && d.length >= 2) {
        const n = u16(dv, 0), pal = M.INDEXED.slice();
        for (let k = 0; k < n && 2 + k * 4 + 3 <= d.length; k++) {
          pal[8 + k] = '#' + [d[2 + k * 4], d[3 + k * 4], d[4 + k * 4]].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
        }
        /* stored on wb after construction */
        bounds._palette = pal;
        continue;
      }
      if (id === 0x0085 && d.length >= 8) {
        const pos = u32(dv, 0), hidden = d[4], kind = d[5];
        const name = xlStr(dv, d, 6, 1).text || ('Sheet' + (bounds.length + 1));
        bounds.push({ pos, hidden, kind, name });
        continue;
      }
      if (id === 0x00FC) {
        const conts = [];
        for (let j = i + 1; j < all.length && all[j].id === 0x003C; j++) conts.push(all[j].data);
        sst = readSST(d, conts);
        continue;
      }
      if (id === 0x01AE && d.length >= 4) {
        const ctab = u16(dv, 0), cch = u16(dv, 2);
        supbooks.push({ internal: cch === 0x0401, ctab });
        continue;
      }
      if (id === 0x0017 && d.length >= 2) {
        const n = u16(dv, 0);
        xti = [];
        for (let k = 0; k < n && 2 + k * 6 + 6 <= d.length; k++) {
          xti.push({ sup: u16(dv, 2 + k * 6), a: u16(dv, 4 + k * 6), b: u16(dv, 6 + k * 6) });
        }
        continue;
      }
      if (id === 0x0018 && d.length >= 14) {
        const flags = u16(dv, 0), cch = d[3], cce = u16(dv, 4), itab = u16(dv, 8);
        const builtin = !!(flags & 0x20);
        let o = 14;
        const wide = d[o] & 1; o += 1;
        let name;
        if (builtin) {
          const bid = wide ? u16(dv, o) : d[o];
          name = '_xlnm.' + (BUILTIN_NAME[bid] || ('Builtin' + bid));
          o += wide ? 2 : 1;
        } else {
          const nbytes = cch * (wide ? 2 : 1);
          name = wide ? utf16(d.subarray(o, o + nbytes)) : latin1(d.subarray(o, o + nbytes));
          o += nbytes;
        }
        names.push({ name, flags, itab, hidden: !!(flags & 2), rgce: d.subarray(o, o + cce) });
        continue;
      }
    }

    if (!bof) throw Object.assign(new Error('This file does not contain a BIFF workbook.'), { code: 'format' });
    const wb = new M.Workbook({ font: fonts[0] || { name: 'Arial', sz: 10 } });
    wb.date1904 = date1904;
    if (bounds._palette) wb.palette = bounds._palette;
    const xfMap = [0];
    for (let i = 0; i < xfs.length; i++) {
      const flags = xfs[i].length >= 6 ? u16(view(xfs[i]), 4) : 0;
      const isStyle = !!(flags & 4);
      const st = xfToStyle(xfs[i], fonts, formats);
      xfMap[i] = isStyle ? wb.styles.add(st) : wb.styles.add(st);
    }
    const sheetNames = bounds.map((b) => b.name);
    const ctx = { xf: xfMap, sst, sheets: sheetNames, names: names.map((n) => ({ name: n.name })), xti: xti.map((x) => ({ a: x.a, b: x.b })) };

    for (const b of bounds) {
      const kind = b.kind === 2 ? 'chartsheet' : b.kind === 1 ? 'macrosheet' : 'worksheet';
      const sh = wb.addSheet(b.name, null, kind);
      if (b.hidden === 1) sh.state = 'hidden';
      else if (b.hidden === 2) sh.state = 'veryHidden';
      if (kind === 'worksheet') readSheet(sliceSheet(all, b.pos), sh, ctx);
    }
    if (!wb.sheets.length) wb.addSheet('Sheet1');
    wb.active = Math.max(0, Math.min(active, wb.sheets.length - 1));
    if (wb.sheets[wb.active].state !== 'visible') {
      const vis = wb.sheets.findIndex((s) => s.state === 'visible');
      if (vis >= 0) wb.active = vis;
    }
    for (const n of names) {
      let ref = null;
      try { ref = decompile(n.rgce, 0, 0, ctx); } catch (e) { ref = null; }
      if (!ref) continue;
      const o = { name: n.name, ref, scope: n.itab ? n.itab - 1 : null };
      if (n.hidden) o.hidden = true;
      wb.names.push(o);
    }
    wb.ooxmlFormat = 'xlsx';
    return wb;
  };
})(typeof window !== 'undefined' ? window : globalThis);
