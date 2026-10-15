import { loadDeeplxApiKey, saveDeeplxApiKey } from "./deeplx-config.js";
import { loadImagePromptSettings, saveImagePromptSettings } from "./image-prompt.js";
import { loadSettings, saveSettings } from "./sync.js";
import { loadV2exImgurClientId, saveV2exImgurClientId } from "./v2ex-options.js";

const KEYS_VERSION = 2;

/**
 * @typedef {{ toast: (text: string) => void }} PanelApi
 * @typedef {{
 *   version: number,
 *   sync?: { baseUrl: string, clientKey: string },
 *   imagePrompt?: { baseUrl: string, apiKey: string, model: string },
 *   v2ex?: { imgurClientId: string },
 *   deeplx?: { apiKey: string },
 * }} FormantKeysFile
 */

/**
 * @param {PanelApi} api
 */
export function initKeysTransfer(api) {
  const { toast } = api;
  const exportBtn = document.getElementById("optKeysExport");
  const importBtn = document.getElementById("optKeysImport");
  const fileInput = /** @type {HTMLInputElement | null} */ (document.getElementById("optKeysFile"));
  const pasteInput = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("optKeysPaste"));
  const pasteBtn = document.getElementById("optKeysPasteImport");
  if (!exportBtn || !importBtn || !fileInput) return;

  exportBtn.addEventListener("click", () => {
    void exportKeys().catch((error) => {
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
    void importKeys(file)
      .then((summary) => toast(summary))
      .catch((error) => toast(error instanceof Error ? error.message : String(error)));
  });

  pasteBtn?.addEventListener("click", () => {
    const text = pasteInput?.value.trim() || "";
    if (!text) {
      toast("请先粘贴 JSON");
      return;
    }
    void importKeysText(text)
      .then((summary) => {
        if (pasteInput) pasteInput.value = "";
        toast(summary);
      })
      .catch((error) => toast(error instanceof Error ? error.message : String(error)));
  });
}

async function exportKeys() {
  const [sync, imagePrompt, imgurClientId, deeplxApiKey] = await Promise.all([
    loadSettings(),
    loadImagePromptSettings(),
    loadV2exImgurClientId(),
    loadDeeplxApiKey(),
  ]);
  const payload = {
    version: KEYS_VERSION,
    sync: { baseUrl: sync.baseUrl, clientKey: sync.clientKey },
    imagePrompt: {
      baseUrl: imagePrompt.baseUrl,
      apiKey: imagePrompt.apiKey,
      model: imagePrompt.model,
    },
    v2ex: { imgurClientId },
    deeplx: { apiKey: deeplxApiKey },
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `formant-keys-${fileDate()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {string} text
 */
async function importKeysText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("不是有效的 JSON");
  }
  return applyKeys(normalizeKeysFile(parsed));
}

/**
 * @param {File} file
 */
async function importKeys(file) {
  return importKeysText(await file.text());
}

/**
 * @param {FormantKeysFile} fileKeys
 */
async function applyKeys(fileKeys) {
  const parts = [];
  if (fileKeys.sync) parts.push("同步");
  if (fileKeys.imagePrompt) parts.push("识图");
  if (fileKeys.v2ex) parts.push("V2EX Imgur");
  if (fileKeys.deeplx) parts.push("DeepLX");
  if (!parts.length) throw new Error("这段 JSON 里没有可导入的钥匙");
  const current = fileKeys.sync ? await loadSettings() : null;
  const keyChanged = Boolean(
    current && fileKeys.sync && current.clientKey && current.clientKey !== fileKeys.sync.clientKey,
  );
  const warning = keyChanged
    ? "\nClient API Key 会更换，本机 New Tab / 手势缓存会被清空。"
    : "";
  const ok = window.confirm(`导入将覆盖本机的${parts.join("、")}钥匙。${warning}\n继续？`);
  if (!ok) throw new Error("已取消导入");

  if (fileKeys.sync) {
    await saveSettings(fileKeys.sync, { allowEmpty: true });
  }
  if (fileKeys.imagePrompt) {
    await saveImagePromptSettings(fileKeys.imagePrompt);
  }
  if (fileKeys.v2ex) {
    await saveV2exImgurClientId(fileKeys.v2ex.imgurClientId);
  }
  if (fileKeys.deeplx) {
    await saveDeeplxApiKey(fileKeys.deeplx.apiKey);
  }
  return keyChanged ? `已导入${parts.join("、")}。Client API Key 已更换，本机缓存已清空` : `已导入${parts.join("、")}`;
}

/**
 * @param {unknown} raw
 * @returns {FormantKeysFile}
 */
function normalizeKeysFile(raw) {
  if (!raw || typeof raw !== "object") throw new Error("不是有效的钥匙文件");
  const src = /** @type {Record<string, unknown>} */ (raw);
  if (src.version !== KEYS_VERSION) throw new Error("不认识的钥匙文件版本");
  /** @type {FormantKeysFile} */
  const next = { version: KEYS_VERSION };
  if ("sync" in src) next.sync = readPair(src.sync, "baseUrl", "clientKey");
  if ("imagePrompt" in src) next.imagePrompt = readTriple(src.imagePrompt);
  if ("v2ex" in src) {
    const block = asRecord(src.v2ex, "v2ex");
    next.v2ex = { imgurClientId: String(block.imgurClientId || "") };
  }
  if ("deeplx" in src) {
    const block = asRecord(src.deeplx, "deeplx");
    next.deeplx = { apiKey: String(block.apiKey || "").trim() };
  }
  return next;
}

/**
 * @param {unknown} raw
 * @param {string} label
 */
function asRecord(raw, label) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${label} 格式不对`);
  return /** @type {Record<string, unknown>} */ (raw);
}

/**
 * @param {unknown} raw
 * @param {string} a
 * @param {string} b
 */
function readPair(raw, a, b) {
  const block = asRecord(raw, "sync");
  return { baseUrl: String(block[a] || ""), clientKey: String(block[b] || "") };
}

/**
 * @param {unknown} raw
 */
function readTriple(raw) {
  const block = asRecord(raw, "imagePrompt");
  return {
    baseUrl: String(block.baseUrl || ""),
    apiKey: String(block.apiKey || ""),
    model: String(block.model || ""),
  };
}

function fileDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
