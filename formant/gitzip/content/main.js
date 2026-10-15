(() => {
  "use strict";

  const bootstrap = globalThis.FormantGitzipBootstrap;
  const github = globalThis.FormantGitzipGithub;
  const zip = globalThis.FormantGitzipZip;
  const dashboardFactory = globalThis.FormantGitzipDashboard;
  if (!bootstrap || !github || !zip || !dashboardFactory) return;

  /** @type {Map<string, { key: string, name: string, type: "file" | "dir" }>} */
  const selected = new Map();
  let config = bootstrap.getState();
  let dashboard = null;
  let scanTimer = 0;
  let lastLocation = "";
  let downloading = false;
  let injecting = false;

  function apiError(message) {
    return new Error(String(message || "GitHub 公开 API 请求失败"));
  }

  /**
   * @param {string} path
   */
  function encodePath(path) {
    return String(path || "")
      .split("/")
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join("/");
  }

  /**
   * @param {{ owner: string, repo: string }} context
   * @param {string} route
   */
  async function requestApi(context, route) {
    const url = `https://api.github.com/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}${route}`;
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (response.ok) return response.json();

    let details = "";
    try {
      details = (await response.json())?.message || "";
    } catch {
      details = response.statusText;
    }
    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      throw apiError("GitHub 匿名 API 限额已用完，请稍后再试（公开模式不支持令牌）。");
    }
    if (response.status === 404) {
      throw apiError("未找到公开仓库或文件；GitZip 公开模式不支持私有仓库。");
    }
    throw apiError(`GitHub API ${response.status}：${details || "请求失败"}`);
  }

  /**
   * @param {{ owner: string, repo: string }} context
   * @param {string} path
   * @param {string} ref
   */
  function getContents(context, path, ref) {
    const suffix = path ? `/${encodePath(path)}` : "";
    return requestApi(context, `/contents${suffix}?ref=${encodeURIComponent(ref)}`);
  }

  /**
   * @param {{ owner: string, repo: string, root: boolean, tail: string[] }} context
   */
  async function resolveRef(context) {
    if (context.root) {
      const repository = await requestApi(context, "");
      if (!repository?.default_branch) throw apiError("无法确定仓库默认分支");
      return { ref: repository.default_branch, path: "" };
    }

    const fromDom = github.chooseLongestRef(context.tail, github.getDomRefCandidates(context));
    if (fromDom) return { ref: fromDom, path: github.pathAfterRef(context, fromDom) };

    const branches = await requestApi(context, "/branches?per_page=100");
    const fromApi = github.chooseLongestRef(
      context.tail,
      Array.isArray(branches) ? branches.map((branch) => branch?.name) : [],
    );
    if (fromApi) return { ref: fromApi, path: github.pathAfterRef(context, fromApi) };

    const [ref, ...parts] = context.tail;
    if (!ref) throw apiError("无法确定当前分支");
    return { ref, path: parts.join("/") };
  }

  /**
   * @param {string} base
   * @param {string} name
   */
  function joinPath(base, name) {
    return [base, name].filter(Boolean).join("/");
  }

  /**
   * @param {string} path
   */
  function displayName(path) {
    const clean = String(path || "").replace(/\/+$/, "");
    return clean.split("/").filter(Boolean).pop() || "";
  }

  /**
   * @param {{ owner: string, repo: string }} context
   * @param {string} path
   * @param {string} ref
   * @param {string} archivePrefix
   * @param {(message: string) => void} log
   */
  async function collectDirectory(context, path, ref, archivePrefix, log) {
    /** @type {Array<{ path: string, directory?: boolean, source?: any }>} */
    const files = [];
    async function visit(remotePath, localPath) {
      const contents = await getContents(context, remotePath, ref);
      if (!Array.isArray(contents)) {
        files.push({ path: localPath, source: contents });
        return;
      }
      if (!contents.length) {
        files.push({ path: localPath, directory: true });
        return;
      }
      for (const entry of contents) {
        const target = joinPath(localPath, entry.name);
        if (entry.type === "dir") {
          await visit(entry.path, target);
        } else if (entry.type === "file") {
          files.push({ path: target, source: entry });
        }
      }
    }
    log(`读取目录 ${path || "/"}…`);
    await visit(path, archivePrefix);
    return files;
  }

  /**
   * @param {{ owner: string, repo: string }} context
   * @param {string} ref
   * @param {(message: string) => void} log
   */
  async function collectRepository(context, ref, log) {
    const tree = await requestApi(context, `/git/trees/${encodeURIComponent(ref)}?recursive=1`);
    if (tree?.truncated) {
      log("仓库树过大，改用逐层公开 API 读取…");
      return collectDirectory(context, "", ref, context.repo, log);
    }
    const entries = Array.isArray(tree?.tree) ? tree.tree : [];
    return entries
      .filter((entry) => entry?.type === "blob")
      .map((entry) => ({
        path: joinPath(context.repo, entry.path),
        source: { ...entry, apiUrl: entry.url, name: displayName(entry.path) },
      }));
  }

  /**
   * @param {{ owner: string, repo: string }} context
   * @param {string} currentPath
   * @param {string} ref
   * @param {(message: string) => void} log
   */
  async function collectSelected(context, currentPath, ref, log) {
    if (!selected.size) throw apiError("请先勾选一个或多个文件、目录");
    const contents = await getContents(context, currentPath, ref);
    if (!Array.isArray(contents)) throw apiError("当前页面不是可选择的目录");
    const wanted = new Set([...selected.values()].map((item) => `${item.type}:${item.name}`));
    /** @type {Array<{ path: string, directory?: boolean, source?: any }>} */
    const files = [];
    for (const entry of contents) {
      const type = entry.type === "dir" ? "dir" : entry.type === "file" ? "file" : "";
      if (!wanted.has(`${type}:${entry.name}`)) continue;
      if (type === "dir") {
        files.push(...(await collectDirectory(context, entry.path, ref, entry.name, log)));
      } else {
        files.push({ path: entry.name, source: entry });
      }
    }
    if (!files.length) throw apiError("已选项目不在当前目录中，请刷新页面后重试");
    return files;
  }

  /**
   * @param {{ owner: string, repo: string, kind: string, root: boolean }} context
   * @param {{ ref: string, path: string }} resolved
   * @param {"selected" | "current" | "repository"} mode
   * @param {(message: string) => void} log
   */
  async function collectForMode(context, resolved, mode, log) {
    if (mode === "repository" || (mode === "current" && context.root)) {
      return collectRepository(context, resolved.ref, log);
    }
    if (mode === "selected") return collectSelected(context, resolved.path, resolved.ref, log);

    const contents = await getContents(context, resolved.path, resolved.ref);
    if (context.kind === "blob" || !Array.isArray(contents)) {
      return [{ path: contents.name || displayName(resolved.path), source: contents }];
    }
    return collectDirectory(
      context,
      resolved.path,
      resolved.ref,
      displayName(resolved.path) || context.repo,
      log,
    );
  }

  /**
   * @param {any} source
   */
  async function fetchFile(source) {
    if (source?.download_url) {
      const response = await fetch(source.download_url);
      if (response.ok) return response.blob();
    }
    const blobUrl = source?.apiUrl || source?.url;
    if (!blobUrl) throw apiError(`无法读取 ${source?.name || "文件"} 的内容`);
    const response = await fetch(blobUrl, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) {
      if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
        throw apiError("GitHub 匿名 API 限额已用完，请稍后再试（公开模式不支持令牌）。");
      }
      throw apiError(`无法读取 ${source?.name || "文件"} 的内容`);
    }
    const payload = await response.json();
    if (!payload?.content) throw apiError(`${source?.name || "文件"} 太大，GitHub 公开 API 未返回内容`);
    const binary = atob(String(payload.content).replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: "application/octet-stream" });
  }

  /**
   * @param {Array<{ path: string, directory?: boolean, source?: any }>} files
   * @param {(message: string) => void} log
   */
  async function materialize(files, log) {
    /** @type {Array<{ path: string, directory?: boolean, blob?: Blob }>} */
    const result = new Array(files.length);
    let cursor = 0;
    const workers = Math.min(4, files.length);
    async function worker() {
      while (cursor < files.length) {
        const index = cursor;
        cursor += 1;
        const file = files[index];
        if (file.directory) {
          result[index] = { path: file.path, directory: true };
          continue;
        }
        log(`读取 ${file.path}…`);
        result[index] = { path: file.path, blob: await fetchFile(file.source) };
      }
    }
    await Promise.all(Array.from({ length: workers }, worker));
    return result;
  }

  function currentPageState() {
    const context = github.currentContext();
    if (!context) return { enabled: config.enabled, selectedCount: 0, hasCurrent: false };
    const label = context.root ? `${context.owner}/${context.repo}` : displayName(context.tail.join("/"));
    return {
      enabled: config.enabled,
      selectedCount: selected.size,
      hasCurrent: true,
      currentLabel: label || context.repo,
      repository: `${context.owner}/${context.repo}`,
      contextType: context.root ? "repository" : context.kind,
    };
  }

  function sendState() {
    void chrome.runtime.sendMessage({ type: "FORMANT_GITZIP_STATE", state: currentPageState() }).catch(() => {});
  }

  function paintSelection() {
    document.querySelectorAll(".formant-gitzip-select[data-gitzip-key]").forEach((button) => {
      const selectedNow = selected.has(button.dataset.gitzipKey || "");
      button.classList.toggle("is-selected", selectedNow);
      button.textContent = selectedNow ? "✓" : "";
      button.setAttribute("aria-pressed", String(selectedNow));
    });
    dashboard?.setSelection([...selected.values()]);
    sendState();
  }

  /**
   * @param {{ key: string, name: string, type: "file" | "dir" }} item
   */
  function toggle(item) {
    if (selected.has(item.key)) selected.delete(item.key);
    else selected.set(item.key, item);
    paintSelection();
  }

  function clearSelection() {
    selected.clear();
    paintSelection();
  }

  /**
   * @param {{ owner: string, repo: string }} context
   */
  function getRows(context) {
    const treePrefix = github.hrefPrefix(context, "tree");
    const blobPrefix = github.hrefPrefix(context, "blob");
    const rows = new Map();
    const isVisible = (link) => {
      const rect = link.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(link).visibility !== "hidden";
    };
    document.querySelectorAll(`a[href^="${treePrefix}"], a[href^="${blobPrefix}"]`).forEach((link) => {
      const row = link.closest("tr, [role='row'], .js-navigation-item, .react-directory-row, [data-testid='tree-item']");
      const href = link.getAttribute("href") || "";
      const type = href.startsWith(treePrefix) ? "dir" : href.startsWith(blobPrefix) ? "file" : "";
      const name = link.textContent?.trim() || "";
      if (!row || !type || !name || name === "..") return;
      const current = rows.get(row);
      if (!current || (!isVisible(current.link) && isVisible(link))) {
        rows.set(row, { row, link, item: { key: `${type}:${href}`, name, type } });
      }
    });
    return [...rows.values()];
  }

  /**
   * @param {Node | null | undefined} node
   */
  function isOurNode(node) {
    return (
      node instanceof Element &&
      (node.matches(".formant-gitzip-select") || Boolean(node.closest?.("#formant-gitzip-dashboard")))
    );
  }

  /**
   * @param {MutationRecord[]} mutations
   */
  function mutationsNeedScan(mutations) {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;
      for (const node of mutation.addedNodes) {
        if (!isOurNode(node)) return true;
      }
      for (const node of mutation.removedNodes) {
        if (!isOurNode(node)) return true;
      }
    }
    return false;
  }

  function injectMarkers() {
    if (!config.enabled || injecting) return;
    injecting = true;
    observer.disconnect();
    try {
      const context = github.currentContext();
      const locationKey = `${location.pathname}${location.search}`;
      if (locationKey !== lastLocation) {
        lastLocation = locationKey;
        selected.clear();
        dashboard?.reset();
      }
      if (!context || context.kind === "blob") {
        paintSelection();
        return;
      }
      const liveKeys = new Set();
      for (const { row, link, item } of getRows(context)) {
        liveKeys.add(item.key);
        let button = row.querySelector(".formant-gitzip-select");
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.className = "formant-gitzip-select";
          button.title = "选择供 GitZip 下载";
          button.setAttribute("aria-label", `选择 ${item.name} 供 GitZip 下载`);
          link.before(button);
        } else if (button.nextElementSibling !== link) {
          link.before(button);
        }
        button.dataset.gitzipKey = item.key;
        button.dataset.mode = config.settings.selectBehaviour;
        const selectedNow = selected.has(item.key);
        button.classList.toggle("is-selected", selectedNow);
        if (button.textContent !== (selectedNow ? "✓" : "")) {
          button.textContent = selectedNow ? "✓" : "";
        }
        button.setAttribute("aria-pressed", String(selectedNow));
        button.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (config.settings.selectBehaviour !== "double-click") toggle(item);
        };
        row.__formantGitzipItem = item;
        if (!row.__formantGitzipBound) {
          row.__formantGitzipBound = true;
          row.addEventListener("dblclick", (event) => {
            if (config.settings.selectBehaviour === "single-check") return;
            const current = row.__formantGitzipItem;
            if (!current) return;
            event.preventDefault();
            event.stopPropagation();
            toggle(current);
          });
        }
      }
      document.querySelectorAll(".formant-gitzip-select[data-gitzip-key]").forEach((marker) => {
        const key = marker.dataset.gitzipKey || "";
        if (!liveKeys.has(key)) marker.remove();
      });
      dashboard?.setSelection([...selected.values()]);
      sendState();
    } finally {
      injecting = false;
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function scheduleScan() {
    if (!config.enabled || scanTimer || injecting) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      injectMarkers();
    }, 120);
  }

  function removeMarkers() {
    document.querySelectorAll(".formant-gitzip-select").forEach((marker) => marker.remove());
    selected.clear();
    dashboard?.reset();
    dashboard?.setSelection([]);
    sendState();
  }

  async function download(mode) {
    if (downloading) return;
    await bootstrap.ready;
    config = bootstrap.getState();
    const context = github.currentContext();
    if (!config.enabled || !context) throw apiError("请在公开 GitHub 仓库页面使用 GitZip");
    downloading = true;
    dashboard ??= dashboardFactory.create();
    dashboard.setBusy(true);
    dashboard.log("公开模式：未使用 GitHub 令牌。");
    try {
      const resolved = await resolveRef(context);
      dashboard.log(`分支：${resolved.ref}`);
      const files = await collectForMode(context, resolved, mode, (message) => dashboard.log(message));
      const actualFiles = await materialize(files, (message) => dashboard.log(message));
      if (!actualFiles.length) throw apiError("当前仓库或目录没有可下载的文件");
      const selectedDirectory = [...selected.values()].some((item) => item.type === "dir");
      const shouldZip =
        actualFiles.length !== 1 ||
        actualFiles[0].directory ||
        mode === "repository" ||
        (mode === "current" && context.kind !== "blob") ||
        (mode === "selected" && (selected.size !== 1 || selectedDirectory));
      if (!shouldZip) {
        zip.triggerDownload(actualFiles[0].blob, displayName(actualFiles[0].path));
      } else {
        dashboard.log(`正在生成 ${actualFiles.length} 项 ZIP…`);
        const archive = await zip.makeZip(actualFiles, {
          onProgress: (done, total, path) => {
            if (done === total || done === 1 || done % 10 === 0) dashboard.log(`压缩 ${done}/${total}：${path}`);
          },
        });
        zip.triggerDownload(archive, `${context.repo}-${mode}.zip`);
      }
      dashboard.log("下载已触发。");
    } catch (error) {
      dashboard.log(error instanceof Error ? error.message : String(error), "error");
      throw error;
    } finally {
      downloading = false;
      dashboard.setBusy(false);
      sendState();
    }
  }

  function applyConfig(next) {
    config = next;
    if (!config.enabled) {
      removeMarkers();
      return;
    }
    dashboard ??= dashboardFactory.create();
    dashboard.setTheme(config.settings.theme);
    dashboard.setHandlers({
      download: () => void download("selected").catch(() => {}),
      clear: clearSelection,
    });
    scheduleScan();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "FORMANT_GITZIP_GET_STATE") {
      sendResponse({ ok: true, state: currentPageState() });
      return false;
    }
    if (message?.type !== "FORMANT_GITZIP_DOWNLOAD") return false;
    void download(message.mode)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  });

  const observer = new MutationObserver((mutations) => {
    if (injecting || !mutationsNeedScan(mutations)) return;
    scheduleScan();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", scheduleScan);
  window.addEventListener("pageshow", scheduleScan);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleScan();
  });
  bootstrap.subscribe(applyConfig);
  void bootstrap.ready.then(applyConfig);
})();
