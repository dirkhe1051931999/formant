import { loadDeeplxApiKey, saveDeeplxApiKey } from "./deeplx-config.js";
import {
  loadTranslateMode,
  loadTranslateTarget,
  normalizeTranslateMode,
  normalizeTranslateTarget,
  saveTranslateMode,
  saveTranslateTarget,
  TRANSLATE_MODE_LABELS,
  TRANSLATE_MODES,
  TRANSLATE_TARGET_LABELS,
  TRANSLATE_TARGETS,
} from "./translate-router.js";

/**
 * @typedef {{ toast: (text: string) => void }} PanelApi
 */

/**
 * @param {PanelApi} api
 */
export function initTranslatePanel(api) {
  const { toast } = api;
  const modeEl = document.getElementById("optTranslateMode");
  const targetSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById("optTranslateTarget"));

  if (!modeEl || !targetSelect) return;

  /** @type {import("./translate-router.js").TranslateMode} */
  let currentMode = "auto";

  function renderModeButtons() {
    modeEl.innerHTML = TRANSLATE_MODES.map((mode) => {
      const active = mode === currentMode ? " is-active" : "";
      const selected = mode === currentMode ? "true" : "false";
      return `<button type="button" class="opt-mode__btn${active}" role="tab" data-mode="${mode}" aria-selected="${selected}">${TRANSLATE_MODE_LABELS[mode]}</button>`;
    }).join("");
  }

  targetSelect.innerHTML = TRANSLATE_TARGETS.map(
    (t) => `<option value="${t}">${TRANSLATE_TARGET_LABELS[t]}</option>`
  ).join("");

  modeEl.addEventListener("click", (event) => {
    const btn = /** @type {HTMLElement | null} */ (
      event.target instanceof Element ? event.target.closest("[data-mode]") : null
    );
    if (!btn) return;
    const mode = normalizeTranslateMode(btn.getAttribute("data-mode"));
    void (async () => {
      currentMode = await saveTranslateMode(mode);
      renderModeButtons();
      toast(`默认模式：${TRANSLATE_MODE_LABELS[currentMode]}`);
    })();
  });

  targetSelect.addEventListener("change", () => {
    void (async () => {
      const target = await saveTranslateTarget(normalizeTranslateTarget(targetSelect.value));
      toast(`默认目标语言：${TRANSLATE_TARGET_LABELS[target]}`);
    })();
  });

  const keyInput = /** @type {HTMLInputElement | null} */ (document.getElementById("optDeeplxKey"));
  let savedKey = "";

  keyInput?.addEventListener("change", () => {
    const next = keyInput.value.trim();
    if (next === savedKey) return;
    void saveDeeplxApiKey(next)
      .then((stored) => {
        savedKey = stored;
        keyInput.value = stored;
        toast(stored ? "DeepLX API Key 已保存" : "DeepLX API Key 已清空");
      })
      .catch((error) => {
        toast(error instanceof Error ? error.message : String(error));
      });
  });

  void (async () => {
    currentMode = await loadTranslateMode();
    renderModeButtons();
    targetSelect.value = await loadTranslateTarget();
    savedKey = await loadDeeplxApiKey();
    if (keyInput) keyInput.value = savedKey;
  })();
}
