/** 工具箱：文件夹 / 单文件 / 图片对比。拖拽或选择，不上传。 */

import { diffListText, fileKind, filterByName, filterRows, pairFiles } from "./tools-compare-core.js";
import { countRows, folderEmpty, folderSummary, mountFolderView } from "./tools-compare-folder.js";
import { ensureRead, listHistory, rememberHistory, removeHistory, renderHistory } from "./tools-compare-history.js";
import { mountImageView } from "./tools-compare-image.js";
import { hashFile, loadExcludeRules, loadSideText, materializeHandle, pathExcluded } from "./tools-compare-io.js";
import { bindCompareKeys, bindExclude, bindPanes, compareShell } from "./tools-compare-shell.js";
import { diffTextAsync, emptyNote as note, mountTextView, textSummary } from "./tools-compare-text.js";
import { bindFullscreen } from "./tools-icons.js";
import { copyText, formatBytes, must, toast } from "./tools-dom.js";

/**
 * @typedef {import("./tools-compare-core.js").CmpFile} CmpFile
 * @typedef {import("./tools-compare-core.js").CmpRow} CmpRow
 * @typedef {import("./tools-compare-history.js").CmpHist} CmpHist
 * @typedef {import("./tools-compare-io.js").SidePayload} SideData
 * @typedef {import("./tools-compare-text.js").TextModel} TextModel
 */

