(() => {
  "use strict";

  const JS_KW = new Set(
    "break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null return super switch this throw true try typeof var void while with yield async await of static get set undefined NaN Infinity from as".split(
      " ",
    ),
  );

  /**
   * @param {"js" | "css"} kind
   * @param {string} text
   * @returns {Array<{ type: string, text: string }>}
   */
  function tokenize(kind, text) {
    return kind === "css" ? tokenizeCss(String(text || "")) : tokenizeJs(String(text || ""));
  }

  /**
   * @param {HTMLElement} root
   * @param {Array<{ type: string, text: string }>} tokens
   * @param {string} query
   * @param {HTMLElement[]} matches
   */
  function paint(root, tokens, query, matches) {
    root.textContent = "";
    const frag = document.createDocumentFragment();
    for (const token of tokens) {
      const span = document.createElement("span");
      span.className = classFor(token.type);
      appendMaybeSearch(span, token.text, query, matches);
      frag.appendChild(span);
    }
    root.appendChild(frag);
  }

  function classFor(type) {
    if (type === "str") return "oolaf-json-string";
    if (type === "num") return "oolaf-json-number";
    if (type === "kw") return "oolaf-code-kw";
    if (type === "comment") return "oolaf-code-comment";
    if (type === "fn") return "oolaf-code-fn";
    if (type === "prop") return "oolaf-json-key";
    if (type === "sel") return "oolaf-code-sel";
    if (type === "punct") return "oolaf-code-punct";
    return "oolaf-code-ident";
  }

  function appendMaybeSearch(parent, text, query, matches) {
    if (!query) {
      parent.textContent = text;
      return;
    }
    const lower = text.toLowerCase();
    const needle = query.toLowerCase();
    let offset = 0;
    let index = lower.indexOf(needle, offset);
    if (index === -1) {
      parent.textContent = text;
      return;
    }
    while (index !== -1) {
      if (index > offset) parent.appendChild(document.createTextNode(text.slice(offset, index)));
      const mark = document.createElement("mark");
      mark.className = "oolaf-json-keyword-hit oolaf-code-hit";
      mark.textContent = text.slice(index, index + query.length);
      parent.appendChild(mark);
      matches.push(mark);
      offset = index + needle.length;
      index = lower.indexOf(needle, offset);
    }
    if (offset < text.length) parent.appendChild(document.createTextNode(text.slice(offset)));
  }

  function tokenizeJs(src) {
    /** @type {Array<{ type: string, text: string }>} */
    const tokens = [];
    let i = 0;
    const n = src.length;
    let lastType = "start";
    let lastText = "";

    while (i < n) {
      const c = src[i];
      if (/\s/.test(c)) {
        let j = i + 1;
        while (j < n && /\s/.test(src[j])) j += 1;
        tokens.push({ type: "space", text: src.slice(i, j) });
        i = j;
        continue;
      }
      if (c === "/" && src[i + 1] === "/") {
        let j = i + 2;
        while (j < n && src[j] !== "\n") j += 1;
        tokens.push({ type: "comment", text: src.slice(i, j) });
        lastType = "comment";
        i = j;
        continue;
      }
      if (c === "/" && src[i + 1] === "*") {
        let j = i + 2;
        while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j += 1;
        j = Math.min(n, j + 2);
        tokens.push({ type: "comment", text: src.slice(i, j) });
        lastType = "comment";
        i = j;
        continue;
      }
      if (c === "'" || c === '"') {
        const end = skipQuoted(src, i);
        tokens.push({ type: "str", text: src.slice(i, end) });
        lastType = "str";
        lastText = c;
        i = end;
        continue;
      }
      if (c === "`") {
        const end = skipTemplate(src, i);
        tokens.push({ type: "str", text: src.slice(i, end) });
        lastType = "str";
        i = end;
        continue;
      }
      if (c === "/" && canBeRegex(lastType, lastText)) {
        const end = skipRegex(src, i);
        tokens.push({ type: "str", text: src.slice(i, end) });
        lastType = "str";
        i = end;
        continue;
      }
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
        const start = i;
        if (/^0[xXbBoO]/.test(src.slice(i, i + 2))) {
          i += 2;
          while (i < n && /[0-9A-Fa-f_]/.test(src[i])) i += 1;
        } else {
          while (i < n && /[0-9._]/.test(src[i])) i += 1;
          if (src[i] === "e" || src[i] === "E") {
            i += 1;
            if (src[i] === "+" || src[i] === "-") i += 1;
            while (i < n && /[0-9_]/.test(src[i])) i += 1;
          }
        }
        tokens.push({ type: "num", text: src.slice(start, i) });
        lastType = "num";
        lastText = src.slice(start, i);
        continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        const start = i;
        i += 1;
        while (i < n && /[\w$]/.test(src[i])) i += 1;
        const word = src.slice(start, i);
        let k = i;
        while (k < n && /\s/.test(src[k])) k += 1;
        const isFn = src[k] === "(";
        const type = JS_KW.has(word) ? "kw" : isFn ? "fn" : "ident";
        tokens.push({ type, text: word });
        lastType = type === "kw" ? "kw" : "ident";
        lastText = word;
        continue;
      }
      tokens.push({ type: "punct", text: c });
      lastType = "punct";
      lastText = c;
      i += 1;
    }
    return tokens;
  }

  function tokenizeCss(src) {
    /** @type {Array<{ type: string, text: string }>} */
    const tokens = [];
    let i = 0;
    const n = src.length;
    /** @type {"sel" | "prop" | "val"} */
    let mode = "sel";

    while (i < n) {
      const c = src[i];
      if (/\s/.test(c)) {
        let j = i + 1;
        while (j < n && /\s/.test(src[j])) j += 1;
        tokens.push({ type: "space", text: src.slice(i, j) });
        i = j;
        continue;
      }
      if (c === "/" && src[i + 1] === "*") {
        let j = i + 2;
        while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j += 1;
        j = Math.min(n, j + 2);
        tokens.push({ type: "comment", text: src.slice(i, j) });
        i = j;
        continue;
      }
      if (c === '"' || c === "'") {
        const end = skipQuoted(src, i);
        tokens.push({ type: "str", text: src.slice(i, end) });
        i = end;
        continue;
      }
      if (c === "{") {
        tokens.push({ type: "punct", text: c });
        mode = "prop";
        i += 1;
        continue;
      }
      if (c === "}") {
        tokens.push({ type: "punct", text: c });
        mode = "sel";
        i += 1;
        continue;
      }
      if (c === ":") {
        tokens.push({ type: "punct", text: c });
        if (mode === "prop") mode = "val";
        i += 1;
        continue;
      }
      if (c === ";") {
        tokens.push({ type: "punct", text: c });
        mode = "prop";
        i += 1;
        continue;
      }
      if (c === "#" && /[0-9A-Fa-f]/.test(src[i + 1] || "")) {
        let j = i + 1;
        while (j < n && /[0-9A-Fa-f]/.test(src[j])) j += 1;
        tokens.push({ type: "num", text: src.slice(i, j) });
        i = j;
        continue;
      }
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
        const start = i;
        while (i < n && /[0-9.%]/.test(src[i])) i += 1;
        while (i < n && /[A-Za-z%]/.test(src[i])) i += 1;
        tokens.push({ type: "num", text: src.slice(start, i) });
        continue;
      }
      if (/[A-Za-z_@*-]/.test(c)) {
        const start = i;
        i += 1;
        while (i < n && /[\w-@%]/.test(src[i])) i += 1;
        const word = src.slice(start, i);
        let k = i;
        while (k < n && /\s/.test(src[k])) k += 1;
        let type = "ident";
        if (word.startsWith("@") || word === "!important") type = "kw";
        else if (src[k] === "(") type = "fn";
        else if (mode === "prop") type = "prop";
        else if (mode === "sel") type = "sel";
        tokens.push({ type, text: word });
        continue;
      }
      tokens.push({ type: "punct", text: c });
      i += 1;
    }
    return tokens;
  }

  function canBeRegex(lastType, lastText) {
    if (lastType === "ident" || lastType === "num" || lastType === "str" || lastType === "fn") return false;
    if (lastText === ")" || lastText === "]" || lastText === "++" || lastText === "--") return false;
    return true;
  }

  function skipQuoted(src, start) {
    const q = src[start];
    let i = start + 1;
    while (i < src.length) {
      if (src[i] === "\\") {
        i += 2;
        continue;
      }
      if (src[i] === q) return i + 1;
      i += 1;
    }
    return src.length;
  }

  function skipTemplate(src, start) {
    let i = start + 1;
    while (i < src.length) {
      if (src[i] === "\\") {
        i += 2;
        continue;
      }
      if (src[i] === "`") return i + 1;
      if (src[i] === "$" && src[i + 1] === "{") {
        i += 2;
        let depth = 1;
        while (i < src.length && depth > 0) {
          if (src[i] === "'" || src[i] === '"') i = skipQuoted(src, i);
          else if (src[i] === "`") i = skipTemplate(src, i);
          else if (src[i] === "{") {
            depth += 1;
            i += 1;
          } else if (src[i] === "}") {
            depth -= 1;
            i += 1;
          } else i += 1;
        }
        continue;
      }
      i += 1;
    }
    return src.length;
  }

  function skipRegex(src, start) {
    let i = start + 1;
    let inClass = false;
    while (i < src.length) {
      const c = src[i];
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === "[") inClass = true;
      else if (c === "]" && inClass) inClass = false;
      else if (c === "/" && !inClass) {
        i += 1;
        while (i < src.length && /[A-Za-z]/.test(src[i])) i += 1;
        return i;
      } else if ((c === "\n" || c === "\r") && !inClass) return i;
      i += 1;
    }
    return src.length;
  }

  globalThis.FormantCodeHighlight = { tokenize, paint };
})();
