import { loadFeeds, rememberFeed, saveFeeds } from "./sources-store.js";

export { loadFeeds, rememberFeed };

/** @param {string} sel @param {ParentNode} [root] */
const $ = (sel, root = document) => root.querySelector(sel);

/**
 * @param {string} text
 */
async function copyText(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {HTMLButtonElement} btn
 * @param {string} label
 */
function markCopied(btn, label) {
  btn.title = "已复制";
  btn.setAttribute("aria-label", "已复制");
  window.setTimeout(() => {
    btn.title = label;
    btn.setAttribute("aria-label", label);
  }, 1200);
}

/**
 * @param {{
 *   onOpenFeed: (url: string) => void,
 *   getListUrl: () => string,
 *   getPlayUrl: () => string,
 *   getRaw: () => string,
 *   getSourceLabel: () => string,
 *   onNextSource: () => void,
 * }} hooks
 */
export function bindPanels(hooks) {
  const rawBtn = /** @type {HTMLButtonElement} */ ($("#rawBtn"));
  const feedsBtn = /** @type {HTMLButtonElement} */ ($("#feedsBtn"));
  const rawPanel = /** @type {HTMLElement} */ ($("#rawPanel"));
  const feedsPanel = /** @type {HTMLElement} */ ($("#feedsPanel"));
  const rawText = /** @type {HTMLElement} */ ($("#rawText"));
  const rawClose = /** @type {HTMLButtonElement} */ ($("#rawClose"));
  const rawCopy = /** @type {HTMLButtonElement} */ ($("#rawCopy"));
  const feedsClose = /** @type {HTMLButtonElement} */ ($("#feedsClose"));
  const feedsForm = /** @type {HTMLFormElement} */ ($("#feedsForm"));
  const feedsInput = /** @type {HTMLInputElement} */ ($("#feedsInput"));
  const feedsList = /** @type {HTMLElement} */ ($("#feedsList"));
  const listUrlEl = /** @type {HTMLElement} */ ($("#listUrlView"));
  const playUrlEl = /** @type {HTMLElement} */ ($("#playUrlView"));
  const nextSrcBtn = /** @type {HTMLButtonElement} */ ($("#nextSrcBtn"));
  const listCopy = /** @type {HTMLButtonElement} */ ($("#listUrlCopy"));
  const playCopy = /** @type {HTMLButtonElement} */ ($("#playUrlCopy"));

  function close() {
    rawPanel.hidden = true;
    feedsPanel.hidden = true;
  }

  function paintInfo() {
    const listUrl = hooks.getListUrl() || "";
    const playUrl = hooks.getPlayUrl() || "";
    listUrlEl.textContent = listUrl || "没有列表地址";
    listUrlEl.title = listUrl;
    playUrlEl.textContent = playUrl || "没有播放地址";
    playUrlEl.title = playUrl;
    listCopy.disabled = !listUrl;
    playCopy.disabled = !playUrl;
    nextSrcBtn.hidden = !hooks.getSourceLabel();
    nextSrcBtn.textContent = hooks.getSourceLabel() || "切源";
    rawBtn.hidden = !hooks.getRaw();
  }

  async function paintFeeds() {
    const items = await loadFeeds();
    const current = hooks.getListUrl();
    feedsList.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "sheet__empty";
      empty.textContent = "还没有保存的 m3u / txt。也可在工具箱 → HLS 里添加。";
      feedsList.appendChild(empty);
      return;
    }
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "sheet__row";
      if (item.url === current) row.classList.add("is-on");
      const open = document.createElement("button");
      open.type = "button";
      open.className = "sheet__open";
      open.textContent = item.name || item.url;
      open.title = item.url;
      open.addEventListener("click", () => {
        close();
        hooks.onOpenFeed(item.url);
      });
      const del = document.createElement("button");
      del.type = "button";
      del.className = "sheet__del";
      del.textContent = "删";
      del.addEventListener("click", async () => {
        const next = (await loadFeeds()).filter((feed) => feed.url !== item.url);
        await saveFeeds(next);
        void paintFeeds();
      });
      row.append(open, del);
      feedsList.appendChild(row);
    }
  }

  rawBtn.addEventListener("click", () => {
    rawText.textContent = hooks.getRaw() || "";
    rawPanel.hidden = false;
    feedsPanel.hidden = true;
  });
  rawClose.addEventListener("click", () => {
    rawPanel.hidden = true;
  });
  rawCopy.addEventListener("click", () => {
    void copyText(hooks.getRaw());
  });
  feedsBtn.addEventListener("click", () => {
    feedsPanel.hidden = !feedsPanel.hidden;
    rawPanel.hidden = true;
    if (!feedsPanel.hidden) void paintFeeds();
  });
  feedsClose.addEventListener("click", () => {
    feedsPanel.hidden = true;
  });
  feedsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = feedsInput.value.trim();
    if (!/^https?:\/\//i.test(url)) return;
    await rememberFeed(url);
    feedsInput.value = "";
    void paintFeeds();
    hooks.onOpenFeed(url);
    close();
  });
  nextSrcBtn.addEventListener("click", () => {
    hooks.onNextSource();
  });
  listCopy.addEventListener("click", async () => {
    if (await copyText(hooks.getListUrl())) markCopied(listCopy, "复制列表");
  });
  playCopy.addEventListener("click", async () => {
    if (await copyText(hooks.getPlayUrl())) markCopied(playCopy, "复制播放");
  });

  return { paintInfo, paintFeeds, close, rememberFeed };
}
