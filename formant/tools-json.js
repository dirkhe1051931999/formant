import { copyText, debounce, downloadBlob, must, toast } from "./tools-dom.js";
import { formatJson, highlightJson, reviveForTree, unicodeToText, urlDecodeText } from "./tools-json-lib.js";

const SAMPLE = '{"name":"formant","tags":["json","tools"],"nested":"{\\"a\\":1,\\"b\\":[true,null]}","id":12345678901234567890,"ok":true}';

/** @param {HTMLElement} root */
export function mount(root) {
  root.innerHTML = `
    <header class="tl-head">
      <div>
        <h2>JSON 美化</h2>
      </div>
    </header>
    <div class="js-pages" data-pages></div>
    <section class="tl-card">
      <div class="tl-row">
        <button type="button" class="tl-btn" data-format>格式化</button>
        <button type="button" class="tl-btn tl-btn--ghost" data-compress>压缩</button>
        <label class="tl-meta">缩进
          <select class="tl-select" data-indent>
            <option value="2" selected>2 空格</option>
            <option value="4">4 空格</option>
            <option value="tab">Tab</option>
          </select>
        </label>
        <label class="tl-meta">键排序
          <select class="tl-select" data-sort>
            <option value="0" selected>默认</option>
            <option value="1">升序</option>
            <option value="-1">降序</option>
          </select>
        </label>
        <label class="tl-meta"><input type="checkbox" data-nested /> 展开嵌套 JSON</label>
        <button type="button" class="tl-btn tl-btn--ghost" data-uni>Unicode → 中文</button>
        <button type="button" class="tl-btn tl-btn--ghost" data-urldec>URL 解码</button>
        <button type="button" class="tl-btn tl-btn--ghost" data-sample>示例</button>
        <button type="button" class="tl-btn tl-btn--ghost" data-clear>清空</button>
      </div>
    </section>
    <div class="js-layout" style="margin-top:12px">
      <section class="tl-card">
        <span class="tl-label">输入</span>
        <textarea class="tl-textarea" data-in placeholder="在此粘贴 JSON" spellcheck="false"></textarea>
      </section>
      <section class="tl-card">
        <div class="tl-row">
          <div class="tl-seg" data-tabs>
            <button type="button" class="is-active" data-tab="text">文本</button>
            <button type="button" data-tab="tree">树视图</button>
          </div>
          <button type="button" class="tl-btn tl-btn--ghost" data-copy>复制</button>
          <button type="button" class="tl-btn tl-btn--ghost" data-use>替换输入</button>
          <button type="button" class="tl-btn tl-btn--ghost" data-download>下载</button>
          <span class="tl-meta" data-status></span>
        </div>
        <p class="tl-error tl-meta" data-error></p>
        <textarea data-out readonly hidden></textarea>
        <pre class="js-code" data-hl></pre>
        <div class="js-out" data-tree hidden></div>
      </section>
    </div>`;

  const input = /** @type {HTMLTextAreaElement} */ (must("[data-in]", root));
  const out = /** @type {HTMLTextAreaElement} */ (must("[data-out]", root));
  const tree = must("[data-tree]", root);
  const hl = must("[data-hl]", root);
  const errorEl = must("[data-error]", root);
  const statusEl = must("[data-status]", root);
  const tabs = must("[data-tabs]", root);
  const indentSel = /** @type {HTMLSelectElement} */ (must("[data-indent]", root));
  const sortSel = /** @type {HTMLSelectElement} */ (must("[data-sort]", root));
  const nested = /** @type {HTMLInputElement} */ (must("[data-nested]", root));

  /** @type {unknown} */
  let lastValue;
  let hasValue = false;
  let treeStale = true;
  let tab = "text";
  let compact = false;

  /* ---- 多页：只存内存，刷新即重置 ---- */
  const MAX_PAGES = 20;
  const pagesEl = must("[data-pages]", root);
  /** @type {{ id: number, name: string, input: string }[]} */
  const pages = [{ id: 1, name: "页 1", input: "" }];
  let seq = 1;
  let current = pages[0];

  function renderPages() {
    pagesEl.textContent = "";
    for (const page of pages) {
      const item = document.createElement("div");
      item.className = "js-page";
      item.classList.toggle("is-active", page === current);
      const main = document.createElement("button");
      main.type = "button";
      main.className = "js-page__main";
      main.dataset.page = String(page.id);
      main.textContent = page.name;
      item.append(main);
      if (pages.length > 1) {
        const close = document.createElement("button");
        close.type = "button";
        close.className = "js-page__x";
        close.dataset.close = String(page.id);
        close.title = "关闭此页";
        close.setAttribute("aria-label", `关闭${page.name}`);
        close.textContent = "×";
        item.append(close);
      }
      pagesEl.append(item);
    }
    const add = document.createElement("button");
    add.type = "button";
    add.className = "js-page__add";
    add.dataset.add = "1";
    add.title = "新增一页";
    add.setAttribute("aria-label", "新增一页");
    add.textContent = "+";
    add.disabled = pages.length >= MAX_PAGES;
    pagesEl.append(add);
  }

  /** @param {{ id: number, name: string, input: string }} page */
  function switchTo(page) {
    current.input = input.value;
    current = page;
    input.value = page.input;
    compact = false;
    run();
    renderPages();
  }

  /** @param {number} id */
  function closePage(id) {
    const index = pages.findIndex((p) => p.id === id);
    if (index < 0 || pages.length < 2) return;
    const page = pages[index];
    const text = page === current ? input.value : page.input;
    if (text.trim() && !window.confirm(`关闭「${page.name}」？页内内容不会保留。`)) return;
    pages.splice(index, 1);
    if (page === current) {
      current = pages[Math.min(index, pages.length - 1)];
      input.value = current.input;
      compact = false;
      run();
    }
    renderPages();
  }

  pagesEl.addEventListener("click", (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.closest("[data-add]")) {
      if (pages.length >= MAX_PAGES) return;
      seq += 1;
      const page = { id: seq, name: `页 ${seq}`, input: "" };
      pages.push(page);
      switchTo(page);
      input.focus();
      return;
    }
    const closeBtn = /** @type {HTMLElement | null} */ (target.closest("[data-close]"));
    if (closeBtn) return closePage(Number(closeBtn.dataset.close));
    const pageBtn = /** @type {HTMLElement | null} */ (target.closest("[data-page]"));
    const page = pageBtn && pages.find((p) => p.id === Number(pageBtn.dataset.page));
    if (page && page !== current) switchTo(page);
  });

  function options() {
    const raw = indentSel.value;
    return {
      indent: /** @type {number | "tab" | 0} */ (compact ? 0 : raw === "tab" ? "tab" : Number(raw)),
      sort: /** @type {1 | -1 | 0} */ (Number(sortSel.value)),
      nested: nested.checked,
    };
  }

  /** 结果文本：textarea 只存值，`pre` 负责带颜色显示。 */
  function setOut(text) {
    out.value = text;
    hl.innerHTML = highlightJson(text);
  }

  function renderTree() {
    treeStale = false;
    const viewer = /** @type {any} */ (window).OolafJsonViewer;
    if (!hasValue || !viewer) {
      tree.innerHTML = '<div class="js-empty">没有可显示的 JSON</div>';
      return;
    }
    viewer.render(tree, reviveForTree(lastValue), out.value, { showToolbar: false, openDepth: 3, downloadName: "data.json" });
  }

  function setTab(next) {
    tab = next;
    for (const btn of tabs.querySelectorAll("button")) btn.classList.toggle("is-active", btn.dataset.tab === next);
    hl.hidden = next !== "text";
    tree.hidden = next !== "tree";
    if (next === "tree" && treeStale) renderTree();
  }

  function run() {
    current.input = input.value;
    errorEl.textContent = "";
    statusEl.textContent = "";
    if (!input.value.trim()) {
      setOut("");
      hasValue = false;
      treeStale = true;
      if (tab === "tree") renderTree();
      return;
    }
    try {
      const result = formatJson(input.value, options());
      lastValue = result.value;
      hasValue = true;
      setOut(result.text);
      statusEl.textContent = `${result.text.length.toLocaleString()} 字符 · ${result.text.split("\n").length.toLocaleString()} 行`;
    } catch (error) {
      hasValue = false;
      setOut("");
      errorEl.textContent = error instanceof Error ? error.message : String(error);
    }
    treeStale = true;
    if (tab === "tree") renderTree();
  }

  const runSoon = debounce(run, 300);
  input.addEventListener("input", () => {
    compact = false;
    runSoon();
  });
  for (const el of [indentSel, sortSel, nested]) {
    el.addEventListener("change", () => {
      compact = false;
      run();
    });
  }
  tabs.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest("button[data-tab]");
    if (btn) setTab(/** @type {HTMLElement} */ (btn).dataset.tab);
  });

  must("[data-format]", root).addEventListener("click", () => {
    compact = false;
    run();
  });
  must("[data-compress]", root).addEventListener("click", () => {
    compact = true;
    run();
  });
  must("[data-uni]", root).addEventListener("click", () => {
    input.value = unicodeToText(input.value);
    compact = false;
    run();
  });
  must("[data-urldec]", root).addEventListener("click", () => {
    input.value = urlDecodeText(input.value);
    compact = false;
    run();
  });
  must("[data-sample]", root).addEventListener("click", () => {
    input.value = SAMPLE;
    compact = false;
    run();
  });
  must("[data-clear]", root).addEventListener("click", () => {
    input.value = "";
    run();
    input.focus();
  });
  must("[data-copy]", root).addEventListener("click", () => void copyText(out.value));
  must("[data-use]", root).addEventListener("click", () => {
    if (!out.value) return toast("没有可替换的结果", true);
    input.value = out.value;
    current.input = input.value;
  });
  renderPages();
  must("[data-download]", root).addEventListener("click", () => {
    if (!out.value) return toast("没有可下载的结果", true);
    downloadBlob(new Blob([out.value], { type: "application/json;charset=utf-8" }), "data.json");
  });
}
