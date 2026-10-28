/** 文件对比最近记录。句柄存在本机 IndexedDB，不进配置 JSON，不同步。 */

import { UI_ICONS } from "./tools-icons.js";

const DB_NAME = "formantCompare";
const STORE = "history";
const LIMIT = 12;

/**
 * @typedef {{
 *   id: string,
 *   at: number,
 *   leftName: string,
 *   rightName: string,
 *   leftKind: string,
 *   rightKind: string,
 *   leftHandle: FileSystemHandle,
 *   rightHandle: FileSystemHandle,
 * }} CmpHist
 */

/** @param {FileSystemHandle | null | undefined} handle */
export async function ensureRead(handle) {
  if (!handle || typeof handle.queryPermission !== "function") throw new Error("没有可刷新的文件");
  const mode = { mode: "read" };
  if ((await handle.queryPermission(mode)) === "granted") return;
  if ((await handle.requestPermission(mode)) !== "granted") throw new Error("没有读取权限");
}

/** @returns {Promise<CmpHist[]>} */
export async function listHistory() {
  const db = await openDb();
  const items = await reqTo(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
  return items.sort((a, b) => b.at - a.at);
}

/**
 * @param {{ name: string, kind: string, handle: FileSystemHandle | null }} left
 * @param {{ name: string, kind: string, handle: FileSystemHandle | null }} right
 */
export async function rememberHistory(left, right) {
  if (!left.handle || !right.handle) return;
  const db = await openDb();
  const prev = await reqTo(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
  const next = {
    id: crypto.randomUUID(),
    at: Date.now(),
    leftName: left.name,
    rightName: right.name,
    leftKind: left.kind,
    rightKind: right.kind,
    leftHandle: left.handle,
    rightHandle: right.handle,
  };
  /** @type {CmpHist[]} */
  const kept = [];
  for (const item of prev) {
    if (await samePair(item, next)) continue;
    kept.push(item);
  }
  kept.sort((a, b) => b.at - a.at);
  const items = [next, ...kept].slice(0, LIMIT);
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  store.clear();
  for (const item of items) store.put(item);
  await txDone(tx);
}

/** @param {string} id */
export async function removeHistory(id) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
}

/**
 * @param {HTMLElement} host
 * @param {CmpHist[]} items
 * @param {(item: CmpHist) => void} onOpen
 * @param {(id: string) => void} onRemove
 */
export function renderHistory(host, items, onOpen, onRemove) {
  host.replaceChildren();
  host.hidden = !items.length;
  if (!items.length) return;
  const label = document.createElement("span");
  label.className = "cmp-history__label";
  label.innerHTML = UI_ICONS.recent;
  label.title = "最近";
  label.setAttribute("aria-label", "最近");
  host.append(label);
  for (const item of items) {
    const chip = document.createElement("span");
    chip.className = "cmp-history__chip";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cmp-history__item";
    btn.textContent = `${item.leftName}  ↔  ${item.rightName}`;
    btn.title = new Date(item.at).toLocaleString();
    btn.addEventListener("click", () => onOpen(item));
    const close = document.createElement("button");
    close.type = "button";
    close.className = "cmp-history__x";
    close.innerHTML = UI_ICONS.close;
    close.title = "移出最近";
    close.setAttribute("aria-label", "移出最近");
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      onRemove(item.id);
    });
    chip.append(btn, close);
    host.append(chip);
  }
}

/** @param {CmpHist} a @param {CmpHist} b */
async function samePair(a, b) {
  if (a.leftKind !== b.leftKind || a.rightKind !== b.rightKind) return false;
  const [left, right] = await Promise.all([
    a.leftHandle.isSameEntry(b.leftHandle),
    a.rightHandle.isSameEntry(b.rightHandle),
  ]);
  return left && right;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @param {IDBRequest} request */
function reqTo(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** @param {IDBTransaction} tx */
function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
