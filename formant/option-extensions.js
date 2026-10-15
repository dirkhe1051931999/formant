import {
  filterManagedExtensions,
  listManagedExtensions,
  setManagedExtensionEnabled,
  subscribeManagedExtensions,
} from "./extensions-manager.js";
import { FEATURES_KEY, isExtensionsManagerEnabled, loadFeatures } from "./features.js";

/** @typedef {{ toast: (text: string) => void }} PanelApi */

/**
 * @param {PanelApi} api
 */
export function initExtensionsPanel(api) {
  const search = /** @type {HTMLInputElement | null} */ (document.getElementById("extensionsSearch"));
  const listEl = document.getElementById("extensionsList");
  const stateEl = document.getElementById("extensionsState");
  const wrap = document.getElementById("extensionsPanelBody");
  if (!search || !listEl || !stateEl || !wrap) return;

  /** @type {import("./extensions-manager.js").FormantManagedExtension[]} */
  let items = [];
  let featureEnabled = true;
  let query = "";

  function paintState() {
    if (!featureEnabled) {
      stateEl.textContent = "扩展管理总开关已关闭；可在「功能」面板重新启用。";
      return;
    }
    const visible = filterManagedExtensions(items, query);
    const enabledCount = items.filter((item) => item.enabled).length;
    stateEl.textContent = `共 ${items.length} 个扩展 · 已启用 ${enabledCount} · 当前显示 ${visible.length}`;
  }

  function paintList() {
    listEl.replaceChildren();
    wrap.classList.toggle("is-disabled", !featureEnabled);

    if (!featureEnabled) {
      const empty = document.createElement("p");
      empty.className = "settings-meta";
      empty.textContent = "功能关闭时不提供启用/禁用操作。";
      listEl.append(empty);
      return;
    }

    const visible = filterManagedExtensions(items, query);
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "settings-meta";
      empty.textContent = query ? "没有匹配的扩展" : "未找到其它扩展";
      listEl.append(empty);
      return;
    }

    for (const item of visible) {
      const row = document.createElement("div");
      row.className = `ext-row${item.enabled ? "" : " is-off"}`;

      const icon = document.createElement("img");
      icon.className = "ext-row__icon";
      icon.alt = "";
      icon.width = 32;
      icon.height = 32;
      if (item.iconUrl) icon.src = item.iconUrl;
      else icon.classList.add("is-placeholder");

      const main = document.createElement("div");
      main.className = "ext-row__main";
      const title = document.createElement("strong");
      title.textContent = item.name;
      const meta = document.createElement("small");
      meta.textContent = item.description || item.id;
      main.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "ext-row__actions";
      if (item.optionsUrl) {
        const options = document.createElement("button");
        options.type = "button";
        options.className = "btn btn--ghost";
        options.textContent = "选项";
        options.addEventListener("click", () => {
          void chrome.tabs.create({ url: item.optionsUrl });
        });
        actions.append(options);
      }

      const toggle = document.createElement("label");
      toggle.className = "ext-row__toggle";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = item.enabled;
      input.disabled = !item.mayDisable;
      input.title = item.mayDisable ? (item.enabled ? "禁用" : "启用") : "该扩展不可禁用";
      input.addEventListener("change", () => {
        const next = input.checked;
        input.disabled = true;
        void setManagedExtensionEnabled(item.id, next)
          .then(() => {
            api.toast(`${item.name} 已${next ? "启用" : "禁用"}`);
          })
          .catch((error) => {
            input.checked = !next;
            api.toast(error instanceof Error ? error.message : String(error));
          })
          .finally(() => {
            input.disabled = !item.mayDisable;
          });
      });
      toggle.append(input);

      actions.append(toggle);
      row.append(icon, main, actions);
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
    paint();
  }

  search.addEventListener("input", () => {
    query = search.value;
    paint();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[FEATURES_KEY]) return;
    featureEnabled = changes[FEATURES_KEY].newValue?.extensions?.enabled !== false;
    paint();
  });

  subscribeManagedExtensions((next) => {
    items = next;
    paint();
  });

  void reload().catch((error) => {
    stateEl.textContent = error instanceof Error ? error.message : String(error);
  });
}
