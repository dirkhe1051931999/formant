import { normalizeHome } from "./home-model.js";
import {
  loadLocalHomeState,
  pullHomeFromMono,
  pushHomeToMono,
  refreshWidgetsFromMono,
  saveLocalHome,
} from "./home-sync.js";

/** @typedef {{ toast: (text: string) => void }} PanelApi */

/**
 * @param {PanelApi} api
 */
export function initNewtabPanel(api) {
  const form = document.getElementById("newtabForm");
  const saveBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("newtabSave"));
  const refreshBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("newtabRefresh"));
  const syncBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("newtabSync"));
  const status = document.getElementById("newtabState");
  const fields = {
    locationId: /** @type {HTMLInputElement | null} */ (document.getElementById("newtabLocationId")),
    cityName: /** @type {HTMLInputElement | null} */ (document.getElementById("newtabCityName")),
    wallpaperUrl: /** @type {HTMLInputElement | null} */ (document.getElementById("newtabWallpaperUrl")),
    wallpaperMask: /** @type {HTMLInputElement | null} */ (document.getElementById("newtabWallpaperMask")),
    wallpaperMaskValue: document.getElementById("newtabWallpaperMaskValue"),
    showSearch: /** @type {HTMLInputElement | null} */ (document.getElementById("newtabShowSearch")),
  };
  if (
    !form ||
    !saveBtn ||
    !refreshBtn ||
    !syncBtn ||
    !status ||
    !fields.locationId ||
    !fields.cityName ||
    !fields.wallpaperUrl ||
    !fields.wallpaperMask ||
    !fields.wallpaperMaskValue ||
    !fields.showSearch
  ) {
    return;
  }

  /** @type {import("./home-model.js").NewtabHome} */
  let home = normalizeHome(null);
  let revision = 0;
  let busy = false;

  function setStatus(text, error = false) {
    status.textContent = text;
    status.classList.toggle("is-error", error);
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    saveBtn.disabled = nextBusy;
    refreshBtn.disabled = nextBusy;
    syncBtn.disabled = nextBusy;
  }

  function paint() {
    fields.locationId.value = home.baseConfig.locationId;
    fields.cityName.value = home.baseConfig.cityName;
    fields.wallpaperUrl.value = home.baseConfig.wallpaperUrl;
    fields.wallpaperMask.value = String(home.baseConfig.wallpaperMask);
    fields.wallpaperMaskValue.textContent = Number(home.baseConfig.wallpaperMask).toFixed(2);
    fields.showSearch.checked = home.baseConfig.showSearch;
  }

  function readForm() {
    home = normalizeHome({
      ...home,
      baseConfig: {
        ...home.baseConfig,
        locationId: fields.locationId.value.trim(),
        cityName: fields.cityName.value.trim(),
        wallpaperUrl: fields.wallpaperUrl.value.trim(),
        wallpaperMask: Number(fields.wallpaperMask.value),
        showSearch: fields.showSearch.checked,
      },
    });
  }

  async function saveDraft() {
    readForm();
    home = await saveLocalHome(home, { revision });
    paint();
  }

  async function reload() {
    const local = await loadLocalHomeState();
    home = local.home;
    revision = local.revision;
    paint();
    setStatus(
      local.lastSyncAt
        ? `当前 revision ${revision} · 上次同步 ${new Date(local.lastSyncAt).toLocaleString()}`
        : `当前 revision ${revision} · 尚未同步`,
    );
  }

  saveBtn.addEventListener("click", () => {
    void (async () => {
      setBusy(true);
      try {
        await saveDraft();
        setStatus("New Tab 设置已保存到本机；打开的新标签页会自动更新。");
        api.toast("New Tab 设置已保存");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(message, true);
        api.toast(message);
      } finally {
        setBusy(false);
      }
    })();
  });

  refreshBtn.addEventListener("click", () => {
    void (async () => {
      setBusy(true);
      try {
        await saveDraft();
        const remote = await pullHomeFromMono();
        home = remote.home;
        revision = remote.revision;
        await refreshWidgetsFromMono({
          locationId: home.baseConfig.locationId,
          cityName: home.baseConfig.cityName,
        });
        paint();
        setStatus(`已刷新主页和卡片数据 · revision ${revision}`);
        api.toast("New Tab 已刷新");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(message, true);
        api.toast(message);
      } finally {
        setBusy(false);
      }
    })();
  });

  syncBtn.addEventListener("click", () => {
    void (async () => {
      setBusy(true);
      try {
        await saveDraft();
        const remote = await pushHomeToMono(home);
        home = remote.home;
        revision = remote.revision;
        paint();
        if (remote.keptRemote) {
          setStatus(`云端主页较新，已改用云端 · revision ${revision}（未用本机覆盖）`);
          api.toast("已改用云端主页，未覆盖");
        } else {
          setStatus(`已同步 New Tab 主页 · revision ${revision}`);
          api.toast("New Tab 已同步");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(message, true);
        api.toast(message);
      } finally {
        setBusy(false);
      }
    })();
  });

  fields.wallpaperMask.addEventListener("input", () => {
    fields.wallpaperMaskValue.textContent = Number(fields.wallpaperMask.value).toFixed(2);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (busy || area !== "local") return;
    if (changes.newtabHome) {
      home = normalizeHome(changes.newtabHome.newValue);
      if (changes.newtabRevision) revision = Number(changes.newtabRevision.newValue || 0) || 0;
      paint();
    }
  });

  void reload().catch((error) => {
    setStatus(error instanceof Error ? error.message : String(error), true);
  });
}
