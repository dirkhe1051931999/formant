import { loadAutopagerizeSettings, saveAutopagerizeSettings } from "./autopagerize-config.js";
import { loadFeatures, normalizeFeatures, saveFeatures } from "./features.js";
import { loadGitzipSettings, saveGitzipSettings } from "./gitzip-config.js";
import { loadGesturesSettings, saveGesturesSettings } from "./gestures-config.js";
import { loadLocalHomeState, saveLocalHome } from "./home-sync.js";
import { loadSourceStore, normalizeSourceStore, saveSourceStore } from "./hls/sources-store.js";
import { normalizeExchangePrefs } from "./newtab-exchange.js";
import { loadProxySettings, saveProxySettings } from "./proxy-config.js";
import {
  loadTranslateMode,
  loadTranslateTarget,
  normalizeTranslateMode,
  normalizeTranslateTarget,
  saveTranslateMode,
  saveTranslateTarget,
} from "./translate-router.js";
import { loadV2exOptions, saveV2exOptions } from "./v2ex-options.js";
import { loadXTranslateSettings, saveXTranslateSettings } from "./x-translate-config.js";

const PREFS_VERSION = 1;
const PREFS_KIND = "formant-prefs";
const TOOLS_ORDER_KEY = "formantToolsOrder";
const DISCORD_INPUT_KEY = "formantDiscordInput";
const EXCHANGE_PREFS_KEY = "formantExchange";

/** @typedef {{ toast: (text: string) => void }} PanelApi */

/**
 * @param {PanelApi} api
 */
export function initPrefsTransfer(api) {
  const { toast } = api;
  const exportBtn = document.getElementById("optPrefsExport");
  const importBtn = document.getElementById("optPrefsImport");
  const fileInput = /** @type {HTMLInputElement | null} */ (document.getElementById("optPrefsFile"));
  const pasteInput = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("optPrefsPaste"));
  const pasteBtn = document.getElementById("optPrefsPasteImport");
  if (!exportBtn || !importBtn || !fileInput) return;

  exportBtn.addEventListener("click", () => {
    void exportPrefs().catch((error) => {
      toast(error instanceof Error ? error.message : String(error));
    });
  });
  importBtn.addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void importPrefsText(file)
      .then((summary) => toast(summary))
      .catch((error) => toast(error instanceof Error ? error.message : String(error)));
  });
  pasteBtn?.addEventListener("click", () => {
    const text = pasteInput?.value.trim() || "";
    if (!text) {
      toast("请先粘贴 JSON");
      return;
    }
    void importPrefsText(text)
      .then((summary) => {
        if (pasteInput) pasteInput.value = "";
        toast(summary);
      })
      .catch((error) => toast(error instanceof Error ? error.message : String(error)));
  });
}

