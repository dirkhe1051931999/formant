import { escapeHtml, must, toast } from "./tools-dom.js";
import {
  CATEGORIES,
  assertPublicHttp,
  formatWhen,
  lhHref,
  loadReports,
  parseLhHash,
  pagespeedLink,
  pickHttpTab,
  removeReport,
  runPsi,
  saveReport,
  scoreTone,
} from "./tools-lighthouse-lib.js";
import { mountLighthouseReport } from "./tools-lighthouse-report.js";

/**
 * @param {HTMLElement} root
 */
export function mount(root) {
  root.innerHTML = `
    <header class="tl-head">
      <div>
        <h2>Lighthouse</h2>
      </div>
      <div class="tl-row" data-head></div>
    </header>
    <div data-view></div>
  `;

  const viewEl = must("[data-view]", root);
  const headEl = must("[data-head]", root);
  const titleEl = must("h2", root);
  let paintTick = 0;
  let view = "list";
  let viewId = "";

  function setTitle(text) {
    const ico = titleEl.querySelector(".tl-ico");
    titleEl.textContent = text;
    if (ico) titleEl.prepend(ico);
  }

  function setHead(listMode) {
    headEl.textContent = "";
    if (!listMode) {
      const back = document.createElement("a");
      back.className = "tl-btn tl-btn--ghost";
      back.href = lhHref("list");
      back.textContent = "返回列表";
      headEl.appendChild(back);
      return;
    }
    const a = document.createElement("a");
    a.className = "tl-btn";
    a.href = lhHref("new");
    a.textContent = "新建测评";
    headEl.appendChild(a);
  }

  function renderList(reports) {
    setTitle("Lighthouse");
    setHead(true);
    if (!reports.length) {
      viewEl.innerHTML = `
        <section class="tl-card">
          <p class="tl-note">还没有报告。对公开网页跑一次 PSI 测评（不能测本机或需登录的页面）。</p>
          <a class="tl-btn" href="${lhHref("new")}">新建测评</a>
        </section>`;
      return;
    }
    viewEl.innerHTML = `<section class="tl-card lh-list" data-list></section>`;
    const list = must("[data-list]", viewEl);
    list.innerHTML = reports
      .map((item) => {
        const pills = CATEGORIES.map((cat) => {
          const value = item.scores?.[cat.id];
          return `<span class="lh-score lh-score--${scoreTone(value)}">${escapeHtml(cat.label)} ${value == null ? "—" : value}</span>`;
        }).join("");
        return `<article class="us-item" data-id="${escapeHtml(item.id)}">
          <div class="us-item__body">
            <strong>${escapeHtml(hostOf(item.finalUrl || item.url))}</strong>
            <p>${escapeHtml(item.finalUrl || item.url)}</p>
            <div class="lh-scores">${pills}</div>
            <span class="tl-meta">${item.strategy === "desktop" ? "桌面" : "手机"} · ${escapeHtml(formatWhen(item.fetchedAt))}</span>
          </div>
          <div class="us-item__ops">
            <a class="tl-btn tl-btn--ghost" href="${lhHref("view", item.id)}">查看</a>
            <button type="button" class="tl-btn tl-btn--ghost" data-del>删除</button>
          </div>
        </article>`;
      })
      .join("");
    list.addEventListener("click", (event) => {
      const btn = event.target instanceof HTMLElement ? event.target.closest("[data-del]") : null;
      if (!btn) return;
      const id = btn.closest(".us-item")?.getAttribute("data-id") || "";
      if (!id || !window.confirm("删除这份报告？")) return;
      void removeReport(id)
        .then(() => paint())
        .then(() => toast("已删除"))
        .catch((error) => toast(error instanceof Error ? error.message : String(error), true));
    });
  }

  function renderNew() {
    setTitle("新建测评");
    setHead(false);
    viewEl.innerHTML = `
      <section class="tl-card">
        <span class="tl-label">页面地址</span>
        <div class="tl-row">
          <input class="tl-input tl-input--grow" data-url placeholder="https://example.com" spellcheck="false" />
          <button type="button" class="tl-btn tl-btn--ghost" data-tab>当前页</button>
        </div>
        <span class="tl-label">设备</span>
        <div class="tl-row">
          <label class="tl-meta"><input type="radio" name="lh-device" value="mobile" checked /> 手机</label>
          <label class="tl-meta"><input type="radio" name="lh-device" value="desktop" /> 桌面</label>
        </div>
        <span class="tl-label">类别</span>
        <div class="tl-row" data-cats>
          ${CATEGORIES.map((item) => `<label class="tl-meta"><input type="checkbox" value="${item.id}" checked /> ${escapeHtml(item.label)}</label>`).join("")}
        </div>
        <div class="tl-row">
          <button type="button" class="tl-btn" data-run>开始测评</button>
          <span class="tl-meta" data-hint>先打开 PageSpeed 网页（与官方扩展相同）。能拉到分数时再写入右侧列表。</span>
        </div>
      </section>
    `;
    const urlEl = /** @type {HTMLInputElement} */ (must("[data-url]", viewEl));
    const hint = must("[data-hint]", viewEl);
    void pickHttpTab().then((tab) => {
      if (tab?.url && !urlEl.value) urlEl.value = tab.url;
    });
    must("[data-tab]", viewEl).addEventListener("click", () => {
      void pickHttpTab().then((tab) => {
        if (!tab?.url) {
          toast("没有可用的 http(s) 标签", true);
          return;
        }
        urlEl.value = tab.url;
      });
    });
    must("[data-run]", viewEl).addEventListener("click", () => {
      const categories = [...viewEl.querySelectorAll("[data-cats] input:checked")].map((el) =>
        /** @type {HTMLInputElement} */ (el).value,
      );
      const device = /** @type {HTMLInputElement | null} */ (viewEl.querySelector('input[name="lh-device"]:checked'));
      const runBtn = /** @type {HTMLButtonElement} */ (must("[data-run]", viewEl));
      runBtn.disabled = true;
      hint.textContent = "测评中…";
      void (async () => {
        const url = assertPublicHttp(urlEl.value.trim());
        const strategy = device?.value === "desktop" ? "desktop" : "mobile";
        const web = pagespeedLink(url, { strategy, categories });
        void chrome.tabs.create({ url: web });
        try {
          hint.textContent = "网页已打开，正在尝试把分数写入列表…";
          const report = await runPsi(url, { strategy, categories });
          await saveReport(report);
          toast("分数已写入列表");
          location.hash = lhHref("view", report.id);
        } catch (error) {
          const stub = {
            id: `web-${Date.now().toString(36)}`,
            url,
            finalUrl: url,
            strategy,
            categories,
            fetchedAt: Date.now(),
            scores: {},
            metrics: {},
            failed: [],
            webOnly: true,
          };
          await saveReport(stub);
          hint.textContent =
            error instanceof Error
              ? `${error.message} 已用网页版打开。`
              : "已用网页版打开。";
        }
      })()
        .catch((error) => {
          hint.textContent = error instanceof Error ? error.message : String(error);
          toast(error instanceof Error ? error.message : String(error), true);
        })
        .finally(() => {
          runBtn.disabled = false;
        });
    });
  }

  async function paint() {
    const mine = ++paintTick;
    const parsed = parseLhHash(location.hash);
    view = parsed.view;
    viewId = parsed.id;
    try {
      if (view === "new") {
        renderNew();
        return;
      }
      if (view === "view") {
        setTitle("测评报告");
        setHead(false);
        await mountLighthouseReport(viewEl, viewId);
        return;
      }
      const { reports } = await loadReports();
      if (mine !== paintTick) return;
      renderList(reports);
    } catch (error) {
      if (mine !== paintTick) return;
      viewEl.innerHTML = `<p class="tl-note tl-note--error">${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`;
    }
  }

  window.addEventListener("hashchange", () => void paint());
  void paint();
}

/**
 * @param {string} url
 */
function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
