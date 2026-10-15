const STORAGE_KEYS = {
  baseUrl: "baseUrl",
  clientKey: "clientKey",
  lastSyncedAt: "lastSyncedAt",
  lastSyncResult: "lastSyncResult",
};

/** Local caches scoped to the current Client API Key; cleared when the key changes. */
const KEY_SCOPED_LOCAL_KEYS = [
  "lastSyncedAt",
  "lastSyncResult",
  "newtabHome",
  "newtabRevision",
  "newtabUpdatedAt",
  "newtabLastSyncAt",
  "newtabLastSyncResult",
  "newtabCacheWeather",
  "newtabCacheWeatherKey",
  "newtabCacheWeatherAt",
  "newtabCacheExchange",
  "newtabCacheHolidays",
  "newtabCacheVocab",
  "newtabCacheVocabAt",
  "newtabCacheWidgetsAt",
  "newtabCacheFavicons",
  "formantGestures",
  "formantGesturesRevision",
  "formantGesturesUpdatedAt",
  "formantGesturesLastSyncAt",
  "formantGesturesLastSyncResult",
];

/** Fixed mono endpoints for local debug / production. */
export const MONO_ENV_PRESETS = {
  dev: "http://localhost:3101",
  prod: "https://www.oolaf.top",
};

/** Old presets still treated as the current env. */
const BASE_URL_ALIASES = {
  "https://localhost:3101": MONO_ENV_PRESETS.dev,
  "https://mono.oolaf.top": MONO_ENV_PRESETS.prod,
};

/**
 * @param {unknown} raw
 */
function canonicalizeBaseUrl(raw) {
  const normalized = String(raw || "")
    .trim()
    .replace(/\/+$/, "");
  return BASE_URL_ALIASES[normalized] || normalized;
}

/**
 * @param {string} baseUrl
 * @returns {"dev" | "prod" | ""}
 */
export function envForBaseUrl(baseUrl) {
  const normalized = canonicalizeBaseUrl(baseUrl);
  if (normalized === MONO_ENV_PRESETS.dev) return "dev";
  if (normalized === MONO_ENV_PRESETS.prod) return "prod";
  return "";
}

/**
 * @param {Record<string, unknown>} data
 */
function normalizeSettings(data) {
  return {
    baseUrl: canonicalizeBaseUrl(data.baseUrl),
    clientKey: String(data.clientKey || "").trim(),
    lastSyncedAt: String(data.lastSyncedAt || ""),
    lastSyncResult: String(data.lastSyncResult || ""),
  };
}

/**
 * Chrome profile sync can carry Base URL + Client API Key to another computer.
 * Local remains the working copy; sync is a fallback when local is empty.
 * @returns {Promise<{ baseUrl: string, clientKey: string }>}
 */
async function readSyncedCredentials() {
  try {
    const data = await chrome.storage.sync.get([STORAGE_KEYS.baseUrl, STORAGE_KEYS.clientKey]);
    return {
      baseUrl: canonicalizeBaseUrl(data.baseUrl),
      clientKey: String(data.clientKey || "").trim(),
    };
  } catch {
    return { baseUrl: "", clientKey: "" };
  }
}

/**
 * @param {{ baseUrl: string, clientKey: string }} settings
 */
async function writeSyncedCredentials(settings) {
  try {
    await chrome.storage.sync.set({
      [STORAGE_KEYS.baseUrl]: settings.baseUrl,
      [STORAGE_KEYS.clientKey]: settings.clientKey,
    });
  } catch (error) {
    console.warn("[formant] chrome.storage.sync credentials skipped", error);
  }
}

/**
 * @returns {Promise<{ baseUrl: string, clientKey: string, lastSyncedAt: string, lastSyncResult: string }>}
 */
