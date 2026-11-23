import { escapeHtml, must, toast } from "./tools-dom.js";
import { usSend, userscriptHref } from "./tools-userscript-lib.js";

/**
 * @param {HTMLElement} root
 * @param {{ host?: string }} [opt]
 */
export function mountUserscriptSearch(root, opt = {}) {
  root.innerHTML = `
    <section class="tl-card">
      <span class="tl-label">Greasy Fork</span>
      <div class="tl-row">
        <input class="tl-input tl-input--grow" data-q placeholder="搜索脚本名称或关键字" />
        <button type="button" class="tl-btn" data-go>搜索</button>
        <button type="button" class="tl-btn tl-btn--ghost" data-site ${opt.host ? "" : "hidden"}>当前站</button>
        <select class="tl-select" data-sort aria-label="搜索结果排序">
          <option value="">默认排序</option>
          <option value="dailyInstalls:desc">今日安装从高到低</option>
          <option value="dailyInstalls:asc">今日安装从低到高</option>
          <option value="totalInstalls:desc">累计安装从高到低</option>
          <option value="totalInstalls:asc">累计安装从低到高</option>
        </select>
      </div>
      <p class="tl-meta" data-hint>公开目录，安装后脚本在本机运行。请只装你信任的脚本。</p>
    </section>
    <section class="tl-card us-search" data-list></section>
  `;

  const qEl = /** @type {HTMLInputElement} */ (must("[data-q]", root));
  const sortEl = /** @type {HTMLSelectElement} */ (must("[data-sort]", root));
  const hint = must("[data-hint]", root);
  const list = must("[data-list]", root);
  /** @type {{ node: HTMLElement, dailyInstalls: number, totalInstalls: number }[]} */
  let results = [];
  let busy = false;

  function renderResults() {
    if (!results.length) return;
    const [field, direction] = sortEl.value.split(":");
    const sorted = field === "dailyInstalls" || field === "totalInstalls"
      ? [...results].sort((a, b) => direction === "asc" ? a[field] - b[field] : b[field] - a[field])
      : results;
    const visible = sorted.slice(0, 40);
    hint.textContent = visible.length < results.length
      ? `显示 ${visible.length} 条，本批返回 ${results.length} 条`
      : `找到 ${visible.length} 条`;
    list.replaceChildren(...visible.map(({ node }) => node));
  }

  /**
   * @param {string} q
   * @param {string} site
   */
  async function search(q, site) {
    if (busy) return;
    busy = true;
    results = [];
    hint.textContent = "搜索中…";
    list.innerHTML = "";
    try {
      const res = await usSend("FORMANT_US_SEARCH", { q, site });
      const items = Array.isArray(res.items) ? res.items : [];
      if (!items.length) {
        hint.textContent = "没有结果";
        list.innerHTML = `<p class="tl-note">没有匹配的脚本。</p>`;
        return;
      }
      const template = document.createElement("template");
      template.innerHTML = items
        .map(
          (item) => `<article class="us-item" data-code="${escapeHtml(item.codeUrl || "")}">
            <div class="us-item__body">
              <strong>${escapeHtml(item.name)}</strong>
              <p>${escapeHtml(item.description || "")}</p>
              <span class="tl-meta">v${escapeHtml(item.version || "-")} · 今日 ${item.dailyInstalls || 0} · 累计 ${item.totalInstalls || 0}</span>
            </div>
            <div class="us-item__ops">
              <a class="tl-btn tl-btn--ghost" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">主页</a>
              <button type="button" class="tl-btn" data-install>安装</button>
            </div>
          </article>`,
        )
        .join("");
      results = Array.from(template.content.children, (node, index) => ({
        node: /** @type {HTMLElement} */ (node),
        dailyInstalls: Number(items[index].dailyInstalls) || 0,
        totalInstalls: Number(items[index].totalInstalls) || 0,
      }));
      renderResults();
    } catch (error) {
      hint.textContent = "";
      toast(error instanceof Error ? error.message : String(error), true);
    } finally {
      busy = false;
    }
  }

  async function install(codeUrl) {
    const fetched = await usSend("FORMANT_US_FETCH", { url: codeUrl });
    await usSend("FORMANT_US_SAVE", { source: fetched.source, installUrl: codeUrl });
    toast("已安装，已打开的页面请刷新");
    location.hash = userscriptHref("list");
  }

  must("[data-go]", root).addEventListener("click", () => {
    void search(qEl.value.trim(), "");
  });
  qEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void search(qEl.value.trim(), "");
    }
  });
  const siteBtn = root.querySelector("[data-site]");
  sortEl.addEventListener("change", renderResults);
  siteBtn?.addEventListener("click", () => {
    void search("", opt.host || "");
  });
  list.addEventListener("click", (event) => {
    const btn = event.target instanceof HTMLElement ? event.target.closest("[data-install]") : null;
    if (!btn) return;
    const row = btn.closest(".us-item");
    const codeUrl = row?.getAttribute("data-code") || "";
    if (!codeUrl) return;
    btn.setAttribute("disabled", "true");
    void install(codeUrl).catch((error) => {
      btn.removeAttribute("disabled");
      toast(error instanceof Error ? error.message : String(error), true);
    });
  });

  if (opt.host) void search("", opt.host);
}
