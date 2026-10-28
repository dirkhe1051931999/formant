/** 文件对比的页面骨架和左右拖放。 */

import { getExcludeRules, parseExcludeExtra, pickSide, readDrop, saveExcludeRules } from "./tools-compare-io.js";
import { UI_ICONS } from "./tools-icons.js";
import { must, toast } from "./tools-dom.js";

/**
 * @typedef {import("./tools-compare-io.js").SidePayload} SideData
 */

export function compareShell() {
  return `
    <header class="tl-head">
      <div><h2>文件对比</h2></div>
      <button type="button" class="cmp-icon" data-full title="全屏" aria-label="全屏">${UI_ICONS.full}</button>
    </header>
    <section class="tl-card cmp-bar">
      <div class="cmp-bar__row">
        <label class="cmp-check"><input type="checkbox" data-ws /> 忽略空白</label>
        <label class="cmp-check"><input type="checkbox" data-hide /> 隐藏相同</label>
        <div class="cmp-tools">
          <button type="button" class="cmp-icon" data-swap title="交换左右" aria-label="交换左右">${UI_ICONS.swap}</button>
          <button type="button" class="cmp-icon" data-refresh title="刷新" aria-label="刷新">${UI_ICONS.refresh}</button>
          <button type="button" class="cmp-icon" data-prev hidden title="上一处差异（Alt+↑）" aria-label="上一处差异">${UI_ICONS.up}</button>
          <button type="button" class="cmp-icon" data-next hidden title="下一处差异（Alt+↓）" aria-label="下一处差异">${UI_ICONS.down}</button>
        </div>
        <span class="cmp-status" data-status></span>
      </div>
      <div class="cmp-bar__row cmp-bar__sub">
        <span class="cmp-exclude" data-ex hidden>
          <span class="cmp-kicker">排除</span>
          <label class="cmp-check"><input type="checkbox" data-skip="node_modules" checked /> node_modules</label>
          <label class="cmp-check"><input type="checkbox" data-skip="git" checked /> .git</label>
          <label class="cmp-check"><input type="checkbox" data-skip="dist" checked /> dist</label>
          <input class="cmp-extra" data-extra placeholder="*.log, coverage" title="额外排除，逗号或空格分隔。带 * 的按文件名，不带 * 的按目录或文件名。回车后生效" />
        </span>
        <input class="cmp-find" data-find hidden placeholder="文件名" title="按相对路径筛选当前列表" />
        <div class="tl-seg" data-filter hidden>
          <button type="button" class="is-active" data-f="all">全部</button>
          <button type="button" data-f="diff">有差异</button>
          <button type="button" data-f="side">仅一侧</button>
        </div>
        <button type="button" class="cmp-copy" data-copy hidden>复制差异</button>
      </div>
      <div class="cmp-history" data-history hidden></div>
    </section>
    <div class="cmp-panes">
      ${paneHtml("left", "左侧")}
      ${paneHtml("right", "右侧")}
    </div>
    <div data-result>
      <div data-folder hidden></div>
      <div class="cmp-detail" data-detail hidden>
        <div class="tl-row">
          <button type="button" class="cmp-icon" data-back hidden title="返回列表（Esc）" aria-label="返回列表">${UI_ICONS.back}</button>
          <strong data-title></strong>
          <select class="tl-select" data-enc hidden>
            <option value="auto">自动</option>
            <option value="utf-8">UTF-8</option>
            <option value="gbk">GBK</option>
          </select>
          <span class="tl-meta" data-detail-meta></span>
        </div>
        <div data-body></div>
      </div>
    </div>
  `;
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   getSide: (which: "left" | "right") => SideData | null,
 *   assign: (left: SideData | null, right: SideData | null) => void,
 *   assignSide: (which: "left" | "right", side: SideData) => void,
 * }} api
 */
export function bindPanes(root, api) {
  root.addEventListener("dragover", (event) => event.preventDefault());
  root.addEventListener("drop", (event) => event.preventDefault());
  for (const which of /** @type {const} */ (["left", "right"])) {
    const box = must(`[data-side="${which}"]`, root);
    box.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.stopPropagation();
      box.classList.add("is-over");
    });
    box.addEventListener("dragleave", (event) => {
      if (!box.contains(/** @type {Node} */ (event.relatedTarget))) box.classList.remove("is-over");
    });
    box.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      box.classList.remove("is-over");
      void onDrop(which, event.dataTransfer, api);
    });
    must("[data-pick-file]", box).addEventListener("click", () => void onPick(which, false, api));
    must("[data-pick-dir]", box).addEventListener("click", () => void onPick(which, true, api));
  }
}

