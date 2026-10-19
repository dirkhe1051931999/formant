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
      </div>
      <p class="tl-meta" data-hint>公开目录，安装后脚本在本机运行。请只装你信任的脚本。</p>
    </section>
    <section class="tl-card us-search" data-list></section>
  `;

  const qEl = /** @type {HTMLInputElement} */ (must("[data-q]", root));
  const hint = must("[data-hint]", root);
  const list = must("[data-list]", root);
  let busy = false;

  /**
   * @param {string} q
   * @param {string} site
   */
  async function search(q, site) {
    if (busy) return;
    busy = true;
    hint.textContent = "搜索中…";
    list.innerHTML = "";
    try {
      const res = await usSend("FORMANT_US_SEARCH", { q, site });
      const items = Array.isArray(res.items) ? res.items : [];
      hint.textContent = items.length ? `找到 ${items.length} 条` : "没有结果";
      if (!items.length) {
        list.innerHTML = `<p class="tl-note">没有匹配的脚本。</p>`;
        return;
      }
      list.innerHTML = items
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