/** @param {HTMLElement} root */
export function mount(root) {
  root.innerHTML = compareShell();

  const status = must("[data-status]", root);
  const filterSeg = must("[data-filter]", root);
  const folderHost = must("[data-folder]", root);
  const detail = must("[data-detail]", root);
  const backBtn = must("[data-back]", root);
  const title = must("[data-title]", root);
  const detailMeta = must("[data-detail-meta]", root);
  const body = must("[data-body]", root);
  const ws = /** @type {HTMLInputElement} */ (must("[data-ws]", root));
  const hideSame = /** @type {HTMLInputElement} */ (must("[data-hide]", root));
  const historyHost = must("[data-history]", root);
  const exBox = must("[data-ex]", root);
  const extraInput = /** @type {HTMLInputElement} */ (must("[data-extra]", root));
  const findInput = /** @type {HTMLInputElement} */ (must("[data-find]", root));
  const copyBtn = must("[data-copy]", root);
  const enc = /** @type {HTMLSelectElement} */ (must("[data-enc]", root));
  const prevBtn = must("[data-prev]", root);
  const nextBtn = must("[data-next]", root);

  /** @type {SideData | null} */
  let left = null;
  /** @type {SideData | null} */
  let right = null;
  /** @type {CmpRow[]} */
  let folderRows = [];
  /** @type {"all" | "diff" | "side"} */
  let filter = "all";
  /** @type {"idle" | "folder" | "text" | "image" | "note"} */
  let mode = "idle";
  /** @type {{ left: string, right: string } | null} */
  let textCache = null;
  /** @type {TextModel | null} */
  let textModel = null;
  /** @type {{ left: File | null, right: File | null }} */
  let textFiles = { left: null, right: null };
  /** @type {{ jump: (step: number) => boolean } | null} */
  let textNav = null;
  /** @type {{ jump: (step: number) => boolean } | null} */
  let folderNav = null;
  let textJob = 0;
  let token = 0;
  let pinnedPath = "";
  let keepPin = false;

  /** @param {"left" | "right"} which @param {string} label */
  function pane(which) {
    return must(`[data-side="${which}"]`, root);
  }

  function paintPanes() {
    paintPane("left", left);
    paintPane("right", right);
  }

  /** @param {"left" | "right"} which @param {SideData | null} data */
  function paintPane(which, data) {
    const box = pane(which);
    const name = must("[data-name]", box);
    const meta = must("[data-meta]", box);
    const drop = must("[data-drop]", box);
    name.textContent = data?.name || (which === "left" ? "左侧" : "右侧");
    drop.hidden = Boolean(data);
    box.title = "";
    if (!data) {
      meta.textContent = "";
      drop.textContent = "拖到这里";
      return;
    }
    if (data.kind === "dir") {
      meta.textContent = data.truncated ? `前 ${data.files.length} 个` : `${data.files.length} 个文件`;
      return;
    }
    meta.textContent = formatBytes(data.file.size);
  }

  /** @param {SideData | null} nextLeft @param {SideData | null} nextRight */
  function assign(nextLeft, nextRight) {
    if (!keepPin) pinnedPath = "";
    keepPin = false;
    left = nextLeft;
    right = nextRight;
    paintPanes();
    void reconcile();
  }

  /** @param {"left" | "right"} which @param {SideData} data */
  function assignSide(which, data) {
    if (which === "left") assign(data, right);
    else assign(left, data);
  }

  async function reconcile() {
    const gen = ++token;
    mode = "idle";
    textCache = null;
    folderRows = [];
    folderHost.hidden = true;
    detail.hidden = true;
    filterSeg.hidden = true;
    textNav = null;
    folderNav = null;
    paintChrome();
    if (!left || !right) {
      status.textContent = left || right ? "还差一侧" : "";
      return;
    }
    if (left.kind !== right.kind) {
      status.textContent = "两边要同是文件，或同是文件夹";
      return;
    }
    if (left.handle && right.handle) {
      void rememberHistory(left, right).then(() => paintHistory()).catch(() => {});
    }
    if (left.kind === "dir" && right.kind === "dir") {
      await runFolder(gen);
      return;
    }
    if (left.kind === "file" && right.kind === "file") await runFiles(gen, left.file, right.file, "", false);
  }

  /** @param {number} gen */
  async function runFolder(gen) {
    if (left?.kind !== "dir" || right?.kind !== "dir") return;
    folderRows = pairFiles(left.files, right.files);
    mode = "folder";
    filterSeg.hidden = false;
    showFolder();
    const pending = folderRows.filter((row) => row.status === "pending");
    let done = 0;
    const queue = pending.slice();
    const worker = async () => {
      while (queue.length) {
        if (gen !== token) return;
        const row = queue.shift();
        if (!row?.left || !row.right) continue;
        const [hl, hr] = await Promise.all([hashFile(row.left.file), hashFile(row.right.file)]);
        if (gen !== token) return;
        row.status = hl === hr ? "same" : "diff";
        done += 1;
        if (done % 24 === 0 || done === pending.length) showFolder();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (gen !== token) return;
    showFolder();
    const row = pinnedPath ? folderRows.find((item) => item.path === pinnedPath) : null;
    if (row) void openRow(row);
  }

  function showFolder() {
    if (mode !== "folder") return;
    const query = findInput.value.trim();
    let shown = filterByName(filterRows(folderRows, filter), query);
    if (hideSame.checked) shown = shown.filter((row) => row.status !== "same");
    const counts = countRows(folderRows);
    const cut = (left?.kind === "dir" && left.truncated) || (right?.kind === "dir" && right.truncated);
    const quiet = !shown.length && !query;
    const empty = query && !shown.length ? "没有符合的文件" : folderEmpty(counts, shown.length, filter, hideSame.checked);
    status.textContent = quiet ? "" : folderSummary(counts, cut, hideSame.checked);
    folderHost.hidden = false;
    detail.hidden = true;
    filterSeg.hidden = false;
    folderNav = mountFolderView(folderHost, shown, (row) => void openRow(row), empty);
    paintChrome();
  }

  /** @param {CmpRow} row */
  async function openRow(row) {
    const gen = token;
    mode = "note";
    folderHost.hidden = true;
    filterSeg.hidden = true;
    detail.hidden = false;
    backBtn.hidden = false;
    pinnedPath = row.path;
    title.textContent = row.path;
    detailMeta.textContent = "";
    body.replaceChildren(note("正在读这个文件"));
    if (gen !== token) return;
    await runFiles(gen, row.left?.file || null, row.right?.file || null, row.path, true);
  }

  /**
   * @param {number} gen
   * @param {File | null} fileL
   * @param {File | null} fileR
   * @param {string} heading
   * @param {boolean} fromFolder
   */
  async function runFiles(gen, fileL, fileR, heading, fromFolder) {
    detail.hidden = false;
    folderHost.hidden = true;
    backBtn.hidden = !fromFolder;
    title.textContent = heading || `${fileL?.name || "左侧"}  /  ${fileR?.name || "右侧"}`;
    const kindL = fileL ? fileKind(fileL) : "";
    const kindR = fileR ? fileKind(fileR) : "";
    const imageL = kindL === "image";
    const imageR = kindR === "image";
    if ((imageL || imageR) && fileL && fileR && imageL !== imageR) {
      mode = "note";
      detailMeta.textContent = "";
      if (!fromFolder) status.textContent = "";
      body.replaceChildren(note("一边是图片，另一边不是"));
      paintChrome();
      return;
    }
    if ((imageL || imageR) && (imageL || !fileL) && (imageR || !fileR)) {
      mode = "image";
      detailMeta.textContent = "";
      if (!fromFolder) status.textContent = "";
      body.replaceChildren();
      try {
        await mountImageView(body, fileL, fileR, () => gen !== token);
      } catch (error) {
        if (gen !== token) return;
        body.replaceChildren(note(error instanceof Error ? error.message : "图片读取失败"));
      }
      paintChrome();
      return;
    }
    textFiles = { left: fileL, right: fileR };
    detailMeta.textContent = "";
    if (!fromFolder) status.textContent = "";
    body.replaceChildren(note("正在读两边的内容"));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    if (gen !== token) return;
    const encoding = /** @type {"auto" | "utf-8" | "gbk"} */ (enc.value || "auto");
    const leftText = await loadSideText(fileL, encoding);
    const rightText = await loadSideText(fileR, encoding);
    if (gen !== token) return;
    const readyL = fileL ? leftText : { ok: true, text: "", message: "" };
    const readyR = fileR ? rightText : { ok: true, text: "", message: "" };
    if (!readyL.ok || !readyR.ok) {
      mode = "note";
      const lines = [];
      if (fileL && !leftText.ok) lines.push(`左：${leftText.message}`);
      if (fileR && !rightText.ok) lines.push(`右：${rightText.message}`);
      detailMeta.textContent = "";
      if (!fromFolder) status.textContent = "";
      body.replaceChildren(note(lines.join("；")));
      paintChrome();
      return;
    }
    showText(readyL.text, readyR.text);
  }

  /** @param {string} leftText @param {string} rightText */
  function showText(leftText, rightText) {
    mode = "text";
    textCache = { left: leftText, right: rightText };
    textModel = null;
    textNav = null;
    const job = ++textJob;
    detailMeta.textContent = "";
    if (backBtn.hidden) status.textContent = "";
    body.replaceChildren(note("正在逐行对照"));
    paintChrome();
    void diffTextAsync(leftText, rightText, ws.checked).then((model) => {
      if (mode !== "text" || job !== textJob) return;
      textModel = model;
      paintText(model);
    });
  }

  /** @param {TextModel} model */
  function paintText(model) {
    const summary = textSummary(model);
    if (backBtn.hidden) {
      status.textContent = summary;
      detailMeta.textContent = "";
    } else detailMeta.textContent = summary;
    body.replaceChildren();
    textNav = mountTextView(body, model, hideSame.checked);
    paintChrome();
  }

  function paintChrome() {
    const dirs = left?.kind === "dir" && right?.kind === "dir";
    exBox.hidden = !dirs;
    findInput.hidden = !dirs;
    copyBtn.hidden = !dirs;
    enc.hidden = mode !== "text";
    const jumping = mode === "text" || mode === "folder";
    prevBtn.hidden = !jumping;
    nextBtn.hidden = !jumping;
  }

  /** @param {number} step */
  function jump(step) {
    const nav = mode === "text" ? textNav : mode === "folder" ? folderNav : null;
    if (!nav?.jump(step)) toast(step > 0 ? "后面没有差异了" : "前面没有差异了");
  }

  /** @param {SideData | null} side */
  function filterSide(side) {
    if (side?.kind !== "dir") return side;
    return { ...side, files: side.files.filter((file) => !pathExcluded(file.path)) };
  }

  async function reloadDirs(opened) {
    if (left?.kind !== "dir" || right?.kind !== "dir") return;
    if (left.handle && right.handle) {
      keepPin = Boolean(pinnedPath);
      status.textContent = "正在按排除规则重读";
      try {
        const [nextL, nextR] = await Promise.all([materializeHandle(left.handle), materializeHandle(right.handle)]);
        assign(nextL, nextR);
      } catch (error) {
        keepPin = false;
        toast(error instanceof Error ? error.message : "重读失败", true);
      }
      return;
    }
    if (opened) toast("重新拖入文件夹后，才会读入刚取消排除的目录");
    assign(filterSide(left), filterSide(right));
  }

  backBtn.addEventListener("click", () => {
    if (!folderRows.length) return;
    mode = "folder";
    textCache = null;
    textModel = null;
    pinnedPath = "";
    showFolder();
  });

  ws.addEventListener("change", () => {
    if (mode === "text" && textCache) showText(textCache.left, textCache.right);
  });

  hideSame.addEventListener("change", () => {
    if (mode === "text" && textModel) paintText(textModel);
    else if (mode === "folder") showFolder();
  });

  must("[data-swap]", root).addEventListener("click", () => {
    if (!left && !right) return;
    pinnedPath = "";
    assign(right, left);
  });

  must("[data-refresh]", root).addEventListener("click", () => void refreshSides());
  prevBtn.addEventListener("click", () => jump(-1));
  nextBtn.addEventListener("click", () => jump(1));
  bindCompareKeys(root, {
    canJump: () => !nextBtn.hidden,
    canBack: () => !backBtn.hidden,
    jump,
    back: () => backBtn.click(),
  });
  enc.addEventListener("change", () => {
    if (mode !== "text") return;
    void runFiles(token, textFiles.left, textFiles.right, title.textContent, !backBtn.hidden);
  });
  bindExclude(root, (opened) => void reloadDirs(opened));
  findInput.addEventListener("input", () => {
    if (mode === "folder") showFolder();
  });
  copyBtn.addEventListener("click", () => {
    let shown = filterByName(filterRows(folderRows, filter), findInput.value);
    if (hideSame.checked) shown = shown.filter((row) => row.status !== "same");
    const text = diffListText(shown);
    if (!text) {
      toast("没有差异可复制");
      return;
    }
    void copyText(text, "已复制差异清单");
  });
  bindFullscreen(must("[data-full]", root), root);
  void loadExcludeRules().then((rules) => {
    for (const input of exBox.querySelectorAll("input[data-skip]")) input.checked = Boolean(rules[input.dataset.skip || ""]);
    extraInput.value = rules.extra || "";
    if (left?.kind !== "dir" || right?.kind !== "dir") return;
    if (left.handle && right.handle) void reloadDirs(false);
    else assign(filterSide(left), filterSide(right));
  });

  filterSeg.addEventListener("click", (event) => {
    const btn = /** @type {HTMLElement} */ (event.target).closest("button");
    if (!btn || !filterSeg.contains(btn)) return;
    filter = /** @type {"all" | "diff" | "side"} */ (btn.dataset.f || "all");
    for (const item of filterSeg.querySelectorAll("button")) item.classList.toggle("is-active", item === btn);
    if (mode === "folder") showFolder();
  });

  bindPanes(root, {
    getSide: (which) => (which === "left" ? left : right),
    assign,
    assignSide,
  });

  async function refreshSides() {
    if (!left?.handle || !right?.handle) {
      toast("请重新选择文件后再刷新");
      return;
    }
    const handleL = left.handle;
    const handleR = right.handle;
    keepPin = Boolean(pinnedPath);
    status.textContent = "正在重新读取";
    try {
      await Promise.all([ensureRead(handleL), ensureRead(handleR)]);
      const [nextL, nextR] = await Promise.all([materializeHandle(handleL), materializeHandle(handleR)]);
      assign(nextL, nextR);
    } catch (error) {
      keepPin = false;
      toast(error instanceof Error ? error.message : "刷新失败", true);
    }
  }

  /** @param {CmpHist} item */
  async function openHist(item) {
    status.textContent = "正在打开";
    try {
      await Promise.all([ensureRead(item.leftHandle), ensureRead(item.rightHandle)]);
      const [nextL, nextR] = await Promise.all([
        materializeHandle(item.leftHandle),
        materializeHandle(item.rightHandle),
      ]);
      assign(nextL, nextR);
    } catch (error) {
      toast(error instanceof Error ? error.message : "打开失败", true);
    }
  }

  /** @param {string} id */
  async function dropHist(id) {
    await removeHistory(id);
    await paintHistory();
  }

  async function paintHistory() {
    try {
      renderHistory(historyHost, await listHistory(), (item) => void openHist(item), (id) => void dropHist(id));
    } catch {
      historyHost.hidden = true;
    }
  }

  void paintHistory();
}