/**
 * @param {"left" | "right"} which
 * @param {boolean} directory
 * @param {{ assignSide: (which: "left" | "right", side: SideData) => void }} api
 */
async function onPick(which, directory, api) {
  try {
    const side = await pickSide(directory);
    if (side) api.assignSide(which, side);
  } catch (error) {
    toast(error instanceof Error ? error.message : "读取失败", true);
  }
}

/**
 * @param {"left" | "right"} which
 * @param {DataTransfer | null} dataTransfer
 * @param {{
 *   getSide: (which: "left" | "right") => SideData | null,
 *   assign: (left: SideData | null, right: SideData | null) => void,
 *   assignSide: (which: "left" | "right", side: SideData) => void,
 * }} api
 */
async function onDrop(which, dataTransfer, api) {
  let payload;
  try {
    payload = await readDrop(dataTransfer);
  } catch (error) {
    toast(error instanceof Error ? error.message : "读取失败", true);
    return;
  }
  if (payload.kind === "empty") return;
  if (payload.kind === "error") {
    toast(payload.message, true);
    return;
  }
  if (payload.kind === "dir" || payload.kind === "file") {
    api.assignSide(which, payload);
    return;
  }
  const items = payload.items;
  const other = api.getSide(which === "left" ? "right" : "left");
  const asSide = (item) => ({ kind: "file", name: item.file.name, file: item.file, handle: item.handle });
  if (items.length >= 2 && !other) {
    if (which === "left") api.assign(asSide(items[0]), asSide(items[1]));
    else api.assign(asSide(items[1]), asSide(items[0]));
    if (items.length > 2) toast("已放入前两个文件");
    return;
  }
  api.assignSide(which, asSide(items[0]));
}

/**
 * @param {HTMLElement} root
 * @param {{ jump: (step: number) => void, back: () => void, canJump: () => boolean, canBack: () => boolean }} api
 */
export function bindCompareKeys(root, api) {
  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || root.hidden || root.closest("[hidden]")) return;
    const el = event.target;
    if (el instanceof HTMLElement) {
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return;
    }
    if (event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      if (!api.canJump()) return;
      event.preventDefault();
      api.jump(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Escape" && !event.altKey && !document.fullscreenElement && api.canBack()) {
      event.preventDefault();
      api.back();
    }
  });
}

/**
 * @param {HTMLElement} root
 * @param {(opened: boolean) => void} reload
 */
export function bindExclude(root, reload) {
  const exBox = must("[data-ex]", root);
  const extraInput = /** @type {HTMLInputElement} */ (must("[data-extra]", root));
  const apply = () => {
    const prev = getExcludeRules();
    const next = { node_modules: false, git: false, dist: false, extra: extraInput.value };
    for (const input of exBox.querySelectorAll("input[data-skip]")) {
      const box = /** @type {HTMLInputElement} */ (input);
      next[/** @type {"node_modules" | "git" | "dist"} */ (box.dataset.skip)] = box.checked;
    }
    if (prev.node_modules === next.node_modules && prev.git === next.git && prev.dist === next.dist && prev.extra === next.extra) return;
    const kept = new Set(parseExcludeExtra(next.extra).map((pattern) => pattern.toLowerCase()));
    const opened = ["node_modules", "git", "dist"].some((key) => prev[key] && !next[key])
      || parseExcludeExtra(prev.extra).some((pattern) => !kept.has(pattern.toLowerCase()));
    saveExcludeRules(next);
    reload(opened);
  };
  exBox.addEventListener("change", (event) => {
    if (event.target === extraInput) return;
    apply();
  });
  extraInput.addEventListener("change", () => apply());
  extraInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    apply();
  });
}

/** @param {"left" | "right"} which @param {string} label */
function paneHtml(which, label) {
  return `
    <section class="cmp-pane" data-side="${which}">
      <div class="cmp-pane__bar">
        <strong data-name>${label}</strong>
        <span class="tl-meta" data-meta></span>
        <button type="button" class="cmp-icon" data-pick-file title="选择文件" aria-label="选择文件">${UI_ICONS.file}</button>
        <button type="button" class="cmp-icon" data-pick-dir title="选择文件夹" aria-label="选择文件夹">${UI_ICONS.folder}</button>
      </div>
      <div class="tl-drop" data-drop>拖到这里</div>
    </section>
  `;
}
