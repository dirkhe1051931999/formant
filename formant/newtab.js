import {
  ITEM_BG_COLORS,
  buildSearchUrl,
  countVisibleHomeItems,
  createItemId,
  currentPage,
  faviconFromUrl,
  isDefaultFaviconSrc,
  isGoogleS2Favicon,
  attachFaviconFallback,
  normalizeHome,
} from "./home-model.js";
import {
  CACHE_KEYS,
  HOME_KEYS,
  createItemOnMono,
  deleteItemOnMono,
  dismissVocabWord,
  ensureVocabFromMono,
  loadLocalHomeState,
  loadWidgetCache,
  pullHomeFromMono,
  pushHomeToMono,
  refreshExchangeFromMono,
  refreshHolidaysFromMono,
  refreshStaleWidgetsFromMono,
  refreshVocabFromMono,
  refreshWeatherFromMono,
  refreshWidgetsFromMono,
  saveLocalHome,
  tryReconcileHomeFromMono,
  updateItemOnMono,
} from "./home-sync.js";
import {
  applyItemFavicon,
  getCached,
  cacheKeyForItem,
  loadFaviconCache,
  reconcileFaviconCache,
} from "./favicon-cache.js";
import { tickWeatherAgeLabels } from "./newtab-widgets.js";
import { loadWxFace, renderWeatherCalendarWidget } from "./newtab-wx.js";
import {
  exchangeCacheMatches,
  getExchangePrefs,
  isExchangeEditing,
  loadExchangePrefs,
} from "./newtab-exchange.js";
import { loadHxFace, renderHolidayExchangeWidget } from "./newtab-hx.js";
import { renderHlsWidget } from "./newtab-hls.js";
import { renderVocabWidget } from "./newtab-vocab.js";
import { loadStudyWords, loadVocabFace } from "./study-words.js";

function scheduleFaviconReconcile() {
  void reconcileFaviconCache(home).catch((error) => {
    console.warn("[formant] favicon reconcile failed", error);
  });
}

/** @type {import("./home-model.js").NewtabHome} */
let home = normalizeHome(null);
let revision = 0;
/** @type {string | null} */
let editingId = null;
let persistTimer = 0;
/** @type {string | null} */
let dragSourceId = null;
/** @type {string | null} */
let dragFromFolderId = null;
/** @type {string | null} */
let openFolderId = null;
let suppressTileClick = false;
let itemDialogBusy = false;

const wallpaperEl = document.getElementById("wallpaper");
const dimEl = document.getElementById("dim");
const searchForm = document.getElementById("searchForm");
const searchInput = /** @type {HTMLInputElement} */ (document.getElementById("searchInput"));
const widgetRow = document.getElementById("widgetRow");
const iconGrid = document.getElementById("iconGrid");
const refreshBtn = document.getElementById("refreshBtn");
const syncBtn = document.getElementById("syncBtn");
const topActionStatus = document.getElementById("topActionStatus");
const folderDialog = /** @type {HTMLDialogElement} */ (document.getElementById("folderDialog"));
const folderScrim = document.getElementById("folderScrim");
const folderBody = document.getElementById("folderBody");
const folderTitle = document.getElementById("folderTitle");
const itemDialog = /** @type {HTMLDialogElement} */ (document.getElementById("itemDialog"));
const itemForm = /** @type {HTMLFormElement} */ (document.getElementById("itemForm"));
const itemBgSwatches = document.getElementById("itemBgSwatches");
const itemFaviconPreview = /** @type {HTMLImageElement} */ (document.getElementById("itemFaviconPreview"));
const itemFormError = document.getElementById("itemFormError");
const itemDialogBusyEl = document.getElementById("itemDialogBusy");
const itemDialogBusyLabel = document.getElementById("itemDialogBusyLabel");
const TILE_EXT_ICON = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6.25 3.5H4.25A1.75 1.75 0 0 0 2.5 5.25v6.5A1.75 1.75 0 0 0 4.25 13.5h6.5a1.75 1.75 0 0 0 1.75-1.75v-2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M9 3.5h4.5V8M13.5 3.5 7.25 9.75" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const els = {
  itemName: /** @type {HTMLInputElement} */ (document.getElementById("itemName")),
  itemUrl: /** @type {HTMLInputElement} */ (document.getElementById("itemUrl")),
  itemSrc: /** @type {HTMLInputElement} */ (document.getElementById("itemSrc")),
  itemIconText: /** @type {HTMLInputElement} */ (document.getElementById("itemIconText")),
  itemBg: /** @type {HTMLInputElement} */ (document.getElementById("itemBg")),
  itemType: /** @type {HTMLSelectElement} */ (document.getElementById("itemType")),
  itemDeleteBtn: /** @type {HTMLButtonElement} */ (document.getElementById("itemDeleteBtn")),
  itemCancelBtn: /** @type {HTMLButtonElement} */ (document.getElementById("itemCancelBtn")),
  itemDialogTitle: document.getElementById("itemDialogTitle"),
};

let topActionStatusTimer = 0;

function setTopActionStatus(text, kind = "info", durationMs = 5_000) {
  if (!topActionStatus) return;
  window.clearTimeout(topActionStatusTimer);
  topActionStatus.hidden = !text;
  topActionStatus.textContent = text;
  topActionStatus.classList.toggle("is-error", kind === "error");
  if (text && durationMs > 0) {
    topActionStatusTimer = window.setTimeout(() => {
      topActionStatus.hidden = true;
    }, durationMs);
  }
}

function emptyHomeHint(reason) {
  if (reason === "missing-key") {
    return "本机还没有主页图标。换电脑后请先在设置 → 同步 填写同一组 Client API Key，打开新标签页会自动拉取；也可点右上角「刷新」。";
  }
  if (reason === "from-default") {
    return "云端还没有你的个人主页。请在已有图标的那台电脑点「同步」上传，再在这台点「刷新」。";
  }
  return "本机主页是空的。打开新标签页会自动拉取云端；「同步」上传本机，空主页或较旧本机不会覆盖云端。";
}

