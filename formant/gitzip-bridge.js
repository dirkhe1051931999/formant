import { isGitzipEnabled, loadFeatures } from "./features.js";

export const GITZIP_MENU_ROOT = "formant.gitzip.root";
export const GITZIP_MENU_SELECTED = "formant.gitzip.selected";
export const GITZIP_MENU_CURRENT = "formant.gitzip.current";
export const GITZIP_MENU_REPOSITORY = "formant.gitzip.repository";

/** Remove children before their parent. */
export const GITZIP_MENU_IDS = [
  GITZIP_MENU_SELECTED,
  GITZIP_MENU_CURRENT,
  GITZIP_MENU_REPOSITORY,
  GITZIP_MENU_ROOT,
];

const GITHUB_DOCUMENT_PATTERNS = ["*://github.com/*"];

/** @type {Map<number, { selectedCount: number, hasCurrent: boolean, currentLabel: string, repository: string }>} */
const tabStates = new Map();

/**
 * @param {chrome.contextMenus.CreateProperties} create
 * @param {import("./features.js").FormantFeatures} features
 */
export function addGitzipContextMenus(create, features) {
  if (!isGitzipEnabled(features)) return;
  create({
    id: GITZIP_MENU_ROOT,
    title: "formant GitZip",
    contexts: ["all"],
    documentUrlPatterns: GITHUB_DOCUMENT_PATTERNS,
  });
  create({
    id: GITZIP_MENU_SELECTED,
    parentId: GITZIP_MENU_ROOT,
    title: "下载已选项",
    contexts: ["all"],
    documentUrlPatterns: GITHUB_DOCUMENT_PATTERNS,
    enabled: false,
  });
  create({
    id: GITZIP_MENU_CURRENT,
    parentId: GITZIP_MENU_ROOT,
    title: "下载当前文件或目录",
    contexts: ["all"],
    documentUrlPatterns: GITHUB_DOCUMENT_PATTERNS,
    enabled: false,
  });
  create({
    id: GITZIP_MENU_REPOSITORY,
    parentId: GITZIP_MENU_ROOT,
    title: "下载整个仓库",
    contexts: ["all"],
    documentUrlPatterns: GITHUB_DOCUMENT_PATTERNS,
    enabled: false,
  });
}

/**
 * @param {string} value
 */
function menuLabel(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * @param {string} id
 * @param {chrome.contextMenus.UpdateProperties} update
 */
function updateMenu(id, update) {
  chrome.contextMenus.update(id, update, () => {
    // A page can report state while the feature switch is rebuilding menus.
    // The next state report or rebuild restores the desired item.
    void chrome.runtime.lastError;
  });
}

/**
 * @param {unknown} raw
 * @param {chrome.runtime.MessageSender} sender
 */
export function updateGitzipContextState(raw, sender) {
  const tabId = sender.tab?.id;
  const tabUrl = sender.tab?.url || "";
  if (!tabId || !/^https?:\/\/github\.com\//i.test(tabUrl)) return;
  const source = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  if (source.enabled === false) {
    tabStates.delete(tabId);
    updateMenu(GITZIP_MENU_SELECTED, { enabled: false, title: "下载已选项" });
    updateMenu(GITZIP_MENU_CURRENT, { enabled: false, title: "下载当前文件或目录" });
    updateMenu(GITZIP_MENU_REPOSITORY, { enabled: false, title: "下载整个仓库" });
    return;
  }

  const selectedCount = Math.max(0, Math.floor(Number(source.selectedCount) || 0));
  const hasCurrent = Boolean(source.hasCurrent);
  const currentLabel = menuLabel(source.currentLabel);
  const repository = menuLabel(source.repository);
  tabStates.set(tabId, { selectedCount, hasCurrent, currentLabel, repository });

  updateMenu(GITZIP_MENU_SELECTED, {
    enabled: selectedCount > 0,
    title: selectedCount ? `下载已选 ${selectedCount} 项` : "下载已选项",
  });
  updateMenu(GITZIP_MENU_CURRENT, {
    enabled: hasCurrent,
    title: currentLabel ? `下载当前：${currentLabel}` : "下载当前文件或目录",
  });
  updateMenu(GITZIP_MENU_REPOSITORY, {
    enabled: hasCurrent,
    title: repository ? `下载整个仓库：${repository}` : "下载整个仓库",
  });
}

/**
 * Static content scripts do not re-run in an already open page after an
 * extension reload. Inject the public-only runtime on demand for a menu click.
 * @param {number} tabId
 */
async function ensureGitzipContent(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "FORMANT_GITZIP_GET_STATE" });
    return;
  } catch {
    // Continue with a one-time injection for this matching GitHub tab.
  }
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["gitzip/content/main.css"],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [
      "gitzip/content/bootstrap.js",
      "gitzip/content/github-url.js",
      "gitzip/content/zip.js",
      "gitzip/content/dashboard.js",
      "gitzip/content/main.js",
    ],
  });
}

/**
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab | undefined} tab
 * @returns {Promise<boolean>}
 */
export async function handleGitzipContextMenu(info, tab) {
  const id = String(info.menuItemId || "");
  const mode =
    id === GITZIP_MENU_SELECTED
      ? "selected"
      : id === GITZIP_MENU_CURRENT
        ? "current"
        : id === GITZIP_MENU_REPOSITORY
          ? "repository"
          : "";
  if (!mode) return false;
  if (!tab?.id || !/^https?:\/\/github\.com\//i.test(tab.url || "")) return true;
  if (!isGitzipEnabled(await loadFeatures())) return true;

  await ensureGitzipContent(tab.id);
  await chrome.tabs.sendMessage(tab.id, {
    type: "FORMANT_GITZIP_DOWNLOAD",
    mode,
  });
  return true;
}

/**
 * Restores dynamic item labels after a service-worker wakeup or menu rebuild.
 * @param {chrome.tabs.Tab | undefined} tab
 */
export async function refreshGitzipContextState(tab) {
  if (!tab?.id || !/^https?:\/\/github\.com\//i.test(tab.url || "")) return;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "FORMANT_GITZIP_GET_STATE" });
    updateGitzipContextState(response?.state, /** @type {chrome.runtime.MessageSender} */ ({ tab }));
  } catch {
    try {
      if (!isGitzipEnabled(await loadFeatures())) return;
      await ensureGitzipContent(tab.id);
      const response = await chrome.tabs.sendMessage(tab.id, { type: "FORMANT_GITZIP_GET_STATE" });
      updateGitzipContextState(response?.state, /** @type {chrome.runtime.MessageSender} */ ({ tab }));
    } catch {
      updateMenu(GITZIP_MENU_SELECTED, { enabled: false, title: "下载已选项" });
    }
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void chrome.tabs.get(tabId).then(refreshGitzipContextState).catch(() => {});
});
