import { METHODS } from "./tools-codec-lib.js";
import { copyText, debounce, escapeHtml, must } from "./tools-dom.js";

/** @param {HTMLElement} root */
export function mount(root) {
  const groupHtml = (group, title) => `
    <div class="cd-group-title">${title}</div>
    <div class="cd-methods">
      ${METHODS.filter((m) => m.group === group)
        .map((m) => `<button type="button" data-method="${m.id}" title="${escapeHtml(m.hint || "")}">${m.label}</button>`)
        .join("")}
    </div>`;

  root.innerHTML = `
    <header class="tl-head">
      <div>
        <h2>编码转换</h2>
      </div>
    </header>
    <section class="tl-card">
      <span class="tl-label">输入</span>
      <textarea class="tl-textarea" data-in placeholder="粘贴要编码 / 解码的内容" spellcheck="false"></textarea>
    </section>
    <section class="tl-card">
      <span class="tl-label">转换方式</span>
      ${groupHtml("encode", "编码 / 摘要")}
      ${groupHtml("decode", "解码 / 解析")}
      <div class="tl-row">
        <button type="button" class="tl-btn" data-run>转换</button>
        <button type="button" class="tl-btn tl-btn--ghost" data-use-out>结果作为输入</button>
        <button type="button" class="tl-btn tl-btn--ghost" data-clear>清空</button>
        <span class="tl-meta" data-hint></span>
      </div>
    </section>
    <section class="tl-card">
      <div class="tl-row">
        <span class="tl-label" style="margin:0">结果</span>
        <button type="button" class="tl-btn tl-btn--ghost" data-copy>复制结果</button>
      </div>
      <textarea class="tl-textarea" data-out readonly placeholder="等待转换"></textarea>
      <div data-table hidden></div>
    </section>`;

  const input = /** @type {HTMLTextAreaElement} */ (must("[data-in]", root));
  const out = /** @type {HTMLTextAreaElement} */ (must("[data-out]", root));
  const table = must("[data-table]", root);
  const hint = must("[data-hint]", root);
  const buttons = Array.from(root.querySelectorAll("button[data-method]"));
  let methodId = "base64Encode";
  let seq = 0;

  function mark() {
    for (const b of buttons) b.classList.toggle("is-active", /** @type {HTMLElement} */ (b).dataset.method === methodId);
    const method = METHODS.find((m) => m.id === methodId);
    hint.textContent = method?.hint ? `${method.label}：${method.hint}` : method?.label || "";
  }

  async function run() {
    const method = METHODS.find((m) => m.id === methodId);
    if (!method) return;
    const id = (seq += 1);
    out.hidden = false;
    table.hidden = true;
    if (!input.value) {
      out.value = "";
      return;
    }
    try {
      const result = await method.run(input.value);
      if (id !== seq) return;
      if (typeof result === "string") {
        out.value = result;
        return;
      }
      out.hidden = true;
      table.hidden = false;
      const info = (result.info || []).map((line) => `<p class="tl-meta">${escapeHtml(line)}</p>`).join("");
      const rows = result.table.rows
        .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
        .join("");
      table.innerHTML = `${info}<table class="cd-params"><thead><tr>${result.table.head
        .map((h) => `<th>${h}</th>`)
        .join("")}</tr></thead><tbody>${rows || '<tr><td colspan="9">没有参数</td></tr>'}</tbody></table>`;
      out.value = result.table.rows.map((r) => r.join("\t")).join("\n");
    } catch (error) {
      if (id !== seq) return;
      out.value = `转换失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  const runSoon = debounce(() => void run(), 150);

  root.addEventListener("click", (event) => {
    const btn = /** @type {HTMLElement} */ (event.target).closest("button[data-method]");
    if (!btn) return;
    methodId = /** @type {HTMLElement} */ (btn).dataset.method || methodId;
    mark();
    void run();
  });
  input.addEventListener("input", runSoon);
  must("[data-run]", root).addEventListener("click", () => void run());
  must("[data-use-out]", root).addEventListener("click", () => {
    if (!out.value) return;
    input.value = out.value;
    out.value = "";
    table.hidden = true;
    out.hidden = false;
  });
  must("[data-clear]", root).addEventListener("click", () => {
    input.value = "";
    out.value = "";
    table.hidden = true;
    out.hidden = false;
  });
  must("[data-copy]", root).addEventListener("click", () => void copyText(out.value));

  mark();
}
