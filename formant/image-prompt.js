/** Popup image-to-prompt via a user-configured OpenAI-compatible vision API. */

export const IMAGE_PROMPT_KEY = "formantImagePrompt";

export const DEFAULT_IMAGE_PROMPT_SETTINGS = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "",
};

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 1600;
const ACCEPT = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/jpg"]);

const ANALYSIS_INSTRUCTION = [
  "You write recreation prompts for image models. Return one JSON object only. No markdown fences and no extra prose.",
  "Shape:",
  '{"zh":{"prompt":""},"en":{"prompt":""},"json_prompt":{"subject":"","action_pose":"","details_appearance":"","environment_background":"","lighting_atmosphere":"","composition_framing":"","style_camera":"","colors":[],"materials":[],"aspect_ratio":"","quality_modifiers":[]}}',
  "zh.prompt and en.prompt are one dense paragraph each, not a short caption and not a bullet list.",
  "Open with what the picture is (photo, screenshot, collage, poster) and its layout. Then walk the frame in reading order: top to bottom, or quadrant by quadrant when the image is a grid. Name each region's viewpoint, color, shape, and setting.",
  "Quote visible text exactly: titles, badges, times, watermarks, labels, license plates, UI strings. If text is cut off, quote the visible part and say it is truncated. If a name or avatar is mosaicked, say it is censored instead of inventing it.",
  "Treat marks on the image as part of the picture: red hand-drawn circles, arrows, highlights, and gray dividers. Say which region they enclose.",
  "Close with overall style, light, materials or UI surfaces, aspect ratio, and sharpness. A busy image should land around 250 to 500 Chinese characters in zh.prompt, with en.prompt carrying the same facts. A sparse image may be shorter. Do not pad with details that are not visible.",
  "json_prompt stores the same visible facts in fields. colors, materials, and quality_modifiers are string arrays.",
].join("\n");

/**
 * @typedef {{ baseUrl: string, apiKey: string, model: string }} ImagePromptSettings
 * @typedef {{ zh: string, en: string, jsonPrompt: Record<string, unknown>, jsonText: string }} ImagePromptResult
 */

/**
 * @param {unknown} value
 */
export function normalizeImagePromptBaseUrl(value) {
  const raw = String(value || "").trim() || DEFAULT_IMAGE_PROMPT_SETTINGS.baseUrl;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Base URL 无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Base URL 只支持 http 或 https");
  }
  return url.href.replace(/\/+$/, "");
}

/**
 * @param {unknown} raw
 * @returns {ImagePromptSettings}
 */
export function normalizeImagePromptSettings(raw) {
  const src = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  return {
    baseUrl: normalizeImagePromptBaseUrl(src.baseUrl),
    apiKey: String(src.apiKey || "").trim(),
    model: String(src.model || "").trim(),
  };
}

/**
 * @param {ImagePromptSettings} settings
 */
export function isImagePromptConfigured(settings) {
  return Boolean(settings.baseUrl && settings.apiKey && settings.model);
}

/**
 * @returns {Promise<ImagePromptSettings>}
 */
export async function loadImagePromptSettings() {
  const data = await chrome.storage.local.get(IMAGE_PROMPT_KEY);
  return normalizeImagePromptSettings(data[IMAGE_PROMPT_KEY]);
}

/**
 * @param {Partial<ImagePromptSettings>} settings
 * @returns {Promise<ImagePromptSettings>}
 */
export async function saveImagePromptSettings(settings) {
  const next = normalizeImagePromptSettings(settings);
  await chrome.storage.local.set({ [IMAGE_PROMPT_KEY]: next });
  return next;
}

/**
 * @param {File} file
 */
export function assertImageFile(file) {
  const type = String(file.type || "").toLowerCase();
  if (!ACCEPT.has(type)) throw new Error("仅支持 JPG、PNG、WebP 和 GIF");
  if (file.size > MAX_BYTES) throw new Error("图片不能超过 10MB");
}

