/** Lightweight mouse-gesture preferences in chrome.storage.local. */
import { canonicalGesturePath, pathFromPoints } from "./gestures-shape.js";

export const GESTURES_SETTINGS_KEY = "formantGestures";

/** @typedef {"back" | "forward" | "reload" | "closeTab" | "scrollTop" | "scrollBottom"} GestureAction */

/** @type {readonly GestureAction[]} */
export const GESTURE_ACTIONS = ["back", "forward", "reload", "closeTab", "scrollTop", "scrollBottom"];

/** @type {Record<GestureAction, string>} */
export const GESTURE_ACTION_LABELS = {
  back: "后退",
  forward: "前进",
  reload: "刷新",
  closeTab: "关闭当前标签",
  scrollTop: "滚到顶部",
  scrollBottom: "滚到底部",
};

/**
 * @typedef {{
 *   path: string,
 *   previewId: string,
 *   previewUrl: string,
 *   storageKey: string
 * }} GestureBinding
 *
 * @typedef {{
 *   minDistance: number,
 *   bindings: Record<GestureAction, GestureBinding>
 * }} GesturesSettings
 */

export function emptyGestureBinding() {
  return { path: "", previewId: "", previewUrl: "", storageKey: "" };
}

/** @type {GesturesSettings} */
export const DEFAULT_GESTURES_SETTINGS = {
  minDistance: 10,
  bindings: {
    back: { path: "L", previewId: "", previewUrl: "", storageKey: "" },
    forward: { path: "R", previewId: "", previewUrl: "", storageKey: "" },
    reload: { path: "UD", previewId: "", previewUrl: "", storageKey: "" },
    closeTab: { path: "DR", previewId: "", previewUrl: "", storageKey: "" },
    scrollTop: { path: "U", previewId: "", previewUrl: "", storageKey: "" },
    scrollBottom: { path: "D", previewId: "", previewUrl: "", storageKey: "" },
  },
};

/**
 * Direction sequences plus shape tokens O (circle) and X.
 * @param {unknown} raw
 */
export function normalizeGesturePath(raw) {
  const text = String(raw || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!text) return "";
  if (text === "O" || text === "CIRCLE" || text === "○" || text === "〇") return "O";
  if (text === "X" || text === "CROSS") return "X";
  const chars = text.replace(/[^LRUD]/g, "").split("");
  /** @type {string[]} */
  const out = [];
  for (const ch of chars) {
    if (out[out.length - 1] !== ch) out.push(ch);
  }
  return out.join("").slice(0, 8);
}

/**
 * @param {unknown} raw
 * @returns {GestureBinding}
 */
export function normalizeGestureBinding(raw) {
  if (typeof raw === "string") {
    return { ...emptyGestureBinding(), path: normalizeGesturePath(raw) };
  }
  if (!raw || typeof raw !== "object") return emptyGestureBinding();
  const source = /** @type {Record<string, unknown>} */ (raw);
  return {
    path: normalizeGesturePath(source.path ?? source.gesture),
    previewId: String(source.previewId || "").slice(0, 80),
    previewUrl: String(source.previewUrl || "").slice(0, 500),
    storageKey: String(source.storageKey || "").slice(0, 320),
  };
}

/**
 * @param {unknown} raw
 */
export function formatGesturePath(raw) {
  const path = normalizeGesturePath(raw);
  if (!path) return "未绑定";
  if (path === "O") return "圈";
  if (path === "X") return "✕";
  const arrows = { L: "←", R: "→", U: "↑", D: "↓" };
  return path
    .split("")
    .map((ch) => arrows[ch] || ch)
    .join(" ");
}

/**
 * @param {Record<string, GestureBinding>} bindings
 * @returns {{ path: string, actions: [GestureAction, GestureAction] } | null}
 */
export function findDuplicateGesturePath(bindings) {
  /** @type {Map<string, GestureAction>} */
  const seen = new Map();
  for (const action of GESTURE_ACTIONS) {
    const path = bindings[action]?.path;
    if (!path) continue;
    const prev = seen.get(path);
    if (prev) return { path, actions: [prev, action] };
    seen.set(path, action);
  }
  return null;
}

/**
 * @param {Record<string, GestureBinding>} bindings
 */
export function assertUniqueGestureBindings(bindings) {
  const dup = findDuplicateGesturePath(bindings);
  if (!dup) return;
  throw new Error(
    `${GESTURE_ACTION_LABELS[dup.actions[0]]} 与 ${GESTURE_ACTION_LABELS[dup.actions[1]]} 不能使用同一手势 ${formatGesturePath(dup.path)}`,
  );
}

/**
 * @param {unknown} raw
 * @param {{ fillDefaults?: boolean }} [options]
 * @returns {GesturesSettings}
 */
export function normalizeGesturesSettings(raw, options = {}) {
  const fillDefaults = options.fillDefaults !== false;
  const source = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const bindingsRaw =
    source.bindings && typeof source.bindings === "object"
      ? /** @type {Record<string, unknown>} */ (source.bindings)
      : {};
  const min = Number(source.minDistance);
  /** @type {Record<GestureAction, GestureBinding>} */
  const bindings = {
    back: emptyGestureBinding(),
    forward: emptyGestureBinding(),
    reload: emptyGestureBinding(),
    closeTab: emptyGestureBinding(),
    scrollTop: emptyGestureBinding(),
    scrollBottom: emptyGestureBinding(),
  };
  for (const action of GESTURE_ACTIONS) {
    const rawBind = bindingsRaw[action];
    if (rawBind == null || rawBind === "") {
      bindings[action] = fillDefaults ? { ...DEFAULT_GESTURES_SETTINGS.bindings[action] } : emptyGestureBinding();
    } else {
      bindings[action] = normalizeGestureBinding(rawBind);
    }
  }
  return {
    minDistance: Number.isFinite(min) ? Math.min(40, Math.max(6, Math.round(min))) : DEFAULT_GESTURES_SETTINGS.minDistance,
    bindings,
  };
}

/**
 * @param {GesturesSettings} settings
 */
export function hasAnyGestureBinding(settings) {
  return GESTURE_ACTIONS.some((action) => Boolean(settings.bindings[action]?.path));
}

/**
 * @param {string} path
 * @param {GesturesSettings} settings
 * @returns {GestureAction | ""}
 */
export function actionForPath(path, settings) {
  const key = canonicalGesturePath(normalizeGesturePath(path));
  if (!key) return "";
  const { bindings } = normalizeGesturesSettings(settings, { fillDefaults: false });
  for (const action of GESTURE_ACTIONS) {
    if (canonicalGesturePath(bindings[action].path) === key) return action;
  }
  return "";
}

export { canonicalGesturePath, pathFromPoints };

/**
 * @returns {Promise<GesturesSettings>}
 */
export async function loadGesturesSettings() {
  const data = await chrome.storage.local.get(GESTURES_SETTINGS_KEY);
  const raw = data[GESTURES_SETTINGS_KEY];
  return normalizeGesturesSettings(raw, { fillDefaults: raw == null });
}

/**
 * @param {unknown} raw
 * @returns {Promise<GesturesSettings>}
 */
export async function saveGesturesSettings(raw) {
  const next = normalizeGesturesSettings(raw, { fillDefaults: false });
  assertUniqueGestureBindings(next.bindings);
  await chrome.storage.local.set({ [GESTURES_SETTINGS_KEY]: next });
  return next;
}
