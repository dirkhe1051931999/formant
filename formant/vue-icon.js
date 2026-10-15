const PLAIN = {
  16: "icons/icon16.png",
  32: "icons/icon32.png",
  48: "icons/icon48.png",
  128: "icons/icon128.png",
};

const VUE = {
  16: "icons/icon16-vue.png",
  32: "icons/icon32-vue.png",
  48: "icons/icon48-vue.png",
  128: "icons/icon128-vue.png",
};

/**
 * @param {number} tabId
 * @param {boolean} present
 */
export async function paintVueIcon(tabId, present) {
  await chrome.action.setIcon({
    tabId,
    path: present ? VUE : PLAIN,
  });
}
