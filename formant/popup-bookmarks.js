import { loadSettings } from "./sync.js";

/**
 * Bookmarks secondary view for popup.
 * @param {{ showView: (name: string) => void }} api
 */
export function initPopupBookmarks(api) {
  const statsEl = document.getElementById("stats");
  const statusEl = document.getElementById("status");
  const treeEl = document.getElementById("tree");
  const refreshBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("refreshBtn"));
  const syncBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("syncBtn"));
  const exportBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("exportBtn"));
  if (!statsEl || !statusEl || !treeEl || !refreshBtn || !syncBtn || !exportBtn) {
    return { loadBookmarks: async () => {} };
  }

  /** @type {chrome.bookmarks.BookmarkTreeNode[] | null} */
  let latestTree = null;

  /**
   * @param {chrome.bookmarks.BookmarkTreeNode[]} nodes
   */
  function countBookmarks(nodes) {
    let folders = 0;
    let links = 0;
    function walk(list) {
      for (const node of list) {
        if (node.url) links += 1;
        else {
          folders += 1;
          if (node.children?.length) walk(node.children);
        }
      }
    }
    walk(nodes);
    return { folders, links };
  }

  /**
   * @param {string} text
   * @param {"info" | "error" | "success"} [kind]
   */
  function setStatus(text, kind = "info") {
    if (!text) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.classList.remove("error", "success");
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = text;
    statusEl.classList.toggle("error", kind === "error");
    statusEl.classList.toggle("success", kind === "success");
  }

  /**
   * @param {chrome.bookmarks.BookmarkTreeNode} node
   */
  function renderNode(node) {
    const li = document.createElement("li");
    li.className = "item";
    const row = document.createElement("div");
    row.className = "node";
    const badge = document.createElement("span");
    badge.className = node.url ? "badge url" : "badge";
    const content = document.createElement("div");
    content.className = "content";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = node.title || (node.url ? "(无标题)" : "(未命名文件夹)");
    content.appendChild(title);
    if (node.url) {
      const link = document.createElement("a");
      link.className = "url";
      link.href = node.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = node.url;
      content.appendChild(link);
    }
    row.append(badge, content);
    li.appendChild(row);
    if (!node.url && node.children?.length) {
      const children = document.createElement("ul");
      for (const child of node.children) children.appendChild(renderNode(child));
      li.appendChild(children);
    }
    return li;
  }

  /**
   * @param {chrome.bookmarks.BookmarkTreeNode[]} tree
   */
  function renderTree(tree) {
    treeEl.replaceChildren();
    const roots = tree[0]?.children ?? tree;
    if (!roots.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "没有收藏夹内容";
      treeEl.appendChild(empty);
      return;
    }
    for (const node of roots) treeEl.appendChild(renderNode(node));
  }

  async function loadBookmarks() {
    refreshBtn.disabled = true;
    exportBtn.disabled = true;
    statsEl.textContent = "加载中…";
    setStatus("");
    try {
      const tree = await chrome.bookmarks.getTree();
      latestTree = tree;
      const { folders, links } = countBookmarks(tree);
      statsEl.textContent = `${links} 个链接 · ${folders} 个文件夹`;
      renderTree(tree);
      exportBtn.disabled = false;
    } catch (error) {
      latestTree = null;
      statsEl.textContent = "读取失败";
      setStatus(error instanceof Error ? error.message : String(error), "error");
      treeEl.replaceChildren();
    } finally {
      refreshBtn.disabled = false;
    }
  }

  function exportJson() {
    if (!latestTree) {
      setStatus("没有可导出的数据", "error");
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      source: "formant",
      tree: latestTree,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bookmarks-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  refreshBtn.addEventListener("click", () => {
    void loadBookmarks();
  });
  exportBtn.addEventListener("click", exportJson);
  syncBtn.addEventListener("click", async () => {
    syncBtn.disabled = true;
    setStatus("同步中…");
    try {
      const settings = await loadSettings();
      if (!settings.baseUrl || !settings.clientKey) {
        throw new Error("请先在扩展设置 → 同步 中填写 mono 连接");
      }
      const response = await chrome.runtime.sendMessage({ type: "SYNC_NOW" });
      if (!response?.ok) throw new Error(response?.error || "同步失败");
      const result = response.result;
      setStatus(
        `同步完成：上传 ${result.itemCount} · 新增 ${result.inserted} · 跳过 ${result.skipped}`,
        "success",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), "error");
    } finally {
      syncBtn.disabled = false;
    }
  });

  document.getElementById("bookmarksNavBtn")?.addEventListener("click", () => api.showView("bookmarks"));
  document.getElementById("backTranslateBtn")?.addEventListener("click", () => api.showView("translate"));

  return { loadBookmarks };
}
