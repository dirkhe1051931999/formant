import { isOfficeEnabled, loadFeatures } from "./features.js";

export const OFFICE_MENU_ROOT = "formant-office-root";
export const OFFICE_MENU_START = "formant-office-start";
export const OFFICE_MENU_WORD = "formant-office-word";
export const OFFICE_MENU_EXCEL = "formant-office-excel";
export const OFFICE_MENU_PPT = "formant-office-ppt";

/** Remove children before their parent. */
export const OFFICE_MENU_IDS = [
  OFFICE_MENU_START,
  OFFICE_MENU_WORD,
  OFFICE_MENU_EXCEL,
  OFFICE_MENU_PPT,
  OFFICE_MENU_ROOT,
];

export const OFFICE_PAGES = {
  start: "oolafoffice/index.html",
  word: "oolafoffice/quire/index.html?new",
  excel: "oolafoffice/ledger/index.html?new",
  ppt: "oolafoffice/lectern/index.html?new",
};

const PAGE_PATTERNS = ["http://*/*", "https://*/*"];

const MENU_PAGES = {
  [OFFICE_MENU_START]: OFFICE_PAGES.start,
  [OFFICE_MENU_WORD]: OFFICE_PAGES.word,
  [OFFICE_MENU_EXCEL]: OFFICE_PAGES.excel,
  [OFFICE_MENU_PPT]: OFFICE_PAGES.ppt,
};

/**
 * @param {string} path
 */
export function officePageUrl(path) {
  const [file, query] = String(path || "").split("?");
  const url = chrome.runtime.getURL(file);
  return query ? `${url}?${query}` : url;
}

/**
 * @param {string} kind
 * @param {number} [openerTabId]
 */
export async function openOfficePage(kind, openerTabId) {
  const path = OFFICE_PAGES[kind];
  if (!path) return false;
  const features = await loadFeatures();
  if (!isOfficeEnabled(features)) return true;
  await openOfficeUrl(path, openerTabId);
  return true;
}

/**
 * @param {string} path
 * @param {number} [openerTabId]
 */
async function openOfficeUrl(path, openerTabId) {
  /** @type {chrome.tabs.CreateProperties} */
  const create = { url: officePageUrl(path) };
  if (openerTabId) create.openerTabId = openerTabId;
  try {
    await chrome.tabs.create(create);
  } catch {
    delete create.openerTabId;
    await chrome.tabs.create(create);
  }
}

/**
 * @param {chrome.contextMenus.CreateProperties} create
 * @param {import("./features.js").FormantFeatures} features
 */
export function addOfficeContextMenus(create, features) {
  if (!isOfficeEnabled(features)) return;
  const shared = {
    contexts: ["page", "frame", "editable", "selection", "image", "link"],
    documentUrlPatterns: PAGE_PATTERNS,
  };
  create({
    id: OFFICE_MENU_ROOT,
    title: "formant oolafOffice",
    ...shared,
  });
  create({
    id: OFFICE_MENU_START,
    parentId: OFFICE_MENU_ROOT,
    title: "起始页",
    ...shared,
  });
  create({
    id: OFFICE_MENU_WORD,
    parentId: OFFICE_MENU_ROOT,
    title: "Word",
    ...shared,
  });
  create({
    id: OFFICE_MENU_EXCEL,
    parentId: OFFICE_MENU_ROOT,
    title: "Excel",
    ...shared,
  });
  create({
    id: OFFICE_MENU_PPT,
    parentId: OFFICE_MENU_ROOT,
    title: "PPT",
    ...shared,
  });
}

/**
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab | undefined} tab
 */
export async function handleOfficeContextMenu(info, tab) {
  const path = MENU_PAGES[String(info.menuItemId || "")];
  if (!path) return false;
  const features = await loadFeatures();
  if (!isOfficeEnabled(features)) return true;
  await openOfficeUrl(path, tab?.id);
  return true;
}
