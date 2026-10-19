import { downloadBlob, escapeHtml, must, toast } from "./tools-dom.js";
import { mountUserscriptEdit } from "./tools-userscript-edit.js";
import {
  listUserscripts,
  matchHint,
  parseUserscriptHash,
  pickHttpTab,
  safeJsFilename,
  scriptMatchesTab,
  usSend,
  userscriptHref,
} from "./tools-userscript-lib.js";
import { mountUserscriptSearch } from "./tools-userscript-search.js";

/**
 * @param {HTMLElement} root
 */
export function mount(root) {
  root.innerHTML = `
    <header class="tl-head">
      <div>
        <h2>油猴</h2>
      </div>
      <div class="tl-row us-head-actions" data-head></div>
    </header>
    <p class="tl-note us-banner" data-banner hidden></p>
    <div data-view></div>
  `;

  const viewEl = must("[data-view]", root);
  const headEl = must("[data-head]", root);
  const bannerEl = /** @type {HTMLElement} */ (must("[data-banner]", root));
  const titleEl = must("h2", root);

  /** @type {import("./userscript/store.js").UserscriptRecord[]} */
  let scripts = [];
  /** @type {{ engine?: string, error?: string }} */
  let engine = {};
  let tabUrl = "";
  let tabHost = "";
  let filter = "";
  let onlyTab = false;
  let view = "list";
  let editId = "";
  let paintTick = 0;

  function route() {
    const parsed = parseUserscriptHash(location.hash);
    view = parsed.view;
    editId = parsed.id;
    void paint();
  }

  function setHead(listMode) {
    headEl.textContent = "";
    if (!listMode) {
      const back = document.createElement("a");
      back.className = "tl-btn tl-btn--ghost us-back";
      back.href = userscriptHref("list");
      back.textContent = "返回列表";
      headEl.appendChild(back);
      return;
    }
    for (const [href, label, primary] of [
      [userscriptHref("new"), "新建", true],
      [userscriptHref("import"), "导入", false],
      [userscriptHref("search"), "搜索", false],
    ]) {
      const a = document.createElement("a");
      a.className = primary ? "tl-btn" : "tl-btn tl-btn--ghost";
      a.href = href;
      a.textContent = label;
      headEl.appendChild(a);
    }
  }

  function setTitle(text) {
    const ico = titleEl.querySelector(".tl-ico");
    titleEl.textContent = text;
    if (ico) titleEl.prepend(ico);
  }

  function showBanner() {
    const err = engine.error || "";
    if (err) {
      bannerEl.hidden = false;
      bannerEl.textContent = err;
      bannerEl.classList.add("tl-note--error");
      return;
    }
    if (engine.engine === "content") {
      bannerEl.hidden = false;
      bannerEl.classList.remove("tl-note--error");
      bannerEl.textContent = "未使用 userScripts 注入，部分站点可能被页面 CSP 拦住。可在扩展详情开启「允许运行用户脚本」。";
      return;
    }
    bannerEl.hidden = true;
    bannerEl.textContent = "";
  }

  async function reload() {
    const [bundle, tab] = await Promise.all([listUserscripts(), pickHttpTab()]);
    scripts = bundle.scripts;
    engine = bundle.engine || {};
    tabUrl = tab?.url || "";
    try {
      tabHost = tabUrl ? new URL(tabUrl).hostname : "";
    } catch {
      tabHost = "";
    }
  }

  function visibleScripts() {
    const q = filter.trim().toLowerCase();
    return scripts.filter((item) => {
      if (onlyTab && tabUrl && !scriptMatchesTab(item, tabUrl)) return false;
      if (!q) return true;
      const blob = `${item.meta.name} ${item.meta.description} ${item.meta.namespace} ${matchHint(item)}`.toLowerCase();
      return blob.includes(q);
    });
  }

  function renderList() {
    setTitle("油猴");
    setHead(true);
    showBanner();
    const rows = visibleScripts();
    viewEl.innerHTML = `
      <section class="tl-card">
        <div class="tl-row">
          <input class="tl-input tl-input--grow" data-q placeholder="筛选名称 / 描述 / 匹配" />
          <label class="tl-meta"><input type="checkbox" data-tab /> 当前页</label>
          <span class="tl-meta" data-count></span>
        </div>
      </section>
      <section class="tl-card us-list" data-list></section>
    `;
    const qEl = /** @type {HTMLInputElement} */ (must("[data-q]", viewEl));
    const tabEl = /** @type {HTMLInputElement} */ (must("[data-tab]", viewEl));
    const countEl = must("[data-count]", viewEl);
    const listEl = must("[data-list]", viewEl);
    qEl.value = filter;
    tabEl.checked = onlyTab;
    tabEl.disabled = !tabUrl;
    countEl.textContent = tabHost ? `${rows.length} / ${scripts.length} · ${tabHost}` : `${rows.length} / ${scripts.length}`;

    if (!scripts.length) {
      listEl.innerHTML = `<p class="tl-note">还没有脚本。可新建、粘贴 <code>.user.js</code>，或到 Greasy Fork 搜索安装。</p>`;
    } else if (!rows.length) {
      listEl.innerHTML = `<p class="tl-note">没有符合筛选的脚本。</p>`;
    } else {
      listEl.innerHTML = rows
        .map((item) => {
          const on = item.enabled ? "已启用" : "已停用";
          return `<article class="us-item${item.enabled ? "" : " is-off"}" data-id="${escapeHtml(item.id)}">
            <label class="us-switch" title="${on}">
              <input type="checkbox" data-toggle ${item.enabled ? "checked" : ""} />
            </label>
            <div class="us-item__body">
              <strong>${escapeHtml(item.meta.name)}</strong>
              <p>${escapeHtml(item.meta.description || matchHint(item))}</p>
              <span class="tl-meta">v${escapeHtml(item.meta.version)} · ${escapeHtml(matchHint(item))}</span>
            </div>
            <div class="us-item__ops">
              <a class="tl-btn tl-btn--ghost" href="${userscriptHref("edit", item.id)}">编辑</a>
              <button type="button" class="tl-btn tl-btn--ghost" data-export>导出</button>
              <button type="button" class="tl-btn tl-btn--ghost" data-del>删除</button>
            </div>
          </article>`;
        })
        .join("");
    }

    qEl.addEventListener("input", () => {
      filter = qEl.value;
      void paintListOnly();
    });
    tabEl.addEventListener("change", () => {
      onlyTab = tabEl.checked;
      void paintListOnly();
    });
    listEl.addEventListener("click", (event) => {
      const target = /** @type {HTMLElement} */ (event.target);
      const item = target.closest(".us-item");
      if (!item) return;
      const id = item.getAttribute("data-id") || "";
      if (target.closest("[data-del]")) {
        if (!window.confirm("删除这个脚本？")) return;
        void usSend("FORMANT_US_DELETE", { id })
          .then(() => reload().then(paintListOnly))
          .then(() => toast("已删除"))
          .catch((error) => toast(error instanceof Error ? error.message : String(error), true));
        return;
      }
      if (target.closest("[data-export]")) {
        const script = scripts.find((row) => row.id === id);
        if (!script) return;
        downloadBlob(new Blob([script.source], { type: "text/plain;charset=utf-8" }), safeJsFilename(script.meta.name));
        toast("已导出");
      }
    });
    listEl.addEventListener("change", (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.matches("[data-toggle]")) return;
      const item = input.closest(".us-item");
      const id = item?.getAttribute("data-id") || "";
      void usSend("FORMANT_US_TOGGLE", { id, enabled: input.checked })
        .then(() => reload().then(paintListOnly))
        .catch((error) => {
          input.checked = !input.checked;
          toast(error instanceof Error ? error.message : String(error), true);
        });
    });
  }

  async function paintListOnly() {
    renderList();
  }

  async function paint() {
    const mine = ++paintTick;
    try {
      if (!scripts.length || view === "list") await reload();
      if (mine !== paintTick) return;
      showBanner();
      if (view === "search") {
        setTitle("搜索脚本");
        setHead(false);
        mountUserscriptSearch(viewEl, { host: tabHost });
        return;
      }
      if (view === "import" || view === "new" || view === "edit") {
        setTitle(view === "new" ? "新建脚本" : view === "import" ? "导入脚本" : "编辑脚本");
        setHead(false);
        await mountUserscriptEdit(viewEl, { view, id: editId });
        return;
      }
      if (mine !== paintTick) return;
      renderList();
    } catch (error) {
      if (mine !== paintTick) return;
      viewEl.innerHTML = `<p class="tl-note tl-note--error">${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
    }
  }

  window.addEventListener("hashchange", route);
  void route();
}
