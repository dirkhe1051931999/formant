export const QR_MENU_PAGE = "formant-page-qr";

/** Remove children before their parent. */
export const QR_MENU_IDS = [QR_MENU_PAGE];

const PAGE_PATTERNS = ["http://*/*", "https://*/*"];

/**
 * @param {(props: chrome.contextMenus.CreateProperties) => void} create
 */
export function addQrContextMenus(create) {
  create({
    id: QR_MENU_PAGE,
    title: "为此网站生成二维码",
    contexts: ["page"],
    documentUrlPatterns: PAGE_PATTERNS,
  });
}

/**
 * @param {number} tabId
 */
async function ensureQrOverlay(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["tools/vendor/qrcode.js", "qr-overlay.js"],
  });
}

/**
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab | undefined} tab
 */
export async function handleQrContextMenu(info, tab) {
  if (info.menuItemId !== QR_MENU_PAGE) return false;
  const url = String(info.pageUrl || tab?.url || "").trim();
  const title = String(tab?.title || "").trim();
  if (!tab?.id || !/^https?:\/\//i.test(url)) return true;

  try {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "FORMANT_SHOW_QR", url, title });
      return true;
    } catch {
      // Overlay script is not injected into this tab yet.
    }
    await ensureQrOverlay(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: "FORMANT_SHOW_QR", url, title });
  } catch (error) {
    console.warn("[formant] show page qr failed", error);
  }
  return true;
}
