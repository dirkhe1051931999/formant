export const HLS_SESSION_KEY = "formantHlsSession";

/**
 * @typedef {{
 *   version: number,
 *   target: "newtab" | "page",
 *   pendingUrl: string,
 *   playId: number,
 * }} HlsSession
 */

/** @type {HlsSession} */
const EMPTY = {
  version: 1,
  target: "newtab",
  pendingUrl: "",
  playId: 0,
};

/**
 * @param {unknown} raw
 * @returns {HlsSession}
 */
export function normalizeHlsSession(raw) {
  const src = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const playId = Number(src.playId);
  const pendingUrl = String(src.pendingUrl || "").trim();
  return {
    version: 1,
    target: src.target === "page" ? "page" : "newtab",
    pendingUrl: /^https?:\/\//i.test(pendingUrl) ? pendingUrl : "",
    playId: Number.isInteger(playId) && playId > 0 ? playId : 0,
  };
}

export async function loadHlsSession() {
  try {
    const data = await chrome.storage.local.get(HLS_SESSION_KEY);
    return normalizeHlsSession(data[HLS_SESSION_KEY]);
  } catch {
    return { ...EMPTY };
  }
}

/**
 * @param {Partial<HlsSession>} patch
 */
export async function saveHlsSession(patch) {
  const current = await loadHlsSession();
  const next = normalizeHlsSession({ ...current, ...patch });
  await chrome.storage.local.set({ [HLS_SESSION_KEY]: next });
  return next;
}

export async function stopHlsSession() {
  return saveHlsSession({ pendingUrl: "", playId: Date.now() });
}