function paintEmptyHint(reason = "") {
  const hint = document.getElementById("iconEmptyHint");
  if (!hint) return;
  const empty = countVisibleHomeItems(home) === 0;
  hint.hidden = !empty;
  hint.textContent = empty ? emptyHomeHint(reason) : "";
}

function setFormError(text = "") {
  if (!itemFormError) return;
  itemFormError.hidden = !text;
  itemFormError.textContent = text;
}

/**
 * @param {boolean} busy
 * @param {string} [label]
 */
function setItemDialogBusy(busy, label = "处理中…") {
  itemDialogBusy = busy;
  itemDialog.classList.toggle("is-busy", busy);
  itemDialog.setAttribute("aria-busy", busy ? "true" : "false");
  itemForm.inert = busy;
  if (itemDialogBusyEl) itemDialogBusyEl.hidden = !busy;
  if (itemDialogBusyLabel && busy) itemDialogBusyLabel.textContent = label;
}

function finishItemDialog() {
  setItemDialogBusy(false);
  closeAnimatedDialog(itemDialog);
}

/**
 * @param {HTMLDialogElement} dialog
 * @param {{ modal?: boolean, force?: boolean }} [opts]
 */
function closeAnimatedDialog(dialog, opts = {}) {
  if (dialog === itemDialog && itemDialogBusy && !opts.force) return;
  if (!dialog.open || dialog.classList.contains("is-closing")) return;
  if (dialog === folderDialog) {
    folderScrim?.classList.remove("is-open");
  }
  dialog.classList.add("is-closing");
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    dialog.classList.remove("is-closing");
    dialog.close();
    if (dialog === folderDialog && folderScrim) {
      folderScrim.hidden = true;
      folderScrim.classList.remove("is-open");
    }
  };
  const onEnd = (event) => {
    if (event.target !== dialog) return;
    dialog.removeEventListener("transitionend", onEnd);
    finish();
  };
  dialog.addEventListener("transitionend", onEnd);
  window.setTimeout(finish, 220);
}

/**
 * @param {HTMLDialogElement} dialog
 * @param {{ modal?: boolean }} [opts]
 */
function openAnimatedDialog(dialog, opts = {}) {
  dialog.classList.remove("is-closing");
  const modal = opts.modal !== false && dialog !== folderDialog;
  if (dialog === folderDialog && folderScrim) {
    folderScrim.hidden = false;
    void folderScrim.offsetWidth;
    folderScrim.classList.add("is-open");
    dialog.show();
    return;
  }
  if (modal) dialog.showModal();
  else dialog.show();
}

function applyChrome() {
  const { wallpaperUrl, wallpaperMask, showSearch } = home.baseConfig;
  wallpaperEl.style.background = wallpaperUrl
    ? `center / cover no-repeat url("${wallpaperUrl.replaceAll('"', "")}")`
    : "linear-gradient(145deg,#0b1c33,#1a3a5c 48%,#0f766e)";
  dimEl.style.background = `rgba(255,255,255,${Math.min(0.72, 0.18 + wallpaperMask * 0.55)})`;
  searchForm.hidden = !showSearch;
}

function schedulePersist() {
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    void saveLocalHome(home, { revision }).then(() => scheduleFaviconReconcile());
  }, 250);
}

/**
 * @param {HTMLDialogElement} dialog
 */
function bindDialogBackdropClose(dialog) {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeAnimatedDialog(dialog);
  });
}

function selectBgColor(color) {
  const next = ITEM_BG_COLORS.includes(color) ? color : ITEM_BG_COLORS[0];
  els.itemBg.value = next;
  itemBgSwatches?.querySelectorAll(".color-swatch").forEach((node) => {
    node.classList.toggle("is-selected", node.getAttribute("data-color") === next);
  });
}

function initColorSwatches() {
  if (!itemBgSwatches) return;
  itemBgSwatches.replaceChildren();
  for (const color of ITEM_BG_COLORS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "color-swatch";
    btn.style.background = color;
    btn.dataset.color = color;
    btn.title = color;
    btn.setAttribute("aria-label", color);
    btn.addEventListener("click", () => selectBgColor(color));
    itemBgSwatches.appendChild(btn);
  }
}

function updateFaviconPreview() {
  const src = els.itemSrc.value.trim();
  if (!src) {
    itemFaviconPreview.hidden = true;
    itemFaviconPreview.removeAttribute("src");
    return;
  }
  itemFaviconPreview.hidden = false;
  const previewItem = { url: els.itemUrl.value.trim(), src, type: "icon" };
  const cached = getCached(cacheKeyForItem(previewItem));
  if (cached?.dataUrl) {
    itemFaviconPreview.src = cached.dataUrl;
    return;
  }
  itemFaviconPreview.src = src;
  attachFaviconFallback(itemFaviconPreview, els.itemUrl.value.trim());
}

/**
 * @param {{ force?: boolean }} [opts]
 */
function syncFaviconFromUrl({ force = false } = {}) {
  const raw = els.itemUrl.value.trim();
  if (!raw) return;
  const next = faviconFromUrl(raw);
  if (!next) return;
  if (force || els.itemSrc.dataset.manual !== "1") {
    els.itemSrc.value = next;
    delete els.itemSrc.dataset.manual;
  }
  updateFaviconPreview();
}

/**
 * @param {import("./home-model.js").NewtabItem} child
 */
function renderFolderCell(child) {
  const cell = document.createElement("span");
  cell.className = "folder-cell";
  if (child.backgroundColor) cell.style.background = child.backgroundColor;
  if (child.type === "text") {
    cell.textContent = (child.iconText || child.name || "").slice(0, 2);
  } else {
    applyItemFavicon(cell, child, { textLen: 2 });
  }
  return cell;
}

