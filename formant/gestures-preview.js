import { ensureHostPermission, loadSettings } from "./sync.js";
import { GESTURE_ACTIONS, normalizeGesturePath } from "./gestures-config.js";

const PREVIEW_W = 240;
const PREVIEW_H = 180;
const PREVIEW_PAD = 18;

/**
 * @param {Array<Array<{ x: number, y: number }>>} strokes
 * @returns {Promise<Blob>}
 */
export async function strokesToPngBlob(strokes) {
  const canvas = document.createElement("canvas");
  canvas.width = PREVIEW_W;
  canvas.height = PREVIEW_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法生成预览图");
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);
  const points = strokes.flat();
  if (points.length < 2) return canvasToBlob(canvas);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const spanX = Math.max(8, maxX - minX);
  const spanY = Math.max(8, maxY - minY);
  const scale = Math.min((PREVIEW_W - PREVIEW_PAD * 2) / spanX, (PREVIEW_H - PREVIEW_PAD * 2) / spanY);
  const ox = (PREVIEW_W - spanX * scale) / 2;
  const oy = (PREVIEW_H - spanY * scale) / 2;
  ctx.strokeStyle = "#1f4b99";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (!stroke || stroke.length < 2) continue;
    ctx.beginPath();
    stroke.forEach((point, index) => {
      const x = ox + (point.x - minX) * scale;
      const y = oy + (point.y - minY) * scale;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  return canvasToBlob(canvas);
}

/**
 * Schematic thumbnail when the cloud preview is missing.
 * @param {unknown} rawPath
 */
export function pathPreviewSvg(rawPath) {
  const path = normalizeGesturePath(rawPath);
  const d = schematicPath(path);
  return `<svg class="gesture-bind__img" viewBox="0 0 72 54" aria-hidden="true"><path d="${d}" fill="none" stroke="#1f4b99" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/**
 * @param {string} path
 */
function schematicPath(path) {
  if (path === "O") return "M36 10 A17 17 0 1 1 35.9 10";
  if (path === "X") return "M22 14 L50 40 M50 14 L22 40";
  const pts = [{ x: 18, y: 27 }];
  let x = 18;
  let y = 27;
  const step = 14;
  for (const ch of path.slice(0, 6)) {
    if (ch === "L") x -= step;
    if (ch === "R") x += step;
    if (ch === "U") y -= step;
    if (ch === "D") y += step;
    x = Math.max(10, Math.min(62, x));
    y = Math.max(10, Math.min(44, y));
    pts.push({ x, y });
  }
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
}

/**
 * @param {string} action
 * @param {Blob} blob
 */
export async function uploadGesturePreview(action, blob) {
  if (!GESTURE_ACTIONS.includes(/** @type {any} */ (action))) throw new Error("未知手势动作");
  const settings = await requireSyncSettings();
  const body = new FormData();
  body.set("action", action);
  body.set("file", blob, `${action}.png`);
  const data = await clientUpload("/api/v1/client/gestures/preview", body, settings);
  return {
    previewId: String(data.previewId || ""),
    previewUrl: String(data.previewUrl || ""),
    storageKey: String(data.storageKey || ""),
  };
}

/**
 * @param {string} action
 */
export async function deleteGesturePreview(action) {
  if (!GESTURE_ACTIONS.includes(/** @type {any} */ (action))) return;
  const settings = await requireSyncSettings();
  await clientUpload(
    `/api/v1/client/gestures/preview?action=${encodeURIComponent(action)}`,
    null,
    settings,
    "DELETE",
  );
}

export async function deleteAllGesturePreviews() {
  const settings = await requireSyncSettings();
  await clientUpload("/api/v1/client/gestures/previews", null, settings, "DELETE");
}

async function requireSyncSettings() {
  const settings = await loadSettings();
  if (!settings.baseUrl) throw new Error("请先填写 mono Base URL");
  if (!settings.clientKey) throw new Error("请先填写 Client API Key");
  await ensureHostPermission(settings.baseUrl);
  return settings;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Blob>}
 */
function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("预览图导出失败"));
    }, "image/png");
  });
}

/**
 * @param {string} path
 * @param {FormData | null} body
 * @param {{ baseUrl: string, clientKey: string }} settings
 * @param {string} [method]
 */
async function clientUpload(path, body, settings, method = "POST") {
  let response;
  try {
    response = await fetch(`${settings.baseUrl}${path}`, {
      method,
      headers: { "x-oolaf-client-key": settings.clientKey },
      body: body || undefined,
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
  return payload.data || {};
}
