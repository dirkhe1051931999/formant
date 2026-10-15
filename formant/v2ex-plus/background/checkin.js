import { V2EX_CHECKIN_DATE_KEY } from "../../v2ex-options.js";

const V2EX_ORIGIN = "https://www.v2ex.com";

/**
 * @returns {string}
 */
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {unknown} saved
 * @returns {boolean}
 */
function isAlreadyCheckedIn(saved) {
  if (saved === todayKey()) return true;
  // Compatibility with V2EX Plus 2.1.3, which saved only UTC day of month.
  return String(saved || "") === String(new Date().getUTCDate());
}

/**
 * @param {string} html
 * @returns {string}
 */
function extractOnce(html) {
  const match =
    html.match(/\/mission\/daily\/redeem\?once=(\d+)/i) ||
    html.match(/\/signout\?once=(\d+)/i);
  return match?.[1] || "";
}

/**
 * @param {string} html
 */
function extractStreak(html) {
  const match = html.match(/已连续登录\s*(\d+)\s*天/) || html.match(/连续登录\s*(\d+)\s*天/);
  return match?.[1] ? `已连续登录 ${match[1]} 天` : "今日签到成功";
}

/**
 * @param {{ chickinNote?: boolean }} options
 */
async function notifySuccess(options, message) {
  if (!options.chickinNote) return;
  await chrome.notifications.create("formant-v2ex-checkin", {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "formant · V2EX 签到",
    message,
  });
}

/**
 * Redeem the V2EX daily mission when the account is signed in.
 *
 * It intentionally does not throw for a logged-out account: the next alarm
 * is expected to retry after the user signs in to V2EX.
 *
 * @param {{ checkin?: boolean, chickinNote?: boolean }} options
 * @returns {Promise<{ status: "disabled" | "already" | "logged-out" | "success" | "failed", message: string }>}
 */
export async function runV2exCheckin(options) {
  if (!options.checkin) {
    return { status: "disabled", message: "自动签到已关闭" };
  }

  const saved = await chrome.storage.sync.get(V2EX_CHECKIN_DATE_KEY);
  if (isAlreadyCheckedIn(saved[V2EX_CHECKIN_DATE_KEY])) {
    return { status: "already", message: "今天已完成 V2EX 签到" };
  }

  let page;
  try {
    page = await fetch(`${V2EX_ORIGIN}/mission/daily`, {
      credentials: "include",
      cache: "no-store",
    });
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : "无法连接 V2EX",
    };
  }

  if (!page.ok) {
    return { status: "failed", message: `签到页面请求失败：HTTP ${page.status}` };
  }

  let landingHtml = await page.text();
  let once = extractOnce(landingHtml);
  // Older V2EX pages expose the nonce only after opening /redeem.
  if (!once) {
    try {
      const redeemPage = await fetch(`${V2EX_ORIGIN}/mission/daily/redeem`, {
        credentials: "include",
        cache: "no-store",
      });
      if (redeemPage.ok) {
        landingHtml = await redeemPage.text();
        once = extractOnce(landingHtml);
      }
    } catch {
      // The normal daily page result below still determines the outcome.
    }
  }
  if (!once) {
    return { status: "logged-out", message: "未登录 V2EX，等待下次尝试" };
  }

  let redeemed;
  try {
    redeemed = await fetch(`${V2EX_ORIGIN}/mission/daily/redeem?once=${encodeURIComponent(once)}`, {
      credentials: "include",
      cache: "no-store",
    });
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : "签到请求失败",
    };
  }

  if (!redeemed.ok) {
    return { status: "failed", message: `签到请求失败：HTTP ${redeemed.status}` };
  }

  const redeemedHtml = await redeemed.text();
  if (!/(查看我的账户余额|已连续登录|今日已领取|redeemed|account balance)/i.test(redeemedHtml)) {
    return { status: "failed", message: "V2EX 未确认签到成功" };
  }

  const message = extractStreak(redeemedHtml);
  await chrome.storage.sync.set({ [V2EX_CHECKIN_DATE_KEY]: todayKey() });
  try {
    await notifySuccess(options, message);
  } catch (error) {
    console.warn("[formant] V2EX check-in notification failed", error);
  }
  return { status: "success", message };
}
