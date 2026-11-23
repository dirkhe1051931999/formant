(() => {
  const body = document.body;
  if (!body || document.documentElement.dataset.oolafJsonPrettified === "true") {
    return;
  }

  const rawText = readPageText();
  if (!rawText) {
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
    document.documentElement.dataset.oolafJsonPrettified = "true";
    document.title = buildTitle(document.title, "JSON");
    window.OolafJsonViewer.render(body, parsed, rawText);
    return;
  } catch {
    parsed = null;
  }

  const kind = detectCodeKind(rawText);
  if (!kind || !window.FormantCodeFormat || !window.FormantCodeViewer) {
    return;
  }

  const prettyText =
    kind === "css" ? window.FormantCodeFormat.formatCss(rawText) : window.FormantCodeFormat.formatJs(rawText);
  document.documentElement.dataset.oolafJsonPrettified = "true";
  document.title = buildTitle(document.title, kind === "css" ? "CSS" : "JS");
  window.FormantCodeViewer.render(body, { kind, sourceText: rawText, prettyText });

  function readPageText() {
    const visibleText = body.innerText ? body.innerText.trim() : "";
    if (!visibleText) {
      return "";
    }

    const onlyPlainText =
      body.children.length === 1 && ["PRE", "TEXTAREA"].includes(body.children[0].tagName);

    const looksJson =
      visibleText.startsWith("{") ||
      visibleText.startsWith("[") ||
      visibleText === "null" ||
      visibleText === "true" ||
      visibleText === "false" ||
      /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(visibleText);

    if (!onlyPlainText && !looksJson) {
      return "";
    }

    return visibleText;
  }

  /**
   * @param {string} text
   * @returns {"js" | "css" | ""}
   */
  function detectCodeKind(text) {
    const path = location.pathname.toLowerCase();
    if (/\.css$/.test(path)) return "css";
    if (/\.(js|mjs|cjs)$/.test(path)) return "js";
    if (
      /\.(?:txt|md|markdown|csv|tsv|log|ini|conf|cfg|yml|yaml|toml|rst|nfo|srt|vtt|m3u8?|ics|lst)$/.test(
        path,
      )
    ) {
      return "";
    }

    const onlyPlainText =
      body.children.length === 1 && ["PRE", "TEXTAREA"].includes(body.children[0].tagName);
    if (!onlyPlainText) return "";

    const head = text.slice(0, 4000);
    if (/^\s*</.test(head) || looksLikeFilterList(head)) return "";
    if (/\{[^}"']{0,80}:[^}]{0,120};/.test(head) && !/\b(function|=>|var |let |const )/.test(head)) {
      return "css";
    }
    if (
      /\b(?:function|=>|var |let |const |class |import |export )\b/.test(head) ||
      /^\s*(?:!function\b|!\(|\()/.test(head) ||
      /\.min\.js/i.test(location.href)
    ) {
      return "js";
    }
    return "";
  }

  /**
   * Adblock / uBlock lists often start with `! Title:` or `[Adblock Plus 2.0]`.
   * A leading `!` used to match minified `!function`, which pulled these into JS pretty.
   * @param {string} head
   * @returns {boolean}
   */
  function looksLikeFilterList(head) {
    const start = String(head || "").trimStart();
    if (/^\[Adblock(?:\s+Plus)?[^\]]*\]/i.test(start)) return true;
    return /^!\s*(?:Title|Expires|License|Homepage|Redirect|Version|Last modified|Diff-Path|Checksum)\s*:/i.test(
      start,
    );
  }

  /**
   * @param {string} currentTitle
   * @param {string} suffix
   */
  function buildTitle(currentTitle, suffix) {
    if (!currentTitle || currentTitle === location.href) {
      return suffix;
    }
    return `${currentTitle} · ${suffix}`;
  }
})();
