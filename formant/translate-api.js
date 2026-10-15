import { loadDeeplxApiKey } from "./deeplx-config.js";
import { ensureLexiconReady } from "./lexicon-runtime.js";
import { ensureHostPermission, loadSettings } from "./sync.js";
import { normalizeTranslateMode, planTranslateRoute } from "./translate-router.js";

/**
 * @param {string} baseUrl
 */
async function ensureMonoAccess(baseUrl) {
  const originPattern = `${new URL(baseUrl).origin}/*`;
  const has = await chrome.permissions.contains({ origins: [originPattern] });
  if (has) return;
  try {
    await ensureHostPermission(baseUrl);
  } catch {
    throw new Error("请打开设置点击「保存」，授权访问 mono 域名后再翻译");
  }
  const granted = await chrome.permissions.contains({ origins: [originPattern] });
  if (!granted) {
    throw new Error("请打开设置点击「保存」，授权访问 mono 域名后再翻译");
  }
}

/**
 * @param {string} path
 * @param {Record<string, unknown>} body
 * @param {number} [timeoutMs]
 */
async function clientPost(path, body, timeoutMs = 20000) {
  const settings = await loadSettings();
  if (!settings.baseUrl || !settings.clientKey) {
    throw new Error("请先填写 mono Base URL 与 Client API Key");
  }
  await ensureMonoAccess(settings.baseUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${settings.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-oolaf-client-key": settings.clientKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("翻译超时，请稍后重试");
    }
    throw new Error(`无法连接 mono（${settings.baseUrl}）：${detail}`);
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`翻译接口响应无效：HTTP ${response.status}`);
  }
  if (!response?.ok || Number(payload?.code) !== 0) {
    throw new Error(payload?.message || `翻译失败：HTTP ${response?.status || "无响应"}`);
  }
  return payload.data;
}

/**
 * @param {string} text
 */