function homeSyncStatus(remote, pushedLabel) {
  if (remote.keptRemote) {
    return `云端主页较新，已改用云端 · revision ${remote.revision}（未用本机覆盖）`;
  }
  return `${pushedLabel} · revision ${remote.revision}`;
}

function persistLayoutChange() {
  schedulePersist();
  void pushHomeToMono(home)
    .then((remote) => {
      home = remote.home;
      revision = remote.revision;
      setTopActionStatus(homeSyncStatus(remote, "主页已自动同步"));
      renderIcons();
      refreshOpenFolder();
      scheduleFaviconReconcile();
    })
    .catch((error) => {
      console.warn("[formant] layout change local-only", error);
    });
}

/**
 * Pull an item out of its folder onto the home grid.
 * @param {string} itemId
 * @param {string} [folderId]
 * @param {{ beforeId?: string | null, persist?: boolean }} [opts]
 */
function moveItemOutOfFolder(
  itemId,
  folderId = dragFromFolderId || openFolderId || "",
  opts = {},
) {
  const page = currentPage(home);
  const folder = page.children.find((item) => item.id === folderId && item.type === "folder");
  if (!folder?.children) return false;
  const index = folder.children.findIndex((child) => child.id === itemId);
  if (index < 0) return false;

  const [moved] = folder.children.splice(index, 1);
  folder.children = folder.children.map((child, order) => ({ ...child, order }));

  const beforeId = opts.beforeId || null;
  const insertAt = beforeId
    ? page.children.findIndex((item) => item.id === beforeId)
    : -1;
  if (insertAt >= 0) {
    page.children.splice(insertAt, 0, moved);
  } else {
    page.children.push(moved);
  }

  if (folder.children.length === 0) {
    page.children = page.children.filter((item) => item.id !== folderId);
    openFolderId = null;
    if (folderDialog.open) closeAnimatedDialog(folderDialog);
  }

  home = normalizeHome(home);
  suppressTileClick = true;
  renderIcons();
  refreshOpenFolder();
  if (opts.persist !== false) persistLayoutChange();
  return true;
}

function refreshOpenFolder() {
  if (!openFolderId || !folderDialog.open) return;
  const page = currentPage(home);
  const folder = page.children.find((item) => item.id === openFolderId && item.type === "folder");
  if (!folder) {
    openFolderId = null;
    closeAnimatedDialog(folderDialog);
    return;
  }
  folderTitle.textContent = folder.name;
  folderBody.replaceChildren();
  for (const child of folder.children || []) {
    folderBody.appendChild(renderTile(child, { inFolder: true, folderId: folder.id }));
  }
}

function clearDragUi() {
  const roots = [iconGrid, folderBody].filter(Boolean);
  for (const root of roots) {
    root.querySelectorAll(".drop-target, .drop-before, .drop-after").forEach((node) => {
      node.classList.remove("drop-target", "drop-before", "drop-after");
    });
  }
  folderDialog.classList.remove("is-extract-target");
}

/**
 * Left/right edge = reorder; center = merge into folder.
 * @param {HTMLElement} el
 * @param {DragEvent} event
 * @returns {"before"|"after"|"merge"}
 */
function dropIntent(el, event) {
  const rect = el.getBoundingClientRect();
  const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5;
  if (ratio < 0.32) return "before";
  if (ratio > 0.68) return "after";
  return "merge";
}

/**
 * @param {HTMLElement} el
 * @param {"before"|"after"|"merge"} intent
 */
function paintDropIntent(el, intent) {
  el.classList.toggle("drop-before", intent === "before");
  el.classList.toggle("drop-after", intent === "after");
  el.classList.toggle("drop-target", intent === "merge");
}

/**
 * @param {import("./home-model.js").NewtabItem[]} list
 * @param {string} sourceId
 * @param {string} targetId
 * @param {"before"|"after"} place
 */
function reorderInList(list, sourceId, targetId, place) {
  const from = list.findIndex((item) => item.id === sourceId);
  const to = list.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0 || from === to) return false;
  const [moved] = list.splice(from, 1);
  let insertAt = list.findIndex((item) => item.id === targetId);
  if (insertAt < 0) return false;
  if (place === "after") insertAt += 1;
  list.splice(insertAt, 0, moved);
  list.forEach((item, order) => {
    item.order = order;
  });
  return true;
}

/**
 * @param {string} sourceId
 * @param {string} targetId
 * @param {"before"|"after"} place
 * @param {string | null} [folderId]
 */
function reorderItems(sourceId, targetId, place, folderId = null) {
  const page = currentPage(home);
  if (folderId) {
    const folder = page.children.find((item) => item.id === folderId && item.type === "folder");
    if (!folder?.children) return;
    if (!reorderInList(folder.children, sourceId, targetId, place)) return;
  } else if (!reorderInList(page.children, sourceId, targetId, place)) {
    return;
  }
  home = normalizeHome(home);
  renderIcons();
  refreshOpenFolder();
  persistLayoutChange();
}

/**
 * @param {HTMLElement} el
 * @param {import("./home-model.js").NewtabItem} item
 * @param {{ inFolder?: boolean, folderId?: string | null }} [opts]
 */
