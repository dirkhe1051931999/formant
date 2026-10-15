window.OolafJsonViewer = (() => {
  const LONG_STRING_LIMIT = 180;
  const SEARCH_DEBOUNCE_MS = 120;
  const INDEX_BUILD_BATCH_SIZE = 1200;
  const CHILD_RENDER_BATCH_SIZE = 250;
  const SEARCH_RENDER_LIMIT = 800;
  const MOCK_MAX_DEPTH = 8;
  const MOCK_MAX_OBJECT_KEYS = 80;
  function render(container, data, sourceText, options = {}) {
    container.textContent = "";
    container.classList.add("oolaf-json-body");

    const state = {
      data,
      sourceText,
      prettyText: null,
      prettyPromise: null,
      view: options.view || "tree",
      openDepth: options.openDepth ?? 4,
      toolbarCollapsible: options.toolbarCollapsible === true,
      toolbarExpanded: options.toolbarExpanded ?? options.toolbarCollapsible !== true,
      filter: "all",
      searchQuery: "",
      searchRawQuery: "",
      searchMode: "contains",
      caseSensitive: false,
      matcher: null,
      searchIndex: -1,
      matches: [],
      index: null,
      parentPaths: null,
      indexPromise: null,
      indexBuildId: 0,
      matchPaths: new Set(),
      visiblePaths: new Set(["$"]),
      resultTotal: 0,
      renderedResultTotal: 0,
      resultLimitHit: false,
      searchTimer: 0,
      renderSeq: 0,
      toolbarMeta: null,
      searchCount: null,
      downloadName: options.downloadName || "",
      showToolbar: options.showToolbar !== false
    };

    const app = createElement("main", "oolaf-json-app");
    const tree = createElement("section", "oolaf-json-tree");
    const raw = createElement("pre", "oolaf-json-raw");

    if (state.showToolbar) {
      app.append(createToolbar(state, tree, raw));
    }
    app.append(tree, raw);
    container.appendChild(app);
    renderContent(state, tree, raw);
  }

  function createToolbar(state, tree, raw) {
    const toolbar = createElement("header", "oolaf-json-toolbar");
    toolbar.classList.toggle("is-collapsible", state.toolbarCollapsible);
    const left = createElement("div", "oolaf-json-title-wrap");
    const title = createElement("strong", "oolaf-json-title", "JSON");
    const meta = createElement(
      "span",
      "oolaf-json-meta",
      `${formatBytes(state.sourceText.length)} · counting...`
    );
    state.toolbarMeta = meta;
    const controls = createElement("div", "oolaf-json-controls");
    const searchWrap = createElement("label", "oolaf-json-search");
    const searchInput = document.createElement("input");
    const searchCount = createElement("span", "oolaf-json-search-count", "0/0");
    state.searchCount = searchCount;
    const previousButton = createButton("Prev");
    const nextButton = createButton("Next");
    searchInput.type = "search";
    searchInput.placeholder = "Search key/value/path";
    searchInput.autocomplete = "off";
    searchWrap.append(searchInput);
    document.addEventListener(
      "keydown",
      (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
          event.preventDefault();
          event.stopPropagation();
          if (state.toolbarCollapsible) {
            setToolbarExpanded(state, toolbar, toggleButton, panel, true);
          }
          state.view = "tree";
          renderContent(state, tree, raw);
          updateSearchCount();
          scrollToCurrentMatch(state);
          searchInput.focus();
          searchInput.select();
        }
      },
      true
    );

    const filterSelect = document.createElement("select");
    filterSelect.className = "oolaf-json-select";
    const filters = [
      ["all", "All"],
      ["number", "Number"],
      ["boolean", "Boolean"],
      ["null", "Null"],
      ["empty-string", "Empty string"],
      ["empty-array", "Empty array"],
      ["empty-object", "Empty object"],
      ["false", "False"]
    ];

    for (const [value, label] of filters) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      filterSelect.appendChild(option);
    }

    const modeSelect = document.createElement("select");
    modeSelect.className = "oolaf-json-select";
    const modes = [
      ["contains", "Contains"],
      ["exact", "Exact"],
      ["regex", "Regex"]
    ];

    for (const [value, label] of modes) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      modeSelect.appendChild(option);
    }

    const caseLabel = createElement("label", "oolaf-json-checkbox");
    const caseInput = document.createElement("input");
    caseInput.type = "checkbox";
    caseLabel.append(caseInput, document.createTextNode("Case"));

    const right = createElement("div", "oolaf-json-actions");
    const treeButton = createButton("Tree");
    const rawButton = createButton("Raw");
    const levelSelect = document.createElement("select");
    levelSelect.className = "oolaf-json-select oolaf-json-level-select";
    const levels = [
      ["1", "Level 1"],
      ["2", "Level 2"],
      ["3", "Level 3"],
      ["4", "Level 4"]
    ];

    for (const [value, label] of levels) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = value === String(state.openDepth);
      levelSelect.appendChild(option);
    }

    const expandButton = createIconButton("Expand all", "expand");
    const collapseButton = createIconButton("Collapse all", "collapse");
    const copyPrettyButton = createIconButton("Copy pretty", "copy");
    const downloadButton = createIconButton("Download pretty", "download");
    const copyRawButton = createIconButton("Copy raw", "clipboard");
    const copyMockButton = createIconButton("Copy Mock.js", "braces");

    const updateSearchCount = () => {
      updateSearchCountText(state);
    };

    const rerenderTree = () => {
      state.matcher = createSearchMatcher(state);
      renderContent(state, tree, raw);
      updateSearchCount();
    };

    searchInput.addEventListener("input", () => {
      state.searchRawQuery = searchInput.value.trim();
      state.searchQuery = state.caseSensitive
        ? state.searchRawQuery
        : state.searchRawQuery.toLowerCase();
      state.searchIndex = state.searchQuery ? 0 : -1;
      window.clearTimeout(state.searchTimer);
      state.searchTimer = window.setTimeout(() => {
        rerenderTree();
        scrollToCurrentMatch(state);
      }, SEARCH_DEBOUNCE_MS);
    });

    searchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      if (event.shiftKey) {
        previousButton.click();
      } else {
        nextButton.click();
      }
    });

    previousButton.addEventListener("click", () => {
      if (state.matches.length === 0) {
        return;
      }

      state.searchIndex =
        (state.searchIndex - 1 + state.matches.length) % state.matches.length;
      updateActiveMatch(state);
      updateSearchCount();
      scrollToCurrentMatch(state);
    });

    nextButton.addEventListener("click", () => {
      if (state.matches.length === 0) {
        return;
      }

      state.searchIndex = (state.searchIndex + 1) % state.matches.length;
      updateActiveMatch(state);
      updateSearchCount();
      scrollToCurrentMatch(state);
    });

    filterSelect.addEventListener("change", () => {
      state.filter = filterSelect.value;
      state.searchIndex = 0;
      rerenderTree();
      scrollToCurrentMatch(state);
    });

    modeSelect.addEventListener("change", () => {
      state.searchMode = modeSelect.value;
      state.searchIndex = state.searchQuery ? 0 : -1;
      rerenderTree();
      scrollToCurrentMatch(state);
    });

    caseInput.addEventListener("change", () => {
      state.caseSensitive = caseInput.checked;
      state.searchQuery = state.caseSensitive
        ? state.searchRawQuery
        : state.searchRawQuery.toLowerCase();
      state.searchIndex = state.searchQuery ? 0 : -1;
      rerenderTree();
      scrollToCurrentMatch(state);
    });

    treeButton.addEventListener("click", () => {
      state.view = "tree";
      renderContent(state, tree, raw);
    });

    rawButton.addEventListener("click", () => {
      state.view = "raw";
      renderContent(state, tree, raw);
    });

    levelSelect.addEventListener("change", () =>
      setOpenDepth(state, tree, raw, Number(levelSelect.value))
    );
    expandButton.addEventListener("click", () =>
      setOpenDepth(state, tree, raw, Number.POSITIVE_INFINITY)
    );
    collapseButton.addEventListener("click", () => setOpenDepth(state, tree, raw, 0));
    copyPrettyButton.addEventListener("click", async () => {
      markButtonBusy(copyPrettyButton);
      copyText(await getPrettyTextAsync(state), copyPrettyButton);
    });
    downloadButton.addEventListener("click", async () => {
      markButtonBusy(downloadButton);
      downloadText(await getPrettyTextAsync(state), downloadFileName(state.downloadName, "json"));
      flashButton(downloadButton, "Saved");
    });
    copyRawButton.addEventListener("click", () => copyText(state.sourceText, copyRawButton));
    copyMockButton.addEventListener("click", () =>
      copyText(buildMockJsTemplate(state.data), copyMockButton)
    );

    left.append(title, meta);
    controls.append(
      searchWrap,
      previousButton,
      nextButton,
      searchCount,
      modeSelect,
      caseLabel,
      filterSelect
    );
    right.append(
      treeButton,
      rawButton,
      levelSelect,
      expandButton,
      collapseButton,
      copyPrettyButton,
      downloadButton,
      copyRawButton,
      copyMockButton
    );

    let toggleButton = null;
    let panel = null;
    if (state.toolbarCollapsible) {
      const summary = createElement("div", "oolaf-json-toolbar-summary");
      toggleButton = createIconButton("Show tools", "chevronDown");
      toggleButton.classList.add("oolaf-json-toolbar-toggle");
      panel = createElement("div", "oolaf-json-toolbar-panel");
      toggleButton.addEventListener("click", () => {
        setToolbarExpanded(state, toolbar, toggleButton, panel, !state.toolbarExpanded);
      });
      summary.append(left, toggleButton);
      panel.append(controls, right);
      toolbar.append(summary, panel);
      setToolbarExpanded(state, toolbar, toggleButton, panel, state.toolbarExpanded);
    } else {
      toolbar.append(left, controls, right);
    }

    countNodesLabelAsync(state.data).then((label) => {
      meta.textContent = `${formatBytes(state.sourceText.length)} · ${label}`;
    });
    return toolbar;
  }

  function setToolbarExpanded(state, toolbar, toggleButton, panel, expanded) {
    state.toolbarExpanded = expanded;
    toolbar.classList.toggle("is-expanded", expanded);
    panel.hidden = !expanded;
    toggleButton.title = expanded ? "Hide tools" : "Show tools";
    toggleButton.setAttribute("aria-label", toggleButton.title);
    toggleButton.innerHTML = getIconSvg(expanded ? "chevronUp" : "chevronDown");
  }

  function setOpenDepth(state, tree, raw, openDepth) {
    state.view = "tree";
    state.openDepth = openDepth;
    state.searchIndex = isResultMode(state) ? 0 : -1;
    renderContent(state, tree, raw);
    scrollToCurrentMatch(state);
  }

  function renderContent(state, tree, raw) {
    const renderSeq = ++state.renderSeq;
    tree.hidden = state.view !== "tree";
    raw.hidden = state.view !== "raw";

    if (state.view === "raw") {
      raw.textContent = state.prettyText || "Formatting...";
      getPrettyTextAsync(state).then((text) => {
        if (state.view === "raw" && renderSeq === state.renderSeq) {
          raw.textContent = text;
        }
      });
      state.matches = [];
      updateSearchCountText(state);
      return;
    }

    state.matches = [];
    state.resultTotal = 0;
    state.renderedResultTotal = 0;
    state.resultLimitHit = false;

    if (isResultMode(state) && !state.index) {
      tree.textContent = "";
      tree.appendChild(createElement("div", "oolaf-json-empty-state", "Building search index..."));
      updateSearchCountText(state, "indexing...");
      ensureIndexAsync(state).then(() => {
        if (renderSeq === state.renderSeq) {
          renderContent(state, tree, raw);
          scrollToCurrentMatch(state);
        }
      });
      return;
    }

    const renderTree = () => {
      tree.textContent = "";
      if (isResultMode(state) && state.matchPaths.size === 0) {
        tree.appendChild(createElement("div", "oolaf-json-empty-state", "No matches"));
      } else {
        tree.appendChild(renderNode(state.data, "$", 0, "$", state));
      }
      updateActiveMatch(state);
      updateSearchCountText(state);
    };

    if (isResultMode(state) && state.index.length > INDEX_BUILD_BATCH_SIZE * 4) {
      tree.textContent = "";
      tree.appendChild(createElement("div", "oolaf-json-empty-state", "Searching..."));
      updateSearchCountText(state, "searching...");
      prepareResultSetsAsync(state, renderSeq).then(() => {
        if (renderSeq === state.renderSeq) {
          renderTree();
          scrollToCurrentMatch(state);
        }
      });
      return;
    }

    prepareResultSets(state);
    renderTree();
  }

  function renderNode(value, key, depth, path, state) {
    if (isResultMode(state) && !state.visiblePaths.has(path)) {
      return null;
    }

    if (isContainer(value)) {
      return renderContainer(value, key, depth, path, state);
    }

    const row = createElement("div", "oolaf-json-row oolaf-json-leaf");
    setupMatchState(row, key, value, path, state);
    row.style.setProperty("--depth", depth);

    if (key !== null) {
      row.appendChild(renderKey(key, state));
    }

    row.append(
      renderValue(value, state),
      renderPathHint(path, state),
      renderLineActions(key, value, path)
    );
    return row;
  }

  function renderContainer(value, key, depth, path, state) {
    const isArray = Array.isArray(value);
    const objectKeys = isArray ? null : Object.keys(value);
    const entryCount = isArray ? value.length : objectKeys.length;
    const details = createElement("details", "oolaf-json-node");
    setupMatchState(details, key, value, path, state);
    details.open =
      isResultMode(state) ||
      depth < state.openDepth ||
      details.classList.contains("oolaf-json-match");
    details.style.setProperty("--depth", depth);

    const summary = createElement("summary", "oolaf-json-summary");
    const type = isArray ? "Array" : "Object";
    const openMark = isArray ? "[" : "{";
    const closeMark = isArray ? "]" : "}";

    if (key !== null) {
      summary.appendChild(renderKey(key, state));
    }

    summary.append(
      createElement("span", "oolaf-json-bracket", openMark),
      createElement("span", "oolaf-json-count", `${type}(${entryCount})`),
      createElement("span", "oolaf-json-bracket oolaf-json-close-mark", closeMark),
      renderPathHint(path, state),
      renderLineActions(key, value, path)
    );

    const children = createElement("div", "oolaf-json-children");
    const renderChildren = () => {
      if (children.dataset.rendered === "true") {
        return;
      }

      children.dataset.rendered = "true";
      if (entryCount === 0) {
        children.appendChild(createElement("div", "oolaf-json-empty", "empty"));
        return;
      }

      let childIndex = 0;
      const renderBatch = () => {
        const fragment = document.createDocumentFragment();
        const batchEnd = Math.min(childIndex + CHILD_RENDER_BATCH_SIZE, entryCount);

        for (; childIndex < batchEnd; childIndex += 1) {
          const childKey = isArray ? childIndex : objectKeys[childIndex];
          const childValue = isArray ? value[childIndex] : value[childKey];
          const childPath = appendPath(path, childKey, isArray);
          const child = renderNode(childValue, String(childKey), depth + 1, childPath, state);
          if (child) {
            fragment.appendChild(child);
          }
        }

        children.appendChild(fragment);
        if (childIndex < entryCount && details.open) {
          window.requestAnimationFrame(renderBatch);
        }
      };

      renderBatch();
    };

    details.append(summary, children);

    if (details.open) {
      details.open = true;
      renderChildren();
    }

    details.addEventListener("toggle", () => {
      if (details.open) {
        renderChildren();
      }
    });

    return details;
  }

  function setupMatchState(element, key, value, path, state) {
    if (isResultMode(state)) {
      if (state.matchPaths.has(path)) {
        element.classList.add("oolaf-json-match");
        element.dataset.matchIndex = String(state.matches.length);
        state.matches.push(element);
      }
    }
  }

  function updateActiveMatch(state) {
    document.querySelectorAll(".oolaf-json-match-current").forEach((element) => {
      element.classList.remove("oolaf-json-match-current");
    });

    if (state.searchIndex < 0 || state.matches.length === 0) {
      return;
    }

    const match = state.matches[state.searchIndex];
    if (match) {
      match.classList.add("oolaf-json-match-current");
    }
  }

  function scrollToCurrentMatch(state) {
    window.requestAnimationFrame(() => {
      const match = state.matches[state.searchIndex];
      if (match) {
        match.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    });
  }

  function renderKey(key, state) {
    const keyNode = createElement("span", "oolaf-json-key");
    appendHighlightedText(keyNode, JSON.stringify(key), state);
    keyNode.appendChild(createElement("span", "oolaf-json-colon", ":"));
    return keyNode;
  }

  function renderValue(value, state) {
    const type = value === null ? "null" : typeof value;
    const timestampHint = getTimeHint(value);

    if (typeof value === "string") {
      const url = parseHttpUrl(value);
      const text = JSON.stringify(value);
      const node = url
        ? createElement("a", `oolaf-json-value oolaf-json-${type} oolaf-json-url`)
        : createElement("span", `oolaf-json-value oolaf-json-${type}`);

      if (url) {
        node.href = url.href;
        node.target = "_blank";
        node.rel = "noopener noreferrer";
        node.title = `${value}\nOpen URL in new tab`;
        appendHighlightedText(
          node,
          text.length > LONG_STRING_LIMIT ? `${text.slice(0, LONG_STRING_LIMIT)}...` : text,
          state
        );
        return appendHint(node, timestampHint);
      }

      node.appendChild(renderMaybeLongText(text, state));
      return appendHint(node, timestampHint);
    }

    const node = createElement("span", `oolaf-json-value oolaf-json-${type}`);
    appendHighlightedText(node, String(value), state);
    return appendHint(node, timestampHint);
  }

  function renderMaybeLongText(text, state) {
    if (text.length <= LONG_STRING_LIMIT) {
      const fragment = document.createDocumentFragment();
      appendHighlightedText(fragment, text, state);
      return fragment;
    }

    const wrapper = createElement("span", "oolaf-json-long-string");
    const shortText = `${text.slice(0, LONG_STRING_LIMIT)}...`;
    const textNode = createElement("span", "");
    appendHighlightedText(textNode, shortText, state);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "oolaf-json-inline-button";
    button.textContent = "more";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const expanded = button.dataset.expanded === "true";
      button.dataset.expanded = expanded ? "false" : "true";
      textNode.textContent = "";
      appendHighlightedText(textNode, expanded ? shortText : text, state);
      button.textContent = expanded ? "more" : "less";
    });

    wrapper.append(textNode, button);
    return wrapper;
  }

  function appendHighlightedText(parent, text, state) {
    if (!state.matcher || !state.searchRawQuery) {
      parent.appendChild(document.createTextNode(text));
      return;
    }

    for (const part of state.matcher.highlightParts(text)) {
      if (!part.text) {
        continue;
      }

      if (part.hit) {
        parent.appendChild(createElement("mark", "oolaf-json-keyword-hit", part.text));
      } else {
        parent.appendChild(document.createTextNode(part.text));
      }
    }
  }

  function appendHint(node, hint) {
    if (!hint) {
      return node;
    }

    const fragment = document.createDocumentFragment();
    fragment.append(node, createElement("span", "oolaf-json-time-hint", hint));
    return fragment;
  }

  function renderPathHint(path, state) {
    if (!isResultMode(state) || !state.searchRawQuery) {
      return document.createDocumentFragment();
    }

    const node = createElement("span", "oolaf-json-path-hint");
    appendHighlightedText(node, path, state);
    return node;
  }

  function renderLineActions(key, value, path) {
    const actions = createElement("span", "oolaf-json-line-actions");
    const lineButton = createLineButton("行", "复制该行");
    const keyButton = createLineButton("K", "复制 key");
    const valueButton = createLineButton("V", "复制 value");
    const pathButton = createLineButton("P", "复制 path");

    lineButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      lineButton.textContent = "...";
      buildLineTextAsync(key, value).then((text) => copyText(text, lineButton));
    });

    keyButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      copyText(key ?? "$", keyButton);
    });

    valueButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      valueButton.textContent = "...";
      buildValueTextAsync(value).then((text) => copyText(text, valueButton));
    });

    pathButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      copyText(path, pathButton);
    });

    actions.append(lineButton, keyButton, valueButton, pathButton);
    return actions;
  }

  function createLineButton(label, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "oolaf-json-line-button";
    button.textContent = label;
    button.dataset.label = label;
    button.title = title;
    return button;
  }

  function filterMatches(value, filter) {
    switch (filter) {
      case "number":
        return typeof value === "number";
      case "boolean":
        return typeof value === "boolean";
      case "null":
        return value === null;
      case "empty-string":
        return value === "";
      case "empty-array":
        return Array.isArray(value) && value.length === 0;
      case "empty-object":
        return isPlainObject(value) && Object.keys(value).length === 0;
      case "false":
        return value === false;
      default:
        return true;
    }
  }

  function createSearchMatcher(state) {
    if (!state.searchRawQuery) {
      return null;
    }

    const query = state.caseSensitive ? state.searchRawQuery : state.searchRawQuery.toLowerCase();
    if (!query) {
      return null;
    }

    if (state.searchMode === "regex") {
      try {
        const flags = state.caseSensitive ? "g" : "gi";
        const regex = new RegExp(state.searchRawQuery, flags);
        return {
          matches: (item) => {
            regex.lastIndex = 0;
            return regex.test(item.text);
          },
          highlightParts: (text) => splitByRegex(text, regex)
        };
      } catch {
        return {
          matches: () => false,
          highlightParts: (text) => [{ text, hit: false }]
        };
      }
    }

    if (state.searchMode === "exact") {
      return {
        matches: (item) => {
          const value = state.caseSensitive ? item.text : item.lowerText;
          return value
            .split(/\s+/)
            .some((part) => part === query || stripJsonQuotes(part) === query);
        },
        highlightParts: (text) => splitByExact(text, query, state.caseSensitive)
      };
    }

    return {
      matches: (item) => {
        const value = state.caseSensitive ? item.text : item.lowerText;
        return value.includes(query);
      },
      highlightParts: (text) => splitByQuery(text, query, state.caseSensitive)
    };
  }

  function stripJsonQuotes(value) {
    return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
      ? value.slice(1, -1)
      : value;
  }

  function splitByExact(text, query, caseSensitive) {
    const normalized = caseSensitive ? text : text.toLowerCase();
    const escaped = escapeRegExp(query);
    const regex = new RegExp(`(^|[^\\w$])(${escaped})(?=[^\\w$]|$)`, caseSensitive ? "g" : "gi");
    const parts = [];
    let offset = 0;

    for (const match of normalized.matchAll(regex)) {
      const fullStart = match.index;
      const prefix = match[1] || "";
      const hitStart = fullStart + prefix.length;
      const hitEnd = hitStart + match[2].length;

      if (hitStart > offset) {
        parts.push({ text: text.slice(offset, hitStart), hit: false });
      }

      parts.push({ text: text.slice(hitStart, hitEnd), hit: true });
      offset = hitEnd;
    }

    if (offset < text.length) {
      parts.push({ text: text.slice(offset), hit: false });
    }

    return parts.length > 0 ? parts : [{ text, hit: false }];
  }

  function splitByQuery(text, query, caseSensitive) {
    if (!query) {
      return [{ text, hit: false }];
    }

    const source = caseSensitive ? text : text.toLowerCase();
    const parts = [];
    let offset = 0;

    while (offset < text.length) {
      const index = source.indexOf(query, offset);
      if (index === -1) {
        parts.push({ text: text.slice(offset), hit: false });
        break;
      }

      if (index > offset) {
        parts.push({ text: text.slice(offset, index), hit: false });
      }

      parts.push({ text: text.slice(index, index + query.length), hit: true });
      offset = index + query.length;
    }

    return parts.length > 0 ? parts : [{ text, hit: false }];
  }

  function splitByRegex(text, regex) {
    const parts = [];
    let offset = 0;
    regex.lastIndex = 0;

    for (const match of text.matchAll(regex)) {
      const value = match[0];
      if (!value) {
        continue;
      }

      if (match.index > offset) {
        parts.push({ text: text.slice(offset, match.index), hit: false });
      }

      parts.push({ text: value, hit: true });
      offset = match.index + value.length;
    }

    if (offset < text.length) {
      parts.push({ text: text.slice(offset), hit: false });
    }

    return parts.length > 0 ? parts : [{ text, hit: false }];
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function prepareResultSets(state) {
    state.matchPaths = new Set();
    state.visiblePaths = new Set(["$"]);
    state.resultTotal = 0;
    state.renderedResultTotal = 0;
    state.resultLimitHit = false;

    if (!isResultMode(state)) {
      return;
    }

    const index = ensureIndex(state);
    for (const item of index) {
      if (!resultMatches(item, state)) {
        continue;
      }

      state.resultTotal += 1;
      if (state.renderedResultTotal < SEARCH_RENDER_LIMIT) {
        state.renderedResultTotal += 1;
        state.matchPaths.add(item.path);
        addVisiblePathWithAncestors(state, item.path);
      } else {
        state.resultLimitHit = true;
      }
    }

    if (state.resultTotal === 0) {
      state.searchIndex = -1;
    } else if (state.searchIndex < 0) {
      state.searchIndex = 0;
    } else if (state.searchIndex >= state.renderedResultTotal) {
      state.searchIndex = Math.max(0, state.renderedResultTotal - 1);
    }
  }

  async function prepareResultSetsAsync(state, renderSeq) {
    const matchPaths = new Set();
    const visiblePaths = new Set(["$"]);
    const matcher = state.matcher;
    const filter = state.filter;
    const parentPaths = state.parentPaths;
    let resultTotal = 0;
    let renderedResultTotal = 0;
    let resultLimitHit = false;

    if (!state.searchQuery && filter === "all") {
      return;
    }

    const index = ensureIndex(state);
    for (let itemIndex = 0; itemIndex < index.length; itemIndex += 1) {
      const item = index[itemIndex];
      if (resultMatchesSnapshot(item, filter, matcher)) {
        resultTotal += 1;
        if (renderedResultTotal < SEARCH_RENDER_LIMIT) {
          renderedResultTotal += 1;
          matchPaths.add(item.path);
          addVisiblePathWithAncestorsToSet(visiblePaths, parentPaths, item.path);
        } else {
          resultLimitHit = true;
        }
      }

      if (itemIndex > 0 && itemIndex % INDEX_BUILD_BATCH_SIZE === 0) {
        updateSearchCountText(state, "searching...");
        await yieldToBrowser();
        if (renderSeq !== state.renderSeq) {
          return;
        }
      }
    }

    if (renderSeq !== state.renderSeq) {
      return;
    }

    state.matchPaths = matchPaths;
    state.visiblePaths = visiblePaths;
    state.resultTotal = resultTotal;
    state.renderedResultTotal = renderedResultTotal;
    state.resultLimitHit = resultLimitHit;

    if (resultTotal === 0) {
      state.searchIndex = -1;
    } else if (state.searchIndex < 0) {
      state.searchIndex = 0;
    } else if (state.searchIndex >= renderedResultTotal) {
      state.searchIndex = Math.max(0, renderedResultTotal - 1);
    }
  }

  function resultMatchesSnapshot(item, filter, matcher) {
    if (filter !== "all" && !filterMatches(item.value, filter)) {
      return false;
    }

    return !matcher || matcher.matches(item);
  }

  function addVisiblePathWithAncestors(state, path) {
    let currentPath = path;
    while (currentPath) {
      state.visiblePaths.add(currentPath);
      currentPath = state.parentPaths.get(currentPath);
    }
  }

  function addVisiblePathWithAncestorsToSet(visiblePaths, parentPaths, path) {
    let currentPath = path;
    while (currentPath) {
      visiblePaths.add(currentPath);
      currentPath = parentPaths.get(currentPath);
    }
  }

  function resultMatches(item, state) {
    if (state.filter !== "all" && !filterMatches(item.value, state.filter)) {
      return false;
    }

    return !state.matcher || state.matcher.matches(item);
  }

  function ensureIndex(state) {
    if (state.index) {
      return state.index;
    }

    return [];
  }

  function ensureIndexAsync(state) {
    if (state.index) {
      return Promise.resolve(state.index);
    }

    if (state.indexPromise) {
      return state.indexPromise;
    }

    const buildId = ++state.indexBuildId;
    state.indexPromise = buildSearchIndexAsync(state.data, () => {
      updateSearchCountText(state, "indexing...");
    }).then((built) => {
      if (buildId === state.indexBuildId) {
        state.index = built.index;
        state.parentPaths = built.parentPaths;
      }
      state.indexPromise = null;
      return state.index;
    });

    return state.indexPromise;
  }

  async function buildSearchIndexAsync(root, onProgress) {
    const index = [];
    const parentPaths = new Map([["$", null]]);
    const stack = [
      {
        key: "$",
        value: root,
        path: "$"
      }
    ];
    let processed = 0;

    while (stack.length > 0) {
      const batchEnd = Math.min(stack.length, INDEX_BUILD_BATCH_SIZE);
      for (let count = 0; count < batchEnd; count += 1) {
        const item = stack.pop();
        processed += 1;
        index.push({
          key: item.key,
          value: item.value,
          path: item.path,
          text: searchableText(item.key, item.value, item.path, true),
          lowerText: searchableText(item.key, item.value, item.path, false),
          keyText: item.key,
          valueText: valueSearchText(item.value),
          pathText: item.path
        });

        if (!isContainer(item.value)) {
          continue;
        }

        const isArray = Array.isArray(item.value);
        if (isArray) {
          for (let indexKey = item.value.length - 1; indexKey >= 0; indexKey -= 1) {
            const childPath = appendPath(item.path, indexKey, true);
            parentPaths.set(childPath, item.path);
            stack.push({
              key: String(indexKey),
              value: item.value[indexKey],
              path: childPath
            });
            if (indexKey > 0 && indexKey % INDEX_BUILD_BATCH_SIZE === 0) {
              await yieldToBrowser();
            }
          }
        } else {
          const keys = Object.keys(item.value);
          for (let indexKey = keys.length - 1; indexKey >= 0; indexKey -= 1) {
            const childKey = keys[indexKey];
            const childPath = appendPath(item.path, childKey, false);
            parentPaths.set(childPath, item.path);
            stack.push({
              key: childKey,
              value: item.value[childKey],
              path: childPath
            });
            if (indexKey > 0 && indexKey % INDEX_BUILD_BATCH_SIZE === 0) {
              await yieldToBrowser();
            }
          }
        }
      }

      if (processed % (INDEX_BUILD_BATCH_SIZE * 4) === 0) {
        onProgress();
      }
      await yieldToBrowser();
    }

    return { index, parentPaths };
  }

  function isResultMode(state) {
    return Boolean(state.searchQuery || state.filter !== "all");
  }

  function searchableText(key, value, path, caseSensitive) {
    const parts = [path];
    if (key !== null) {
      parts.push(String(key));
    }

    if (isContainer(value)) {
      parts.push(Array.isArray(value) ? "array" : "object");
    } else {
      parts.push(String(value));
    }

    const text = parts.join(" ");
    return caseSensitive ? text : text.toLowerCase();
  }

  function valueSearchText(value) {
    if (isContainer(value)) {
      return Array.isArray(value) ? "array" : "object";
    }

    return String(value);
  }

  async function buildLineTextAsync(key, value) {
    if (key === null) {
      return buildJsonTextAsync(value);
    }

    return `${JSON.stringify(key)}: ${await buildJsonTextAsync(value)}`;
  }

  async function buildValueTextAsync(value) {
    if (typeof value === "string") {
      return value;
    }

    if (value === null || typeof value !== "object") {
      return String(value);
    }

    return prettyStringifyAsync(value);
  }

  function buildJsonTextAsync(value) {
    return isContainer(value) ? prettyStringifyAsync(value) : Promise.resolve(JSON.stringify(value));
  }

  function buildMockJsTemplate(value) {
    return `Mock.mock(${stringifyMockTemplate(toMockTemplate(value, "$", 0), 0)});`;
  }

  function toMockTemplate(value, key, depth) {
    if (depth > MOCK_MAX_DEPTH) {
      return inferMockValue(key, value);
    }

    if (Array.isArray(value)) {
      const sample = value.length > 0 ? toMockTemplate(value[0], key, depth + 1) : {};
      return {
        __mockArray: true,
        count: value.length > 0 ? Math.min(Math.max(value.length, 1), 10) : 3,
        sample
      };
    }

    if (isPlainObject(value)) {
      const result = {};
      const entries = Object.entries(value).slice(0, MOCK_MAX_OBJECT_KEYS);
      for (const [childKey, childValue] of entries) {
        result[inferMockKey(childKey, childValue)] = toMockTemplate(childValue, childKey, depth + 1);
      }
      if (Object.keys(value).length > MOCK_MAX_OBJECT_KEYS) {
        result.__truncated = `${Object.keys(value).length - MOCK_MAX_OBJECT_KEYS} more keys`;
      }
      return result;
    }

    return inferMockValue(key, value);
  }

  function inferMockKey(key, value) {
    if (Array.isArray(value)) {
      const length = value.length > 0 ? Math.min(Math.max(value.length, 1), 10) : 3;
      return `${key}|${length}`;
    }

    if (typeof value === "number") {
      return Number.isInteger(value) ? `${key}|1-9999` : `${key}|1-9999.1-2`;
    }

    if (typeof value === "boolean") {
      return `${key}|1`;
    }

    return key;
  }

  function inferMockValue(key, value) {
    const normalizedKey = String(key).toLowerCase();

    if (value === null) {
      return null;
    }

    if (typeof value === "boolean") {
      return true;
    }

    if (typeof value === "number") {
      if (isTimestampLike(value)) {
        return "@datetime";
      }

      return Number.isInteger(value) ? 1 : 1.23;
    }

    if (typeof value !== "string") {
      return value;
    }

    if (/avatar|image|img|photo|pic|cover|thumb/.test(normalizedKey)) {
      return "@image";
    }

    if (/url|link|href/.test(normalizedKey) || parseHttpUrl(value)) {
      return "@url";
    }

    if (/email|mail/.test(normalizedKey) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return "@email";
    }

    if (/phone|mobile|tel/.test(normalizedKey)) {
      return /^1\d{10}$/.test(value) ? /^1[3-9]\d{9}$/ : "@string";
    }

    if (/time|date|created|updated|expired/.test(normalizedKey) || getTimeHint(value)) {
      return "@datetime";
    }

    if (/name|title|label/.test(normalizedKey)) {
      return "@ctitle";
    }

    if (/desc|description|summary|content|remark/.test(normalizedKey)) {
      return "@cparagraph";
    }

    if (/city/.test(normalizedKey)) {
      return "@city";
    }

    if (/province/.test(normalizedKey)) {
      return "@province";
    }

    if (/address/.test(normalizedKey)) {
      return "@county(true)";
    }

    if (/id$|_id$|uuid|guid/.test(normalizedKey)) {
      return "@guid";
    }

    return value === "" ? "@string" : value;
  }

  function isTimestampLike(value) {
    return (
      (Number.isInteger(value) && value >= 1000000000 && value <= 9999999999) ||
      (Number.isInteger(value) && value >= 1000000000000 && value <= 9999999999999)
    );
  }

  function stringifyMockTemplate(value, depth) {
    const indent = "  ".repeat(depth);
    const childIndent = "  ".repeat(depth + 1);

    if (value && value.__mockArray) {
      return `[\n${childIndent}${stringifyMockTemplate(value.sample, depth + 1)}\n${indent}]`;
    }

    if (Array.isArray(value)) {
      return JSON.stringify(value, null, 2);
    }

    if (isPlainObject(value)) {
      const entries = Object.entries(value);
      if (entries.length === 0) {
        return "{}";
      }

      const lines = entries.map(
        ([entryKey, entryValue]) =>
          `${childIndent}${JSON.stringify(entryKey)}: ${stringifyMockTemplate(entryValue, depth + 1)}`
      );
      return `{\n${lines.join(",\n")}\n${indent}}`;
    }

    if (value instanceof RegExp) {
      return String(value);
    }

    return JSON.stringify(value);
  }

  function appendPath(parentPath, key, parentIsArray) {
    if (parentIsArray) {
      return `${parentPath}[${key}]`;
    }

    return /^[A-Za-z_$][\w$]*$/.test(key)
      ? `${parentPath}.${key}`
      : `${parentPath}[${JSON.stringify(String(key))}]`;
  }

  function parseHttpUrl(value) {
    if (!/^https?:\/\//i.test(value)) {
      return null;
    }

    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? url : null;
    } catch {
      return null;
    }
  }

  function getTimeHint(value) {
    if (typeof value === "string") {
      const time = Date.parse(value);
      if (!Number.isNaN(time) && /^\d{4}-\d{2}-\d{2}T|\d{4}-\d{2}-\d{2}\s/.test(value)) {
        return formatDateHint(time);
      }

      return null;
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }

    if (Number.isInteger(value) && value >= 1000000000000 && value <= 9999999999999) {
      return formatDateHint(value);
    }

    if (Number.isInteger(value) && value >= 1000000000 && value <= 9999999999) {
      return formatDateHint(value * 1000);
    }

    if (value >= 1000 && value < 86400000 && value % 1000 === 0) {
      return formatDuration(value);
    }

    return null;
  }

  function formatDateHint(time) {
    return new Date(time).toLocaleString();
  }

  function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}m ${seconds % 60}s`;
    }

    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  async function copyText(text, button) {
    const originalText = button.dataset.label || button.textContent;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        copyTextFallback(text);
      }
      showCopyFeedback(button, originalText);
    } catch {
      copyTextFallback(text);
      showCopyFeedback(button, originalText);
    }

    window.setTimeout(() => {
      if (button.dataset.iconButton === "true") {
        button.classList.remove("oolaf-json-button-copied", "oolaf-json-button-busy");
        button.title = originalText;
      } else {
        button.textContent = originalText;
      }
    }, 1200);
  }

  function showCopyFeedback(button, originalText) {
    if (button.dataset.iconButton === "true") {
      button.classList.remove("oolaf-json-button-busy");
      button.classList.add("oolaf-json-button-copied");
      button.title = "Copied";
      return;
    }

    button.textContent = button.classList.contains("oolaf-json-line-button") ? "OK" : "Copied";
  }

  function copyTextFallback(text) {
    const textarea = createElement("textarea", "oolaf-json-copy-buffer");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function flashButton(button, message) {
    button.classList.remove("oolaf-json-button-busy");
    button.classList.add("oolaf-json-button-copied");
    button.title = message;
    window.setTimeout(() => {
      button.classList.remove("oolaf-json-button-copied");
      button.title = button.dataset.label || "";
    }, 1200);
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadFileName(hint, ext) {
    let base = "";
    try {
      const url = new URL(String(hint || location.href), location.href);
      base = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
    } catch {
      base = "";
    }
    base = base.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
    if (!base || /^(panel|viewer)\.html$/i.test(base)) base = "pretty";
    if (new RegExp(`\\.${ext}$`, "i").test(base)) return base;
    return `${base.replace(/\.[a-z0-9]{1,8}$/i, "")}.${ext}`;
  }

  function createButton(label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "oolaf-json-button";
    button.textContent = label;
    button.dataset.label = label;
    return button;
  }

  function createIconButton(label, iconName) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "oolaf-json-button oolaf-json-icon-button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.dataset.label = label;
    button.dataset.iconButton = "true";
    button.innerHTML = getIconSvg(iconName);
    return button;
  }

  function markButtonBusy(button) {
    if (button.dataset.iconButton === "true") {
      button.classList.add("oolaf-json-button-busy");
      button.title = "Working";
      return;
    }

    button.textContent = "Working";
  }

  function getIconSvg(name) {
    const icons = {
      expand:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 3 6 0 0 6"/><path d="m21 3-7 7"/><path d="m9 21-6 0 0-6"/><path d="m3 21 7-7"/></svg>',
      collapse:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 14 6 0 0 6"/><path d="m10 14-7 7"/><path d="m20 10-6 0 0-6"/><path d="m14 10 7-7"/></svg>',
      download:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
      copy:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
      clipboard:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>',
      braces:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/></svg>',
      chevronDown:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
      chevronUp:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>'
    };

    return icons[name] || icons.copy;
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    element.className = className;
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function isContainer(value) {
    return value !== null && typeof value === "object";
  }

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === "[object Object]";
  }

  async function countNodesLabelAsync(value) {
    const limit = 50000;
    const stack = [value];
    let count = 0;

    while (stack.length > 0 && count <= limit) {
      const batchEnd = Math.min(stack.length, 1000);
      for (let index = 0; index < batchEnd && stack.length > 0; index += 1) {
        const current = stack.pop();
        count += 1;

        if (isContainer(current)) {
          if (Array.isArray(current)) {
            for (let childIndex = 0; childIndex < current.length; childIndex += 1) {
              stack.push(current[childIndex]);
              if (childIndex > 0 && childIndex % 1000 === 0) {
                await yieldToBrowser();
              }
            }
          } else {
            const keys = Object.keys(current);
            for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
              const key = keys[keyIndex];
              stack.push(current[key]);
              if (keyIndex > 0 && keyIndex % 1000 === 0) {
                await yieldToBrowser();
              }
            }
          }
        }
      }

      await yieldToBrowser();
    }

    return count > limit ? `${limit}+ nodes` : `${count} nodes`;
  }

  async function getPrettyTextAsync(state) {
    if (!state.prettyText) {
      if (!state.prettyPromise) {
        state.prettyPromise = prettyStringifyAsync(state.data).then((text) => {
          state.prettyText = text;
          state.prettyPromise = null;
          return text;
        });
      }
      return state.prettyPromise;
    }

    return state.prettyText;
  }

  async function prettyStringifyAsync(value) {
    const chunks = [];
    const stack = [{ kind: "value", value, depth: 0 }];
    let processed = 0;

    while (stack.length > 0) {
      const task = stack.pop();
      processed += 1;

      if (task.kind === "text") {
        chunks.push(task.text);
      } else if (task.kind === "property") {
        chunks.push(`${"  ".repeat(task.depth)}${JSON.stringify(task.key)}: `);
        stack.push({ kind: "value", value: task.value, depth: task.depth });
      } else {
        pushPrettyValueTasks(stack, chunks, task.value, task.depth);
      }

      if (processed % 1200 === 0) {
        await yieldToBrowser();
      }
    }

    await yieldToBrowser();
    return chunks.join("");
  }

  function pushPrettyValueTasks(stack, chunks, value, depth) {
    if (!isContainer(value)) {
      chunks.push(JSON.stringify(value));
      return;
    }

    const indent = "  ".repeat(depth);
    const childIndent = "  ".repeat(depth + 1);

    if (Array.isArray(value)) {
      if (value.length === 0) {
        chunks.push("[]");
        return;
      }

      chunks.push("[\n");
      stack.push({ kind: "text", text: `\n${indent}]` });
      for (let index = value.length - 1; index >= 0; index -= 1) {
        if (index < value.length - 1) {
          stack.push({ kind: "text", text: ",\n" });
        }
        stack.push({ kind: "value", value: value[index], depth: depth + 1 });
        stack.push({ kind: "text", text: childIndent });
      }
      return;
    }

    const keys = Object.keys(value);
    if (keys.length === 0) {
      chunks.push("{}");
      return;
    }

    chunks.push("{\n");
    stack.push({ kind: "text", text: `\n${indent}}` });
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      if (index < keys.length - 1) {
        stack.push({ kind: "text", text: ",\n" });
      }
      const key = keys[index];
      stack.push({ kind: "property", key, value: value[key], depth: depth + 1 });
    }
  }

  function updateSearchCountText(state, overrideText) {
    if (!state.searchCount) {
      return;
    }

    if (overrideText) {
      state.searchCount.textContent = overrideText;
      return;
    }

    if (!isResultMode(state)) {
      state.searchCount.textContent = "0/0";
      return;
    }

    const renderedTotal = state.matches.length;
    const current = renderedTotal > 0 ? state.searchIndex + 1 : 0;
    if (state.resultLimitHit) {
      state.searchCount.textContent = `${current}/${renderedTotal} of ${state.resultTotal}`;
      return;
    }

    state.searchCount.textContent = renderedTotal > 0 ? `${current}/${renderedTotal}` : "0/0";
  }

  function yieldToBrowser() {
    return new Promise((resolve) => {
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(resolve, { timeout: 50 });
      } else {
        window.setTimeout(resolve, 0);
      }
    });
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

  function buildTitle(currentTitle) {
    if (!currentTitle || currentTitle === location.href) {
      return "JSON";
    }

    return `${currentTitle} · JSON`;
  }

  return {
    render
  };
})();
