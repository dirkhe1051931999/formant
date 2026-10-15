/**
 * Cookie helpers for the service worker (callback-based for Edge/Chromium quirks).
 */

/**
 * @param {chrome.cookies.GetAllDetails} details
 * @returns {Promise<chrome.cookies.Cookie[]>}
 */
function cookiesGetAll(details) {
  return new Promise((resolve, reject) => {
    if (!chrome.cookies?.getAll) {
      reject(new Error("缺少 cookies 权限，请到扩展管理页重新加载 formant"));
      return;
    }
    try {
      chrome.cookies.getAll(details, (items) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(items || []);
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * @param {string} pageUrl
 * @returns {Promise<chrome.cookies.Cookie[]>}
 */
async function readCookiesForPage(pageUrl) {
  const byUrl = await cookiesGetAll({ url: pageUrl });
  let host = "";
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    host = "";
  }
  const byDomain = host ? await cookiesGetAll({ domain: host }) : [];
  /** @type {Map<string, chrome.cookies.Cookie>} */
  const merged = new Map();
  for (const cookie of [...byUrl, ...byDomain]) {
    const key = `${cookie.name}\n${cookie.domain}\n${cookie.path}\n${cookie.storeId || ""}`;
    merged.set(key, cookie);
  }
  return [...merged.values()];
}

/**
 * @param {chrome.cookies.Cookie} cookie
 */
function serializeCookie(cookie) {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    storeId: cookie.storeId,
    expirationDate: cookie.expirationDate,
  };
}

/**
 * Handle SITE_DATA_COOKIES / SITE_DATA_COOKIE_REMOVE in background.
 * @param {any} message
 * @param {(response: unknown) => void} sendResponse
 * @returns {boolean}
 */
export function handleSiteDataMessage(message, sendResponse) {
  if (message?.type === "SITE_DATA_COOKIES") {
    const url = String(message.url || "").trim();
    void (async () => {
      if (!url) throw new Error("缺少页面 URL");
      const items = await readCookiesForPage(url);
      return items.map(serializeCookie);
    })()
      .then((cookies) => {
        try {
          sendResponse({ ok: true, cookies });
        } catch (error) {
          console.warn("[formant] SITE_DATA_COOKIES sendResponse failed", error);
        }
      })
      .catch((error) => {
        try {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        } catch (sendError) {
          console.warn("[formant] SITE_DATA_COOKIES error sendResponse failed", sendError);
        }
      });
    return true;
  }

  if (message?.type === "SITE_DATA_COOKIE_REMOVE") {
    const name = String(message.name || "").trim();
    const url = String(message.url || "").trim();
    const storeId = message.storeId ? String(message.storeId) : undefined;
    void (async () => {
      if (!name || !url) throw new Error("缺少 Cookie 名称或 URL");
      if (!chrome.cookies?.remove) {
        throw new Error("缺少 cookies 权限，请到扩展管理页重新加载 formant");
      }
      const removed = await new Promise((resolve, reject) => {
        /** @type {chrome.cookies.CookieDetails} */
        const details = { url, name };
        if (storeId) details.storeId = storeId;
        chrome.cookies.remove(details, (detailsResult) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(detailsResult);
        });
      });
      if (!removed) throw new Error("未能删除该 Cookie（可能已不存在）");
      return removed;
    })()
      .then((removed) => sendResponse({ ok: true, removed }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }

  return false;
}
