import {
  FEATURES_KEY,
  isUblockEnabled,
  loadFeatures,
  normalizeFeatures,
} from "./features.js";
import {
  DEFAULT_UBLOCK_CONFIG,
  UBLOCK_CONFIG_KEY,
  UBLOCK_LIST_META,
  loadUblockConfig,
  normalizeUblockConfig,
  saveUblockConfig,
} from "./ublock-config.js";
import { UBLOCK_PROGRESS_KEY, UBLOCK_STATUS_KEY, loadUblockStatus } from "./ublock-sync.js";

/**
 * @param {Awaited<ReturnType<typeof loadUblockStatus>>} status
 * @returns {string}
 */
export function formatUblockStatus(status) {
  if (!status.lastUpdated && !status.ruleCount) {
    return "规则尚未生成，后台正在编译…";
  }
  const when = status.lastUpdated
    ? new Date(status.lastUpdated).toLocaleString()
    : "尚未更新";
  const source =
    status.source === "cdn" ? "CDN" : status.source === "cache" ? "缓存" : "离线种子";
  const err = status.lastError ? `；上次错误：${status.lastError}` : "";
  const scriptlets =
    status.scriptlets === "2 worlds (userScripts)"
      ? "已启用（userScripts）"
      : status.scriptlets === "2 worlds (static fallback)"
        ? "已启用（静态回退）"
        : status.scriptlets === "2 worlds"
          ? "已启用"
          : status.scriptlets === "pending"
            ? "待编译"
            : status.scriptlets === "disabled"
              ? "已关闭"
              : `未启用（${status.scriptlets || "未知错误"}）`;
  return `网络 ${status.ruleCount} 条（配额外 ${status.skipped}）· 元素隐藏 ${status.cosmeticCount || 0} 条 · scriptlet：${scriptlets} · ${source} · ${when}${err}`;
}

/**
 * @param {{ toast: (text: string) => void }} api
 */
