import { isNewtabEnabled, loadFeatures, FEATURES_KEY } from "./features.js";
import {
  isHolidaysCacheStale,
  loadLocalHomeState,
  loadSettings,
  loadWidgetCache,
  refreshHolidaysFromMono,
  refreshWeatherFromMono,
} from "./home-sync.js";

export const NEWTAB_WEATHER_ALARM = "formant-newtab-weather";

/**
 * Keep a 10-minute weather refresh alarm while New Tab + mono credentials are ready.
 */
export async function configureNewtabWeatherAlarm() {
  const [features, settings] = await Promise.all([loadFeatures(), loadSettings()]);
  if (!isNewtabEnabled(features) || !settings.baseUrl || !settings.clientKey) {
    await chrome.alarms.clear(NEWTAB_WEATHER_ALARM);
    return;
  }
  chrome.alarms.create(NEWTAB_WEATHER_ALARM, { periodInMinutes: 10 });
}

/**
 * Force-refresh weather; holidays refetch only when the cache is from a
 * previous day (countdowns are relative to "today"). Exchange / home untouched.
 */
export async function runNewtabWeatherRefresh() {
  const features = await loadFeatures();
  if (!isNewtabEnabled(features)) return { status: "disabled" };
  const settings = await loadSettings();
  if (!settings.baseUrl || !settings.clientKey) return { status: "unconfigured" };

  const { home } = await loadLocalHomeState();
  const result = await refreshWeatherFromMono({
    locationId: home.baseConfig?.locationId || "",
    cityName: home.baseConfig?.cityName || "",
    force: true,
  });
  let holidays = "fresh";
  if (isHolidaysCacheStale(await loadWidgetCache())) {
    await refreshHolidaysFromMono();
    holidays = "refreshed";
  }
  return { status: "ok", fromCache: Boolean(result.fromCache), holidays };
}

/**
 * @returns {Promise<void>}
 */
export async function initNewtabWeatherBackground() {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== NEWTAB_WEATHER_ALARM) return;
    void runNewtabWeatherRefresh().catch((error) => {
      console.warn("[formant] New Tab weather alarm failed", error);
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!changes[FEATURES_KEY] && !changes.baseUrl && !changes.clientKey && !changes.newtabHome) {
      return;
    }
    void configureNewtabWeatherAlarm().catch((error) => {
      console.warn("[formant] New Tab weather alarm refresh failed", error);
    });
  });

  await configureNewtabWeatherAlarm();
}
