import {
  DEFAULT_GESTURES_SETTINGS,
  GESTURE_ACTION_LABELS,
  GESTURE_ACTIONS,
  GESTURES_SETTINGS_KEY,
  emptyGestureBinding,
  formatGesturePath,
  loadGesturesSettings,
  normalizeGesturesSettings,
  saveGesturesSettings,
} from "./gestures-config.js";
import { FEATURES_KEY, loadFeatures } from "./features.js";
import { loadGesturesSyncMeta, pullGesturesFromMono, pushGesturesToMono } from "./gestures-sync.js";
import {
  deleteAllGesturePreviews,
  deleteGesturePreview,
  pathPreviewSvg,
  strokesToPngBlob,
  uploadGesturePreview,
} from "./gestures-preview.js";
import { createGesturePad } from "./option-gestures-pad.js";

/** @typedef {{ toast: (text: string) => void }} PanelApi */
/** @typedef {import("./gestures-config.js").GestureAction} GestureAction */

/**
 * @param {PanelApi} api
 */
export function initGesturesPanel(api) {
  const form = document.getElementById("gesturesForm");
  const reset = document.getElementById("gesturesReset");
  const refreshBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("gesturesRefresh"));
  const syncBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("gesturesSync"));
  const addBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("gesturesAdd"));
  const addSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById("gesturesAddAction"));
  const listEl = document.getElementById("gesturesBindList");
  const stateEl = document.getElementById("gesturesState");
  const minDistance = /** @type {HTMLInputElement | null} */ (document.getElementById("gesturesMinDistance"));
  const pad = document.getElementById("gesturesPad");
  const padHint = document.getElementById("gesturesPadHint");
  const strokesEl = document.getElementById("gesturesPadStrokes");
  if (!form || !stateEl || !minDistance || !pad || !padHint || !strokesEl || !listEl || !addSelect) return;

  /** @type {import("./gestures-config.js").GesturesSettings} */
  let current = normalizeGesturesSettings(DEFAULT_GESTURES_SETTINGS);
  let featureEnabled = false;
  let revision = 0;
  let lastSyncAt = "";
  let busy = false;

  const padCtl = createGesturePad({
    pad,
    hint: padHint,
    strokesEl: /** @type {SVGGElement} */ (strokesEl),
    actionLabel: (action) => GESTURE_ACTION_LABELS[/** @type {GestureAction} */ (action)] || action,
    onToast: (text) => api.toast(text),
    onCommit: (action, strokes, path) => {
      void bindDrawn(/** @type {GestureAction} */ (action), strokes, path);
    },
  });

  function setStatus(text, error = false) {
    stateEl.textContent = text;
    stateEl.classList.toggle("is-error", error);
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    if (refreshBtn) refreshBtn.disabled = nextBusy;
    if (syncBtn) syncBtn.disabled = nextBusy;
    if (reset) reset.disabled = nextBusy;
    if (addBtn) addBtn.disabled = nextBusy;
  }

  function statusHint() {
    const syncHint = lastSyncAt
      ? `revision ${revision} · 上次同步 ${new Date(lastSyncAt).toLocaleString()}`
      : `revision ${revision} · 尚未同步 mono`;
    const featureHint = featureEnabled
      ? "已启用：普通 http(s) 页右键划动。edge://、chrome://、扩展商店无法注入（浏览器限制）。"
      : "鼠标手势总开关当前关闭；可在「功能」面板开启，映射会保留。";
    return `${featureHint}\n${syncHint}`;
  }

  function unusedActions() {
    return GESTURE_ACTIONS.filter((action) => !current.bindings[action]?.path);
  }

  function paintAddSelect() {
    const unused = unusedActions();
    const prev = addSelect.value;
    addSelect.innerHTML = unused
      .map((action) => `<option value="${action}">${GESTURE_ACTION_LABELS[action]}</option>`)
      .join("");
    if (unused.includes(/** @type {GestureAction} */ (prev))) addSelect.value = prev;
    addSelect.disabled = unused.length === 0;
    if (addBtn) addBtn.disabled = unused.length === 0 || busy;
  }

  function paintBindings() {
    const capturing = padCtl.isCapturing();
    const bound = GESTURE_ACTIONS.filter((action) => current.bindings[action]?.path);
    listEl.innerHTML = bound
      .map((action) => {
        const bind = current.bindings[action];
        const preview = bind.previewUrl
          ? `<img class="gesture-bind__img" src="${escapeAttr(bind.previewUrl)}" alt="">`
          : pathPreviewSvg(bind.path);
        const drawLabel = capturing === action ? "取消" : "绘制";
        return `<div class="gesture-bind${capturing === action ? " is-capturing" : ""}" data-gesture-row="${action}">
          ${preview}
          <div class="gesture-bind__meta">
            <strong>${GESTURE_ACTION_LABELS[action]}</strong>
            <span class="gesture-bind__path">${formatGesturePath(bind.path)}</span>
          </div>
          <div class="gesture-bind__ops">
            <button type="button" class="btn btn--ghost" data-gesture-draw="${action}">${drawLabel}</button>
            <button type="button" class="btn btn--ghost" data-gesture-delete="${action}">删除</button>
          </div>
        </div>`;
      })
      .join("");
    if (!bound.length) {
      listEl.innerHTML = `<p class="settings-hint">还没有手势。选择动作后点「添加」，在画板划出路径。</p>`;
    }
    paintAddSelect();
    padCtl.paintHint();
  }

  function paint() {
    minDistance.value = String(current.minDistance);
    paintBindings();
    setStatus(statusHint());
  }

  function readForm() {
    return normalizeGesturesSettings(
      {
        minDistance: Number(minDistance.value),
        bindings: current.bindings,
      },
      { fillDefaults: false },
    );
  }

  function persist(next, toastText) {
    void saveGesturesSettings(next)
      .then((saved) => {
        current = saved;
        paint();
        if (toastText) api.toast(toastText);
      })
      .catch((error) => {
        api.toast(error instanceof Error ? error.message : String(error));
        void reload();
      });
  }

  /**
   * @param {GestureAction} action
   * @param {Array<Array<{ x: number, y: number }>>} strokes
   * @param {string} path
   */
  async function bindDrawn(action, strokes, path) {
    const next = readForm();
    next.bindings[action] = { ...emptyGestureBinding(), path };
    try {
      const blob = await strokesToPngBlob(strokes);
      const uploaded = await uploadGesturePreview(action, blob);
      next.bindings[action] = { path, ...uploaded };
      persist(next, `已绑定「${GESTURE_ACTION_LABELS[action]}」：${formatGesturePath(path)}`);
    } catch (error) {
      persist(
        next,
        `已绑定「${GESTURE_ACTION_LABELS[action]}」：${formatGesturePath(path)}（预览图未上传：${error instanceof Error ? error.message : String(error)}）`,
      );
    }
  }

  async function reload() {
    const [settings, features, meta] = await Promise.all([
      loadGesturesSettings(),
      loadFeatures(),
      loadGesturesSyncMeta(),
    ]);
    current = settings;
    featureEnabled = features.gestures.enabled;
    revision = meta.revision;
    lastSyncAt = meta.lastSyncAt;
    paint();
  }

  function escapeAttr(value) {
    return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  form.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const drawBtn = target?.closest("[data-gesture-draw]");
    const deleteBtn = target?.closest("[data-gesture-delete]");
    if (drawBtn) {
      const action = /** @type {GestureAction} */ (drawBtn.getAttribute("data-gesture-draw") || "");
      if (!GESTURE_ACTIONS.includes(action)) return;
      if (padCtl.isCapturing() === action) {
        padCtl.stop();
        paintBindings();
        return;
      }
      padCtl.start(action);
      paintBindings();
      return;
    }
    if (deleteBtn) {
      const action = /** @type {GestureAction} */ (deleteBtn.getAttribute("data-gesture-delete") || "");
      if (!GESTURE_ACTIONS.includes(action)) return;
      padCtl.stop();
      void (async () => {
        try {
          await deleteGesturePreview(action);
        } catch {
          /* local delete still proceeds */
        }
        const next = readForm();
        next.bindings[action] = emptyGestureBinding();
        persist(next, `已删除「${GESTURE_ACTION_LABELS[action]}」`);
      })();
    }
  });

  addBtn?.addEventListener("click", () => {
    const action = /** @type {GestureAction} */ (addSelect.value);
    if (!GESTURE_ACTIONS.includes(action) || current.bindings[action]?.path) {
      api.toast("请选择尚未绑定的动作");
      return;
    }
    padCtl.start(action);
    paintBindings();
  });

  minDistance.addEventListener("change", () => persist(readForm(), "手势设置已保存到本机"));

  reset?.addEventListener("click", () => {
    padCtl.stop();
    void (async () => {
      try {
        await deleteAllGesturePreviews();
      } catch {
        /* defaults still restore locally */
      }
      persist(DEFAULT_GESTURES_SETTINGS, "手势设置已恢复默认（本机）；同步后才会覆盖云端");
    })();
  });

  refreshBtn?.addEventListener("click", () => {
    void (async () => {
      setBusy(true);
      padCtl.stop();
      try {
        const remote = await pullGesturesFromMono();
        current = remote.settings;
        revision = remote.revision;
        lastSyncAt = new Date().toISOString();
        paint();
        setStatus(
          remote.fromDefault
            ? `云端尚无个人映射，已显示默认 · revision ${revision}`
            : `已从 mono 拉取手势 · revision ${revision}`,
        );
        api.toast("手势已刷新");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(message, true);
        api.toast(message);
      } finally {
        setBusy(false);
      }
    })();
  });

  syncBtn?.addEventListener("click", () => {
    void (async () => {
      setBusy(true);
      padCtl.stop();
      try {
        const remote = await pushGesturesToMono(readForm());
        current = remote.settings;
        revision = remote.revision;
        lastSyncAt = new Date().toISOString();
        paint();
        setStatus(`已同步手势到 mono · revision ${revision}`);
        api.toast("手势已同步");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(message, true);
        api.toast(message);
      } finally {
        setBusy(false);
      }
    })();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (busy || area !== "local") return;
    if (changes[GESTURES_SETTINGS_KEY]) {
      current = normalizeGesturesSettings(changes[GESTURES_SETTINGS_KEY].newValue, { fillDefaults: false });
    }
    if (changes[FEATURES_KEY]) {
      const next = changes[FEATURES_KEY].newValue;
      featureEnabled = next?.gestures?.enabled === true;
    }
    if (changes[GESTURES_SETTINGS_KEY] || changes[FEATURES_KEY]) paint();
  });

  void reload().catch((error) => {
    setStatus(error instanceof Error ? error.message : String(error), true);
  });
}
