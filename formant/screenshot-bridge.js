import { isScreenshotEnabled, loadFeatures } from "./features.js";
import {
  downloadScreenshot,
  downloadViaPage,
  screenshotFilename,
  stitchSlices,
  visibleToBlob,
} from "./screenshot-compose.js";

export const SCREENSHOT_MENU_ROOT = "formant-screenshot-root";
export const SCREENSHOT_MENU_VISIBLE = "formant-screenshot-visible";
export const SCREENSHOT_MENU_FULL = "formant-screenshot-full";

/** Remove children before their parent. */
export const SCREENSHOT_MENU_IDS = [
  SCREENSHOT_MENU_VISIBLE,
  SCREENSHOT_MENU_FULL,
  SCREENSHOT_MENU_ROOT,
];

const PAGE_PATTERNS = ["http://*/*", "https://*/*"];
const MAX_SLICES = 80;
const SETTLE_MS = 200;

/** @type {Promise<void> | null} */
let running = null;

/**
 * @param {chrome.contextMenus.CreateProperties} create
 * @param {import("./features.js").FormantFeatures} features
 */
export function addScreenshotContextMenus(create, features) {
  if (!isScreenshotEnabled(features)) return;
  create({
    id: SCREENSHOT_MENU_FULL,
    title: "formant 整页滚动截屏",
    contexts: ["page", "frame", "editable", "selection", "image", "link"],
    documentUrlPatterns: PAGE_PATTERNS,
  });
  create({
    id: SCREENSHOT_MENU_VISIBLE,
    title: "formant 截取可见区域",
    contexts: ["page", "frame", "editable", "selection", "image", "link"],
    documentUrlPatterns: PAGE_PATTERNS,
  });
}

/**
 * @param {string} url
 */
function isHttpTab(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * @param {string} message
 */
async function notify(message) {
  try {
    await chrome.notifications.create("formant-screenshot", {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "formant 截屏",
      message,
    });
  } catch (error) {
    console.warn("[formant] screenshot notify failed", error);
  }
}

/**
 * @param {number} tabId
 * @param {string} msg
 */
async function toastOnPage(tabId, msg) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (text) => {
        const id = "formant-screenshot-toast";
        document.getElementById(id)?.remove();
        const el = document.createElement("div");
        el.id = id;
        el.textContent = text;
        el.style.cssText =
          "position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:min(320px,calc(100vw - 32px));padding:12px 14px;border-radius:10px;background:rgba(21,26,34,.92);color:#fff;font:12px/1.45 Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;box-shadow:0 8px 24px rgba(21,26,34,.28);";
        document.documentElement.append(el);
        setTimeout(() => el.remove(), 5000);
      },
      args: [msg],
    });
  } catch (error) {
    console.warn("[formant] screenshot toast failed", error);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {number} tabId
 */
async function ensureContent(tabId) {
  const ping = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => Boolean(globalThis.__formantScreenshot),
  });
  if (ping?.[0]?.result) return;
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["screenshot/content/main.js"],
  });
}

/**
 * @param {number} tabId
 * @param {string} cmd
 * @param {Record<string, unknown>} [payload]
 */
async function pageCall(tabId, cmd, payload) {
  await ensureContent(tabId);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (c, p) => {
      const api = globalThis.__formantScreenshot;
      if (!api) return Promise.resolve({ ok: false, error: "截屏脚本未就绪" });
      return api(c, p);
    },
    args: [cmd, payload || null],
  });
  const result = results?.[0]?.result;
  if (!result) throw new Error("页面没有返回截屏结果");
  if (result.ok === false) throw new Error(result.error || "页面操作失败");
  return result;
}

/**
 * @param {number} windowId
 * @returns {Promise<string>}
 */
function captureVisible(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      const err = chrome.runtime.lastError?.message;
      if (err || !dataUrl) {
        reject(new Error(err || "截取当前画面失败"));
        return;
      }
      resolve(dataUrl);
    });
  });
}

/**
 * @param {number} tabId
 * @param {number} windowId
 */
async function captureTab(tabId, windowId) {
  await pageCall(tabId, "overlay", { visible: false });
  await sleep(SETTLE_MS);
  return captureVisible(windowId);
}

