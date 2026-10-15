import { FEATURES_KEY, isProxyEnabled, loadFeatures } from "./features.js";
import {
  PROXY_BUILTIN,
  PROXY_SETTINGS_KEY,
  hasPacConfig,
  loadProxySettings,
  normalizeProxySettings,
} from "./proxy-config.js";

/**
 * @param {{ value: chrome.proxy.ProxyConfig, scope?: string }} details
 */
function setProxy(details) {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.set(details, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function clearProxy() {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.clear({ scope: "regular" }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

/**
 * Apply current formantProxy + feature flag to chrome.proxy.settings.
 * @returns {Promise<{ status: string, activeId?: string }>}
 */
export async function applyProxyFromStorage() {
  const [features, settings] = await Promise.all([loadFeatures(), loadProxySettings()]);
  if (!isProxyEnabled(features)) {
    await clearProxy();
    return { status: "cleared" };
  }

  const { activeId, profiles, pac } = settings;
  if (activeId === PROXY_BUILTIN.DIRECT) {
    await setProxy({ value: { mode: "direct" }, scope: "regular" });
    return { status: "direct", activeId };
  }
  if (activeId === PROXY_BUILTIN.SYSTEM) {
    await setProxy({ value: { mode: "system" }, scope: "regular" });
    return { status: "system", activeId };
  }
  if (activeId === PROXY_BUILTIN.PAC) {
    if (!hasPacConfig(pac)) {
      await setProxy({ value: { mode: "system" }, scope: "regular" });
      return { status: "fallback-system", activeId: PROXY_BUILTIN.SYSTEM };
    }
    /** @type {chrome.proxy.PacScript} */
    const pacScript = pac.data
      ? { data: pac.data, mandatory: false }
      : { url: pac.url, mandatory: false };
    await setProxy({
      value: { mode: "pac_script", pacScript },
      scope: "regular",
    });
    return { status: "pac", activeId };
  }

  const profile = profiles.find((item) => item.id === activeId);
  if (!profile) {
    await setProxy({ value: { mode: "system" }, scope: "regular" });
    return { status: "fallback-system", activeId: PROXY_BUILTIN.SYSTEM };
  }

  await setProxy({
    value: {
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: profile.scheme,
          host: profile.host,
          port: profile.port,
        },
        bypassList: profile.bypassList,
      },
    },
    scope: "regular",
  });
  return { status: "fixed", activeId: profile.id };
}

/**
 * Wire storage listeners and apply once. Safe to call on every SW wake.
 */
export async function initProxyBackground() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!changes[PROXY_SETTINGS_KEY] && !changes[FEATURES_KEY]) return;
    void applyProxyFromStorage().catch((error) => {
      console.warn("[formant] proxy apply failed", error);
    });
  });

  await applyProxyFromStorage().catch((error) => {
    console.warn("[formant] proxy initial apply failed", error);
  });
}

export { normalizeProxySettings, PROXY_SETTINGS_KEY };
