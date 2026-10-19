import {
  isImageSaveJpgEnabled,
  isImageSavePngEnabled,
  isTranslateContextMenuEnabled,
  isNewtabEnabled,
  isV2exEnabled,
  loadFeatures,
} from "./features.js";
import { openOrFocusNewtab } from "./newtab-tab.js";
import {
  SCREENSHOT_MENU_IDS,
  addScreenshotContextMenus,
  handleScreenshotContextMenu,
} from "./screenshot-bridge.js";
import {
  OFFICE_MENU_IDS,
  addOfficeContextMenus,
  handleOfficeContextMenu,
} from "./office-bridge.js";
import {
  GITZIP_MENU_IDS,
  addGitzipContextMenus,
  handleGitzipContextMenu,
  refreshGitzipContextState,
  updateGitzipContextState,
} from "./gitzip-bridge.js";
import { handleAutopagerizeMessage, initAutopagerizeBackground } from "./autopagerize-bridge.js";
import { handleGestureMessage } from "./gestures-bridge.js";
import { handleTelegramMessage } from "./telegram-bridge.js";
import { handleFreefqMessage } from "./freefq-bridge.js";
import { initHuavodBackground } from "./huavod-bridge.js";
import { initHlsBackground } from "./hls-bridge.js";
import { handleAxureMessage } from "./axure-bridge.js";
import { initVueBackground } from "./vue-bridge.js";
import { handleXTranslateMessage } from "./x-translate-bridge.js";
import { handleDiscordTranslateMessage } from "./discord-bridge.js";
import { handleElitepvpersTranslateMessage } from "./elitepvpers-bridge.js";
import { handleGeminiMessage } from "./gemini-bridge.js";
import { initNewtabWeatherBackground } from "./newtab-weather-bridge.js";
import { initProxyBackground } from "./proxy-bridge.js";
import { handleSiteDataMessage } from "./site-data-bridge.js";
import { handleUserscriptMessage, initUserscriptBackground } from "./userscript-bridge.js";
import { saveImageAs } from "./image-save.js";
import { ensureLexiconReady } from "./lexicon-runtime.js";
import { syncBookmarksToMono } from "./sync.js";
import { translateSmart } from "./translate-api.js";
import { recordStudyWord } from "./study-words.js";
import { loadTranslateMode, normalizeTranslateMode } from "./translate-router.js";
import {
  addV2exContextMenus,
  handleV2exContextMenu,
  initV2exBackground,
  runV2exCheckinIfEnabled,
  V2EX_MENU_SOV2EX,
} from "./v2ex-bridge.js";
import { ensureV2exOptions } from "./v2ex-options.js";

void ensureLexiconReady().catch((error) => {
  console.warn("[formant] lexicon warm-up failed", error);
});

void initAutopagerizeBackground().catch((error) => {
  console.warn("[formant] AutoPagerize background init failed", error);
});

void initNewtabWeatherBackground().catch((error) => {
  console.warn("[formant] New Tab weather alarm init failed", error);
});

void initProxyBackground().catch((error) => {
  console.warn("[formant] proxy background init failed", error);
});

void initHuavodBackground().catch((error) => {
  console.warn("[formant] huavod background init failed", error);
});

initHlsBackground();
initVueBackground();
initUserscriptBackground();

const SYNC_DEBOUNCE_MS = 8_000;
/** @type {ReturnType<typeof setTimeout> | null} */
let syncTimer = null;
let syncing = false;
/** @type {Promise<unknown> | null} */
let pendingSync = null;

const MENU_TRANSLATE = "formant-translate-selection";
const MENU_IMAGE_ROOT = "formant-image-save";
const MENU_IMAGE_PNG = "formant-image-save-png";
const MENU_IMAGE_JPG = "formant-image-save-jpg";
const OWNED_MENU_IDS = [
  MENU_IMAGE_PNG,
  MENU_IMAGE_JPG,
  MENU_IMAGE_ROOT,
  MENU_TRANSLATE,
  V2EX_MENU_SOV2EX,
  ...SCREENSHOT_MENU_IDS,
  ...OFFICE_MENU_IDS,
  ...GITZIP_MENU_IDS,
];
let contextMenusJob = Promise.resolve();

/**
 * @param {chrome.contextMenus.CreateProperties} props
 */
function createMenu(props) {
  return new Promise((resolve) => {
    chrome.contextMenus.create(props, () => {
      if (chrome.runtime.lastError) {
        console.warn("[formant] contextMenus.create", chrome.runtime.lastError.message);
      }
      resolve();
    });
  });
}

