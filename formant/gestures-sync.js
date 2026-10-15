import { ensureHostPermission, loadSettings } from "./sync.js";
import {
  hasAnyGestureBinding,
  loadGesturesSettings,
  normalizeGesturesSettings,
  saveGesturesSettings,
} from "./gestures-config.js";

export const GESTURES_SYNC_KEYS = {
  revision: "formantGesturesRevision",
  updatedAt: "formantGesturesUpdatedAt",
  lastSyncAt: "formantGesturesLastSyncAt",
  lastSyncResult: "formantGesturesLastSyncResult",
};

export async function loadGesturesSyncMeta() {
  const data = await chrome.storage.local.get([
    GESTURES_SYNC_KEYS.revision,
    GESTURES_SYNC_KEYS.updatedAt,
    GESTURES_SYNC_KEYS.lastSyncAt,
    GESTURES_SYNC_KEYS.lastSyncResult,
  ]);
  return {
    revision: Number(data[GESTURES_SYNC_KEYS.revision] || 0) || 0,
    updatedAt: String(data[GESTURES_SYNC_KEYS.updatedAt] || ""),
    lastSyncAt: String(data[GESTURES_SYNC_KEYS.lastSyncAt] || ""),
    lastSyncResult: String(data[GESTURES_SYNC_KEYS.lastSyncResult] || ""),
  };
}

async function requireSyncSettings() {
  const settings = await loadSettings();
  if (!settings.baseUrl) throw new Error("请先填写 mono Base URL");
  if (!settings.clientKey) throw new Error("请先填写 Client API Key");
  await ensureHostPermission(settings.baseUrl);
  return settings;
}

async function clientFetch(path, init = {}) {
  const settings = await requireSyncSettings();
  let response;
  try {
    response = await fetch(`${settings.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-oolaf-client-key": settings.clientKey,
        ...(init.headers || {}),
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`无法连接 ${settings.baseUrl}（${detail}）`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`请求失败：HTTP ${response.status}`);
  }
  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.message || `请求失败：HTTP ${response.status}`);
  }
  return payload.data;
}

async function rememberSync(result, label) {
  const settings = await saveGesturesSettings(result.settings);
  const revision = Number(result.revision) || 0;
  const updatedAt = result.updatedAt || "";
  await chrome.storage.local.set({
    [GESTURES_SYNC_KEYS.revision]: revision,
    [GESTURES_SYNC_KEYS.updatedAt]: updatedAt,
    [GESTURES_SYNC_KEYS.lastSyncAt]: new Date().toISOString(),
    [GESTURES_SYNC_KEYS.lastSyncResult]: `${label} revision ${revision}`,
  });
  return {
    revision,
    updatedAt,
    settings,
    fromDefault: Boolean(result.fromDefault),
  };
}

export async function pullGesturesFromMono() {
  const data = await clientFetch("/api/v1/client/gestures");
  return rememberSync(data, data?.fromDefault ? "已拉取默认" : "已拉取");
}

export async function pushGesturesToMono(raw) {
  const local = await saveGesturesSettings(raw ?? (await loadGesturesSettings()));
  const existing = await clientFetch("/api/v1/client/gestures");
  const remote = normalizeGesturesSettings(existing?.settings, { fillDefaults: false });
  const localEmpty = !hasAnyGestureBinding(local);
  const remoteCustomized = Boolean(existing) && !existing.fromDefault && hasAnyGestureBinding(remote);
  if (localEmpty && remoteCustomized) {
    return rememberSync(existing, "已保留云端手势（未用空映射覆盖）");
  }
  const data = await clientFetch("/api/v1/client/gestures", {
    method: "PUT",
    body: JSON.stringify({ settings: local }),
  });
  return rememberSync(data, "已同步");
}
