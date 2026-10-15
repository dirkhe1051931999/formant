(() => {
  const PANEL_WIDTH_KEY = "oolaf-json-panel-sidebar-width";
  const MIN_SIDEBAR_WIDTH = 180;
  const MIN_VIEWER_WIDTH = 260;
  const panel = document.querySelector(".oolaf-panel");
  const sidebar = document.querySelector(".oolaf-panel-sidebar");
  const resizer = document.getElementById("panel-resizer");
  const requestList = document.getElementById("request-list");
  const requestSearch = document.getElementById("request-search");
  const viewerRoot = document.getElementById("viewer-root");
  const detailRoot = document.getElementById("detail-root");
  const emptyState = document.getElementById("empty-state");
  const clearButton = document.getElementById("clear-list");
  const entries = [];
  let activeId = null;
  let activeView = "headers";
  let requestQuery = "";

  restoreSidebarWidth();

  resizer.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    startResize(event);
  });

  resizer.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const currentWidth = getSidebarWidth();
    const delta = event.key === "ArrowLeft" ? -24 : 24;
    setSidebarWidth(currentWidth + delta, true);
  });

  clearButton.addEventListener("click", () => {
    entries.length = 0;
    activeId = null;
    requestQuery = "";
    requestSearch.value = "";
    requestList.textContent = "";
    viewerRoot.textContent = "";
    detailRoot.textContent = "";
    detailRoot.hidden = true;
    emptyState.hidden = false;
  });

  requestSearch.addEventListener("input", () => {
    requestQuery = requestSearch.value.trim().toLowerCase();
    renderRequestList();
  });

  chrome.devtools.network.onRequestFinished.addListener((request) => {
    request.getContent((content) => {
      if (!content) {
        return;
      }

      const kind = detectResponseKind(request, content);
      if (!kind) {
        return;
      }

      let parsed = null;
      if (kind === "json") {
        try {
          parsed = JSON.parse(content);
        } catch {
          return;
        }
      }

      addEntry(request, parsed, content, kind);
    });
  });

  chrome.devtools.network.getHAR((harLog) => {
    for (const entry of harLog.entries || []) {
      if (entry.response?.content?.mimeType?.includes("json")) {
        // Historical response bodies are usually unavailable from HAR. New requests are handled
        // by onRequestFinished and request.getContent().
      }
    }
  });

  function addEntry(request, parsed, content, kind) {
    const id = `${Date.now()}-${entries.length}`;
    const url = parseUrl(request.request.url);
    const entry = {
      id,
      kind: kind || "json",
      method: request.request.method,
      status: request.response.status,
      time: Number.isFinite(request.time) ? request.time : null,
      completedAt: Date.now(),
      name: getRequestName(url),
      url: request.request.url,
      requestHeaders: normalizeHeaders(request.request.headers),
      responseHeaders: normalizeHeaders(request.response.headers),
      payload: buildPayload(request.request),
      parsed,
      content
    };

    entries.unshift(entry);
    renderRequestList();

    if (!activeId) {
      selectEntry(entry.id);
    }
  }

  function renderRequestList() {
    requestList.textContent = "";
    for (const entry of entries) {
      if (requestMatchesQuery(entry)) {
        renderRequestItem(entry);
      }
    }
  }

  function renderRequestItem(entry) {
    const item = document.createElement("a");
    item.href = entry.url;
    item.target = "_blank";
    item.rel = "noopener noreferrer";
    item.className = "oolaf-request-item";
    item.classList.toggle("is-active", entry.id === activeId);
    item.dataset.id = entry.id;
    item.title = entry.url;

    const name = document.createElement("span");
    name.className = "oolaf-request-name";
    appendRequestHighlight(name, entry.name);

    const meta = document.createElement("span");
    meta.className = "oolaf-request-meta";
    appendRequestHighlight(
      meta,
      `${entry.kind.toUpperCase()} · ${entry.method} · ${entry.status} · ${formatBytes(entry.content.length)} · ${formatClockTime(
        entry.completedAt
      )} · ${formatDuration(
        entry.time
      )}`
    );

    item.append(name, meta);
    item.addEventListener("click", (event) => {
      event.preventDefault();
      selectEntry(entry.id);
    });
    requestList.appendChild(item);
  }

  function selectEntry(id) {
    const entry = entries.find((item) => item.id === id);
    if (!entry) {
      return;
    }

    if (activeId !== id) {
      activeView = "headers";
    }
    activeId = id;
    requestList.querySelectorAll(".oolaf-request-item").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.id === id);
    });
    emptyState.hidden = true;
    detailRoot.hidden = false;
    renderEntry(entry);
  }

  function renderEntry(entry) {
    renderDetailTabs(entry);
    renderActiveView(entry);
  }

  function renderDetailTabs(entry) {
    detailRoot.textContent = "";
    const tabs = document.createElement("div");
    tabs.className = "oolaf-panel-tabs";
    const views = [
      ["headers", "Headers"],
      ["payload", "Payload"],
      ["response", "Response"]
    ];

    for (const [view, label] of views) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "oolaf-panel-tab";
      tab.classList.toggle("is-active", activeView === view);
      tab.textContent = label;
      tab.addEventListener("click", () => {
        activeView = view;
        renderEntry(entry);
      });
      tabs.appendChild(tab);
    }

    const summary = document.createElement("div");
    summary.className = "oolaf-panel-request-summary";
    summary.title = entry.url;

    const summaryText = document.createElement("span");
    summaryText.className = "oolaf-panel-request-summary-text";
    summaryText.textContent = `${entry.method} ${entry.url}`;

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "oolaf-panel-copy-url";
    copyButton.title = "Copy URL";
    copyButton.setAttribute("aria-label", "Copy URL");
    copyButton.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
    copyButton.addEventListener("click", () => copyUrl(entry.url, copyButton));

    summary.append(summaryText, copyButton);
    detailRoot.append(tabs, summary);
  }

  function renderActiveView(entry) {
    viewerRoot.textContent = "";
    viewerRoot.classList.toggle("oolaf-panel-text-view", activeView === "headers");

    if (activeView === "response") {
      if (entry.kind === "js" || entry.kind === "css") {
        if (!entry.prettyText && window.FormantCodeFormat) {
          entry.prettyText =
            entry.kind === "css"
              ? window.FormantCodeFormat.formatCss(entry.content)
              : window.FormantCodeFormat.formatJs(entry.content);
        }
        window.FormantCodeViewer.render(viewerRoot, {
          kind: entry.kind,
          sourceText: entry.content,
          prettyText: entry.prettyText || entry.content,
        }, {
          showToolbar: true,
          downloadName: entry.url,
        });
        return;
      }
      renderPanelJson(viewerRoot, entry.parsed, entry.content, {
        showToolbar: true,
        openDepth: 1,
        view: "tree",
        downloadName: entry.url,
      });
      return;
    }

    if (activeView === "headers") {
      viewerRoot.appendChild(renderHeaders(entry));
      return;
    }

    const payloadData = buildPayloadJson(entry.payload);
    if (!payloadData) {
      viewerRoot.classList.add("oolaf-panel-text-view");
      const pre = document.createElement("pre");
      pre.className = "oolaf-panel-pre";
      pre.textContent = "(no payload)";
      viewerRoot.appendChild(pre);
      return;
    }

    renderPanelJson(viewerRoot, payloadData, JSON.stringify(payloadData), {
      showToolbar: false,
      openDepth: Number.POSITIVE_INFINITY,
      view: "raw"
    });
  }

  function renderPanelJson(container, data, sourceText, options) {
    window.OolafJsonViewer.render(container, data, sourceText, {
      openDepth: options.openDepth,
      toolbarCollapsible: true,
      toolbarExpanded: false,
      showToolbar: options.showToolbar,
      view: options.view,
      downloadName: options.downloadName,
    });
  }

  function renderHeaders(entry) {
    const root = document.createElement("div");
    root.className = "oolaf-panel-headers";
    const sections = [
      ["Request Headers", entry.requestHeaders],
      ["Response Headers", entry.responseHeaders]
    ];

    for (const [title, headers] of sections) {
      const section = document.createElement("section");
      section.className = "oolaf-panel-header-section";
      section.appendChild(createHeaderTitle(title));

      if (headers.length === 0) {
        section.appendChild(createHeaderEmpty());
      } else {
        for (const header of headers) {
          section.appendChild(createHeaderLine(header));
        }
      }

      root.appendChild(section);
    }

    return root;
  }

  function createHeaderTitle(text) {
    const title = document.createElement("div");
    title.className = "oolaf-panel-header-title";
    title.textContent = text;
    return title;
  }

  function createHeaderEmpty() {
    const empty = document.createElement("div");
    empty.className = "oolaf-panel-header-empty";
    empty.textContent = "(no headers)";
    return empty;
  }

  function createHeaderLine(header) {
    const line = document.createElement("div");
    line.className = "oolaf-panel-header-line";

    const key = document.createElement("span");
    key.className = "oolaf-panel-header-key";
    key.textContent = header.name;

    const separator = document.createElement("span");
    separator.className = "oolaf-panel-header-separator";
    separator.textContent = ": ";

    const value = document.createElement("span");
    value.className = "oolaf-panel-header-value";
    value.textContent = header.value;

    line.append(key, separator, value);
    return line;
  }

  function buildPayload(request) {
    const url = parseUrl(request.url);
    const queryParams = normalizeParams(request.queryString);
    if (queryParams.length === 0 && url) {
      for (const [name, value] of url.searchParams.entries()) {
        queryParams.push({ name, value });
      }
    }

    const postData = request.postData || null;
    return {
      queryParams,
      body: normalizePostData(postData)
    };
  }

  function normalizePostData(postData) {
    if (!postData) {
      return null;
    }

    const mimeType = postData.mimeType || "";
    const text = typeof postData.text === "string" ? postData.text : "";
    const params = normalizeParams(postData.params);
    if (params.length === 0 && text && mimeType.includes("x-www-form-urlencoded")) {
      params.push(...parseUrlEncodedParams(text));
    } else if (params.length === 0 && text && mimeType.includes("multipart/form-data")) {
      params.push(...parseMultipartParams(text, mimeType));
    }
    return {
      mimeType,
      text,
      params
    };
  }

  function parseUrlEncodedParams(text) {
    try {
      return Array.from(new URLSearchParams(text).entries()).map(([name, value]) => ({
        name,
        value,
        fileName: "",
        contentType: ""
      }));
    } catch {
      return [];
    }
  }

  function parseMultipartParams(text, mimeType) {
    const boundary = getMultipartBoundary(mimeType);
    if (!boundary) {
      return [];
    }

    const delimiter = `--${boundary}`;
    return text
      .split(delimiter)
      .slice(1, -1)
      .map(parseMultipartPart)
      .filter(Boolean);
  }

  function getMultipartBoundary(mimeType) {
    const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(mimeType);
    return match ? (match[1] || match[2] || "").trim() : "";
  }

  function parseMultipartPart(part) {
    const normalized = part.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    const separator = normalized.indexOf("\r\n\r\n");
    const fallbackSeparator = normalized.indexOf("\n\n");
    const splitAt = separator === -1 ? fallbackSeparator : separator;
    if (splitAt === -1) {
      return null;
    }

    const headersText = normalized.slice(0, splitAt);
    const valueOffset = splitAt + (separator === -1 ? 2 : 4);
    const value = normalized.slice(valueOffset).replace(/\r?\n$/, "");
    const disposition = headersText.match(/content-disposition:\s*([^\r\n]+)/i)?.[1] || "";
    const name = disposition.match(/name="([^"]*)"/i)?.[1] || "";
    if (!name) {
      return null;
    }

    const fileName = disposition.match(/filename="([^"]*)"/i)?.[1] || "";
    const contentType = headersText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "";
    return {
      name,
      value: fileName ? "" : value,
      fileName,
      contentType,
      size: fileName ? value.length : null
    };
  }

  function normalizeParams(params) {
    if (!Array.isArray(params)) {
      return [];
    }

    return params.map((param) => ({
      name: param.name || "",
      value: param.value ?? "",
      fileName: param.fileName || param.filename || "",
      contentType: param.contentType || "",
      size: Number.isFinite(param.size) ? param.size : null
    }));
  }

  function buildPayloadJson(payload) {
    if (!payload || (payload.queryParams.length === 0 && !hasBodyPayload(payload.body))) {
      return null;
    }

    let data = {};
    if (payload.queryParams.length > 0) {
      data = mergePayloadValues(data, paramsToObject(payload.queryParams));
    }

    if (hasBodyPayload(payload.body)) {
      data = mergePayloadValues(data, bodyToValue(payload.body));
    }

    return data;
  }

  function hasBodyPayload(body) {
    return Boolean(body && (body.text || body.params.length > 0));
  }

  function bodyToValue(body) {
    if (body.params.length > 0) {
      return paramsToObject(body.params);
    }

    return parseMaybeJson(body.text);
  }

  function mergePayloadValues(left, right) {
    if (!isPlainObject(left) || !isPlainObject(right)) {
      return right;
    }

    const merged = { ...left };
    for (const [key, value] of Object.entries(right)) {
      if (Object.prototype.hasOwnProperty.call(merged, key)) {
        merged[key] = Array.isArray(merged[key])
          ? [...merged[key], value]
          : [merged[key], value];
      } else {
        merged[key] = value;
      }
    }
    return merged;
  }

  function paramsToObject(params) {
    const data = {};
    for (const item of params) {
      const value = paramToValue(item);
      if (Object.prototype.hasOwnProperty.call(data, item.name)) {
        data[item.name] = Array.isArray(data[item.name])
          ? [...data[item.name], value]
          : [data[item.name], value];
      } else {
        data[item.name] = value;
      }
    }
    return data;
  }

  function paramToValue(item) {
    if (!item.fileName) {
      return item.value;
    }

    const file = {
      fileName: item.fileName
    };
    if (item.contentType) {
      file.contentType = item.contentType;
    }
    if (item.value !== "") {
      file.value = item.value;
    }
    if (Number.isFinite(item.size)) {
      file.size = item.size;
    }
    return file;
  }

  function parseMaybeJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeHeaders(headers) {
    return Array.isArray(headers)
      ? headers.map((header) => ({
          name: header.name || "",
          value: header.value || ""
        }))
      : [];
  }

  function requestMatchesQuery(entry) {
    if (!requestQuery) {
      return true;
    }

    return requestSearchText(entry).includes(requestQuery);
  }

  function requestSearchText(entry) {
    return `${entry.name} ${entry.url} ${entry.method} ${entry.status} ${formatBytes(
      entry.content.length
    )} ${formatClockTime(entry.completedAt)} ${formatDuration(entry.time)}`.toLowerCase();
  }

  function appendRequestHighlight(parent, text) {
    if (!requestQuery) {
      parent.textContent = text;
      return;
    }

    const lowerText = text.toLowerCase();
    let offset = 0;
    let matchIndex = lowerText.indexOf(requestQuery, offset);
    while (matchIndex !== -1) {
      if (matchIndex > offset) {
        parent.appendChild(document.createTextNode(text.slice(offset, matchIndex)));
      }

      const mark = document.createElement("mark");
      mark.className = "oolaf-request-hit";
      mark.textContent = text.slice(matchIndex, matchIndex + requestQuery.length);
      parent.appendChild(mark);

      offset = matchIndex + requestQuery.length;
      matchIndex = lowerText.indexOf(requestQuery, offset);
    }

    if (offset < text.length) {
      parent.appendChild(document.createTextNode(text.slice(offset)));
    }
  }

  function startResize(event) {
    resizer.setPointerCapture(event.pointerId);
    document.body.classList.add("oolaf-panel-resizing");

    const onPointerMove = (moveEvent) => {
      const panelRect = panel.getBoundingClientRect();
      setSidebarWidth(moveEvent.clientX - panelRect.left, false);
    };

    const stopResize = () => {
      document.body.classList.remove("oolaf-panel-resizing");
      localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(getSidebarWidth())));
      resizer.removeEventListener("pointermove", onPointerMove);
      resizer.removeEventListener("pointerup", stopResize);
      resizer.removeEventListener("pointercancel", stopResize);
    };

    resizer.addEventListener("pointermove", onPointerMove);
    resizer.addEventListener("pointerup", stopResize);
    resizer.addEventListener("pointercancel", stopResize);
  }

  function restoreSidebarWidth() {
    const storedWidth = Number(localStorage.getItem(PANEL_WIDTH_KEY));
    if (Number.isFinite(storedWidth) && storedWidth > 0) {
      setSidebarWidth(storedWidth, false);
    }
  }

  function getSidebarWidth() {
    return sidebar.getBoundingClientRect().width || MIN_SIDEBAR_WIDTH;
  }

  function setSidebarWidth(width, persist) {
    const panelWidth = panel.getBoundingClientRect().width;
    const maxWidth = Math.max(MIN_SIDEBAR_WIDTH, panelWidth - MIN_VIEWER_WIDTH);
    const nextWidth = Math.min(Math.max(width, MIN_SIDEBAR_WIDTH), maxWidth);
    panel.style.setProperty("--sidebar-width", `${Math.round(nextWidth)}px`);

    if (persist) {
      localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(nextWidth)));
    }
  }

  function detectResponseKind(request, content) {
    const mimeType = (request.response.content.mimeType || "").toLowerCase();
    const url = String(request.request.url || "").toLowerCase();
    if (mimeType.includes("json") || mimeType.includes("+json")) {
      return "json";
    }
    if (mimeType.includes("css") || /\.css(?:$|\?)/.test(url)) {
      return "css";
    }
    if (
      mimeType.includes("javascript") ||
      mimeType.includes("ecmascript") ||
      /\.(?:js|mjs|cjs)(?:$|\?)/.test(url)
    ) {
      return "js";
    }

    const trimmed = content.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return "json";
    }
    return "";
  }

  function getRequestName(url) {
    if (!url) {
      return "request";
    }

    const pathname = url.pathname;
    const name = pathname.split("/").filter(Boolean).pop() || url.hostname;
    return name;
  }

  function parseUrl(value) {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  }

  function formatBytes(length) {
    if (length < 1024) {
      return `${length} B`;
    }

    const kb = length / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }

    return `${(kb / 1024).toFixed(1)} MB`;
  }

  async function copyUrl(url, button) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        copyTextFallback(url);
      }
      showCopyUrlFeedback(button);
    } catch {
      copyTextFallback(url);
      showCopyUrlFeedback(button);
    }
  }

  function showCopyUrlFeedback(button) {
    button.classList.add("is-copied");
    button.title = "Copied";
    window.setTimeout(() => {
      button.classList.remove("is-copied");
      button.title = "Copy URL";
    }, 1200);
  }

  function copyTextFallback(text) {
    const textarea = document.createElement("textarea");
    textarea.className = "oolaf-panel-copy-buffer";
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function formatClockTime(time) {
    if (!Number.isFinite(time)) {
      return "--:--:--.---";
    }

    const date = new Date(time);
    const clock = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    return `${clock}.${String(date.getMilliseconds()).padStart(3, "0")}`;
  }

  function formatDuration(time) {
    if (!Number.isFinite(time)) {
      return "- ms";
    }

    if (time < 1000) {
      return `${Math.round(time)} ms`;
    }

    return `${(time / 1000).toFixed(2)} s`;
  }
})();