/**
 * @param {number} tabId
 * @param {Blob} blob
 * @param {string} filename
 */
async function saveBlob(tabId, blob, filename) {
  try {
    await downloadScreenshot(blob, filename);
  } catch (error) {
    console.warn("[formant] screenshot downloads API failed, try page save", error);
    await downloadViaPage(tabId, blob, filename);
  }
}

/**
 * @param {chrome.tabs.Tab} tab
 * @param {"full" | "visible"} mode
 * @param {string} pageUrl
 */
async function runCapture(tab, mode, pageUrl) {
  const tabId = tab.id;
  const windowId = tab.windowId;
  if (!tabId || windowId == null) throw new Error("找不到当前标签");
  const url = tab.url || pageUrl || "";
  if (url && !isHttpTab(url)) throw new Error("只能截 http / https 网页，系统页和扩展页不行");

  await ensureContent(tabId);
  const prepared = await pageCall(tabId, "prepare", { mode });
  const metrics = prepared.metrics;
  if (!metrics) throw new Error("无法读取页面尺寸");
  const filename = screenshotFilename(metrics.title);

  try {
    if (mode === "visible") {
      const dataUrl = await captureTab(tabId, windowId);
      const blob = await visibleToBlob(dataUrl);
      await pageCall(tabId, "finish");
      await saveBlob(tabId, blob, filename);
      return;
    }

    const viewport = Math.max(1, Number(metrics.viewportHeight) || 1);
    const pageHeight = Math.max(viewport, Number(metrics.scrollHeight) || viewport);
    const total = Math.min(MAX_SLICES, Math.max(1, Math.ceil(pageHeight / viewport)));
    /** @type {{ dataUrl: string, top: number }[]} */
    const slices = [];
    let top = 0;
    let lastTop = -1;

    for (let i = 0; i < total; i += 1) {
      const scrolled = await pageCall(tabId, "scroll", { top, hideFixed: i > 0 });
      if (scrolled.cancelled) throw new Error("已取消");

      const actualTop = Number(scrolled.top);
      if (!Number.isFinite(actualTop)) throw new Error("读不到滚动位置");
      if (actualTop === lastTop && i > 0) break;
      lastTop = actualTop;

      await pageCall(tabId, "overlay", {
        text: `正在截屏 ${i + 1} / ${total}`,
        current: i + 1,
        total,
      });
      const dataUrl = await captureTab(tabId, windowId);
      slices.push({ dataUrl, top: actualTop });

      const next = actualTop + viewport;
      if (next >= pageHeight - 2) break;
      top = next;
    }

    await pageCall(tabId, "overlay", { text: "正在拼接…", current: total, total });
    const blob = await stitchSlices(slices, metrics);
    await pageCall(tabId, "finish");
    await saveBlob(tabId, blob, filename);
  } finally {
    try {
      await pageCall(tabId, "finish");
    } catch {
      // tab may have navigated
    }
  }
}

/**
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab | undefined} tab
 */
export async function handleScreenshotContextMenu(info, tab) {
  const id = String(info.menuItemId || "");
  const mode =
    id === SCREENSHOT_MENU_VISIBLE
      ? "visible"
      : id === SCREENSHOT_MENU_FULL || id === SCREENSHOT_MENU_ROOT
        ? "full"
        : "";
  if (!mode) return false;

  const features = await loadFeatures();
  if (!isScreenshotEnabled(features)) return true;

  let current = tab;
  if (!current?.id) {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    current = active;
  }
  if (!current?.id) {
    await notify("找不到当前标签");
    return true;
  }
  if (running) {
    await toastOnPage(current.id, "已有截屏在进行");
    await notify("已有截屏在进行");
    return true;
  }

  const pageUrl = current.url || info.pageUrl || info.frameUrl || "";
  running = runCapture(current, mode, pageUrl)
    .catch(async (error) => {
      const text = error instanceof Error ? error.message : String(error);
      console.warn("[formant] screenshot failed", error);
      if (text === "已取消") return;
      try {
        await pageCall(current.id, "error", { text: `截屏失败：${text}` });
        await sleep(1600);
      } catch {
        await toastOnPage(current.id, `截屏失败：${text}`);
      }
      await notify(text);
    })
    .finally(() => {
      running = null;
    });
  await running;
  return true;
}
