import {
  FEATURES_KEY,
  loadFeatures,
  normalizeFeatures,
  saveFeatures,
} from "./features.js";
import { UBLOCK_STATUS_KEY, loadUblockStatus } from "./ublock-sync.js";
import { formatUblockStatus } from "./option-ublock.js";

/**
 * @typedef {{ toast: (text: string) => void }} PanelApi
 */

/**
 * @param {PanelApi} api
 */
export function initFeaturesPanel(api) {
  const { toast } = api;
  const root = document.getElementById("featuresForm");
  if (!root) return;

  /** @type {import("./features.js").FormantFeatures | null} */
  let current = null;
  const statusEl = document.getElementById("ublockStatus");
  const updateBtn = document.getElementById("ublockUpdateNow");

  function syncDependentUi() {
    if (!current) return;
    const masterOn = current.translate.enabled;
    root.querySelectorAll("[data-requires-translate]").forEach((el) => {
      const input = /** @type {HTMLInputElement} */ (el);
      input.disabled = !masterOn;
      input.closest(".feature-row")?.classList.toggle("is-disabled", !masterOn);
    });
  }

  function paint() {
    if (!current) return;
    const map = {
      "translate.enabled": current.translate.enabled,
      "translate.popup": current.translate.popup,
      "translate.selection": current.translate.selection,
      "translate.contextMenu": current.translate.contextMenu,
      "newtab.enabled": current.newtab.enabled,
      "imageSave.png": current.imageSave.png,
      "imageSave.jpg": current.imageSave.jpg,
      "screenshot.enabled": current.screenshot.enabled,
      "office.enabled": current.office.enabled,
      "v2ex.enabled": current.v2ex.enabled,
      "gitzip.enabled": current.gitzip.enabled,
      "autopagerize.enabled": current.autopagerize.enabled,
      "proxy.enabled": current.proxy.enabled,
      "extensions.enabled": current.extensions.enabled,
      "siteData.enabled": current.siteData.enabled,
      "gestures.enabled": current.gestures.enabled,
      "telegram.enabled": current.telegram.enabled,
      "xTranslate.enabled": current.xTranslate.enabled,
      "discord.enabled": current.discord.enabled,
      "elitepvpers.enabled": current.elitepvpers.enabled,
      "githubIssues.enabled": current.githubIssues.enabled,
      "linuxdo.enabled": current.linuxdo.enabled,
      "hupu.enabled": current.hupu.enabled,
      "freefq.enabled": current.freefq.enabled,
      "huavod.enabled": current.huavod.enabled,
      "gemini.enabled": current.gemini.enabled,
      "gmail.enabled": current.gmail.enabled,
      "axure.enabled": current.axure.enabled,
      "vue.enabled": current.vue.enabled,
      "techDetect.enabled": current.techDetect.enabled,
      "hls.enabled": current.hls.enabled,
      "imagePrompt.enabled": current.imagePrompt.enabled,
      "tools.enabled": current.tools.enabled,
      "userscript.enabled": current.userscript.enabled,
      "ublock.enabled": current.ublock.enabled,
    };
    for (const [path, value] of Object.entries(map)) {
      const input = /** @type {HTMLInputElement | null} */ (
        root.querySelector(`input[data-feature="${path}"]`)
      );
      if (input) input.checked = value;
    }
    syncDependentUi();
    if (updateBtn) updateBtn.disabled = !current.ublock.enabled;
  }

  root.addEventListener("change", (event) => {
    const input = /** @type {HTMLInputElement | null} */ (
      event.target instanceof HTMLInputElement && event.target.matches("[data-feature]")
        ? event.target
        : null
    );
    if (!input || !current) return;
    const path = input.getAttribute("data-feature") || "";
    const on = input.checked;

    if (path === "translate.enabled") current.translate.enabled = on;
    else if (path === "translate.popup") current.translate.popup = on;
    else if (path === "translate.selection") current.translate.selection = on;
    else if (path === "translate.contextMenu") current.translate.contextMenu = on;
    else if (path === "newtab.enabled") current.newtab.enabled = on;
    else if (path === "imageSave.png") current.imageSave.png = on;
    else if (path === "imageSave.jpg") current.imageSave.jpg = on;
    else if (path === "screenshot.enabled") current.screenshot.enabled = on;
    else if (path === "office.enabled") current.office.enabled = on;
    else if (path === "v2ex.enabled") current.v2ex.enabled = on;
    else if (path === "gitzip.enabled") current.gitzip.enabled = on;
    else if (path === "autopagerize.enabled") current.autopagerize.enabled = on;
    else if (path === "proxy.enabled") current.proxy.enabled = on;
    else if (path === "extensions.enabled") current.extensions.enabled = on;
    else if (path === "siteData.enabled") current.siteData.enabled = on;
    else if (path === "gestures.enabled") current.gestures.enabled = on;
    else if (path === "telegram.enabled") current.telegram.enabled = on;
    else if (path === "xTranslate.enabled") current.xTranslate.enabled = on;
    else if (path === "discord.enabled") current.discord.enabled = on;
    else if (path === "elitepvpers.enabled") current.elitepvpers.enabled = on;
    else if (path === "githubIssues.enabled") current.githubIssues.enabled = on;
    else if (path === "linuxdo.enabled") current.linuxdo.enabled = on;
    else if (path === "hupu.enabled") current.hupu.enabled = on;
    else if (path === "freefq.enabled") current.freefq.enabled = on;
    else if (path === "huavod.enabled") current.huavod.enabled = on;
    else if (path === "gemini.enabled") current.gemini.enabled = on;
    else if (path === "gmail.enabled") current.gmail.enabled = on;
    else if (path === "axure.enabled") current.axure.enabled = on;
    else if (path === "vue.enabled") current.vue.enabled = on;
    else if (path === "techDetect.enabled") current.techDetect.enabled = on;
    else if (path === "hls.enabled") current.hls.enabled = on;
    else if (path === "imagePrompt.enabled") current.imagePrompt.enabled = on;
    else if (path === "tools.enabled") current.tools.enabled = on;
    else if (path === "userscript.enabled") current.userscript.enabled = on;
    else if (path === "ublock.enabled") current.ublock.enabled = on;
    else return;

    void (async () => {
      current = await saveFeatures(current);
      paint();
      toast("功能开关已保存");
    })().catch((error) => {
      toast(error instanceof Error ? error.message : String(error));
      void loadFeatures().then((f) => {
        current = f;
        paint();
      });
    });
  });

  root.querySelectorAll("[data-open-tools]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-open-tools") || "";
      const url = chrome.runtime.getURL(id ? `tools.html#${id}` : "tools.html");
      void chrome.tabs.create({ url });
    });
  });

  /**
   * @param {Awaited<ReturnType<typeof loadUblockStatus>>} status
   */
  function paintUblockStatus(status) {
    if (!statusEl) return;
    statusEl.textContent = formatUblockStatus(status);
  }

  void loadUblockStatus().then(paintUblockStatus);

  updateBtn?.addEventListener("click", () => {
    updateBtn.disabled = true;
    void chrome.runtime
      .sendMessage({ type: "FORMANT_UBLOCK_UPDATE_NOW" })
      .then((res) => {
        if (!res?.ok) throw new Error(res?.error || "更新失败");
        if (res.status) paintUblockStatus(res.status);
        toast("过滤列表已更新");
      })
      .catch((error) => {
        toast(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        updateBtn.disabled = !current?.ublock.enabled;
      });
  });

  void loadFeatures().then((f) => {
    current = f;
    paint();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[FEATURES_KEY]) {
      current = normalizeFeatures(changes[FEATURES_KEY].newValue);
      paint();
    }
    if (changes[UBLOCK_STATUS_KEY]) {
      void loadUblockStatus().then(paintUblockStatus);
    }
  });
}
