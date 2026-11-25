import { loadSettings, maskClientKey } from "./sync.js";

function chipLabel(clientKey) {
  const fingerprint = maskClientKey(clientKey);
  return fingerprint ? `Key ${fingerprint}` : "";
}

export function initClientKeyScope() {
  const chip = /** @type {HTMLButtonElement | null} */ (document.getElementById("shellClientKey"));

  async function paint() {
    const settings = await loadSettings();
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
