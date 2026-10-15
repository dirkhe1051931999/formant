(() => {
  "use strict";

  const INDENT = "  ";
  const MAX_INPUT = 2000000;
  const BINARY = new Set(["+", "-", "*", "/", "%", "=", "<", ">", "&", "|", "^", "?", ":", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "==", "!=", "===", "!==", "<=", ">=", "&&", "||", "??", "<<", ">>", ">>>", "=>"]);
  const TIGHT = new Set([".", "?.", "++", "--", "...", "!"]);
  const SPACE_KEYWORD = /^(?:if|for|while|switch|catch|with|function|async|await|return|throw|new|typeof|delete|void|yield|case|else|do|class|const|let|var|in|of|from|import|export|default)$/;

  function formatCss(input) {
    const src = String(input || "").replace(/^\uFEFF/, "");
    if (src.length > MAX_INPUT) return src;
    let i = 0;
    const n = src.length;
    let depth = 0;
    let out = "";

    const peek = (k = 0) => src[i + k] || "";
    const skipSpace = () => {
      while (i < n && /\s/.test(src[i])) i += 1;
    };
    const nl = () => {
      out += `\n${INDENT.repeat(Math.max(0, depth))}`;
    };

    while (i < n) {
      skipSpace();
      if (i >= n) break;
      const c = src[i];

      if (c === "/" && peek(1) === "*") {
        const start = i;
        i += 2;
        while (i < n && !(src[i] === "*" && peek(1) === "/")) i += 1;
        i = Math.min(n, i + 2);
        if (out && !out.endsWith("\n")) nl();
        out += src.slice(start, i);
        nl();
        continue;
      }

      if (c === '"' || c === "'") {
        out += readQuoted(src, i);
        i = skipQuoted(src, i);
        continue;
      }

      if (c === "{") {
        out += " {";
        depth += 1;
        i += 1;
        skipSpace();
        if (peek() !== "}") nl();
        continue;
      }

      if (c === "}") {
        depth = Math.max(0, depth - 1);
        if (!out.endsWith("\n")) out += "\n";
        out += `${INDENT.repeat(depth)}}`;
        i += 1;
        skipSpace();
        if (peek() && peek() !== "}") nl();
        continue;
      }

      if (c === ";") {
        out += ";";
        i += 1;
        skipSpace();
        if (peek() && peek() !== "}") nl();
        continue;
      }

      if (c === ",") {
        out += ", ";
        i += 1;
        continue;
      }

      if (c === ":") {
        out += ": ";
        i += 1;
        continue;
      }

      out += c;
      i += 1;
    }

    return `${out.trim()}\n`;
  }

  function formatJs(input) {
    const src = String(input || "").replace(/^\uFEFF/, "");
    if (src.length > MAX_INPUT) return src;
    let i = 0;
    const n = src.length;
    /** @type {string[]} */
    const stack = [];
    let out = "";
    /** @type {"start" | "word" | "num" | "str" | "punct" | "open" | "close" | "semi" | "kw"} */
    let last = "start";
    let lastTok = "";

    const peek = (k = 0) => src[i + k] || "";
    const skipSpace = () => {
      while (i < n && /[\s\u00a0]/.test(src[i])) i += 1;
    };
    const depth = () => stack.filter((ch) => ch === "{" || ch === "[").length;
    const pad = () => INDENT.repeat(Math.max(0, depth()));
    const nl = () => {
      if (!out.endsWith("\n")) out += "\n";
      out += pad();
    };
    const spaceWord = () => {
      if (last === "word" || last === "kw" || last === "num" || last === "str" || last === "close") {
        out += " ";
      }
    };

    while (i < n) {
      skipSpace();
      if (i >= n) break;
      const c = src[i];

      if (c === "/" && peek(1) === "/") {
        if (last !== "start" && last !== "semi" && !out.endsWith("\n")) out += " ";
        const start = i;
        i += 2;
        while (i < n && src[i] !== "\n" && src[i] !== "\r") i += 1;
        out += src.slice(start, i);
        last = "semi";
        nl();
        continue;
      }

      if (c === "/" && peek(1) === "*") {
        const start = i;
        i += 2;
        while (i < n && !(src[i] === "*" && peek(1) === "/")) i += 1;
        i = Math.min(n, i + 2);
        if (out && !out.endsWith("\n")) nl();
        out += src.slice(start, i);
        last = "semi";
        nl();
        continue;
      }

      if (c === "'" || c === '"') {
        spaceWord();
        out += readQuoted(src, i);
        i = skipQuoted(src, i);
        last = "str";
        lastTok = c;
        continue;
      }

      if (c === "`") {
        spaceWord();
        const read = readTemplate(src, i);
        out += read.text;
        i = read.end;
        last = "str";
        lastTok = "`";
        continue;
      }

      if (c === "/" && canBeRegex(last, lastTok)) {
        spaceWord();
        out += readRegex(src, i);
        i = skipRegex(src, i);
        last = "str";
        lastTok = "/";
        continue;
      }

      const punct = readPunct(src, i);
      if (punct) {
        i += punct.length;
        writePunct(punct);
        continue;
      }

      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(peek(1)))) {
        spaceWord();
        const start = i;
        if (src.startsWith("0x", i) || src.startsWith("0X", i) || src.startsWith("0b", i) || src.startsWith("0o", i)) {
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
        out += src.slice(start, i);
        last = "num";
        lastTok = src.slice(start, i);
        continue;
      }

      if (/[A-Za-z_$]/.test(c)) {
        const start = i;
        i += 1;
        while (i < n && /[\w$]/.test(src[i])) i += 1;
        const word = src.slice(start, i);
        if (last === "kw" && SPACE_KEYWORD.test(lastTok)) out += " ";
        else spaceWord();
        out += word;
        last = SPACE_KEYWORD.test(word) ? "kw" : "word";
        lastTok = word;
        continue;
      }

      out += c;
      i += 1;
      last = "punct";
      lastTok = c;
    }

    function writePunct(punct) {
      if (punct === "{" || punct === "[") {
        if (punct === "{" && (last === "word" || last === "kw" || last === "close" || last === "str")) out += " ";
        out += punct;
        stack.push(punct);
        last = "open";
        lastTok = punct;
        skipSpace();
        const closer = punct === "{" ? "}" : "]";
        if (peek() !== closer) nl();
        return;
      }

      if (punct === "}" || punct === "]") {
        if (stack.length) stack.pop();
        if (!out.endsWith("\n")) out += "\n";
        out += pad() + punct;
        last = "close";
        lastTok = punct;
        skipSpace();
        if (peek() === "," || peek() === ";" || peek() === ")" || peek() === "]") return;
        if (peek() === "}") return;
        if (peek()) nl();
        return;
      }

      if (punct === "(") {
        if (last === "kw" && /^(?:if|for|while|switch|catch|with|function)$/.test(lastTok)) out += " ";
        out += "(";
        stack.push("(");
        last = "open";
        lastTok = "(";
        return;
      }

      if (punct === ")") {
        if (stack[stack.length - 1] === "(") stack.pop();
        out += ")";
        last = "close";
        lastTok = ")";
        return;
      }

      if (punct === ";") {
        out += ";";
        last = "semi";
        lastTok = ";";
        skipSpace();
        if (peek() && peek() !== "}") nl();
        return;
      }

      if (punct === ",") {
        out += ",";
        last = "punct";
        lastTok = ",";
        skipSpace();
        if (stack[stack.length - 1] === "(") {
          out += " ";
          return;
        }
        nl();
        return;
      }

      if (TIGHT.has(punct) || punct === "~") {
        out += punct;
        last = "punct";
        lastTok = punct;
        return;
      }

      if (BINARY.has(punct)) {
        if (punct === ":" && stack[stack.length - 1] === "{") {
          out += ": ";
        } else if (punct === "?" || punct === ":") {
          out += ` ${punct} `;
        } else {
          out += ` ${punct} `;
        }
        last = "punct";
        lastTok = punct;
        return;
      }

      out += punct;
      last = "punct";
      lastTok = punct;
    }

    return `${out.trim()}\n`;
  }

  function canBeRegex(last, lastTok) {
    if (last === "word" || last === "num" || last === "str" || last === "close") return false;
    if (lastTok === "++" || lastTok === "--") return false;
    return true;
  }

  function readPunct(src, start) {
    const three = src.slice(start, start + 3);
    if (["===", "!==", ">>>", "..."].includes(three)) return three;
    const two = src.slice(start, start + 2);
    if (
      [
        "=>",
        "==",
        "!=",
        "<=",
        ">=",
        "&&",
        "||",
        "??",
        "?.",
        "++",
        "--",
        "+=",
        "-=",
        "*=",
        "/=",
        "%=",
        "&=",
        "|=",
        "^=",
        "<<",
        ">>",
      ].includes(two)
    ) {
      return two;
    }
    const one = src[start];
    if ("{}[]().,;:+-*/%=<>!&|^~?:".includes(one)) return one;
    return "";
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

  function readQuoted(src, start) {
    return src.slice(start, skipQuoted(src, start));
  }

  function readTemplate(src, start) {
    let i = start + 1;
    while (i < src.length) {
      if (src[i] === "\\") {
        i += 2;
        continue;
      }
      if (src[i] === "`") return { text: src.slice(start, i + 1), end: i + 1 };
      if (src[i] === "$" && src[i + 1] === "{") {
        i += 2;
        let depth = 1;
        while (i < src.length && depth > 0) {
          if (src[i] === "'" || src[i] === '"') i = skipQuoted(src, i);
          else if (src[i] === "`") {
            const inner = readTemplate(src, i);
            i = inner.end;
          } else if (src[i] === "{") {
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
    return { text: src.slice(start), end: src.length };
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
      if (c === "[" ) inClass = true;
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

  function readRegex(src, start) {
    return src.slice(start, skipRegex(src, start));
  }

  globalThis.FormantCodeFormat = { formatJs, formatCss, MAX_INPUT };
})();
