const TAB_ID_KEY = "formantNewtabTabId";

export function newtabPageUrl() {
  return chrome.runtime.getURL("newtab.html");
}

/**
 * Chrome/Edge still set runtime.lastError on some promise tab APIs.
 * Always read it so the extensions page does not list "Unchecked runtime.lastError".
 * @template T
 * @param {(cb: (result: T) => void) => void} run
 * @returns {Promise<{ ok: boolean, result: T | undefined }>}
 */
function withLastError(run) {
  return new Promise((resolve) => {
    try {
      run((result) => {
        const err = chrome.runtime.lastError;
        resolve({ ok: !err, result });
      });
    } catch {
      resolve({ ok: false, result: undefined });
    }
  });
}

/** @param {number} tabId */
async function getTab(tabId) {
  const { ok, result } = await withLastError(
    /** @param {(tab: chrome.tabs.Tab) => void} cb */ (cb) => chrome.tabs.get(tabId, cb),
  );
  return ok ? result : undefined;
}

async function getCurrentTab() {
  const { result } = await withLastError(
    /** @param {(tab?: chrome.tabs.Tab) => void} cb */ (cb) => chrome.tabs.getCurrent(cb),
  );
  return result;
}

/** @param {chrome.tabs.QueryInfo} query */
async function queryTabs(query) {
  const { result } = await withLastError(
    /** @param {(tabs: chrome.tabs.Tab[]) => void} cb */ (cb) => chrome.tabs.query(query, cb),
  );
  return result || [];
}

/**
 * @param {number} tabId
 * @param {chrome.tabs.UpdateProperties} props
 */
async function updateTab(tabId, props) {
  const { ok, result } = await withLastError(
    /** @param {(tab?: chrome.tabs.Tab) => void} cb */ (cb) => chrome.tabs.update(tabId, props, cb),
  );
  return ok ? result : undefined;
}

export async function rememberNewtabTab() {
  const tab = await getCurrentTab();
  if (!tab?.id) return;
  try {
    await chrome.storage.session.set({ [TAB_ID_KEY]: tab.id });
  } catch (error) {
    console.warn("[formant] remember newtab tab", error);
  }
}

export function bindRememberNewtabTab() {
  void rememberNewtabTab();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void rememberNewtabTab();
  });
}

/**
 * @param {number | undefined} exceptId
 * @param {number | undefined} windowId
 */
async function queryNewtabTabs(exceptId, windowId) {
  /** @type {chrome.tabs.QueryInfo} */
  const query = { url: newtabPageUrl() };
  if (typeof windowId === "number") query.windowId = windowId;
  const tabs = await queryTabs(query);
  return tabs.filter((tab) => tab.id && tab.id !== exceptId);
}

/**
 * Prefer a New Tab in the same window; otherwise any window, then the last remembered tab.
 * @param {number | undefined} exceptId
 * @param {number | undefined} windowId
 * @returns {Promise<number | null>}
 */
export async function findOtherNewtabTabId(exceptId, windowId) {
  const sameWindow = await queryNewtabTabs(exceptId, windowId);
  if (sameWindow[0]?.id) return sameWindow[0].id;
  const anyWindow = await queryNewtabTabs(exceptId, undefined);
  if (anyWindow[0]?.id) return anyWindow[0].id;
  try {
    const data = await chrome.storage.session.get(TAB_ID_KEY);
    const storedId = Number(data[TAB_ID_KEY] || 0) || 0;
    if (!storedId || storedId === exceptId) return null;
    const tab = await getTab(storedId);
    if (tab?.id && tab.id !== exceptId) return tab.id;
    await chrome.storage.session.remove(TAB_ID_KEY);
  } catch {
    // ignore
  }
  return null;
}

/** @param {number} tabId */
export async function activateTab(tabId) {
  const tab = await getTab(tabId);
  if (!tab?.id) return false;
  if (tab.windowId != null) {
    await withLastError(
      /** @param {() => void} cb */ (cb) => chrome.windows.update(tab.windowId, { focused: true }, cb),
    );
  }
  const next = await updateTab(tab.id, { active: true });
  return Boolean(next?.id);
}

/** Ctrl+Home: focus an existing New Tab, or open one. Leaves the current page alone. */
export async function openOrFocusNewtab() {
  const [current] = await queryTabs({ active: true, currentWindow: true });
  const existing = await queryNewtabTabs(undefined, current?.windowId);
  if (existing.some((tab) => tab.id === current?.id)) return;
  const otherId = await findOtherNewtabTabId(current?.id, current?.windowId);
  if (otherId && (await activateTab(otherId))) return;
  await withLastError(
    /** @param {(tab?: chrome.tabs.Tab) => void} cb */ (cb) => chrome.tabs.create({ url: "chrome://newtab/" }, cb),
  );
}