/**
 * Removes only formant-owned IDs. Never call removeAll: it would erase
 * independently managed menu state during a feature-toggle rebuild.
 * @param {string} id
 */
function removeMenu(id) {
  return new Promise((resolve) => {
    chrome.contextMenus.remove(id, () => {
      const error = chrome.runtime.lastError?.message;
      if (error && !/cannot find menu item/i.test(error)) {
        console.warn("[formant] contextMenus.remove", id, error);
      }
      resolve();
    });
  });
}

function ensureContextMenus() {
  const job = contextMenusJob.then(rebuildContextMenus);
  contextMenusJob = job.catch((error) => {
    console.warn("[formant] ensureContextMenus failed", error);
  });
  return job;
}

async function rebuildContextMenus() {
  try {
    const [features, v2exOptions] = await Promise.all([loadFeatures(), ensureV2exOptions()]);
    for (const id of OWNED_MENU_IDS) await removeMenu(id);

    /** @type {chrome.contextMenus.CreateProperties[]} */
    const menus = [];
    const collectMenu = (props) => menus.push(props);
    if (isTranslateContextMenuEnabled(features)) {
      collectMenu({
        id: MENU_TRANSLATE,
        title: "用 formant 翻译",
        contexts: ["selection"],
      });
    }

    const png = isImageSavePngEnabled(features);
    const jpg = isImageSaveJpgEnabled(features);
    if (png || jpg) {
      collectMenu({
        id: MENU_IMAGE_ROOT,
        title: "formant 图片另存为",
        contexts: ["image"],
      });
      if (png) {
        collectMenu({
          id: MENU_IMAGE_PNG,
          parentId: MENU_IMAGE_ROOT,
          title: "PNG",
          contexts: ["image"],
        });
      }
      if (jpg) {
        collectMenu({
          id: MENU_IMAGE_JPG,
          parentId: MENU_IMAGE_ROOT,
          title: "JPG",
          contexts: ["image"],
        });
      }
    }

    addV2exContextMenus(collectMenu, features, v2exOptions);
    addScreenshotContextMenus(collectMenu, features);
    addOfficeContextMenus(collectMenu, features);
    addGitzipContextMenus(collectMenu, features);
    for (const props of menus) await createMenu(props);

    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await refreshGitzipContextState(activeTab);
  } catch (error) {
    console.warn("[formant] rebuildContextMenus failed", error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[formant] installed");
  void ensureContextMenus();
});

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    void ensureContextMenus();
  });
}

void ensureContextMenus();
void initV2exBackground({
  refreshContextMenus: () => {
    void ensureContextMenus();
  },
}).catch((error) => {
  console.warn("[formant] V2EX background init failed", error);
});

function scheduleAutoSync(reason) {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void runSync(`auto:${reason}`).catch((error) => {
      console.warn("[formant] auto sync failed", error);
    });
  }, SYNC_DEBOUNCE_MS);
}

async function runSync(reason) {
  if (syncing && pendingSync) {
    return pendingSync;
  }
  syncing = true;
  pendingSync = (async () => {
    console.log("[formant] sync start", reason);
    const result = await syncBookmarksToMono();
    console.log("[formant] sync done", reason, result);
    return result;
  })().finally(() => {
    syncing = false;
    pendingSync = null;
  });
  return pendingSync;
}

for (const eventName of ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered"]) {
  const event = chrome.bookmarks[eventName];
  if (event?.addListener) {
    event.addListener(() => {
      scheduleAutoSync(eventName);
    });
  }
}

/**
 * Ensure translate content script is present on the tab (needed after extension reload).
 * @param {number} tabId
 */
async function ensureTranslateContent(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "FORMANT_PING" });
    return;
  } catch {
    // not injected yet
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["translate-content.js"],
  });
}

/**
 * @param {number | undefined} tabId
 * @param {string} text
 */
