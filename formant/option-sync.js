import { envForBaseUrl, loadSettings, MONO_ENV_PRESETS, saveSettings } from "./sync.js";

/**
 * @typedef {{ toast: (text: string) => void }} PanelApi
 */

/**
 * @param {PanelApi} api
 */
export function initSyncPanel(api) {
  const { toast } = api;
  const envSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById("optEnvSelect"));
  const baseUrlInput = /** @type {HTMLInputElement | null} */ (document.getElementById("optBaseUrl"));
  const clientKeyInput = /** @type {HTMLInputElement | null} */ (document.getElementById("optClientKey"));
  const saveBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("optSyncSave"));
  const syncBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("optSyncNow"));
  const metaEl = document.getElementById("optSyncMeta");

  if (!envSelect || !baseUrlInput || !clientKeyInput || !saveBtn || !syncBtn || !metaEl) return;

  /**
   * @param {string} lastSyncedAt
   * @param {string} lastSyncResult
   */
  function renderMeta(lastSyncedAt, lastSyncResult) {
    if (!lastSyncedAt) {
      metaEl.textContent = "尚未同步";
      return;
    }
    const stamp = new Date(lastSyncedAt).toLocaleString();
    if (!lastSyncResult) {
      metaEl.textContent = `上次同步 ${stamp}`;
      return;
    }
    metaEl.textContent = `上次同步 ${stamp}\n${lastSyncResult}`;
  }

  /**
   * @param {string} key
   */
  function applyEnvPreset(key) {
    if (key === "dev") baseUrlInput.value = MONO_ENV_PRESETS.dev;
    else if (key === "prod") baseUrlInput.value = MONO_ENV_PRESETS.prod;
  }

  envSelect.addEventListener("change", () => {
    applyEnvPreset(envSelect.value);
    if (!clientKeyInput.value.trim()) return;
    void saveSettings({ baseUrl: baseUrlInput.value, clientKey: clientKeyInput.value })
      .then((saved) => {
        toast(saved.keyChanged ? "已切换 Client API Key，本机云端缓存已清空" : `已切换到 ${envSelect.value}`);
      })
      .catch((error) => toast(error instanceof Error ? error.message : String(error)));
  });

  baseUrlInput.addEventListener("input", () => {
    const env = envForBaseUrl(baseUrlInput.value);
    if (env) envSelect.value = env;
  });

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    try {
      const saved = await saveSettings({ baseUrl: baseUrlInput.value, clientKey: clientKeyInput.value });
      toast(
        saved.keyChanged
          ? "已切换 Client API Key：New Tab / 手势 / 书签 / 词卡已隔离，本机缓存已清空"
          : "同步设置已保存",
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    } finally {
      saveBtn.disabled = false;
    }
  });

  syncBtn.addEventListener("click", async () => {
    syncBtn.disabled = true;
    saveBtn.disabled = true;
    metaEl.textContent = "同步中…";
    try {
      await saveSettings({ baseUrl: baseUrlInput.value, clientKey: clientKeyInput.value });
      const response = await chrome.runtime.sendMessage({ type: "SYNC_NOW" });
      if (!response?.ok) throw new Error(response?.error || "同步失败");
      const result = response.result;
      const summary = `创建 ${result?.created ?? 0} · 更新 ${result?.updated ?? 0} · 删除 ${result?.deleted ?? 0}`;
      renderMeta(new Date().toISOString(), summary);
      toast("书签同步完成");
      const settings = await loadSettings();
      renderMeta(settings.lastSyncedAt, settings.lastSyncResult);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      metaEl.textContent = msg;
      toast(msg);
    } finally {
      syncBtn.disabled = false;
      saveBtn.disabled = false;
    }
  });

  void (async () => {
    const settings = await loadSettings();
    const env = envForBaseUrl(settings.baseUrl) || "dev";
    envSelect.value = env;
    baseUrlInput.value = settings.baseUrl || MONO_ENV_PRESETS[env];
    clientKeyInput.value = settings.clientKey;
    renderMeta(settings.lastSyncedAt, settings.lastSyncResult);
  })();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || (!changes.baseUrl && !changes.clientKey)) return;
    if (changes.baseUrl) baseUrlInput.value = String(changes.baseUrl.newValue || "");
    if (changes.clientKey) clientKeyInput.value = String(changes.clientKey.newValue || "");
    const env = envForBaseUrl(baseUrlInput.value);
    if (env) envSelect.value = env;
  });
}
