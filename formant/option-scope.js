import { loadSettings, maskClientKey } from "./sync.js";

function scopeLabel(clientKey) {
  const fingerprint = maskClientKey(clientKey);
  if (!fingerprint) {
    return "未配置 Client API Key。New Tab / 手势 / 书签 / 热点英语的云端配置按 Key 隔离，请先到「同步」填写。";
  }
  return `当前 Client API Key：${fingerprint}。换一把 Key 就是另一套 New Tab / 手势 / 书签 / 热点英语，互不影响。`;
}

function chipLabel(clientKey) {
  const fingerprint = maskClientKey(clientKey);
  return fingerprint ? `Key ${fingerprint}` : "";
}

export function initClientKeyScope() {
  const chip = /** @type {HTMLButtonElement | null} */ (document.getElementById("shellClientKey"));

  async function paint() {
    const settings = await loadSettings();
    const text = scopeLabel(settings.clientKey);
    document.querySelectorAll("[data-client-key-scope]").forEach((el) => {
      el.textContent = text;
    });
    if (!chip) return;
    const label = chipLabel(settings.clientKey);
    chip.hidden = !label;
    chip.textContent = label;
    chip.title = settings.clientKey
      ? "云端配置按此 Client API Key 隔离；点击打开同步"
      : "";
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.clientKey || changes.baseUrl)) void paint();
  });

  void paint();
}
