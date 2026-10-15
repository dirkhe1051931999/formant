import { diffJson, diffText } from "./tools-diff-core.js";
import { escapeHtml, must, toast } from "./tools-dom.js";
import { parseJson, restoreBigInts, sortKeys } from "./tools-json-lib.js";

const EXAMPLES = {
  json: [
    '{"id":1001,"name":"张三","tags":["a","b"],"profile":{"city":"北京","age":28}}',
    '{"id":1001,"name":"张三丰","tags":["a","c","d"],"profile":{"city":"上海","age":28,"vip":true}}',
  ],
  text: ["第一行\n第二行\n第三行\n", "第一行\n第 2 行\n第三行\n第四行\n"],
};

const OP_LABEL = { add: "新增", remove: "删除", replace: "修改" };

/** @param {unknown} v */
function preview(v) {
  const s = restoreBigInts(JSON.stringify(v) ?? String(v));
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

/** @param {HTMLElement} root */
export function mount(root) {
  root.innerHTML = `
    <header class="tl-head">
      <div>
        <h2>JSON 对比</h2>
      </div>
    </header>
    <section class="tl-card">
      <div class="tl-row">
        <div class="tl-seg" data-mode>
          <button type="button" class="is-active" data-m="json">JSON 对比</button>
          <button type="button" data-m="text">纯文本</button>
        </div>
        <label class="tl-meta" data-sort-wrap><input type="checkbox" data-sort checked /> 忽略键顺序</label>
        <button type="button" class="tl-btn" data-run>对比</button>
        <button type="button" class="tl-btn tl-btn--ghost" data-format>格式化双侧</button>
        <button type="button" class="tl-btn tl-btn--ghost" data-example>示例</button>
        <button type="button" class="tl-btn tl-btn--ghost" data-clear>清空</button>
        <span class="tl-meta" data-status></span>
      </div>
      <p class="tl-error tl-meta" data-error></p>
    </section>
    <div class="df-sides" style="margin-top:12px">
      <textarea class="tl-textarea" data-left placeholder="左侧：原始内容" spellcheck="false"></textarea>
      <textarea class="tl-textarea" data-right placeholder="右侧：对比内容" spellcheck="false"></textarea>
    </div>
    <section class="tl-card df-summary" data-summary hidden></section>
    <div class="df-view" data-view hidden>
      <pre class="df-code" data-code-left></pre>
      <pre class="df-code" data-code-right></pre>
    </div>`;

  const left = /** @type {HTMLTextAreaElement} */ (must("[data-left]", root));
  const right = /** @type {HTMLTextAreaElement} */ (must("[data-right]", root));
  const modeBar = must("[data-mode]", root);
  const sortWrap = must("[data-sort-wrap]", root);
  const sortBox = /** @type {HTMLInputElement} */ (must("[data-sort]", root));
  const statusEl = must("[data-status]", root);
  const errorEl = must("[data-error]", root);
  const summary = must("[data-summary]", root);
  const view = must("[data-view]", root);
  const codeL = must("[data-code-left]", root);
  const codeR = must("[data-code-right]", root);
  let mode = "json";

  function setMode(next) {
    mode = next;
    for (const b of modeBar.querySelectorAll("button")) b.classList.toggle("is-active", b.dataset.m === next);
    sortWrap.hidden = next !== "json";
    clearResult();
  }
  modeBar.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest("button[data-m]");
    if (btn) setMode(/** @type {HTMLElement} */ (btn).dataset.m);
  });

  function clearResult() {
    summary.hidden = true;
    view.hidden = true;
    statusEl.textContent = "";
    errorEl.textContent = "";
  }

  /** @param {HTMLElement} pre @param {import("./tools-diff-core.js").DiffCell[]} cells */
  function paint(pre, cells) {
    pre.textContent = "";
    const frag = document.createDocumentFragment();
    for (const cell of cells) {
      const span = document.createElement("span");
      span.className = `df-line${cell.type === "add" ? " df-line--add" : cell.type === "del" ? " df-line--del" : cell.type === "pad" ? " df-line--pad" : ""}`;
      span.textContent = cell.text || "\u200b";
      frag.appendChild(span);
    }
    pre.appendChild(frag);
  }

  /** @param {string} src @param {string} side */
  function normalize(src, side) {
    try {
      const value = parseJson(src);
      return { value, text: restoreBigInts(JSON.stringify(sortBox.checked ? sortKeys(value, 1) : value, null, 2)) };
    } catch (error) {
      throw new Error(`${side}：${error instanceof Error ? error.message : error}`);
    }
  }

  function run() {
    clearResult();
    if (!left.value.trim() && !right.value.trim()) return toast("请先在两侧填入内容", true);
    let a = left.value;
    let b = right.value;
    /** @type {import("./tools-diff-core.js").JsonChange[] | null} */
    let changes = null;
    if (mode === "json") {
      try {
        const na = normalize(a, "左侧");
        const nb = normalize(b, "右侧");
        a = na.text;
        b = nb.text;
        changes = diffJson(na.value, nb.value);
      } catch (error) {
        errorEl.textContent = error instanceof Error ? error.message : String(error);
        return;
      }
    }
    const result = diffText(a, b);
    paint(codeL, result.rows.map((r) => r.left));
    paint(codeR, result.rows.map((r) => r.right));
    view.hidden = false;
    const same = result.added === 0 && result.removed === 0;
    statusEl.textContent = same ? "两侧完全一致" : `新增 ${result.added} 行 · 删除 ${result.removed} 行`;
    statusEl.classList.toggle("tl-ok", same);

    if (changes && changes.length) {
      summary.hidden = false;
      summary.innerHTML = `<span class="tl-label">结构差异（${changes.length} 项）</span>${changes
        .slice(0, 300)
        .map((c) => {
          const detail =
            c.op === "replace"
              ? `<span class="tl-meta">${escapeHtml(preview(c.from))} → ${escapeHtml(preview(c.to))}${c.note ? `（${c.note}）` : ""}</span>`
              : `<span class="tl-meta">${escapeHtml(preview(c.op === "add" ? c.to : c.from))}</span>`;
          return `<div class="df-item"><span class="df-op df-op--${c.op}">${OP_LABEL[c.op]}</span><code>${escapeHtml(c.path)}</code>${detail}</div>`;
        })
        .join("")}${changes.length > 300 ? '<p class="tl-meta">仅显示前 300 项</p>' : ""}`;
    }
  }

  // 左右滚动联动
  let syncing = false;
  for (const [from, to] of [[codeL, codeR], [codeR, codeL]]) {
    from.addEventListener("scroll", () => {
      if (syncing) return;
      syncing = true;
      to.scrollTop = from.scrollTop;
      to.scrollLeft = from.scrollLeft;
      syncing = false;
    });
  }

  must("[data-run]", root).addEventListener("click", run);
  must("[data-format]", root).addEventListener("click", () => {
    if (mode !== "json") return toast("仅 JSON 模式可格式化", true);
    try {
      if (left.value.trim()) left.value = normalize(left.value, "左侧").text;
      if (right.value.trim()) right.value = normalize(right.value, "右侧").text;
      errorEl.textContent = "";
    } catch (error) {
      errorEl.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  must("[data-example]", root).addEventListener("click", () => {
    [left.value, right.value] = EXAMPLES[/** @type {"json" | "text"} */ (mode)];
    run();
  });
  must("[data-clear]", root).addEventListener("click", () => {
    left.value = "";
    right.value = "";
    clearResult();
  });
}