async function openTranslatePanel(tabId, text) {
  const q = String(text || "").trim();
  if (!tabId || !q) return;
  const features = await loadFeatures();
  if (!isTranslateContextMenuEnabled(features)) return;
  try {
    await ensureTranslateContent(tabId);
    await chrome.tabs.sendMessage(tabId, { type: "FORMANT_SHOW_TRANSLATE", q });
  } catch (error) {
    console.warn("[formant] show translate panel failed", error);
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void (async () => {
    if (await handleScreenshotContextMenu(info, tab)) return;

    if (await handleOfficeContextMenu(info, tab)) return;

    if (await handleGitzipContextMenu(info, tab)) return;

    if (info.menuItemId === V2EX_MENU_SOV2EX) {
      await handleV2exContextMenu(info);
      return;
    }

    if (info.menuItemId === MENU_TRANSLATE) {
      const text = String(info.selectionText || "").trim();
      if (!text || !tab?.id) return;
      await openTranslatePanel(tab.id, text);
      return;
    }

    if (info.menuItemId === MENU_IMAGE_PNG || info.menuItemId === MENU_IMAGE_JPG) {
      const srcUrl = String(info.srcUrl || "").trim();
      const format = info.menuItemId === MENU_IMAGE_PNG ? "png" : "jpg";
      const features = await loadFeatures();
      if (format === "png" && !isImageSavePngEnabled(features)) return;
      if (format === "jpg" && !isImageSaveJpgEnabled(features)) return;
      await saveImageAs(srcUrl, format);
    }
  })().catch((error) => {
    console.warn("[formant] context menu click failed", error);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "FORMANT_GITZIP_STATE") {
    updateGitzipContextState(message.state, sender);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "GET_FEATURES") {
    void loadFeatures()
      .then((features) => sendResponse({ ok: true, features }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }

  if (message?.type === "SYNC_NOW") {
    void runSync("manual")
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }

  if (handleSiteDataMessage(message, sendResponse)) return true;

  if (message?.type === "V2EX_CHECKIN_NOW") {
    void runV2exCheckinIfEnabled()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }

  if (message?.type === "TRANSLATE") {
    const tabId = sender.tab?.id;
    const seq = message.seq;
    void (async () => {
      const mode = normalizeTranslateMode(
        message.mode || (await loadTranslateMode()),
      );
      return translateSmart(
        {
          q: message.q,
          source: message.source,
          target: message.target,
          mode,
        },
        {
          onRoute: (plan) => {
            if (tabId == null) return;
            void chrome.tabs
              .sendMessage(tabId, {
                type: "FORMANT_TRANSLATE_ROUTE",
                seq,
                plan,
              })
              .catch(() => {});
          },
          onGoogle: (result) => {
            if (tabId == null) return;
            void chrome.tabs
              .sendMessage(tabId, {
                type: "FORMANT_TRANSLATE_PARTIAL",
                provider: "google",
                seq,
                result,
              })
              .catch(() => {});
          },
          onGpt: (result) => {
            if (tabId == null) return;
            void chrome.tabs
              .sendMessage(tabId, {
                type: "FORMANT_TRANSLATE_PARTIAL",
                provider: "gpt",
                seq,
                result,
              })
              .catch(() => {});
          },
          onDeeplx: (result) => {
            if (tabId == null) return;
            void chrome.tabs
              .sendMessage(tabId, {
                type: "FORMANT_TRANSLATE_PARTIAL",
                provider: "deeplx",
                seq,
                result,
              })
              .catch(() => {});
          },
        },
      );
    })()
      .then(async (result) => {
        try {
          await recordStudyWord(String(message.q || ""), result);
        } catch (error) {
          console.warn("[formant] study word record failed", error);
        }
        sendResponse({ ok: true, result });
      })
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }

  if (message?.type === "FORMANT_OPEN_TRANSLATE" && sender.tab?.id) {
    void openTranslatePanel(sender.tab.id, message.q);
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "FORMANT_PING") {
    sendResponse({ ok: true });
    return false;
  }

  if (handleAutopagerizeMessage(message, sender, sendResponse)) return true;

  if (handleGestureMessage(message, sender, sendResponse)) return true;

  if (handleTelegramMessage(message, sender, sendResponse)) return true;

  if (handleFreefqMessage(message, sender, sendResponse)) return true;

  if (handleXTranslateMessage(message, sender, sendResponse)) return true;

  if (handleDiscordTranslateMessage(message, sender, sendResponse)) return true;

  if (handleElitepvpersTranslateMessage(message, sender, sendResponse)) return true;

  if (handleGeminiMessage(message, sender, sendResponse)) return true;

  if (handleAxureMessage(message, sender, sendResponse)) return true;

  if (handleUserscriptMessage(message, sender, sendResponse)) return true;

  return false;
});

chrome.commands.onCommand.addListener((command) => {
  void (async () => {
    const features = await loadFeatures();
    if (command === "formantNewtab") {
      if (isNewtabEnabled(features)) await openOrFocusNewtab();
      return;
    }
    if (!isV2exEnabled(features)) return;
    if (command === "newV2EX") void chrome.tabs.create({ url: "https://www.v2ex.com/" });
    if (command === "newMsg") void chrome.tabs.create({ url: "https://www.v2ex.com/notifications" });
  })();
});
