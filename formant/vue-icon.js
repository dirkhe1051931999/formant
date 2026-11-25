import { setTabVue } from "./action-icon.js";

/**
 * @param {number} tabId
 * @param {boolean} present
 */
export async function paintVueIcon(tabId, present) {
  await setTabVue(tabId, present);
}
