/**
 * Lightweight helpers to read cookies / web storage for the active tab.
 * Inspired by common Cookie+Storage extractors; does not embed third-party source.
 */

/**
 * @typedef {{
 *   id: number,
 *   url: string,
 *   origin: string,
 *   hostname: string,
 *   title: string,
 * }} SiteDataTab
 */

/**
 * @typedef {{
 *   name: string,
 *   value: string,
 *   domain: string,
 *   path: string,
 *   secure: boolean,
 *   httpOnly: boolean,
 *   storeId?: string,
 *   expirationDate?: number,
 * }} SiteCookie
 */

/**
 * @returns {Promise<SiteDataTab>}
 */
export async function getActiveSiteTab() {
  // Popup 执行上下文里 currentWindow 可能是扩展窗本身（无 tabs），要用 lastFocusedWindow。
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab =
    tabs.find((item) => item.url && !item.url.startsWith("chrome-extension://")) || tabs[0];
  if (!tab?.id || !tab.url) {
    throw new Error("未找到当前标签页");
  }
  let parsed;
  try {
    parsed = new URL(tab.url);
  } catch {
    throw new Error("当前页 URL 无效");
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error("仅支持 http/https 页面（chrome:// 等无法提取）");
  }
  return {
    id: tab.id,
    url: tab.url,
    origin: parsed.origin,
    hostname: parsed.hostname,
    title: String(tab.title || parsed.hostname),
  };
}

/**
 * @param {string} url
 * @returns {Promise<SiteCookie[]>}
 */
export async function listCookiesForUrl(url) {
  /** @type {{ ok?: boolean, cookies?: SiteCookie[], error?: string } | undefined} */
  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: "SITE_DATA_COOKIES",
      url,
    });
  } catch (error) {
    // Receiving end does not exist / SW 未起来
    throw new Error(
      `无法连接后台：${error instanceof Error ? error.message : String(error)}。请到扩展管理页重新加载 formant`,
    );
  }
  if (chrome.runtime.lastError) {
    throw new Error(
      `${chrome.runtime.lastError.message}。请到扩展管理页重新加载 formant`,
    );
  }
  if (!response) {
    throw new Error("后台未响应 Cookie 请求，请到扩展管理页重新加载 formant（需含 cookies 权限）");
  }
  if (!response.ok) {
    throw new Error(response.error || "读取 Cookie 失败");
  }
  const cookies = Array.isArray(response.cookies) ? response.cookies : [];
  return cookies
    .map((cookie) => ({
      name: String(cookie.name || ""),
      value: String(cookie.value || ""),
      domain: String(cookie.domain || ""),
      path: String(cookie.path || ""),
      secure: Boolean(cookie.secure),
      httpOnly: Boolean(cookie.httpOnly),
      storeId: cookie.storeId ? String(cookie.storeId) : undefined,
      expirationDate: cookie.expirationDate,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

/**
 * Build a URL chrome.cookies.remove accepts for this cookie.
 * @param {SiteCookie} cookie
 * @param {string} pageUrl
 */
export function cookieRemoveUrl(cookie, pageUrl) {
  try {
    const page = new URL(pageUrl);
    const host = String(cookie.domain || page.hostname).replace(/^\./, "");
    const path = cookie.path || "/";
    const scheme = cookie.secure ? "https" : page.protocol.replace(":", "") || "https";
    return `${scheme}://${host}${path.startsWith("/") ? path : `/${path}`}`;
  } catch {
    return pageUrl;
  }
}

/**
 * @param {SiteCookie} cookie
 * @param {string} pageUrl
 */
export async function removeCookie(cookie, pageUrl) {
  const response = await chrome.runtime.sendMessage({
    type: "SITE_DATA_COOKIE_REMOVE",
    name: cookie.name,
    url: cookieRemoveUrl(cookie, pageUrl),
    storeId: cookie.storeId,
  });
  if (!response?.ok) {
    throw new Error(response?.error || "删除 Cookie 失败");
  }
}

/**
 * @param {number} tabId
 * @param {"local" | "session"} kind
 * @param {string} key
 */
export async function removePageStorageKey(tabId, kind, key) {
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [kind, key],
    func: (storageKind, storageKey) => {
      const target = storageKind === "local" ? window.localStorage : window.sessionStorage;
      target.removeItem(String(storageKey));
    },
  });
  if (chrome.runtime.lastError) {
    throw new Error(chrome.runtime.lastError.message);
  }
}

/**
 * Clear all cookies visible for the page URL (current Cookie tab scope).
 * @param {string} pageUrl
 */
export async function clearCookiesForUrl(pageUrl) {
  const cookies = await listCookiesForUrl(pageUrl);
  for (const cookie of cookies) {
    await removeCookie(cookie, pageUrl);
  }
}

/**
 * @param {number} tabId
 * @param {"local" | "session"} kind
 */
export async function clearPageStorage(tabId, kind) {
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [kind],
    func: (storageKind) => {
      const target = storageKind === "local" ? window.localStorage : window.sessionStorage;
      target.clear();
    },
  });
  if (chrome.runtime.lastError) {
    throw new Error(chrome.runtime.lastError.message);
  }
}

/**
 * @param {SiteCookie[]} cookies
 */
export function formatCookiesRaw(cookies) {
  if (!cookies.length) return "未找到任何 Cookie";
  const lines = cookies.map((cookie) => `${cookie.name}=${cookie.value}`);
  return `${lines.join("\n")}\n\nJSON格式:\n${JSON.stringify(cookies, null, 2)}`;
}

/**
 * @param {number} tabId
 * @param {"local" | "session"} kind
 * @returns {Promise<Record<string, string>>}
 */
export async function readPageStorage(tabId, kind) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    args: [kind],
    func: (storageKind) => {
      /** @type {Record<string, string>} */
      const items = {};
      const target = storageKind === "local" ? window.localStorage : window.sessionStorage;
      for (let i = 0; i < target.length; i += 1) {
        const key = target.key(i);
        if (key == null) continue;
        items[key] = target.getItem(key) ?? "";
      }
      return items;
    },
  });
  if (chrome.runtime.lastError) {
    throw new Error(chrome.runtime.lastError.message);
  }
  const first = results?.[0]?.result;
  if (!first || typeof first !== "object") {
    return {};
  }
  return /** @type {Record<string, string>} */ (first);
}

/**
 * @param {Record<string, string>} data
 */
export function formatStorageRaw(data) {
  const keys = Object.keys(data);
  if (!keys.length) return "未找到数据";
  return JSON.stringify(data, null, 2);
}

/**
 * @param {string} text
 */
export async function copyText(text) {
  const value = String(text || "");
  if (!value) throw new Error("没有可复制的内容");
  await navigator.clipboard.writeText(value);
}
