import {
  filterManagedExtensions,
  listManagedExtensions,
  setManagedExtensionEnabled,
  subscribeManagedExtensions,
} from "./extensions-manager.js";
import { FEATURES_KEY, isExtensionsManagerEnabled, loadFeatures } from "./features.js";

/** @typedef {{ showView: (name: string) => void }} ExtensionsApi */

/**
 * Popup secondary view: list + enable/disable. Full options stay in option.html#extensions.
 * @param {ExtensionsApi} api
 */
export function initPopupExtensions(api) {
  const navBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("extensionsNavBtn"));
  const backBtn = document.getElementById("backExtensionsBtn");
  const stateEl = document.getElementById("extensionsPopupState");
  const noteEl = document.getElementById("extensionsPopupNote");
  const search = /** @type {HTMLInputElement | null} */ (document.getElementById("extensionsPopupSearch"));
  const listEl = document.getElementById("extensionsPopupList");
  if (!navBtn || !stateEl || !search || !listEl) return;

  /** @type {import("./extensions-manager.js").FormantManagedExtension[]} */
  let items = [];
  let featureEnabled = true;
  let query = "";

  function setFeatureUi() {
    navBtn.hidden = !featureEnabled;
    if (noteEl) {
      noteEl.hidden = featureEnabled;
      noteEl.textContent = featureEnabled ? "" : "扩展管理已关闭。可在扩展设置 → 功能 中开启。";
    }
  }

  function paintState() {
    const visible = filterManagedExtensions(items, query);
    const enabledCount = items.filter((item) => item.enabled).length;
    stateEl.textContent = `${enabledCount}/${items.length} 启用`;
    stateEl.title = `共 ${items.length} 个扩展 · 已启用 ${enabledCount} · 当前显示 ${visible.length}`;
  }

  function paintList() {
    listEl.replaceChildren();
    listEl.classList.toggle("is-disabled", !featureEnabled);
    if (!featureEnabled) return;

    const visible = filterManagedExtensions(items, query);
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "sd-empty";
      empty.textContent = query ? "没有匹配的扩展" : "未找到其它扩展";
      listEl.append(empty);
      return;
    }

    for (const item of visible) {
      const row = document.createElement("div");
      row.className = `ext-pop-row${item.enabled ? "" : " is-off"}`;

      const icon = document.createElement("img");
      icon.className = "ext-pop-row__icon";
      icon.alt = "";
      icon.width = 24;
      icon.height = 24;
      if (item.iconUrl) icon.src = item.iconUrl;
      else icon.classList.add("is-placeholder");

      const main = document.createElement("div");
      main.className = "ext-pop-row__main";
      const title = document.createElement("strong");
      title.textContent = item.name;
      title.title = item.description || item.id;
      main.append(title);
      if (item.optionsUrl) {
        const options = document.createElement("button");
        options.type = "button";
        options.className = "ext-pop-row__opts";
        options.textContent = "选项";
        options.addEventListener("click", () => {
          void chrome.tabs.create({ url: item.optionsUrl });
        });
        main.append(options);
      }

      const toggle = document.createElement("label");
      toggle.className = "ext-pop-row__toggle";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = item.enabled;
      input.disabled = !featureEnabled || !item.mayDisable;
      input.title = item.mayDisable ? (item.enabled ? "禁用" : "启用") : "该扩展不可禁用";
      input.setAttribute("aria-label", `${item.enabled ? "禁用" : "启用"} ${item.name}`);
      input.addEventListener("change", () => {
        const next = input.checked;
        input.disabled = true;
        void setManagedExtensionEnabled(item.id, next)
          .catch((error) => {
            input.checked = !next;
            console.warn("[formant] toggle extension failed", error);
          })
          .finally(() => {
            input.disabled = !item.mayDisable;
          });
      });
      toggle.append(input);

      row.append(icon, main, toggle);
      listEl.append(row);
    }
  }

  function paint() {
    paintState();
    paintList();
  }

  async function reload() {
    const [list, features] = await Promise.all([listManagedExtensions(), loadFeatures()]);
    items = list;
    featureEnabled = isExtensionsManagerEnabled(features);
    setFeatureUi();
    paint();
  }

  navBtn.addEventListener("click", () => {
    if (!featureEnabled) return;
    api.showView("extensions");
    void reload();
  });
  backBtn?.addEventListener("click", () => api.showView("translate"));

  search.addEventListener("input", () => {
    query = search.value;
    paint();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[FEATURES_KEY]) return;
    featureEnabled = changes[FEATURES_KEY].newValue?.extensions?.enabled !== false;
    setFeatureUi();
    paint();
    if (!featureEnabled) api.showView("translate");
  });

  subscribeManagedExtensions((next) => {
    items = next;
    paint();
  });

  void reload().catch((error) => {
    stateEl.textContent = error instanceof Error ? error.message : String(error);
  });
}