export function initUblockPanel(api) {
  const { toast } = api;
  const statusEl = document.getElementById("ublockPanelStatus");
  const logWrap = /** @type {HTMLDetailsElement | null} */ (
    document.getElementById("ublockLogWrap")
  );
  const logEl = document.getElementById("ublockUpdateLog");
  const updateBtn = /** @type {HTMLButtonElement | null} */ (
    document.getElementById("ublockPanelUpdateNow")
  );
  const saveBtn = /** @type {HTMLButtonElement | null} */ (
    document.getElementById("ublockSaveConfig")
  );
  const resetBtn = /** @type {HTMLButtonElement | null} */ (
    document.getElementById("ublockResetConfig")
  );
  const optCosmetic = /** @type {HTMLInputElement | null} */ (
    document.getElementById("ublockOptCosmetic")
  );
  const optScriptlets = /** @type {HTMLInputElement | null} */ (
    document.getElementById("ublockOptScriptlets")
  );
  const listWrap = document.getElementById("ublockListToggles");
  const trustedEl = /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById("ublockTrustedSites")
  );
  const customEl = /** @type {HTMLTextAreaElement | null} */ (
    document.getElementById("ublockCustomFilters")
  );
  if (!listWrap) return;

  /** @type {Map<string, HTMLInputElement>} */
  const listInputs = new Map();
  for (const item of UBLOCK_LIST_META) {
    const label = document.createElement("label");
    label.className = "feature-row";
    const span = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = item.label;
    span.appendChild(strong);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.ublockList = item.id;
    label.append(span, input);
    listWrap.appendChild(label);
    listInputs.set(item.id, input);
  }

  function paintConfig(config) {
    if (optCosmetic) optCosmetic.checked = config.cosmetic;
    if (optScriptlets) optScriptlets.checked = config.scriptlets;
    for (const [id, input] of listInputs) {
      input.checked = config.lists[id] !== false;
    }
    if (trustedEl) trustedEl.value = config.trustedSites.join("\n");
    if (customEl) customEl.value = config.customFilters;
  }

  function readConfig() {
    /** @type {Record<string, boolean>} */
    const lists = {};
    for (const [id, input] of listInputs) lists[id] = input.checked;
    return normalizeUblockConfig({
      lists,
      cosmetic: optCosmetic ? optCosmetic.checked : true,
      scriptlets: optScriptlets ? optScriptlets.checked : true,
      badge: false,
      trustedSites: trustedEl ? trustedEl.value : "",
      customFilters: customEl ? customEl.value : "",
    });
  }

  let featureEnabled = true;
  let updating = false;

  function syncUpdateButton() {
    if (!updateBtn) return;
    updateBtn.disabled = updating || !featureEnabled;
    updateBtn.textContent = updating ? "更新中…" : "立即更新列表";
  }

  function paintStatus(status) {
    if (statusEl) statusEl.textContent = formatUblockStatus(status);
    syncUpdateButton();
  }

  function paintProgress(progress) {
    if (!progress || typeof progress !== "object") return;
    if (typeof progress.running === "boolean") {
      updating = progress.running;
      syncUpdateButton();
    }
    if (Array.isArray(progress.logs) && logEl) {
      logEl.textContent = progress.logs.length ? progress.logs.join("\n") : "暂无更新日志";
      logEl.scrollTop = logEl.scrollHeight;
      if (progress.running && logWrap) logWrap.open = true;
    }
  }

  saveBtn?.addEventListener("click", () => {
    saveBtn.disabled = true;
    void saveUblockConfig(readConfig())
      .then((saved) => {
        paintConfig(saved);
        toast("广告拦截配置已保存，正在应用规则");
      })
      .catch((error) => {
        toast(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        saveBtn.disabled = false;
      });
  });

  resetBtn?.addEventListener("click", () => {
    void saveUblockConfig(DEFAULT_UBLOCK_CONFIG)
      .then((saved) => {
        paintConfig(saved);
        toast("已恢复默认广告拦截配置");
      })
      .catch((error) => {
        toast(error instanceof Error ? error.message : String(error));
      });
  });

  updateBtn?.addEventListener("click", () => {
    updating = true;
    syncUpdateButton();
    if (logWrap) logWrap.open = true;
    if (logEl) logEl.textContent = "正在启动更新…";
    void chrome.runtime
      .sendMessage({ type: "FORMANT_UBLOCK_UPDATE_NOW" })
      .then((res) => {
        if (!res?.ok) throw new Error(res?.error || "更新失败");
        if (res.status) paintStatus(res.status);
        toast("过滤列表已更新");
      })
      .catch((error) => {
        toast(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        updating = false;
        syncUpdateButton();
        void loadUblockStatus().then(paintStatus);
      });
  });

  void loadFeatures().then((f) => {
    featureEnabled = isUblockEnabled(f);
    syncUpdateButton();
  });
  void loadUblockConfig().then(paintConfig);
  void loadUblockStatus().then(paintStatus);
  void chrome.storage.local.get(UBLOCK_PROGRESS_KEY).then((data) => {
    if (data?.[UBLOCK_PROGRESS_KEY]) paintProgress(data[UBLOCK_PROGRESS_KEY]);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[FEATURES_KEY]) {
      featureEnabled = isUblockEnabled(normalizeFeatures(changes[FEATURES_KEY].newValue));
      syncUpdateButton();
    }
    if (changes[UBLOCK_CONFIG_KEY]) {
      paintConfig(normalizeUblockConfig(changes[UBLOCK_CONFIG_KEY].newValue));
    }
    if (changes[UBLOCK_STATUS_KEY]) {
      void loadUblockStatus().then(paintStatus);
    }
    if (changes[UBLOCK_PROGRESS_KEY]) {
      paintProgress(changes[UBLOCK_PROGRESS_KEY].newValue);
    }
  });
}
