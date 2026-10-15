/**
 * Detached translate window: Chrome action popups close on blur / tab switch.
 * Same popup.html in a type=popup window stays until the user closes it.
 */

const DRAFT_KEY = "formantPopupDraft";
const WINDOW_KEY = "formantPopupPanelWindowId";

function panelStore() {
  return chrome.storage.session || chrome.storage.local;
}

export function isDetachedTranslatePanel() {
  return new URLSearchParams(location.search).get("panel") === "1";
}

/**
 * @param {HTMLButtonElement | null} btn
 * @param {() => string} getDraft
 */
export function initPopoutButton(btn, getDraft) {
  if (isDetachedTranslatePanel()) {
    if (btn) btn.hidden = true;
    return;
  }
  btn?.addEventListener("click", () => {
    void openTranslatePanel(getDraft())
      .then(() => window.close())
      .catch((error) => console.warn("[formant] popout failed", error));
  });
}

/**
 * @param {string} draft
 */
export async function openTranslatePanel(draft) {
  const store = panelStore();
  const text = String(draft || "");
  if (text) await store.set({ [DRAFT_KEY]: text });

  const data = await store.get(WINDOW_KEY);
  const existingId = Number(data[WINDOW_KEY] || 0);
  if (existingId) {
    try {
      await chrome.windows.update(existingId, { focused: true });
      return;
    } catch {
      await store.remove(WINDOW_KEY);
    }
  }

  const win = await chrome.windows.create({
    url: `${chrome.runtime.getURL("popup.html")}?panel=1`,
    type: "popup",
    width: 400,
    height: 620,
    focused: true,
  });
  if (win?.id != null) await store.set({ [WINDOW_KEY]: win.id });
}

/**
 * @param {(draft: string) => void} onDraft
 */
export function initDetachedTranslatePanel(onDraft) {
  if (!isDetachedTranslatePanel()) return;

  document.documentElement.classList.add("is-detached-panel");
  const store = panelStore();
  const area = chrome.storage.session ? "session" : "local";

  void store.get(DRAFT_KEY).then((data) => {
    const draft = String(data[DRAFT_KEY] || "");
    if (draft) onDraft(draft);
    if (draft) void store.remove(DRAFT_KEY);
  });

  chrome.storage.onChanged.addListener((changes, changedArea) => {
    if (changedArea !== area || !changes[DRAFT_KEY]) return;
    const draft = String(changes[DRAFT_KEY].newValue || "");
    if (!draft) return;
    onDraft(draft);
    void store.remove(DRAFT_KEY);
  });

  chrome.windows.getCurrent().then((win) => {
    if (win?.id != null) void store.set({ [WINDOW_KEY]: win.id });
  });
}