function bindTileDrag(el, item, { inFolder = false, folderId = null } = {}) {
  if (item.type === "component") return;
  el.draggable = true;
  el.dataset.itemId = item.id;
  if (folderId) el.dataset.folderId = folderId;

  el.addEventListener("dragstart", (event) => {
    dragSourceId = item.id;
    dragFromFolderId = folderId || null;
    suppressTileClick = false;
    event.dataTransfer?.setData("text/plain", item.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    el.classList.add("is-dragging");
    if (folderId) {
      folderDialog.classList.add("is-extract-target");
      // Let drops reach the home grid behind the scrim.
      if (folderScrim) folderScrim.style.pointerEvents = "none";
    }
  });

  el.addEventListener("dragend", () => {
    el.classList.remove("is-dragging");
    if (folderScrim) folderScrim.style.pointerEvents = "";
    clearDragUi();
    window.setTimeout(() => {
      dragSourceId = null;
      dragFromFolderId = null;
    }, 0);
  });

  el.addEventListener("dragover", (event) => {
    if (!dragSourceId || dragSourceId === item.id) return;
    // From folder onto home: always place beside (no merge).
    // Inside folder: reorder only.
    // Home-to-home: edge = reorder, center = merge.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    let intent = dropIntent(el, event);
    if (inFolder || dragFromFolderId) {
      intent = intent === "after" ? "after" : "before";
    } else if (item.type === "folder" && intent === "merge") {
      intent = "merge";
    }
    iconGrid?.querySelectorAll(".drop-target, .drop-before, .drop-after").forEach((node) => {
      if (node !== el) node.classList.remove("drop-target", "drop-before", "drop-after");
    });
    folderBody?.querySelectorAll(".drop-target, .drop-before, .drop-after").forEach((node) => {
      if (node !== el) node.classList.remove("drop-target", "drop-before", "drop-after");
    });
    paintDropIntent(el, intent);
  });

  el.addEventListener("dragleave", (event) => {
    if (event.relatedTarget instanceof Node && el.contains(event.relatedTarget)) return;
    el.classList.remove("drop-target", "drop-before", "drop-after");
  });

  el.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const intent = dropIntent(el, event);
    el.classList.remove("drop-target", "drop-before", "drop-after");
    const fromId = event.dataTransfer?.getData("text/plain") || dragSourceId;
    if (!fromId || fromId === item.id) return;
    suppressTileClick = true;

    if (dragFromFolderId && !inFolder) {
      const beforeId = intent === "after" ? null : item.id;
      if (intent === "after") {
        // insert after target: find next sibling as beforeId, or append
        const page = currentPage(home);
        const idx = page.children.findIndex((child) => child.id === item.id);
        const next = idx >= 0 ? page.children[idx + 1] : null;
        moveItemOutOfFolder(fromId, dragFromFolderId, { beforeId: next?.id || null });
      } else {
        moveItemOutOfFolder(fromId, dragFromFolderId, { beforeId });
      }
      return;
    }

    if (inFolder && folderId) {
      const place = intent === "after" ? "after" : "before";
      reorderItems(fromId, item.id, place, folderId);
      return;
    }

    if (intent === "before" || intent === "after") {
      reorderItems(fromId, item.id, intent, null);
      return;
    }
    mergeItems(fromId, item.id);
  });
}

/**
 * @param {string} sourceId
 * @param {string} targetId
 */
function mergeItems(sourceId, targetId) {
  const page = currentPage(home);
  const children = page.children;
  const sourceIndex = children.findIndex((item) => item.id === sourceId);
  const targetIndex = children.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;

  const source = children[sourceIndex];
  const target = children[targetIndex];
  if (source.type === "component" || target.type === "component") return;
  if (source.type === "folder" && target.type !== "folder") return;

  children.splice(sourceIndex, 1);
  const nextTargetIndex = children.findIndex((item) => item.id === targetId);
  if (nextTargetIndex < 0) return;
  const nextTarget = children[nextTargetIndex];

  if (nextTarget.type === "folder") {
    const list = nextTarget.children || [];
    if (source.type === "folder") {
      list.push(...(source.children || []));
    } else {
      list.push(source);
    }
    nextTarget.children = list.map((child, order) => ({ ...child, order }));
  } else {
    children[nextTargetIndex] = {
      id: createItemId(),
      type: "folder",
      name: "文件夹",
      order: nextTarget.order,
      backgroundColor: "#ffffff",
      size: "1x1",
      children: [
        { ...nextTarget, order: 0 },
        { ...source, order: 1 },
      ],
    };
  }

  home = normalizeHome(home);
  renderIcons();
  persistLayoutChange();
}

function renderTile(item, { inFolder = false, folderId = null } = {}) {
  const isLink = item.type === "icon" || item.type === "text";
  const el = document.createElement(isLink ? "div" : "button");
  el.className = "tile";
  if (!isLink) el.type = "button";

  const icon = document.createElement("div");
  icon.className = "tile__icon";
  if (item.backgroundColor) icon.style.background = item.backgroundColor;

  if (item.type === "folder") {
    icon.classList.add("tile__icon--folder");
    for (const child of (item.children || []).slice(0, 4)) {
      icon.appendChild(renderFolderCell(child));
    }
  } else if (item.type !== "text") {
    applyItemFavicon(icon, item, { textLen: 4 });
  } else {
    icon.classList.add("tile__icon--text");
    icon.textContent = item.iconText || item.name.slice(0, 4);
  }

  const name = document.createElement("div");
  name.className = "tile__name";
  name.textContent = item.name;

  if (isLink) {
    const wrap = document.createElement("div");
    wrap.className = "tile__icon-wrap";
    wrap.append(icon);
    if (item.url) {
      const ext = document.createElement("button");
      ext.type = "button";
      ext.className = "tile__ext";
      ext.title = "新标签打开";
      ext.setAttribute("aria-label", `新标签打开 ${item.name}`);
      ext.innerHTML = TILE_EXT_ICON;
      ext.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (suppressTileClick) {
          suppressTileClick = false;
          return;
        }
        window.open(item.url, "_blank", "noopener,noreferrer");
      });
      wrap.append(ext);
    }
    const hit = document.createElement("a");
    hit.className = "tile__hit";
    hit.href = item.url || "#";
    hit.rel = "noreferrer";
    hit.draggable = false;
    hit.setAttribute("aria-label", item.name);
    if (item.url && home.baseConfig.openLinksInNewWindow) hit.target = "_blank";
    el.append(wrap, name, hit);
  } else {
    el.append(icon, name);
  }

  el.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    openItemDialog(item.id);
  });

  el.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest(".tile__ext")) return;
    if (suppressTileClick) {
      event.preventDefault();
      suppressTileClick = false;
      return;
    }
    if (item.type === "folder") {
      event.preventDefault();
      openFolder(item);
    }
  });

  bindTileDrag(el, item, { inFolder, folderId: folderId || (inFolder ? openFolderId : null) });
  return el;
}

