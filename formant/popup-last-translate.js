/**
 * Last popup translate snapshot. Action popups die on blur; this restores
 * the previous source + results without calling translate APIs again.
 */

const LAST_KEY = "formantPopupLastTranslate";
const RESTORE_KEY = "formantPopupRestoreAfterTab";
const MAX_Q = 8000;

function lastStore() {
  return chrome.storage.session || chrome.storage.local;
}

/**
 * @typedef {{
 *   q: string,
 *   mode?: string,
 *   target?: string,
 *   routeHint?: string,
 *   google?: object | null,
 *   gpt?: object | null,
 *   deeplx?: object | null,
 *   at?: number,
 * }} LastTranslateSnap
 */

/**
 * @param {unknown} raw
 * @returns {LastTranslateSnap | null}
 */
function normalizeLastTranslate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const q = String(/** @type {{ q?: unknown }} */ (raw).q || "").trim();
  if (!q) return null;
  const snap = /** @type {LastTranslateSnap} */ (raw);
  return {
    q: q.length > MAX_Q ? q.slice(0, MAX_Q) : q,
    mode: snap.mode ? String(snap.mode) : "",
    target: snap.target ? String(snap.target) : "",
    routeHint: snap.routeHint ? String(snap.routeHint) : "",
    google: snap.google || null,
    gpt: snap.gpt || null,
    deeplx: snap.deeplx || null,
    at: Number(snap.at) || 0,
  };
}

async function loadLastTranslate() {
  const data = await lastStore().get(LAST_KEY);
  return normalizeLastTranslate(data[LAST_KEY]);
}

/**
 * @param {LastTranslateSnap} snap
 */
async function saveLastTranslate(snap) {
  const next = normalizeLastTranslate(snap);
  if (!next) {
    await lastStore().remove(LAST_KEY);
    return null;
  }
  next.at = Date.now();
  await lastStore().set({ [LAST_KEY]: next });
  return next;
}

async function clearLastTranslate() {
  await lastStore().remove(LAST_KEY);
}

/**
 * @param {LastTranslateSnap | null | undefined} snap
 * @param {string} q
 * @param {string} mode
 * @param {string} target
 */
function lastTranslateReusable(snap, q, mode, target) {
  if (!snap?.q) return false;
  if (snap.q !== String(q || "").trim()) return false;
  if (snap.mode && snap.mode !== mode) return false;
  if (snap.target && snap.target !== target) return false;
  return Boolean(snap.google || snap.gpt || snap.deeplx);
}

/**
 * @param {{
 *   getQuery: () => string,
 *   setQuery: (q: string) => void,
 *   getMode: () => string,
 *   getTarget: () => string,
 *   paint: (snap: LastTranslateSnap) => void,
 * }} api
 */
export function createLastTranslateSession(api) {
  /** @type {LastTranslateSnap | null} */
  let lastSnap = null;

  function persist(patch = {}) {
    const q = api.getQuery();
    if (!q) {
      lastSnap = null;
      void clearLastTranslate();
      return;
    }
    lastSnap = {
      q,
      mode: api.getMode(),
      target: api.getTarget(),
      routeHint: lastSnap?.routeHint || "",
      google: lastSnap?.google || null,
      gpt: lastSnap?.gpt || null,
      deeplx: lastSnap?.deeplx || null,
      ...patch,
    };
    void saveLastTranslate(lastSnap);
  }

  function reusable() {
    return lastTranslateReusable(lastSnap, api.getQuery(), api.getMode(), api.getTarget());
  }

  function applyCached() {
    if (!lastSnap) return false;
    api.paint(lastSnap);
    return true;
  }

  function snapshot() {
    return lastSnap;
  }

  async function load() {
    lastSnap = await loadLastTranslate();
    return lastSnap;
  }

  /**
   * @param {string} [draft]
   * @returns {"empty" | "cached" | "source-only" | "fetch"}
   */
  function restore(draft) {
    const fromDraft = String(draft || "").trim();
    const q = fromDraft || lastSnap?.q || "";
    if (!q) return "empty";
    api.setQuery(fromDraft || lastSnap?.q || "");
    if (lastTranslateReusable(lastSnap, q, api.getMode(), api.getTarget())) {
      api.paint(lastSnap);
      return "cached";
    }
    return fromDraft ? "fetch" : "source-only";
  }

  /** Toolbar popup: restore only after a tab switch; a normal close starts empty. */
  async function openFromToolbar() {
    await load();
    const data = await lastStore().get(RESTORE_KEY);
    if (data[RESTORE_KEY]) {
      await lastStore().remove(RESTORE_KEY);
      return restore("");
    }
    lastSnap = null;
    await clearLastTranslate();
    return "empty";
  }

  function watchTabSwitchToRestore() {
    const arm = () => {
      if (!api.getQuery()) return;
      void lastStore().set({ [RESTORE_KEY]: true });
    };
    chrome.tabs.onActivated.addListener(arm);
  }

  return { persist, reusable, applyCached, snapshot, load, restore, openFromToolbar, watchTabSwitchToRestore };
}
