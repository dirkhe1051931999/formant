/** Feature toggles persisted in chrome.storage.local */

export const FEATURES_KEY = "formantFeatures";

/**
 * @typedef {{
 *   translate: {
 *     enabled: boolean,
 *     popup: boolean,
 *     selection: boolean,
 *     contextMenu: boolean,
 *   },
 *   newtab: { enabled: boolean },
 *   imageSave: { png: boolean, jpg: boolean },
 *   screenshot: { enabled: boolean },
 *   office: { enabled: boolean },
 *   v2ex: { enabled: boolean },
 *   gitzip: { enabled: boolean },
 *   autopagerize: { enabled: boolean },
 *   proxy: { enabled: boolean },
 *   extensions: { enabled: boolean },
 *   siteData: { enabled: boolean },
 *   gestures: { enabled: boolean },
 *   telegram: { enabled: boolean },
 *   xTranslate: { enabled: boolean },
 *   discord: { enabled: boolean },
 *   elitepvpers: { enabled: boolean },
 *   githubIssues: { enabled: boolean },
 *   linuxdo: { enabled: boolean },
 *   hupu: { enabled: boolean },
 *   freefq: { enabled: boolean },
 *   huavod: { enabled: boolean },
 *   gemini: { enabled: boolean },
 *   gmail: { enabled: boolean },
 *   axure: { enabled: boolean },
 *   vue: { enabled: boolean },
 *   hls: { enabled: boolean },
 *   imagePrompt: { enabled: boolean },
 *   tools: { enabled: boolean },
 *   userscript: { enabled: boolean },
 * }} FormantFeatures
 */

/** @type {FormantFeatures} */
export const DEFAULT_FEATURES = {
  translate: {
    enabled: true,
    popup: true,
    selection: true,
    contextMenu: true,
  },
  newtab: {
    enabled: true,
  },
  imageSave: {
    png: true,
    jpg: true,
  },
  screenshot: {
    enabled: true,
  },
  office: {
    enabled: true,
  },
  v2ex: {
    enabled: true,
  },
  gitzip: {
    enabled: true,
  },
  autopagerize: {
    enabled: true,
  },
  proxy: {
    enabled: true,
  },
  extensions: {
    enabled: true,
  },
  siteData: {
    enabled: true,
  },
  gestures: {
    enabled: false,
  },
  telegram: {
    enabled: true,
  },
  xTranslate: {
    enabled: false,
  },
  discord: {
    enabled: true,
  },
  elitepvpers: {
    enabled: false,
  },
  githubIssues: {
    enabled: false,
  },
  linuxdo: {
    enabled: true,
  },
  hupu: {
    enabled: true,
  },
  freefq: {
    enabled: true,
  },
  huavod: {
    enabled: true,
  },
  gemini: {
    enabled: true,
  },
  gmail: {
    enabled: true,
  },
  axure: {
    enabled: true,
  },
  vue: {
    enabled: true,
  },
  hls: {
    enabled: true,
  },
  imagePrompt: {
    enabled: true,
  },
  tools: {
    enabled: true,
  },
  userscript: {
    enabled: true,
  },
};

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function asBool(value, fallback = true) {
  if (typeof value === "boolean") return value;
  return fallback;
}

/**
 * @param {unknown} raw
 * @returns {FormantFeatures}
 */
