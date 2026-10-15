const V2EX_ORIGIN = "https://www.v2ex.com";

/**
 * @param {string} html
 * @returns {string | null}
 */
function unreadCountFromPage(html) {
  const match =
    html.match(/(\d+)\s*(?:未读提醒|unread)/i) ||
    html.match(/(?:未读提醒|unread)[^\d]{0,24}(\d+)/i);
  return match?.[1] || null;
}

/**
 * Reads V2EX's mission page and updates the formant action badge.
 *
 * The upstream extension swapped the action icon for its own V2EX artwork.
 * formant deliberately preserves its popup branding and only uses the badge.
 *
 * @param {{ msgNote?: boolean }} options
 * @returns {Promise<{ status: "disabled" | "logged-out" | "ok" | "failed", unread: string }>}
 */
export async function refreshV2exUnreadBadge(options) {
  if (!options.msgNote) {
    await chrome.action.setBadgeText({ text: "" });
    return { status: "disabled", unread: "" };
  }

  let response;
  try {
    response = await fetch(`${V2EX_ORIGIN}/mission`, {
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    return { status: "failed", unread: "" };
  }

  if (!response.ok) {
    await chrome.action.setBadgeBackgroundColor({ color: "#667084" });
    await chrome.action.setBadgeText({ text: "!" });
    return { status: "logged-out", unread: "" };
  }

  const html = await response.text();
  const unread = unreadCountFromPage(html);
  if (unread === null) {
    await chrome.action.setBadgeBackgroundColor({ color: "#667084" });
    await chrome.action.setBadgeText({ text: "!" });
    return { status: "logged-out", unread: "" };
  }

  if (unread !== "0") {
    await chrome.action.setBadgeBackgroundColor({ color: "#b42318" });
    await chrome.action.setBadgeText({ text: unread });
    return { status: "ok", unread };
  }

  await chrome.action.setBadgeText({ text: "" });
  return { status: "ok", unread: "" };
}