function renderIcons() {
  iconGrid.replaceChildren();
  const page = currentPage(home);
  for (const item of page.children) {
    if (item.type === "component") continue;
    iconGrid.appendChild(renderTile(item));
  }
  const add = document.createElement("button");
  add.type = "button";
  add.className = "tile-add";
  add.setAttribute("aria-label", "添加链接");
  add.innerHTML = '<div class="tile-add__icon">+</div><div class="tile-add__name"> </div>';
  add.addEventListener("click", () => openItemDialog(null));
  iconGrid.appendChild(add);
  paintEmptyHint();
}

function openFolder(item) {
  openFolderId = item.id;
  folderTitle.textContent = item.name;
  folderBody.replaceChildren();
  for (const child of item.children || []) {
    folderBody.appendChild(renderTile(child, { inFolder: true, folderId: item.id }));
  }
  openAnimatedDialog(folderDialog);
}

/**
 * Drop on empty folder chrome / body → move icon out to home grid.
 * @param {DragEvent} event
 */
function handleFolderExtractDrop(event) {
  if (!dragSourceId || !dragFromFolderId) return;
  const onTile = event.target instanceof Element && event.target.closest(".tile");
  if (onTile) return;
  event.preventDefault();
  event.stopPropagation();
  const fromId = event.dataTransfer?.getData("text/plain") || dragSourceId;
  if (!fromId) return;
  moveItemOutOfFolder(fromId, dragFromFolderId);
  clearDragUi();
}

let widgetPaintSeq = 0;

function paintWidgets(cache = {}) {
  const seq = ++widgetPaintSeq;
  void (async () => {
    /** @type {"hot" | "study"} */
    let face = "hot";
    /** @type {import("./study-words.js").StudyWord[]} */
    let words = [];
    /** @type {"holidays" | "exchange"} */
    let hxFace = "holidays";
    /** @type {"weather" | "calendar"} */
    let wxFace = "weather";
    try {
      [face, words, hxFace, wxFace] = await Promise.all([
        loadVocabFace(),
        loadStudyWords(),
        loadHxFace(),
        loadWxFace(),
      ]);
    } catch (error) {
      console.warn("[formant] study words load failed", error);
    }
    if (seq !== widgetPaintSeq) return;
    paintWidgetsNow(cache, { face, words }, hxFace, wxFace);
  })();
}

/**
 * @param {{ weather?: unknown, exchange?: unknown, holidays?: unknown, vocab?: unknown, weatherAt?: string, widgetsAt?: string }} [cache]
 * @param {{ face: "hot" | "study", words: import("./study-words.js").StudyWord[] }} study
 * @param {"holidays" | "exchange"} [hxFace]
 * @param {"weather" | "calendar"} [wxFace]
 */
function paintWidgetsNow(cache = {}, study, hxFace = "holidays", wxFace = "weather") {
  const weatherAt = cache.weatherAt || cache.widgetsAt || "";
  if (!widgetRow) return;
  const hlsCard = widgetRow.querySelector('[data-widget="hls"]') || renderHlsWidget();
  widgetRow.replaceChildren(
    renderWeatherCalendarWidget({
      weather: cache.weather || null,
      weatherMeta: {
        weatherAt,
        widgetsAt: cache.widgetsAt || "",
      },
      holidays: cache.holidays || null,
      face: wxFace,
    }),
    renderHolidayExchangeWidget({
      holidays: cache.holidays || null,
      holidaysMeta: { holidaysAt: cache.holidaysAt || cache.widgetsAt || "" },
      exchange: cache.exchange || null,
      exchangeMeta: {
        exchangeAt: cache.exchangeAt || cache.widgetsAt || "",
        onCommit: () => {
          void handleExchangeCommit();
        },
        onClose: () => {
          void handleExchangeClose();
        },
      },
      face: hxFace,
    }),
    renderVocabWidget(cache.vocab || null, {
      onRefresh: async () => {
        try {
          await refreshVocabFromMono();
          paintWidgets(await loadWidgetCache());
        } catch (error) {
          setTopActionStatus(error instanceof Error ? error.message : String(error), "error");
          throw error;
        }
      },
      onDismiss: async (word) => {
        try {
          await dismissVocabWord(word);
          paintWidgets(await loadWidgetCache());
        } catch (error) {
          setTopActionStatus(error instanceof Error ? error.message : String(error), "error");
          throw error;
        }
      },
    }, study),
    hlsCard,
  );
  widgetRow.querySelectorAll(".widget__refresh[data-widget]:not([data-widget='vocab'])").forEach((btn) => {
    btn.addEventListener("click", () => {
      void refreshSingleWidget(/** @type {HTMLButtonElement} */ (btn));
    });
  });
}

/**
 * @param {HTMLButtonElement} btn
 */
async function refreshSingleWidget(btn) {
  const kind = btn.dataset.widget;
  if (!kind || btn.disabled) return;
  btn.disabled = true;
  btn.classList.add("is-loading");
  try {
    if (kind === "weather") {
      await refreshWeatherFromMono({
        locationId: home.baseConfig.locationId,
        cityName: home.baseConfig.cityName,
        force: true,
      });
    } else if (kind === "holidays") {
      await refreshHolidaysFromMono();
    } else if (kind === "exchange") {
      await refreshExchangeFromMono();
    } else if (kind === "vocab") {
      await refreshVocabFromMono();
    }
    paintWidgets(await loadWidgetCache());
  } catch (error) {
    console.warn("[formant] widget refresh failed", kind, error);
    setTopActionStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    btn.disabled = false;
    btn.classList.remove("is-loading");
  }
}

async function paintWidgetsFromCache() {
  await loadExchangePrefs();
  const cache = await loadWidgetCache();
  paintWidgets(cache);
  return cache;
}