export function normalizeFeatures(raw) {
  const src = raw && typeof raw === "object" ? /** @type {Record<string, any>} */ (raw) : {};
  const translate = src.translate && typeof src.translate === "object" ? src.translate : {};
  const newtab = src.newtab && typeof src.newtab === "object" ? src.newtab : {};
  const imageSave = src.imageSave && typeof src.imageSave === "object" ? src.imageSave : {};
  const screenshot = src.screenshot && typeof src.screenshot === "object" ? src.screenshot : {};
  const office = src.office && typeof src.office === "object" ? src.office : {};
  const v2ex = src.v2ex && typeof src.v2ex === "object" ? src.v2ex : {};
  const gitzip = src.gitzip && typeof src.gitzip === "object" ? src.gitzip : {};
  const autopagerize = src.autopagerize && typeof src.autopagerize === "object" ? src.autopagerize : {};
  const proxy = src.proxy && typeof src.proxy === "object" ? src.proxy : {};
  const extensions = src.extensions && typeof src.extensions === "object" ? src.extensions : {};
  const siteData = src.siteData && typeof src.siteData === "object" ? src.siteData : {};
  const gestures = src.gestures && typeof src.gestures === "object" ? src.gestures : {};
  const telegram = src.telegram && typeof src.telegram === "object" ? src.telegram : {};
  const xTranslate = src.xTranslate && typeof src.xTranslate === "object" ? src.xTranslate : {};
  const discord = src.discord && typeof src.discord === "object" ? src.discord : {};
  const elitepvpers = src.elitepvpers && typeof src.elitepvpers === "object" ? src.elitepvpers : {};
  const githubIssues = src.githubIssues && typeof src.githubIssues === "object" ? src.githubIssues : {};
  const linuxdo = src.linuxdo && typeof src.linuxdo === "object" ? src.linuxdo : {};
  const hupu = src.hupu && typeof src.hupu === "object" ? src.hupu : {};
  const freefq = src.freefq && typeof src.freefq === "object" ? src.freefq : {};
  const huavod = src.huavod && typeof src.huavod === "object" ? src.huavod : {};
  const gemini = src.gemini && typeof src.gemini === "object" ? src.gemini : {};
  const gmail = src.gmail && typeof src.gmail === "object" ? src.gmail : {};
  const axure = src.axure && typeof src.axure === "object" ? src.axure : {};
  const vue = src.vue && typeof src.vue === "object" ? src.vue : {};
  const hls = src.hls && typeof src.hls === "object" ? src.hls : {};
  const imagePrompt = src.imagePrompt && typeof src.imagePrompt === "object" ? src.imagePrompt : {};
  const tools = src.tools && typeof src.tools === "object" ? src.tools : {};
  const userscript = src.userscript && typeof src.userscript === "object" ? src.userscript : {};

  return {
    translate: {
      enabled: asBool(translate.enabled, DEFAULT_FEATURES.translate.enabled),
      popup: asBool(translate.popup, DEFAULT_FEATURES.translate.popup),
      selection: asBool(translate.selection, DEFAULT_FEATURES.translate.selection),
      contextMenu: asBool(translate.contextMenu, DEFAULT_FEATURES.translate.contextMenu),
    },
    newtab: {
      enabled: asBool(newtab.enabled, DEFAULT_FEATURES.newtab.enabled),
    },
    imageSave: {
      png: asBool(imageSave.png, DEFAULT_FEATURES.imageSave.png),
      jpg: asBool(imageSave.jpg, DEFAULT_FEATURES.imageSave.jpg),
    },
    screenshot: {
      enabled: asBool(screenshot.enabled, DEFAULT_FEATURES.screenshot.enabled),
    },
    office: {
      enabled: asBool(office.enabled, DEFAULT_FEATURES.office.enabled),
    },
    v2ex: {
      enabled: asBool(v2ex.enabled, DEFAULT_FEATURES.v2ex.enabled),
    },
    gitzip: {
      enabled: asBool(gitzip.enabled, DEFAULT_FEATURES.gitzip.enabled),
    },
    autopagerize: {
      enabled: asBool(autopagerize.enabled, DEFAULT_FEATURES.autopagerize.enabled),
    },
    proxy: {
      enabled: asBool(proxy.enabled, DEFAULT_FEATURES.proxy.enabled),
    },
    extensions: {
      enabled: asBool(extensions.enabled, DEFAULT_FEATURES.extensions.enabled),
    },
    siteData: {
      enabled: asBool(siteData.enabled, DEFAULT_FEATURES.siteData.enabled),
    },
    gestures: {
      enabled: asBool(gestures.enabled, DEFAULT_FEATURES.gestures.enabled),
    },
    telegram: {
      enabled: asBool(telegram.enabled, DEFAULT_FEATURES.telegram.enabled),
    },
    xTranslate: {
      enabled: asBool(xTranslate.enabled, DEFAULT_FEATURES.xTranslate.enabled),
    },
    discord: {
      enabled: asBool(discord.enabled, DEFAULT_FEATURES.discord.enabled),
    },
    elitepvpers: {
      enabled: asBool(elitepvpers.enabled, DEFAULT_FEATURES.elitepvpers.enabled),
    },
    githubIssues: {
      enabled: asBool(githubIssues.enabled, DEFAULT_FEATURES.githubIssues.enabled),
    },
    linuxdo: {
      enabled: asBool(linuxdo.enabled, DEFAULT_FEATURES.linuxdo.enabled),
    },
    hupu: {
      enabled: asBool(hupu.enabled, DEFAULT_FEATURES.hupu.enabled),
    },
    freefq: {
      enabled: asBool(freefq.enabled, DEFAULT_FEATURES.freefq.enabled),
    },
    huavod: {
      enabled: asBool(huavod.enabled, DEFAULT_FEATURES.huavod.enabled),
    },
    gemini: {
      enabled: asBool(gemini.enabled, DEFAULT_FEATURES.gemini.enabled),
    },
    gmail: {
      enabled: asBool(gmail.enabled, DEFAULT_FEATURES.gmail.enabled),
    },
    axure: {
      enabled: asBool(axure.enabled, DEFAULT_FEATURES.axure.enabled),
    },
    vue: {
      enabled: asBool(vue.enabled, DEFAULT_FEATURES.vue.enabled),
    },
    hls: {
      enabled: asBool(hls.enabled, DEFAULT_FEATURES.hls.enabled),
    },
    imagePrompt: {
      enabled: asBool(imagePrompt.enabled, DEFAULT_FEATURES.imagePrompt.enabled),
    },
    tools: {
      enabled: asBool(tools.enabled, DEFAULT_FEATURES.tools.enabled),
    },
    userscript: {
      enabled: asBool(userscript.enabled, DEFAULT_FEATURES.userscript.enabled),
    },
  };
}

