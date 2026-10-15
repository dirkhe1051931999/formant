/**
 * V2EX Plus-compatible settings stored in chrome.storage.sync.
 *
 * Field names intentionally match V2EX Plus 2.1.3 so its vendored
 * content features and the formant management surface share one source
 * of truth.
 */

export const V2EX_OPTIONS_KEY = "options";
export const V2EX_CHECKIN_DATE_KEY = "checkinDate";
export const V2EX_IMGUR_CLIENT_ID_KEY = "formantV2exImgurClientId";

/** @typedef {Record<string, boolean | string | number | string[]>} V2exOptions */

/** @type {V2exOptions} */
export const DEFAULT_V2EX_OPTIONS = {
  checkin: 1,
  msgNote: 1,
  chickinNote: 1,
  preview: 1,
  ignore: 1,
  fold: 1,
  jump: 1,
  newWindow: 0,
  replyUserNum: 1,
  relateReply: 1,
  nestedComment: 1,
  autoNestedComment: 0,
  imageParsing: 1,
  opReplyBg: 0,
  replyColor: "#fff94d",
  replyA: 0.4,
  thankColor: "#cccccc",
  weekNewuser: 0,
  vDaily: 0,
  userinfo: 1,
  markColor: "#ff0000",
  userMarkList: [],
  sov2ex: 0,
  sov2exMenu: 0,
  searchShortcut: 1,
  dblclickToTop: 0,
  base64: 1,
};

const BOOLEAN_KEYS = new Set([
  "checkin",
  "msgNote",
  "chickinNote",
  "preview",
  "ignore",
  "fold",
  "jump",
  "newWindow",
  "replyUserNum",
  "relateReply",
  "nestedComment",
  "autoNestedComment",
  "imageParsing",
  "opReplyBg",
  "weekNewuser",
  "vDaily",
  "userinfo",
  "sov2ex",
  "sov2exMenu",
  "searchShortcut",
  "dblclickToTop",
  "base64",
]);

const COLOR_KEYS = new Set(["replyColor", "thankColor", "markColor"]);

/**
 * @param {unknown} value
 * @param {string} fallback
 */
function normalizeColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeUserMarkList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
}

/**
 * @param {unknown} raw
 * @returns {V2exOptions}
 */
export function normalizeV2exOptions(raw) {
  const source = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  /** @type {V2exOptions} */
  const next = { ...DEFAULT_V2EX_OPTIONS, userMarkList: [] };

  for (const key of BOOLEAN_KEYS) {
    if (typeof source[key] === "boolean" || typeof source[key] === "number") {
      next[key] = source[key] ? 1 : 0;
    }
  }
  for (const key of COLOR_KEYS) {
    next[key] = normalizeColor(source[key], String(DEFAULT_V2EX_OPTIONS[key]));
  }

  const opacity = Number(source.replyA);
  next.replyA = Number.isFinite(opacity)
    ? Math.min(1, Math.max(0, Math.round(opacity * 20) / 20))
    : DEFAULT_V2EX_OPTIONS.replyA;
  next.userMarkList = normalizeUserMarkList(source.userMarkList);
  return next;
}

/**
 * @returns {Promise<V2exOptions>}
 */
export async function loadV2exOptions() {
  const data = await chrome.storage.sync.get(V2EX_OPTIONS_KEY);
  return normalizeV2exOptions(data[V2EX_OPTIONS_KEY]);
}

/**
 * Creates the compatible option object on first use.
 * @returns {Promise<V2exOptions>}
 */
export async function ensureV2exOptions() {
  const data = await chrome.storage.sync.get(V2EX_OPTIONS_KEY);
  if (data[V2EX_OPTIONS_KEY] !== undefined) {
    return normalizeV2exOptions(data[V2EX_OPTIONS_KEY]);
  }
  const defaults = normalizeV2exOptions(DEFAULT_V2EX_OPTIONS);
  await chrome.storage.sync.set({ [V2EX_OPTIONS_KEY]: defaults });
  return defaults;
}

/**
 * @param {unknown} raw
 * @returns {Promise<V2exOptions>}
 */
export async function saveV2exOptions(raw) {
  const next = normalizeV2exOptions(raw);
  await chrome.storage.sync.set({ [V2EX_OPTIONS_KEY]: next });
  return next;
}

/**
 * @param {string} key
 * @param {unknown} value
 * @returns {Promise<V2exOptions>}
 */
export async function updateV2exOption(key, value) {
  if (!Object.hasOwn(DEFAULT_V2EX_OPTIONS, key)) {
    throw new Error("未知 V2EX 设置项");
  }
  const current = await loadV2exOptions();
  current[key] = /** @type {never} */ (value);
  return saveV2exOptions(current);
}

/**
 * Matches V2EX Plus's reset behavior: the next reader re-creates defaults.
 */
export async function resetV2exOptions() {
  await chrome.storage.sync.remove(V2EX_OPTIONS_KEY);
  return ensureV2exOptions();
}

/**
 * Imgur's browser-side Client ID is user-provided and kept outside the
 * upstream-compatible sync object so it is never bundled with the extension.
 *
 * @returns {Promise<string>}
 */
export async function loadV2exImgurClientId() {
  const data = await chrome.storage.local.get(V2EX_IMGUR_CLIENT_ID_KEY);
  return String(data[V2EX_IMGUR_CLIENT_ID_KEY] || "").trim().slice(0, 256);
}

/**
 * @param {unknown} value
 */
export async function saveV2exImgurClientId(value) {
  const clientId = String(value || "").trim().slice(0, 256);
  await chrome.storage.local.set({ [V2EX_IMGUR_CLIENT_ID_KEY]: clientId });
  return clientId;
}
