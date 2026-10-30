import { isNewtabEnabled, loadFeatures } from "./features.js";
import { bindRememberNewtabTab } from "./newtab-tab.js";

const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.type = "image/png";
favicon.href = chrome.runtime.getURL("icons/newtab-32.png");
document.querySelectorAll("link[rel~='icon']").forEach((node) => node.remove());
document.head.appendChild(favicon);

const features = await loadFeatures();
if (!isNewtabEnabled(features)) {
  document.title = "New Tab";
  document.body.replaceChildren();
  document.body.style.cssText =
    "margin:0;font:14px/1.5 Segoe UI,PingFang SC,Microsoft YaHei,sans-serif;color:#667084;background:#f4f6f9;display:grid;place-items:center;min-height:100vh;padding:24px;text-align:center";
  document.body.innerHTML = `
  <div>
    <p style="margin:0 0 8px;color:#151a22;font-weight:650">formant New Tab 已关闭</p>
    <p style="margin:0 0 16px">可在扩展设置 → 功能 中重新开启。正在尝试打开浏览器默认新标签页…</p>
    <p style="margin:0">
      <button type="button" id="btnNtp" style="margin-right:10px;border:1px solid #e5eaf0;border-radius:8px;background:#fff;padding:6px 12px;cursor:pointer;font:inherit;color:#1f4b99">打开默认新标签页</button>
      <button type="button" id="btnOpt" style="border:1px solid #e5eaf0;border-radius:8px;background:#fff;padding:6px 12px;cursor:pointer;font:inherit;color:#1f4b99">扩展设置</button>
    </p>
  </div>`;

  const goNtp = () => {
    void chrome.tabs.getCurrent().then((tab) => {
      if (tab?.id) {
        void chrome.tabs.update(tab.id, { url: "chrome://new-tab-page/" });
        return;
      }
      location.replace("chrome://new-tab-page/");
    });
  };

  document.getElementById("btnNtp")?.addEventListener("click", goNtp);
  document.getElementById("btnOpt")?.addEventListener("click", () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("option.html#features") });
  });
  goNtp();
} else {
  bindRememberNewtabTab();
  await import("./newtab.js");
  const { mountNewtabMenu } = await import("./newtab-calc.js");
  mountNewtabMenu();
}