/**
 * @returns {Promise<FormantFeatures>}
 */
export async function loadFeatures() {
  const data = await chrome.storage.local.get(FEATURES_KEY);
  return normalizeFeatures(data[FEATURES_KEY]);
}

/**
 * @param {FormantFeatures} features
 * @returns {Promise<FormantFeatures>}
 */
export async function saveFeatures(features) {
  const next = normalizeFeatures(features);
  await chrome.storage.local.set({ [FEATURES_KEY]: next });
  return next;
}

/**
 * @param {FormantFeatures} features
 * @param {string} path dot path under root, e.g. "translate.selection"
 * @param {boolean} value
 */
export async function setFeatureFlag(path, value) {
  const current = await loadFeatures();
  const parts = String(path || "").split(".").filter(Boolean);
  if (parts.length < 2) throw new Error("无效的功能开关路径");

  /** @type {Record<string, any>} */
  let cursor = current;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!cursor[key] || typeof cursor[key] !== "object") {
      throw new Error("无效的功能开关路径");
    }
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = Boolean(value);
  return saveFeatures(current);
}

/** Effective: master + child */
export function isTranslatePopupEnabled(f) {
  return f.translate.enabled && f.translate.popup;
}

export function isTranslateSelectionEnabled(f) {
  return f.translate.enabled && f.translate.selection;
}

export function isTranslateContextMenuEnabled(f) {
  return f.translate.enabled && f.translate.contextMenu;
}

export function isNewtabEnabled(f) {
  return f.newtab.enabled;
}

export function isImageSavePngEnabled(f) {
  return f.imageSave.png;
}

export function isImageSaveJpgEnabled(f) {
  return f.imageSave.jpg;
}

export function isImageSaveAnyEnabled(f) {
  return f.imageSave.png || f.imageSave.jpg;
}

export function isScreenshotEnabled(f) {
  return f.screenshot.enabled;
}

export function isOfficeEnabled(f) {
  return f.office.enabled;
}

export function isV2exEnabled(f) {
  return f.v2ex.enabled;
}

export function isGitzipEnabled(f) {
  return f.gitzip.enabled;
}

export function isAutopagerizeEnabled(f) {
  return f.autopagerize.enabled;
}

export function isProxyEnabled(f) {
  return f.proxy.enabled;
}

export function isExtensionsManagerEnabled(f) {
  return f.extensions.enabled;
}

export function isSiteDataEnabled(f) {
  return f.siteData.enabled;
}

export function isGesturesEnabled(f) {
  return f.gestures.enabled;
}

export function isTelegramEnabled(f) {
  return f.telegram.enabled;
}

export function isXTranslateEnabled(f) {
  return f.xTranslate.enabled;
}

export function isDiscordEnabled(f) {
  return f.discord.enabled;
}

export function isElitepvpersEnabled(f) {
  return f.elitepvpers.enabled;
}

export function isGithubIssuesEnabled(f) {
  return f.githubIssues.enabled;
}

export function isLinuxdoEnabled(f) {
  return f.linuxdo.enabled;
}

export function isHupuEnabled(f) {
  return f.hupu.enabled;
}

export function isFreefqEnabled(f) {
  return f.freefq.enabled;
}

export function isHuavodEnabled(f) {
  return f.huavod.enabled;
}

export function isGeminiEnabled(f) {
  return f.gemini.enabled;
}

export function isGmailEnabled(f) {
  return f.gmail.enabled;
}

export function isAxureEnabled(f) {
  return f.axure.enabled;
}

export function isVueEnabled(f) {
  return f.vue.enabled;
}

export function isHlsEnabled(f) {
  return f.hls.enabled;
}

export function isImagePromptEnabled(f) {
  return f.imagePrompt.enabled;
}

export function isToolsEnabled(f) {
  return f.tools.enabled;
}

export function isUserscriptEnabled(f) {
  return f.userscript.enabled;
}
