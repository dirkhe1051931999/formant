import { escapeHtml, must, toast } from "./tools-dom.js";
import {
  DEFAULT_ENGINE,
  ENGINES,
  MAIN_IDS,
  clearRecent,
  loadRecent,
  looksLikeCreditCode,
  normalizeQuery,
  pushRecent,
  searchUrl,
} from "./tools-company-lib.js";

/**
 * 当前窗口里正在看的 http(s) 页（工具箱自己不算）。
 * @returns {Promise<chrome.tabs.Tab | null>}
 */
async function pickHttpTab() {
  try {
    const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
    const http = tabs
      .filter((t) => t.id && /^https?:/i.test(t.url || ""))
      .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    if (http[0]) return http[0];
    const actives = await chrome.tabs.query({ active: true });
    return actives.find((t) => t.id && /^https?:/i.test(t.url || "")) || null;
  } catch {
    return null;
  }
}

/** @returns {Promise<string>} */
async function readPageSelection() {
  const tab = await pickHttpTab();
  if (!tab?.id) return "";
  try {
    const injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => (window.getSelection() ? window.getSelection().toString() : ""),
    });
    const text = injected && injected[0] && injected[0].result;
    return typeof text === "string" ? text.trim() : "";
  } catch {
    return "";
  }
}

/** @param {string} url */
function openTab(url) {
  void chrome.tabs.create({ url });
}

/** @param {HTMLElement} root */
export function mount(root) {
  root.innerHTML = `
    <header class="tl-head">
      <div>
        <h2>企业查询</h2>
      </div>
    </header>

    <section class="tl-card">
      <span class="tl-label">企业名称 / 统一社会信用代码</span>
      <div class="tl-row">
        <input class="tl-input tl-input--grow" data-q placeholder="如 华为技术有限公司，或 18 位信用代码" spellcheck="false" />
        <button type="button" class="tl-btn" data-go>天眼查</button>
        <button type="button" class="tl-btn tl-btn--ghost" data-main>常用四站</button>
      </div>
      <div class="tl-row">
        <button type="button" class="tl-btn tl-btn--ghost" data-sel>读当前页选区</button>
        <button type="button" class="tl-btn tl-btn--ghost" data-clear>清空</button>
        <span class="tl-meta" data-hint></span>
      </div>
    </section>

    <section class="tl-card">
      <span class="tl-label">检索站点（新标签打开，不经过 formant）</span>
      <div class="co-grid" data-engines></div>
    </section>

    <section class="tl-card">
      <span class="tl-label">最近查询</span>
      <div class="co-recent" data-recent></div>
      <div class="tl-row">
        <button type="button" class="tl-btn tl-btn--ghost" data-forget>清空最近</button>
        <span class="tl-meta">只存在本机，不同步、不含密钥。</span>
      </div>
    </section>`;

  const input = /** @type {HTMLInputElement} */ (must("[data-q]", root));
  const hint = must("[data-hint]", root);
  const enginesEl = must("[data-engines]", root);
  const recentEl = must("[data-recent]", root);

  enginesEl.innerHTML = ENGINES.map(
    (e) =>
      `<button type="button" class="co-engine" data-engine="${escapeHtml(e.id)}" title="${escapeHtml(e.hint)}">` +
      `<strong>${escapeHtml(e.name)}</strong><span>${escapeHtml(e.hint)}</span></button>`,
  ).join("");

  function paintHint() {
    const q = normalizeQuery(input.value);
    hint.textContent = q && looksLikeCreditCode(q) ? "识别为统一社会信用代码" : "";
  }

  /** @param {string[]} list */
  function paintRecent(list) {
    if (!list.length) {
      recentEl.innerHTML = `<span class="tl-meta">还没有记录</span>`;
      return;
    }
    recentEl.innerHTML = list
      .map((q) => `<button type="button" class="co-chip" data-word="${escapeHtml(q)}">${escapeHtml(q)}</button>`)
      .join("");
  }

  /** @param {string} id */
  async function search(id) {
    const q = normalizeQuery(input.value);
    if (!q) {
      toast("请先填写企业名称或信用代码", true);
      input.focus();
      return;
    }
    openTab(searchUrl(id, q));
    paintRecent(await pushRecent(q));
  }

  async function searchMain() {
    const q = normalizeQuery(input.value);
    if (!q) {
      toast("请先填写企业名称或信用代码", true);
      input.focus();
      return;
    }
    for (const id of MAIN_IDS) openTab(searchUrl(id, q));
    paintRecent(await pushRecent(q));
  }

  input.addEventListener("input", paintHint);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void search(DEFAULT_ENGINE);
    }
  });
  must("[data-go]", root).addEventListener("click", () => void search(DEFAULT_ENGINE));
  must("[data-main]", root).addEventListener("click", () => void searchMain());
  must("[data-clear]", root).addEventListener("click", () => {
    input.value = "";
    paintHint();
    input.focus();
  });
  must("[data-sel]", root).addEventListener("click", () => {
    void (async () => {
      const text = await readPageSelection();
      if (!text) {
        toast("当前页没有选中文字", true);
        return;
      }
      input.value = normalizeQuery(text);
      paintHint();
      toast("已填入选区");
    })();
  });
  must("[data-forget]", root).addEventListener("click", () => {
    void clearRecent().then(() => paintRecent([]));
  });
  enginesEl.addEventListener("click", (event) => {
    const btn = /** @type {HTMLElement} */ (event.target).closest("[data-engine]");
    if (btn) void search(btn.getAttribute("data-engine") || DEFAULT_ENGINE);
  });
  recentEl.addEventListener("click", (event) => {
    const chip = /** @type {HTMLElement} */ (event.target).closest("[data-word]");
    if (!chip) return;
    input.value = chip.getAttribute("data-word") || "";
    paintHint();
    input.focus();
  });

  void loadRecent().then((list) => {
    paintRecent(list);
    if (!input.value && list[0]) {
      input.value = list[0];
      paintHint();
    }
  });
  void (async () => {
    const text = await readPageSelection();
    if (text) {
      input.value = normalizeQuery(text);
      paintHint();
    }
  })();
  input.focus();
}