/**
 * @param {string} rawUrl
 * @returns {Promise<Blob>}
 */
export async function fetchImageBlob(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch {
    throw new Error("图片 URL 无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("只支持 http 或 https 图片地址");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetch(url.href, { signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("下载图片超时");
    }
    throw new Error(error instanceof Error ? error.message : "无法下载图片");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) throw new Error(`无法下载图片：HTTP ${response.status}`);
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (type && !ACCEPT.has(type) && type !== "application/octet-stream") {
    throw new Error("这个地址不是图片");
  }
  const blob = await response.blob();
  const declared = type || String(blob.type || "").toLowerCase();
  if (declared && declared !== "application/octet-stream" && !ACCEPT.has(declared)) {
    throw new Error("这个地址不是图片");
  }
  if (blob.size > MAX_BYTES) throw new Error("图片不能超过 10MB");
  return blob;
}

/**
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
export async function imageBlobToDataUrl(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const longest = Math.max(bitmap.width, bitmap.height) || 1;
    const scale = Math.min(1, MAX_EDGE / longest);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法处理图片");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.92);
  } finally {
    bitmap.close();
  }
}

/**
 * @param {string} baseUrl
 */
function chatCompletionsUrl(baseUrl) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

/**
 * @param {unknown} content
 */
function contentToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && typeof part.text === "string") return part.text;
      return "";
    })
    .join("");
}

/**
 * @param {string} text
 * @returns {ImagePromptResult}
 */
export function parseAnalysisText(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1].trim() : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回 JSON");

  let parsed;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error("模型返回的 JSON 无法解析");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("模型返回的 JSON 无法解析");

  const zhNode = /** @type {Record<string, unknown>} */ (parsed).zh;
  const enNode = /** @type {Record<string, unknown>} */ (parsed).en;
  const zh = typeof zhNode === "string" ? zhNode : zhNode && typeof zhNode.prompt === "string" ? zhNode.prompt : "";
  const en = typeof enNode === "string" ? enNode : enNode && typeof enNode.prompt === "string" ? enNode.prompt : "";
  if (!zh.trim() || !en.trim()) throw new Error("模型结果缺少中文或英文提示词");

  let jsonPrompt = /** @type {Record<string, unknown>} */ (parsed).json_prompt;
  if (typeof jsonPrompt === "string") {
    try {
      jsonPrompt = JSON.parse(jsonPrompt);
    } catch {
      jsonPrompt = { prompt: jsonPrompt };
    }
  }
  if (!jsonPrompt || typeof jsonPrompt !== "object" || Array.isArray(jsonPrompt)) {
    jsonPrompt = {};
  }

  return {
    zh: zh.trim(),
    en: en.trim(),
    jsonPrompt,
    jsonText: JSON.stringify(jsonPrompt, null, 2),
  };
}

/**
 * @param {string} dataUrl
 * @param {ImagePromptSettings} settings
 * @returns {Promise<ImagePromptResult>}
 */
export async function analyzeImageDataUrl(dataUrl, settings) {
  if (!isImagePromptConfigured(settings)) {
    throw new Error("请先在设置里填写 Base URL、API Key 和 Model");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  let response;
  try {
    response = await fetch(chatCompletionsUrl(settings.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.2,
        max_tokens: 2500,
        messages: [
          { role: "system", content: ANALYSIS_INSTRUCTION },
          {
            role: "user",
            content: [
              { type: "text", text: "Write a dense recreation prompt. Transcribe visible text and walk the frame region by region." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("识别超时，请稍后重试");
    }
    throw new Error(error instanceof Error ? error.message : "无法连接模型接口");
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && payload.error && typeof payload.error.message === "string"
        ? payload.error.message
        : `识别失败：HTTP ${response.status}`;
    throw new Error(message);
  }

  const text = contentToText(payload?.choices?.[0]?.message?.content);
  if (!text.trim()) throw new Error("模型没有返回内容");
  return parseAnalysisText(text);
}