export async function loadSettings() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.baseUrl,
    STORAGE_KEYS.clientKey,
    STORAGE_KEYS.lastSyncedAt,
    STORAGE_KEYS.lastSyncResult,
  ]);
  const local = normalizeSettings(data);
  const storedUrl = String(data.baseUrl || "").trim().replace(/\/+$/, "");
  if (local.baseUrl && local.baseUrl !== storedUrl) {
    await chrome.storage.local.set({ [STORAGE_KEYS.baseUrl]: local.baseUrl });
    if (local.clientKey) await writeSyncedCredentials({ baseUrl: local.baseUrl, clientKey: local.clientKey });
  }
  if (local.baseUrl && local.clientKey) return local;

  const synced = await readSyncedCredentials();
  if (!synced.baseUrl || !synced.clientKey) return local;

  await chrome.storage.local.set({
    [STORAGE_KEYS.baseUrl]: synced.baseUrl,
    [STORAGE_KEYS.clientKey]: synced.clientKey,
  });
  return {
    ...local,
    baseUrl: synced.baseUrl,
    clientKey: synced.clientKey,
  };
}

/**
 * @param {{ baseUrl: string, clientKey: string }} settings
 * @param {{ allowEmpty?: boolean }} [opts]
 */
export async function saveSettings(settings, opts = {}) {
  const allowEmpty = Boolean(opts.allowEmpty);
  const baseUrl = canonicalizeBaseUrl(settings.baseUrl);
  const clientKey = settings.clientKey.trim();
  if (!baseUrl && !allowEmpty) {
    throw new Error("请填写 mono Base URL");
  }
  if (baseUrl) {
    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Base URL 仅支持 http/https");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Base URL")) throw error;
      throw new Error("Base URL 无效");
    }
    await ensureHostPermission(baseUrl);
  }
  if (!clientKey && !allowEmpty) {
    throw new Error("请填写 Client API Key");
  }

  const previous = await loadSettings();
  const keyChanged = Boolean(previous.clientKey && previous.clientKey !== clientKey);
  if (keyChanged) {
    await chrome.storage.local.remove(KEY_SCOPED_LOCAL_KEYS);
  }
  await chrome.storage.local.set({
    [STORAGE_KEYS.baseUrl]: baseUrl,
    [STORAGE_KEYS.clientKey]: clientKey,
  });
  await writeSyncedCredentials({ baseUrl, clientKey });
  return { baseUrl, clientKey, keyChanged };
}

/**
 * Show a fingerprint only; never the full Client API Key.
 * @param {unknown} raw
 */
export function maskClientKey(raw) {
  const key = String(raw || "").trim();
  if (!key) return "";
  if (key.length <= 16) return `${key.slice(0, Math.min(8, key.length))}…`;
  return `${key.slice(0, 12)}…${key.slice(-4)}`;
}

/**
 * @param {string} baseUrl
 */
export async function ensureHostPermission(baseUrl) {
  const originPattern = `${new URL(baseUrl).origin}/*`;
  const has = await chrome.permissions.contains({ origins: [originPattern] });
  if (has) return;
  const granted = await chrome.permissions.request({ origins: [originPattern] });
  if (!granted) {
    throw new Error("需要授权访问 mono 域名才能同步");
  }
}

/**
 * Chrome/Edge 顶层目录 title 经常为空，只带 folderType。
 * @param {chrome.bookmarks.BookmarkTreeNode} node
 */
function resolveFolderName(node) {
  const title = (node.title || "").trim();
  if (title) return title;

  const folderType = node.folderType;
  if (folderType === "bookmarks-bar") return "书签栏";
  if (folderType === "other") return "其他书签";
  if (folderType === "mobile") return "移动设备书签";
  if (folderType === "managed") return "托管书签";

  // 非根、有子节点的无名文件夹仍占一层，避免路径被拍平
  if (node.id && node.id !== "0" && node.children?.length) {
    return `文件夹-${node.id}`;
  }
  return "";
}

/**
 * Edge/Chrome 同层顺序路径，段内零填充便于字符串排序。
 * @param {number[]} parts
 */
function formatPositionPath(parts) {
  return parts.map((n) => String(n).padStart(6, "0")).join("/");
}

/**
 * @param {chrome.bookmarks.BookmarkTreeNode[]} nodes
 * @returns {{
 *   items: Array<{ url: string, title: string, folderPath: string, positionPath: string }>,
 *   folders: Array<{ folderPath: string, positionPath: string }>
 * }}
 */