async function handleExchangeCommit() {
  const cache = await loadWidgetCache();
  if (exchangeCacheMatches(cache, getExchangePrefs())) {
    if (!isExchangeEditing()) paintWidgets(cache);
    return;
  }
  try {
    await refreshExchangeFromMono();
  } catch (error) {
    setTopActionStatus(error instanceof Error ? error.message : String(error), "error");
    return;
  }
  if (!isExchangeEditing()) paintWidgets(await loadWidgetCache());
}

async function handleExchangeClose() {
  paintWidgets(await loadWidgetCache());
}

/** Active refresh: hit mono widget APIs and rewrite cache. */
async function refreshWidgets() {
  const result = await refreshWidgetsFromMono({
    locationId: home.baseConfig.locationId,
    cityName: home.baseConfig.cityName,
  });
  const cache = await loadWidgetCache();
  paintWidgets(cache);
  return result;
}

/** Pull home + refresh widgets (explicit user action). */
async function refreshAllRemote() {
  const remote = await pullHomeFromMono();
  home = remote.home;
  revision = remote.revision;
  renderAll();
  scheduleFaviconReconcile();
  await refreshWidgets();
  return remote;
}

/**
 * @param {"icon"|"text"|"folder"} mode
 */
function setItemFormMode(mode) {
  const typeField = document.getElementById("itemTypeField");
  const urlField = document.getElementById("itemUrlField");
  const srcField = document.getElementById("itemSrcField");
  const textField = document.getElementById("itemIconTextField");
  const bgField = document.getElementById("itemBgField");

  const isFolder = mode === "folder";
  const isText = mode === "text";
  const isIcon = mode === "icon";

  if (typeField) typeField.hidden = isFolder;
  if (urlField) urlField.hidden = isFolder;
  if (srcField) srcField.hidden = !isIcon;
  if (textField) textField.hidden = !isText;
  if (bgField) bgField.hidden = false;

  els.itemDeleteBtn.textContent = isFolder ? "打散" : "删除";
  els.itemDeleteBtn.title = isFolder ? "打散后子链接回到主页，不删除内容" : "删除此链接";
  els.itemDialogTitle.textContent = isFolder
    ? "编辑文件夹"
    : editingId
      ? "编辑链接"
      : "添加链接";
}

/**
 * Replace a root-level folder with its children (scatter).
 * @param {string} folderId
 * @returns {boolean}
 */
function scatterFolderLocal(folderId) {
  const page = currentPage(home);
  const index = page.children.findIndex((item) => item.id === folderId);
  if (index < 0) return false;
  const folder = page.children[index];
  if (folder.type !== "folder") return false;
  const kids = (folder.children || []).map((child, order) => ({ ...child, order }));
  page.children.splice(index, 1, ...kids);
  home = normalizeHome(home);
  return true;
}

function openItemDialog(id) {
  editingId = id;
  setFormError("");
  const page = currentPage(home);
  const current =
    findItem(page.children, id) ||
    page.children.flatMap((item) => item.children || []).find((item) => item.id === id);
  const isFolder = current?.type === "folder";

  // Never offer "folder" in the add/edit link type list.
  els.itemType.querySelector('option[value="folder"]')?.remove();

  els.itemName.value = current?.name || "";
  els.itemUrl.value = current?.url || "";
  els.itemSrc.value = current?.src || "";
  delete els.itemSrc.dataset.manual;
  const defaultSrc = current?.url ? faviconFromUrl(current.url) : "";
  if (
    current?.src &&
    !isGoogleS2Favicon(current.src) &&
    !isDefaultFaviconSrc(current.src, current.url || "")
  ) {
    els.itemSrc.dataset.manual = "1";
  } else if (current?.url) {
    els.itemSrc.value = defaultSrc;
  }
  els.itemIconText.value = current?.iconText || "";
  selectBgColor(current?.backgroundColor || ITEM_BG_COLORS[0]);
  els.itemType.value = current?.type === "text" ? "text" : "icon";
  els.itemDeleteBtn.hidden = !current;

  const mode = isFolder ? "folder" : /** @type {"icon"|"text"} */ (els.itemType.value);
  setItemFormMode(mode);
  updateFaviconPreview();
  if (mode === "icon" && els.itemUrl.value && !els.itemSrc.value) {
    syncFaviconFromUrl({ force: true });
  }
  setItemDialogBusy(false);
  openAnimatedDialog(itemDialog);
}

function findItem(items, id) {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const nested = findItem(item.children, id);
      if (nested) return nested;
    }
  }
  return null;
}

function renderAll() {
  applyChrome();
  renderIcons();
}