function looksLikeChinese(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

/**
 * @param {{ q: string, source?: string, target?: string }} input
 */
function resolvePair(input) {
  const source = (input.source || "auto").trim() || "auto";
  let target = (input.target || "").trim();
  if (!target || target === "auto") {
    target = looksLikeChinese(input.q) ? "en" : "zh-CN";
  }
  return { source, target };
}

/**
 * Google Translate PA gtx browser key (public frontend client, not a formant/mono secret).
 * Same gtx PA channel used by Chrome-family web translators.
 */
const GOOGLE_PA_ENDPOINT = "https://translate-pa.googleapis.com/v1/translate";
const GOOGLE_PA_KEY = "AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA";

/**
 * Call Google translate-pa (gtx) directly from the browser. No mono.
 * @param {{ q: string, source?: string, target?: string }} input
 */
export async function translateGooglePa(input) {
  const q = String(input.q || "").trim();
  if (!q) throw new Error("请输入要翻译的文本");
  const { source, target } = resolvePair({ q, source: input.source, target: input.target });
  const params = new URLSearchParams();
  params.set("params.client", "gtx");
  params.set("query.source_language", source);
  params.set("query.target_language", target);
  params.set("query.text", q);
  params.set("key", GOOGLE_PA_KEY);
  params.append("data_types", "TRANSLATION");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  let response;
  try {
    response = await fetch(`${GOOGLE_PA_ENDPOINT}?${params.toString()}`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Google 翻译超时");
    }
    throw new Error(error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }

  if (!response?.ok) throw new Error(`Google 翻译失败：HTTP ${response?.status || "无响应"}`);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Google 翻译响应无效");
  }

  const body = payload && typeof payload === "object" ? payload : {};
  const text = typeof body.translation === "string" ? body.translation.trim() : "";
  if (!text) throw new Error("Google 翻译结果为空");

  const detected =
    typeof body.sourceLanguage === "string" && body.sourceLanguage
      ? body.sourceLanguage
      : Array.isArray(body.detectedLanguages?.srclangs) && typeof body.detectedLanguages.srclangs[0] === "string"
        ? body.detectedLanguages.srclangs[0]
        : source === "auto"
          ? ""
          : source;

  return {
    provider: "google",
    source: detected || source,
    target,
    text,
  };
}

/**
 * @param {{ q: string, source?: string, target?: string }} input
 */
export async function translateGoogle(input) {
  try {
    return await translateGooglePa(input);
  } catch (directError) {
    try {
      return await clientPost(
        "/api/v1/client/newtab/translate/google",
        {
          q: input.q,
          source: input.source || "auto",
          target: input.target,
        },
        10000,
      );
    } catch {
      throw directError instanceof Error ? directError : new Error(String(directError));
    }
  }
}

/**
 * @param {{ q: string, source?: string, target?: string }} input
 */
export async function translateGpt(input) {
  return clientPost(
    "/api/v1/client/newtab/translate/gpt",
    {
      q: input.q,
      source: input.source || "auto",
      target: input.target,
    },
    25000,
  );
}

/**
 * DeepL language code. zh-CN / en come from resolvePair; auto stays auto.
 * @param {string} code
 */
function deeplxLang(code) {
  const value = String(code || "auto").trim().toLowerCase();
  if (value.startsWith("zh")) return "ZH";
  if (value === "en") return "EN";
  return "auto";
}

/**
 * DeepLX direct call. Key is local (formantDeeplx), never mono.
 * Google 失败时的备用，以及「全部」模式的并行第三路。
 * @param {{ q: string, source?: string, target?: string }} input
 */
export async function translateDeeplx(input) {
  const q = String(input.q || "").trim();
  if (!q) throw new Error("请输入要翻译的文本");
  const apiKey = await loadDeeplxApiKey();
  if (!apiKey) throw new Error("请先在设置「翻译」里填写 DeepLX API Key");
  const { source, target } = resolvePair({ q, source: input.source, target: input.target });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let response;
  try {
    response = await fetch(`https://api.deeplx.org/${encodeURIComponent(apiKey)}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        text: q,
        source_lang: deeplxLang(source),
        target_lang: deeplxLang(target),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("DeepLX 超时");
    throw new Error("无法连接 DeepLX");
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`DeepLX 响应无效：HTTP ${response.status}`);
  }
  const code = Number(payload?.code);
  const text = typeof payload?.data === "string" ? payload.data.trim() : "";
  if (!response?.ok || (Number.isFinite(code) && code !== 200) || !text) {
    const message = typeof payload?.message === "string" ? payload.message.trim() : "";
    throw new Error(message || `DeepLX 失败：HTTP ${response?.status || code || "未知"}`);
  }
  return {
    provider: "deeplx",
    source: typeof payload.source_lang === "string" ? payload.source_lang : source,
    target: typeof payload.target_lang === "string" ? payload.target_lang : target,
    text,
  };
}

/**
 * @typedef {{ ok: true, data: any } | { ok: false, error: string, skipped?: boolean } } TranslateSideResult
 */

/**
 * @param {unknown} reason
 */
function toErrorMessage(reason) {
  return reason instanceof Error ? reason.message : String(reason);
}

/**
 * Partial callbacks must not reject the side promise.
 * @param {(r: TranslateSideResult) => void} [onDone]
 * @param {TranslateSideResult} result
 */
function notifySide(onDone, result) {
  try {
    onDone?.(result);
  } catch (error) {
    console.warn("[formant] translate callback failed", error);
  }
  return result;
}

/**
 * @param {unknown} value
 * @param {string} error
 * @returns {TranslateSideResult}
 */
function asSide(value, error) {
  if (value && typeof value === "object" && typeof /** @type {{ ok?: unknown }} */ (value).ok === "boolean") {
    return /** @type {TranslateSideResult} */ (value);
  }
  return { ok: false, error };
}

/**
 * Sync throws and callback throws stay inside the side result.
 * @param {() => Promise<any>} runner
 * @param {(r: TranslateSideResult) => void} [onDone]
 * @returns {Promise<TranslateSideResult>}
 */
function runSide(runner, onDone) {
  return Promise.resolve()
    .then(runner)
    .then(
      (data) => notifySide(onDone, { ok: true, data }),
      (reason) => notifySide(onDone, { ok: false, error: toErrorMessage(reason) }),
    );
}

/**
 * Smart / manual routing for Google + GPT + DeepLX fallback.
 * @param {{ q: string, source?: string, target?: string, mode?: import("./translate-router.js").TranslateMode }} input
 * @param {{ onGoogle?: (r: TranslateSideResult) => void, onGpt?: (r: TranslateSideResult) => void, onDeeplx?: (r: TranslateSideResult) => void, onRoute?: (plan: import("./translate-router.js").RoutePlan) => void }} [handlers]
 */
export async function translateSmart(input, handlers = {}) {
  const q = String(input.q || "").trim();
  if (!q) throw new Error("请输入要翻译的文本");
  await ensureLexiconReady();
  const mode = normalizeTranslateMode(input.mode);
  const plan = planTranslateRoute(q, mode);
  handlers.onRoute?.(plan);

  const body = { q, source: input.source || "auto", target: input.target };

  /** @type {Promise<TranslateSideResult>} */
  let googlePromise;
  if (plan.runGoogle) {
    googlePromise = runSide(() => translateGoogle(body), handlers.onGoogle);
  } else {
    /** @type {TranslateSideResult} */
    const skipped = { ok: false, skipped: true, error: "已跳过 · 当前模式未启用 Google" };
    handlers.onGoogle?.(skipped);
    googlePromise = Promise.resolve(skipped);
  }

  /** @type {Promise<TranslateSideResult>} */
  let gptPromise;
  if (plan.runGpt) {
    gptPromise = runSide(() => translateGpt(body), handlers.onGpt);
  } else {
    const why =
      plan.mode === "auto"
        ? `已跳过 · ${plan.summary.replace(/^自动 · /, "")}`
        : "已跳过 · 当前模式未启用 GPT";
    /** @type {TranslateSideResult} */
    const skipped = { ok: false, skipped: true, error: why };
    handlers.onGpt?.(skipped);
    gptPromise = Promise.resolve(skipped);
  }

  /** @type {Promise<TranslateSideResult>} */
  let deeplxPromise;
  if (plan.runDeeplx) {
    deeplxPromise = runSide(() => translateDeeplx(body), handlers.onDeeplx);
  } else if (plan.deeplxFallback) {
    deeplxPromise = googlePromise.then((raw) => {
      const google = asSide(raw, "Google 翻译失败");
      if (google.ok) {
        /** @type {TranslateSideResult} */
        const standby = {
          ok: false,
          skipped: true,
          error: "待机 · Google 可用时不调用",
        };
        handlers.onDeeplx?.(standby);
        return standby;
      }
      if (google.skipped) {
        /** @type {TranslateSideResult} */
        const skipped = { ok: false, skipped: true, error: "已跳过 · 当前模式未启用 DeepLX" };
        handlers.onDeeplx?.(skipped);
        return skipped;
      }
      return runSide(
        () =>
          translateDeeplx(body).then((data) => ({
            ...data,
            fallbackFrom: "google",
          })),
        handlers.onDeeplx,
      );
    });
  } else {
    /** @type {TranslateSideResult} */
    const skipped = { ok: false, skipped: true, error: "已跳过 · 当前模式未启用 DeepLX" };
    handlers.onDeeplx?.(skipped);
    deeplxPromise = Promise.resolve(skipped);
  }

  const [google, gpt, deeplx] = await Promise.all([googlePromise, gptPromise, deeplxPromise]);
  return {
    google: asSide(google, "Google 翻译失败"),
    gpt: asSide(gpt, "GPT 翻译失败"),
    deeplx: asSide(deeplx, "DeepLX 翻译失败"),
    plan,
  };
}

/**
 * Backward-compatible alias: always run Google + GPT + DeepLX.
 * @param {{ q: string, source?: string, target?: string }} input
 * @param {{ onGoogle?: (r: TranslateSideResult) => void, onGpt?: (r: TranslateSideResult) => void, onDeeplx?: (r: TranslateSideResult) => void }} [handlers]
 */
export async function translateBoth(input, handlers = {}) {
  const result = await translateSmart({ ...input, mode: "all" }, handlers);
  return { google: result.google, gpt: result.gpt, deeplx: result.deeplx };
}