export function collectBookmarkTree(nodes) {
  /** @type {Map<string, { url: string, title: string, folderPath: string, positionPath: string }>} */
  const byUrl = new Map();
  /** @type {Map<string, { folderPath: string, positionPath: string }>} */
  const byFolderPath = new Map();

  /**
   * @param {chrome.bookmarks.BookmarkTreeNode[]} list
   * @param {string[]} pathParts
   * @param {number[]} indexParts
   */
  function walk(list, pathParts, indexParts) {
    for (let i = 0; i < list.length; i += 1) {
      const node = list[i];
      const siblingIndex = typeof node.index === "number" ? node.index : i;
      const nextIndexParts = [...indexParts, siblingIndex];

      if (node.url) {
        const url = node.url.trim();
        if (!url.startsWith("http://") && !url.startsWith("https://")) continue;
        if (byUrl.has(url)) continue;
        byUrl.set(url, {
          url,
          title: (node.title || "").trim() || url,
          folderPath: pathParts.join("/"),
          positionPath: formatPositionPath(nextIndexParts),
        });
        continue;
      }

      // 文件夹（含空文件夹）也要带上同层 index，才能还原 Edge 文件夹顺序
      const name = resolveFolderName(node) || `文件夹-${node.id || siblingIndex}`;
      const nextPathParts = [...pathParts, name];
      const folderPath = nextPathParts.join("/");
      byFolderPath.set(folderPath, {
        folderPath,
        positionPath: formatPositionPath(nextIndexParts),
      });
      if (node.children?.length) {
        walk(node.children, nextPathParts, nextIndexParts);
      }
    }
  }

  // getTree() 根节点无标题，从它的 children 开始更稳
  const roots = nodes.length === 1 && !nodes[0]?.url && nodes[0]?.children
    ? nodes[0].children
    : nodes;
  walk(roots, [], []);
  return {
    items: [...byUrl.values()],
    folders: [...byFolderPath.values()],
  };
}

/** @deprecated 使用 collectBookmarkTree */
export function collectLinkItems(nodes) {
  return collectBookmarkTree(nodes).items;
}

/**
 * @returns {Promise<{ inserted: number, skipped: number, total: number, itemCount: number, syncedAt: string }>}
 */
export async function syncBookmarksToMono() {
  const settings = await loadSettings();
  if (!settings.clientKey) {
    throw new Error("请先在设置里填写 Client API Key");
  }
  if (!settings.baseUrl) {
    throw new Error("请先在设置里填写 mono Base URL");
  }

  await ensureHostPermission(settings.baseUrl);

  const tree = await chrome.bookmarks.getTree();
  const { items, folders } = collectBookmarkTree(tree);
  const endpoint = `${settings.baseUrl}/api/v1/client/bookmarks/sync`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-oolaf-client-key": settings.clientKey,
    },
    body: JSON.stringify({
      items,
      ...(folders.length > 0 ? { folders } : {}),
    }),
  });

  /** @type {{ code?: number, message?: string, data?: { inserted: number, skipped: number, total: number, folderCount?: number } }} */
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`同步失败：HTTP ${response.status}`);
  }

  if (!response.ok || payload.code !== 0 || !payload.data) {
    throw new Error(payload.message || `同步失败：HTTP ${response.status}`);
  }

  const withPath = items.filter((item) => item.folderPath).length;
  const syncedAt = new Date().toISOString();
  const filledPath = payload.data.filledPath ?? 0;
  const folderCount = payload.data.folderCount ?? folders.length;
  const summary = `新增 ${payload.data.inserted} · 跳过 ${payload.data.skipped} · 回填 ${filledPath} · 文件夹 ${folderCount} · 本地路径 ${withPath}/${items.length} · 云端 ${payload.data.total}`;
  await chrome.storage.local.set({
    [STORAGE_KEYS.lastSyncedAt]: syncedAt,
    [STORAGE_KEYS.lastSyncResult]: summary,
  });

  return {
    inserted: payload.data.inserted,
    skipped: payload.data.skipped,
    filledPath,
    folderCount,
    total: payload.data.total,
    itemCount: items.length,
    pathCount: withPath,
    syncedAt,
  };
}

export { STORAGE_KEYS };