async function hydrate() {
  const local = await loadLocalHomeState();
  home = local.home;
  revision = local.revision;
  await loadFaviconCache();
  initColorSwatches();
  selectBgColor(ITEM_BG_COLORS[0]);
  renderAll();
  scheduleFaviconReconcile();
  const cache = await paintWidgetsFromCache();
  const cachedWords =
    cache.vocab && typeof cache.vocab === "object" && Array.isArray(/** @type {{ words?: unknown }} */ (cache.vocab).words)
      ? /** @type {{ words: Array<{ ipa?: unknown }> }} */ (cache.vocab).words
      : [];
  const cacheMissingIpa = cachedWords.some((item) => !String(item?.ipa || "").trim());
  if (!cachedWords.length || cacheMissingIpa) {
    void ensureVocabFromMono()
      .then(async () => paintWidgets(await loadWidgetCache()))
      .catch((error) => console.warn("[formant] vocab hydrate failed", error));
  }

  // 天气超过 30 分钟 / 假期缓存跨天时自动补拉（后台 10 分钟 alarm 之外的兜底）。
  void refreshStaleWidgetsFromMono({
    locationId: home.baseConfig.locationId,
    cityName: home.baseConfig.cityName,
  })
    .then(async ({ refreshed }) => {
      if (refreshed) paintWidgets(await loadWidgetCache());
    })
    .catch((error) => console.warn("[formant] stale widget refresh failed", error));

  // 每次打开 New Tab 对账云端：本机空或 revision 落后则拉取，避免旧电脑一直停在过期布局。
  void tryReconcileHomeFromMono()
    .then(async (pulled) => {
      if (pulled.ok) {
        if (pulled.applied) {
          home = pulled.home;
          revision = pulled.revision;
          renderAll();
          scheduleFaviconReconcile();
          if (countVisibleHomeItems(home) === 0) {
            paintEmptyHint(pulled.fromDefault ? "from-default" : "");
            if (pulled.fromDefault) {
              setTopActionStatus(emptyHomeHint("from-default"), "info", 12_000);
            }
          } else {
            setTopActionStatus(`已从云端更新主页 · revision ${revision}`);
            void refreshStaleWidgetsFromMono({
              locationId: home.baseConfig.locationId,
              cityName: home.baseConfig.cityName,
            })
              .then(async ({ refreshed }) => {
                if (refreshed) paintWidgets(await loadWidgetCache());
              })
              .catch((error) => console.warn("[formant] widget hydrate after pull failed", error));
          }
        }
        return;
      }
      if (pulled.reason === "error" && pulled.error) {
        console.warn("[formant] home reconcile failed", pulled.error);
      }
      if (countVisibleHomeItems(home) === 0) {
        paintEmptyHint(pulled.reason === "missing-key" ? "missing-key" : "");
        if (pulled.reason === "missing-key") {
          setTopActionStatus(emptyHomeHint("missing-key"), "info", 12_000);
        } else if (pulled.error) {
          setTopActionStatus(
            `${pulled.error.message}；请检查设置 → 同步 中的 mono 连接。`,
            "error",
            12_000,
          );
        }
      }
    })
    .catch((error) => console.warn("[formant] home reconcile failed", error));
}

function openNewtabSettings() {
  void chrome.tabs.create({ url: chrome.runtime.getURL("option.html#newtab") });
}

document.getElementById("settingsBtn")?.addEventListener("click", openNewtabSettings);
document.getElementById("folderCloseBtn")?.addEventListener("click", () => closeAnimatedDialog(folderDialog));

bindDialogBackdropClose(itemDialog);

folderScrim?.addEventListener("click", () => closeAnimatedDialog(folderDialog));
folderScrim?.addEventListener("dragover", (event) => {
  if (!dragFromFolderId || !dragSourceId) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  folderDialog.classList.add("is-extract-target");
});
folderScrim?.addEventListener("drop", (event) => {
  event.preventDefault();
  const fromId = event.dataTransfer?.getData("text/plain") || dragSourceId;
  if (!fromId || !dragFromFolderId) return;
  moveItemOutOfFolder(fromId, dragFromFolderId);
  clearDragUi();
});

folderDialog.addEventListener("close", () => {
  openFolderId = null;
  folderDialog.classList.remove("is-extract-target");
  if (folderScrim) {
    folderScrim.hidden = true;
    folderScrim.classList.remove("is-open");
  }
});

folderDialog.addEventListener("dragover", (event) => {
  if (!dragFromFolderId || !dragSourceId) return;
  if (event.target instanceof Element && event.target.closest(".tile")) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  folderDialog.classList.add("is-extract-target");
});

folderDialog.addEventListener("drop", handleFolderExtractDrop);
folderBody.addEventListener("dragover", (event) => {
  if (!dragFromFolderId || !dragSourceId) return;
  if (event.target instanceof Element && event.target.closest(".tile")) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
});
folderBody.addEventListener("drop", handleFolderExtractDrop);

function allowExtractDrop(event) {
  if (!dragFromFolderId || !dragSourceId) return false;
  if (event.target instanceof Element && event.target.closest(".tile, .folder-dialog, .icon-btn")) {
    return false;
  }
  return true;
}

// Allow dropping onto home area while folder is open.
const extractZones = [iconGrid, document.querySelector(".stage")].filter(Boolean);
for (const zone of extractZones) {
  zone.addEventListener("dragover", (event) => {
    if (!allowExtractDrop(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });
  zone.addEventListener("drop", (event) => {
    if (!allowExtractDrop(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const fromId = event.dataTransfer?.getData("text/plain") || dragSourceId;
    if (!fromId || !dragFromFolderId) return;
    moveItemOutOfFolder(fromId, dragFromFolderId);
    clearDragUi();
  });
}

folderDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeAnimatedDialog(folderDialog);
});

itemDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  if (itemDialogBusy) return;
  closeAnimatedDialog(itemDialog);
});

els.itemCancelBtn?.addEventListener("click", () => {
  if (itemDialogBusy) return;
  closeAnimatedDialog(itemDialog);
});

els.itemType.addEventListener("change", () => {
  const mode = els.itemType.value === "text" ? "text" : "icon";
  setItemFormMode(mode);
  if (mode === "icon" && els.itemUrl.value) syncFaviconFromUrl();
});

els.itemUrl.addEventListener("blur", () => {
  if (els.itemType.value === "icon") syncFaviconFromUrl();
});
els.itemUrl.addEventListener("change", () => {
  if (els.itemType.value === "icon") syncFaviconFromUrl({ force: true });
});
els.itemSrc.addEventListener("input", () => {
  els.itemSrc.dataset.manual = "1";
  updateFaviconPreview();
});

