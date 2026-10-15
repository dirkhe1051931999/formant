(() => {
  "use strict";

  const HOST_ID = "formant-gitzip-dashboard";

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function createDashboard() {
    let host = document.getElementById(HOST_ID);
    if (host && host.shadowRoot) return host.__formantGitzipDashboard;

    host = document.createElement("div");
    host.id = HOST_ID;
    host.setAttribute("aria-live", "polite");
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; color-scheme: light dark; }
      .root {
        --fg-bg: #fff;
        --fg-ink: #151a22;
        --fg-muted: #667084;
        --fg-line: #d9e1eb;
        --fg-accent: #1f4b99;
        --fg-danger: #b42318;
        position: fixed;
        z-index: 2147483647;
        right: 18px;
        bottom: 18px;
        width: min(340px, calc(100vw - 36px));
        overflow: hidden;
        border: 1px solid var(--fg-line);
        border-radius: 12px;
        background: var(--fg-bg);
        box-shadow: 0 12px 34px rgba(21, 26, 34, .18);
        color: var(--fg-ink);
        font: 13px/1.45 "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      .root.dark {
        --fg-bg: #1f2630;
        --fg-ink: #f5f7fa;
        --fg-muted: #aeb8c7;
        --fg-line: #3e4a59;
        --fg-accent: #8eb6ff;
        --fg-danger: #ffb4ab;
      }
      .root[hidden] { display: none; }
      .head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--fg-line); }
      .title { flex: 1; margin: 0; font-weight: 700; }
      .state { color: var(--fg-muted); font-size: 11px; }
      button {
        appearance: none; border: 1px solid var(--fg-line); border-radius: 7px;
        padding: 6px 9px; background: transparent; color: var(--fg-ink);
        font: inherit; font-size: 12px; cursor: pointer;
      }
      button:hover:not(:disabled) { border-color: var(--fg-accent); color: var(--fg-accent); }
      button:disabled { cursor: wait; opacity: .6; }
      .body { display: grid; gap: 8px; max-height: 180px; overflow: auto; padding: 9px 12px; }
      .selection[hidden] { display: none; }
      .selection-title { margin: 0; color: var(--fg-muted); font-size: 11px; font-weight: 650; }
      .selection-list { display: grid; gap: 4px; margin: 5px 0 0; padding: 0; list-style: none; }
      .selection-item { display: flex; align-items: center; gap: 7px; min-width: 0; }
      .selection-kind { flex: 0 0 auto; color: var(--fg-accent); font-size: 11px; }
      .selection-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .logs { display: grid; gap: 6px; }
      .message { margin: 0; color: var(--fg-muted); overflow-wrap: anywhere; }
      .message.error { color: var(--fg-danger); }
      .message.warn { color: #9a5b00; }
      .foot { display: flex; justify-content: space-between; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--fg-line); }
      .download { border-color: var(--fg-accent); background: var(--fg-accent); color: #fff; font-weight: 650; }
      .download:hover:not(:disabled) { color: #fff; filter: brightness(1.06); }
      @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
    `;
    const root = makeElement("section", "root");
    root.hidden = true;
    const head = makeElement("div", "head");
    const title = makeElement("strong", "title", "formant GitZip");
    const state = makeElement("span", "state", "公开仓库模式");
    head.append(title, state);
    const body = makeElement("div", "body");
    const selection = makeElement("section", "selection");
    const selectionTitle = makeElement("p", "selection-title", "已选项目");
    const selectionList = makeElement("ul", "selection-list");
    selection.append(selectionTitle, selectionList);
    const logs = makeElement("div", "logs");
    body.append(selection, logs);
    const foot = makeElement("div", "foot");
    const clear = makeElement("button", "", "清空选择");
    clear.type = "button";
    const download = makeElement("button", "download", "下载已选项");
    download.type = "button";
    foot.append(clear, download);
    root.append(head, body, foot);
    shadow.append(style, root);
    document.documentElement.append(host);

    let onDownload = () => {};
    let onClear = () => {};
    let selectedCount = 0;
    let busy = false;
    let mode = "default";

    function isDark() {
      return mode === "dark" || (mode === "default" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }

    function render() {
      root.classList.toggle("dark", isDark());
      root.hidden = !busy && selectedCount < 1 && !logs.childElementCount;
      download.disabled = busy || selectedCount < 1;
      download.textContent = selectedCount ? `下载已选 ${selectedCount} 项` : "下载已选项";
      clear.disabled = busy || selectedCount < 1;
    }

    clear.addEventListener("click", () => onClear());
    download.addEventListener("click", () => onDownload());

    const api = {
      setTheme(nextTheme) {
        mode = ["default", "light", "dark"].includes(nextTheme) ? nextTheme : "default";
        render();
      },
      setSelection(items) {
        const values = Array.isArray(items) ? items : [];
        selectedCount = values.length;
        selection.hidden = !selectedCount;
        selectionList.replaceChildren();
        for (const item of values) {
          const row = makeElement("li", "selection-item");
          const kind = makeElement("span", "selection-kind", item?.type === "dir" ? "目录" : "文件");
          const name = makeElement("span", "selection-name", String(item?.name || "未命名项目"));
          name.title = name.textContent;
          row.append(kind, name);
          selectionList.append(row);
        }
        render();
      },
      setBusy(nextBusy) {
        busy = Boolean(nextBusy);
        render();
      },
      reset() {
        busy = false;
        logs.replaceChildren();
        render();
      },
      log(message, type = "") {
        const line = makeElement("p", `message ${type}`.trim(), String(message || ""));
        logs.append(line);
        body.scrollTop = body.scrollHeight;
        render();
      },
      setHandlers(handlers) {
        onDownload = typeof handlers?.download === "function" ? handlers.download : () => {};
        onClear = typeof handlers?.clear === "function" ? handlers.clear : () => {};
      },
    };
    host.__formantGitzipDashboard = api;
    render();
    return api;
  }

  globalThis.FormantGitzipDashboard = { create: createDashboard };
})();
