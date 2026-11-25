export function initPopupPageInfo() {
  const el = document.getElementById("popupPageInfo");
  if (!el) return;

  void chrome.tabs
    .query({ active: true, lastFocusedWindow: true })
    .then(([tab]) => {
      if (tab?.id == null) return null;
      return chrome.runtime.sendMessage({ type: "FORMANT_TAB_PAGE_INFO", tabId: tab.id });
    })
    .then((res) => {
      if (!res?.ok) return;
      const parts = [];
      if (res.frameworkName) parts.push(`当前页面：${res.frameworkName}`);
      if (res.adCount > 0) parts.push(`已过滤广告 ${res.adCount}`);
      if (!parts.length) return;
      el.textContent = parts.join(" · ");
      el.hidden = false;
    })
    .catch(() => {});
}