async function exportPrefs() {
  const [
    features,
    homeState,
    v2ex,
    gitzip,
    autopagerize,
    gestures,
    proxy,
    xTranslate,
    hls,
    mode,
    target,
    toolsOrder,
    discordInput,
    exchange,
  ] = await Promise.all([
    loadFeatures(),
    loadLocalHomeState(),
    loadV2exOptions(),
    loadGitzipSettings(),
    loadAutopagerizeSettings(),
    loadGesturesSettings(),
    loadProxySettings(),
    loadXTranslateSettings(),
    loadSourceStore(),
    loadTranslateMode(),
    loadTranslateTarget(),
    chrome.storage.local.get(TOOLS_ORDER_KEY),
    chrome.storage.local.get(DISCORD_INPUT_KEY),
    chrome.storage.local.get(EXCHANGE_PREFS_KEY),
  ]);
  const payload = {
    version: PREFS_VERSION,
    kind: PREFS_KIND,
    features,
    newtab: homeState.home,
    v2ex,
    gitzip,
    autopagerize,
    gestures,
    proxy,
    xTranslate,
    hls,
    translate: { mode, target },
    toolsOrder: asIdList(toolsOrder[TOOLS_ORDER_KEY]),
    discordInput: asDiscordInput(discordInput[DISCORD_INPUT_KEY]),
    exchange: normalizeExchangePrefs(exchange[EXCHANGE_PREFS_KEY]),
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `formant-prefs-${fileDate()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {string | File} input
 */
async function importPrefsText(input) {
  const text = typeof input === "string" ? input : await input.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("不是有效的 JSON");
  }
  return applyPrefs(normalizePrefsFile(parsed));
}

/**
 * @param {Record<string, unknown>} filePrefs
 */
async function applyPrefs(filePrefs) {
  const labels = {
    features: "功能开关",
    newtab: "New Tab",
    v2ex: "V2EX",
    gitzip: "GitZip",
    autopagerize: "自动翻页",
    gestures: "手势",
    proxy: "代理",
    xTranslate: "X 推文",
    hls: "HLS 源",
    translate: "翻译",
    toolsOrder: "工具箱顺序",
    discordInput: "Discord 输入翻译",
    exchange: "汇率币种",
  };
  const parts = Object.keys(labels).filter((key) => key in filePrefs);
  if (!parts.length) throw new Error("这段 JSON 里没有可导入的配置");
  const ok = window.confirm(`导入将覆盖本机的${parts.map((key) => labels[key]).join("、")}。\n密钥不会改。继续？`);
  if (!ok) throw new Error("已取消导入");
  /** @type {string[]} */
  const skipped = [];

  if (filePrefs.features) await saveFeatures(normalizeFeatures(filePrefs.features));
  if (filePrefs.newtab) {
    await saveLocalHome(filePrefs.newtab, { updatedAt: new Date().toISOString() });
  }
  if (filePrefs.v2ex) await saveV2exOptions(filePrefs.v2ex);
  if (filePrefs.gitzip) await saveGitzipSettings(filePrefs.gitzip);
  if (filePrefs.autopagerize) await saveAutopagerizeSettings(filePrefs.autopagerize);
  if (filePrefs.gestures) {
    try {
      await saveGesturesSettings(filePrefs.gestures);
    } catch (error) {
      const idx = parts.indexOf("gestures");
      if (idx >= 0) parts.splice(idx, 1);
      skipped.push(`手势未导入（${error instanceof Error ? error.message : String(error)}）`);
    }
  }
  if (filePrefs.proxy) await saveProxySettings(filePrefs.proxy);
  if (filePrefs.xTranslate) await saveXTranslateSettings(filePrefs.xTranslate);
  if (filePrefs.hls) await saveSourceStore(normalizeSourceStore(filePrefs.hls));
  if (filePrefs.translate && typeof filePrefs.translate === "object") {
    const block = /** @type {Record<string, unknown>} */ (filePrefs.translate);
    if ("mode" in block) await saveTranslateMode(normalizeTranslateMode(block.mode));
    if ("target" in block) await saveTranslateTarget(normalizeTranslateTarget(block.target));
  }
  if (filePrefs.toolsOrder) {
    await chrome.storage.local.set({ [TOOLS_ORDER_KEY]: asIdList(filePrefs.toolsOrder) });
  }
  if (filePrefs.discordInput) {
    await chrome.storage.local.set({ [DISCORD_INPUT_KEY]: asDiscordInput(filePrefs.discordInput) });
  }
  if (filePrefs.exchange) {
    await chrome.storage.local.set({ [EXCHANGE_PREFS_KEY]: normalizeExchangePrefs(filePrefs.exchange) });
  }
  if (!parts.length) {
    throw new Error(skipped.length ? skipped.join("；") : "这段 JSON 里没有可导入的配置");
  }
  const extra = skipped.length ? `。${skipped.join("；")}` : "";
  return `已导入${parts.map((key) => labels[key]).join("、")}。请刷新本页${extra}`;
}

/**
 * @param {unknown} raw
 */
function normalizePrefsFile(raw) {
  if (!raw || typeof raw !== "object") throw new Error("不是有效的配置文件");
  const src = /** @type {Record<string, unknown>} */ (raw);
  if (src.version === 2 || looksLikeKeys(src)) {
    throw new Error("这是钥匙 JSON，请用上面的「本机钥匙」导入");
  }
  if (src.version !== PREFS_VERSION) throw new Error("不认识的配置文件版本");
  if (src.kind != null && src.kind !== PREFS_KIND) throw new Error("不是 formant 配置 JSON");
  /** @type {Record<string, unknown>} */
  const next = { version: PREFS_VERSION, kind: PREFS_KIND };
  for (const key of [
    "features",
    "newtab",
    "v2ex",
    "gitzip",
    "autopagerize",
    "gestures",
    "proxy",
    "xTranslate",
    "hls",
    "translate",
    "toolsOrder",
    "discordInput",
    "exchange",
  ]) {
    if (key in src) next[key] = src[key];
  }
  return next;
}

/**
 * @param {Record<string, unknown>} src
 */
function looksLikeKeys(src) {
  const sync = src.sync && typeof src.sync === "object" ? /** @type {Record<string, unknown>} */ (src.sync) : null;
  return Boolean(sync && ("clientKey" in sync || "apiKey" in sync));
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function asIdList(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {string[]} */
  const ids = [];
  for (const item of raw) {
    const id = String(item || "").trim();
    if (!id || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= 40) break;
  }
  return ids;
}

/**
 * @param {unknown} raw
 * @returns {{ engine: "google" | "gpt" }}
 */
function asDiscordInput(raw) {
  const src = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  return { engine: src.engine === "gpt" ? "gpt" : "google" };
}

function fileDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
