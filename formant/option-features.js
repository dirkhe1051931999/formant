import {
  FEATURES_KEY,
  isTranslateContextMenuEnabled,
  isTranslatePopupEnabled,
  isTranslateSelectionEnabled,
  loadFeatures,
  normalizeFeatures,
  saveFeatures,
} from "./features.js";

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
      "linuxdo.enabled": current.linuxdo.enabled,
      "hupu.enabled": current.hupu.enabled,
      "freefq.enabled": current.freefq.enabled,
      "huavod.enabled": current.huavod.enabled,
      "gemini.enabled": current.gemini.enabled,
      "gmail.enabled": current.gmail.enabled,
      "axure.enabled": current.axure.enabled,
      "vue.enabled": current.vue.enabled,
      "hls.enabled": current.hls.enabled,
      "imagePrompt.enabled": current.imagePrompt.enabled,
      "tools.enabled": current.tools.enabled,
    };
    for (const [path, value] of Object.entries(map)) {
      const input = /** @type {HTMLInputElement | null} */ (
        root.querySelector(`input[data-feature="${path}"]`)
      );
      if (input) input.checked = value;
    }
    syncDependentUi();

    const summary = document.getElementById("featuresSummary");
    if (summary) {
      const bits = [];
      if (isTranslatePopupEnabled(current)) bits.push("弹窗翻译");
      if (isTranslateSelectionEnabled(current)) bits.push("划词");
      if (isTranslateContextMenuEnabled(current)) bits.push("右键翻译");
      if (current.newtab.enabled) bits.push("New Tab");
      const imgs = [];
      if (current.imageSave.png) imgs.push("PNG");
      if (current.imageSave.jpg) imgs.push("JPG");
      if (imgs.length) bits.push(`另存为 ${imgs.join("/")}`);
      if (current.screenshot.enabled) bits.push("滚动截屏");
      if (current.office.enabled) bits.push("oolafOffice");
      if (current.v2ex.enabled) bits.push("V2EX Plus");
      if (current.gitzip.enabled) bits.push("GitZip");
      if (current.autopagerize.enabled) bits.push("AutoPagerize");
      if (current.proxy.enabled) bits.push("代理");
      if (current.extensions.enabled) bits.push("扩展管理");
      if (current.siteData.enabled) bits.push("站点数据");
      if (current.gestures.enabled) bits.push("鼠标手势");
      if (current.telegram.enabled) bits.push("Telegram 下载");
      if (current.xTranslate.enabled) bits.push("X 推文翻译");
      if (current.discord.enabled) bits.push("Discord 翻译");
      if (current.elitepvpers.enabled) bits.push("elitepvpers 翻译");
      if (current.linuxdo.enabled) bits.push("linux.do 列表");
      if (current.hupu.enabled) bits.push("虎扑帖子");
      if (current.freefq.enabled) bits.push("freefq 导出");
      if (current.huavod.enabled) bits.push("huavod 控制台");
      if (current.gemini.enabled) bits.push("Gemini 去水印");
      if (current.gmail.enabled) bits.push("Gmail 邮箱");
      if (current.axure.enabled) bits.push("Axure 原型");
      if (current.vue.enabled) bits.push("Vue 组件");
      if (current.hls.enabled) bits.push("HLS 播放");
      if (current.imagePrompt.enabled) bits.push("识图");
      if (current.tools.enabled) bits.push("工具箱");
      summary.textContent = bits.length ? `已启用：${bits.join(" · ")}` : "当前未启用任何可选能力";
    }
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
    else if (path === "linuxdo.enabled") current.linuxdo.enabled = on;
    else if (path === "hupu.enabled") current.hupu.enabled = on;
    else if (path === "freefq.enabled") current.freefq.enabled = on;
    else if (path === "huavod.enabled") current.huavod.enabled = on;
    else if (path === "gemini.enabled") current.gemini.enabled = on;
    else if (path === "gmail.enabled") current.gmail.enabled = on;
    else if (path === "axure.enabled") current.axure.enabled = on;
    else if (path === "vue.enabled") current.vue.enabled = on;
    else if (path === "hls.enabled") current.hls.enabled = on;
    else if (path === "imagePrompt.enabled") current.imagePrompt.enabled = on;
    else if (path === "tools.enabled") current.tools.enabled = on;
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

  void loadFeatures().then((f) => {
    current = f;
    paint();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[FEATURES_KEY]) return;
    current = normalizeFeatures(changes[FEATURES_KEY].newValue);
    paint();
  });
}