async function handleRefreshClick() {
  refreshBtn?.setAttribute("disabled", "true");
  syncBtn?.setAttribute("disabled", "true");
  try {
    await refreshAllRemote();
    setTopActionStatus(`已刷新主页和卡片数据 · revision ${revision}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setTopActionStatus(`${message}；请打开「同步」检查 mono Base URL（本地是 http://localhost:3101）。`, "error");
  } finally {
    refreshBtn?.removeAttribute("disabled");
    syncBtn?.removeAttribute("disabled");
  }
}

async function handleSyncClick() {
  syncBtn?.setAttribute("disabled", "true");
  refreshBtn?.setAttribute("disabled", "true");
  try {
    const remote = await pushHomeToMono(home);
    home = remote.home;
    revision = remote.revision;
    renderAll();
    scheduleFaviconReconcile();
    setTopActionStatus(homeSyncStatus(remote, "已同步主页"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setTopActionStatus(`${message}；请打开「同步」检查 mono Base URL（本地是 http://localhost:3101）。`, "error");
  } finally {
    syncBtn?.removeAttribute("disabled");
    refreshBtn?.removeAttribute("disabled");
  }
}

refreshBtn?.addEventListener("click", () => {
  void handleRefreshClick();
});
syncBtn?.addEventListener("click", () => {
  void handleSyncClick();
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const url = buildSearchUrl(home, searchInput.value);
  if (!url) return;
  if (home.baseConfig.openLinksInNewWindow) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.href = url;
});

itemForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (itemDialogBusy) return;
  setFormError("");
  const page = currentPage(home);
  const editing = editingId ? findItem(page.children, editingId) : null;
  const isFolder = editing?.type === "folder";
  const type = isFolder ? "folder" : els.itemType.value === "text" ? "text" : "icon";
  const name = els.itemName.value.trim();
  if (!name) {
    setFormError("请填写名称");
    els.itemName.focus();
    return;
  }
  if (!isFolder) {
    const url = els.itemUrl.value.trim();
    if (!url) {
      setFormError("请填写 URL");
      els.itemUrl.focus();
      return;
    }
    try {
      void new URL(url);
    } catch {
      setFormError("URL 格式不正确");
      els.itemUrl.focus();
      return;
    }
    if (type === "text" && !els.itemIconText.value.trim()) {
      setFormError("请填写文字图标");
      els.itemIconText.focus();
      return;
    }
    if (type === "icon" && !els.itemSrc.value.trim()) syncFaviconFromUrl({ force: true });
  }

  const url = isFolder ? "" : els.itemUrl.value.trim();
  const srcRaw = els.itemSrc.value.trim();
  // Only persist truly custom icons. Default /favicon.ico (and Google s2) stay derived from URL
  // so cache keys remain origin:* and edit-save does not orphan a working favicon cache entry.
  const persistSrc =
    type === "icon" && srcRaw && !isGoogleS2Favicon(srcRaw) && !isDefaultFaviconSrc(srcRaw, url)
      ? srcRaw
      : "";

  /** @type {Record<string, unknown>} */
  const body = isFolder
    ? {
        name,
        type: "folder",
        backgroundColor: els.itemBg.value.trim() || ITEM_BG_COLORS[0],
      }
    : {
        name,
        type,
        url: url || undefined,
        // Empty string clears a previously saved default /favicon.ico on mono PATCH.
        src: type === "icon" ? persistSrc : undefined,
        iconText: type === "text" ? els.itemIconText.value.trim() || undefined : undefined,
        backgroundColor: els.itemBg.value.trim() || ITEM_BG_COLORS[0],
        size: "1x1",
      };

  setItemDialogBusy(true, editingId ? "保存中…" : "添加中…");
  try {
    if (editingId) {
      await updateItemOnMono(editingId, body);
    } else {
      await createItemOnMono(body);
    }
    const remote = await pullHomeFromMono();
    home = remote.home;
    revision = remote.revision;
    finishItemDialog();
    renderIcons();
    scheduleFaviconReconcile();
    paintWidgets(await loadWidgetCache());
  } catch (error) {
    const page = currentPage(home);
    if (editingId) {
      const target = findItem(page.children, editingId);
      if (target) Object.assign(target, body);
    } else {
      page.children.push({ id: createItemId(), order: page.children.length, ...body });
    }
    home = normalizeHome(home);
    finishItemDialog();
    renderIcons();
    schedulePersist();
    console.warn("[formant] item mutate fallback local", error);
  }
});

els.itemDeleteBtn.addEventListener("click", async () => {
  if (!editingId || itemDialogBusy) return;
  const page = currentPage(home);
  const target = findItem(page.children, editingId);
  const isFolder = target?.type === "folder";

  setItemDialogBusy(true, isFolder ? "打散中…" : "删除中…");

  if (isFolder) {
    if (!scatterFolderLocal(editingId)) {
      setItemDialogBusy(false);
      return;
    }
    schedulePersist();
    try {
      const remote = await pushHomeToMono(home);
      home = remote.home;
      revision = remote.revision;
      setTopActionStatus(homeSyncStatus(remote, "主页已同步"));
    } catch (error) {
      console.warn("[formant] scatter folder local-only", error);
    }
    finishItemDialog();
    if (folderDialog.open) closeAnimatedDialog(folderDialog);
    renderIcons();
    scheduleFaviconReconcile();
    return;
  }

  try {
    await deleteItemOnMono(editingId);
    const remote = await pullHomeFromMono();
    home = remote.home;
    revision = remote.revision;
  } catch {
    page.children = page.children.filter((item) => item.id !== editingId);
    for (const item of page.children) {
      if (item.children) {
        item.children = item.children.filter((child) => child.id !== editingId);
      }
    }
    home = normalizeHome(home);
    schedulePersist();
  }
  finishItemDialog();
  renderIcons();
  scheduleFaviconReconcile();
  paintWidgets(await loadWidgetCache());
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[HOME_KEYS.home]) {
    home = normalizeHome(changes[HOME_KEYS.home].newValue);
    if (changes[HOME_KEYS.revision]) revision = Number(changes[HOME_KEYS.revision].newValue || 0) || 0;
    renderAll();
    scheduleFaviconReconcile();
  }
  if (Object.values(CACHE_KEYS).some((key) => changes[key])) {
    void paintWidgetsFromCache();
  }
});

window.setInterval(() => tickWeatherAgeLabels(widgetRow), 60_000);

void hydrate();
