import {
  DEFAULT_BYPASS_LIST,
  DEFAULT_PROXY_PORT,
  DEFAULT_PROXY_SETTINGS,
  MAX_PROXY_PROFILES,
  PROXY_BUILTIN,
  PROXY_SETTINGS_KEY,
  createProxyProfileId,
  describePac,
  hasPacConfig,
  loadProxySettings,
  normalizeBypassList,
  normalizePac,
  normalizeProxySettings,
  saveProxySettings,
} from "./proxy-config.js";
import { FEATURES_KEY, loadFeatures } from "./features.js";

/** @typedef {{ toast: (text: string) => void }} PanelApi */

/**
 * @param {PanelApi} api
 */
export function initProxyPanel(api) {
  const form = document.getElementById("proxyForm");
  const listEl = document.getElementById("proxyProfileList");
  const nameEl = /** @type {HTMLInputElement | null} */ (document.getElementById("proxyName"));
  const schemeEl = /** @type {HTMLSelectElement | null} */ (document.getElementById("proxyScheme"));
  const hostEl = /** @type {HTMLInputElement | null} */ (document.getElementById("proxyHost"));
  const portEl = /** @type {HTMLInputElement | null} */ (document.getElementById("proxyPort"));
  const bypassEl = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("proxyBypass"));
  const editIdEl = /** @type {HTMLInputElement | null} */ (document.getElementById("proxyEditId"));
  const saveBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("proxySaveProfile"));
  const resetFormBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("proxyResetForm"));
  const pacUrlEl = /** @type {HTMLInputElement | null} */ (document.getElementById("proxyPacUrl"));
  const pacDataEl = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("proxyPacData"));
  const pacFileEl = /** @type {HTMLInputElement | null} */ (document.getElementById("proxyPacFile"));
  const pacSaveBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("proxyPacSave"));
  const pacApplyBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("proxyPacApply"));
  const pacClearBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("proxyPacClear"));
  const stateEl = document.getElementById("proxyState");
  if (
    !form ||
    !listEl ||
    !nameEl ||
    !schemeEl ||
    !hostEl ||
    !portEl ||
    !bypassEl ||
    !editIdEl ||
    !saveBtn ||
    !pacUrlEl ||
    !pacDataEl ||
    !pacSaveBtn ||
    !stateEl
  ) {
    return;
  }

  /** @type {import("./proxy-config.js").ProxySettings} */
  let current = {
    ...DEFAULT_PROXY_SETTINGS,
    profiles: [],
    pac: { url: "", data: "" },
  };
  let featureEnabled = true;

  function clearForm() {
    editIdEl.value = "";
    nameEl.value = "";
    schemeEl.value = "socks5";
    hostEl.value = "";
    portEl.value = String(DEFAULT_PROXY_PORT);
    bypassEl.value = DEFAULT_BYPASS_LIST.join("\n");
    saveBtn.textContent = "添加代理";
  }

  function fillForm(profile) {
    editIdEl.value = profile.id;
    nameEl.value = profile.name;
    schemeEl.value = profile.scheme;
    hostEl.value = profile.host;
    portEl.value = String(profile.port);
    bypassEl.value = profile.bypassList.join("\n");
    saveBtn.textContent = "保存修改";
  }

  function paintPacFields() {
    pacUrlEl.value = current.pac.url;
    pacDataEl.value = current.pac.data;
  }

  function paintState() {
    if (!featureEnabled) {
      stateEl.textContent = "代理总开关已关闭：扩展不再控制浏览器代理，配置仍保留。";
      return;
    }
    if (current.activeId === PROXY_BUILTIN.DIRECT) {
      stateEl.textContent = "当前：直连";
      return;
    }
    if (current.activeId === PROXY_BUILTIN.SYSTEM) {
      stateEl.textContent = "当前：系统代理";
      return;
    }
    if (current.activeId === PROXY_BUILTIN.PAC) {
      stateEl.textContent = `当前：PAC（${describePac(current.pac)}）`;
      return;
    }
    const profile = current.profiles.find((item) => item.id === current.activeId);
    stateEl.textContent = profile
      ? `当前：${profile.name}（${profile.scheme}://${profile.host}:${profile.port}）`
      : "当前：系统代理";
  }

  function paintList() {
    listEl.replaceChildren();

    /** @type {{ id: string, title: string, meta: string, builtin: boolean }[]} */
    const rows = [
      { id: PROXY_BUILTIN.DIRECT, title: "直连", meta: "不使用代理", builtin: true },
      { id: PROXY_BUILTIN.SYSTEM, title: "系统代理", meta: "跟随操作系统 / 浏览器系统代理", builtin: true },
      {
        id: PROXY_BUILTIN.PAC,
        title: "PAC",
        meta: hasPacConfig(current.pac) ? describePac(current.pac) : "请先导入或填写下方 PAC",
        builtin: true,
      },
    ];
    for (const profile of current.profiles) {
      rows.push({
        id: profile.id,
        title: profile.name,
        meta: `${profile.scheme}://${profile.host}:${profile.port}`,
        builtin: false,
      });
    }

    for (const row of rows) {
      const item = document.createElement("div");
      item.className = `proxy-profile${current.activeId === row.id ? " is-active" : ""}`;

      const main = document.createElement("button");
      main.type = "button";
      main.className = "proxy-profile__main";
      main.dataset.proxyActivate = row.id;
      const title = document.createElement("strong");
      title.textContent = row.title;
      const meta = document.createElement("small");
      meta.textContent = row.meta;
      main.append(title, meta);
      item.append(main);

      if (!row.builtin) {
        const actions = document.createElement("div");
        actions.className = "proxy-profile__actions";
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "btn btn--ghost";
        edit.dataset.proxyEdit = row.id;
        edit.textContent = "编辑";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn btn--ghost";
        remove.dataset.proxyRemove = row.id;
        remove.textContent = "删除";
        actions.append(edit, remove);
        item.append(actions);
      }

      listEl.append(item);
    }
  }

  function paint() {
    paintList();
    paintPacFields();
    paintState();
  }

  async function reload() {
    const [settings, features] = await Promise.all([loadProxySettings(), loadFeatures()]);
    current = settings;
    featureEnabled = features.proxy.enabled;
    paint();
  }

  async function persist(next, message) {
    current = await saveProxySettings(next);
    paint();
    api.toast(message);
  }

  function readPacFromFields() {
    return normalizePac({ url: pacUrlEl.value, data: pacDataEl.value });
  }

  listEl.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const activate = target.closest("[data-proxy-activate]");
    if (activate instanceof HTMLElement) {
      const id = activate.dataset.proxyActivate || "";
      if (id === PROXY_BUILTIN.PAC && !hasPacConfig(current.pac)) {
        api.toast("请先导入或填写 PAC");
        return;
      }
      void persist({ ...current, activeId: id }, "已切换代理").catch((error) => {
        api.toast(error instanceof Error ? error.message : String(error));
      });
      return;
    }
    const edit = target.closest("[data-proxy-edit]");
    if (edit instanceof HTMLElement) {
      const profile = current.profiles.find((item) => item.id === edit.dataset.proxyEdit);
      if (profile) fillForm(profile);
      return;
    }
    const remove = target.closest("[data-proxy-remove]");
    if (remove instanceof HTMLElement) {
      const id = remove.dataset.proxyRemove || "";
      const profiles = current.profiles.filter((item) => item.id !== id);
      const activeId = current.activeId === id ? PROXY_BUILTIN.SYSTEM : current.activeId;
      void persist({ ...current, activeId, profiles }, "已删除代理配置").catch((error) => {
        api.toast(error instanceof Error ? error.message : String(error));
      });
      if (editIdEl.value === id) clearForm();
    }
  });

  saveBtn.addEventListener("click", () => {
    const host = hostEl.value.trim();
    if (!host) {
      api.toast("请填写代理主机");
      return;
    }
    const editingId = editIdEl.value.trim();
    if (!editingId && current.profiles.length >= MAX_PROXY_PROFILES) {
      api.toast(`最多 ${MAX_PROXY_PROFILES} 条自定义代理`);
      return;
    }
    const profile = {
      id: editingId || createProxyProfileId(),
      name: nameEl.value.trim() || host,
      scheme: schemeEl.value,
      host,
      port: Number(portEl.value || DEFAULT_PROXY_PORT),
      bypassList: normalizeBypassList(bypassEl.value),
    };
    const profiles = editingId
      ? current.profiles.map((item) => (item.id === editingId ? profile : item))
      : [...current.profiles, profile];
    void persist(
      {
        ...current,
        activeId: current.activeId === profile.id || !editingId ? profile.id : current.activeId,
        profiles,
      },
      editingId ? "代理配置已更新" : "代理配置已添加",
    )
      .then(() => clearForm())
      .catch((error) => api.toast(error instanceof Error ? error.message : String(error)));
  });

  resetFormBtn?.addEventListener("click", clearForm);

  pacFileEl?.addEventListener("change", () => {
    const file = pacFileEl.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pacDataEl.value = String(reader.result || "");
      api.toast(`已导入 ${file.name}`);
      pacFileEl.value = "";
    };
    reader.onerror = () => api.toast("读取 PAC 文件失败");
    reader.readAsText(file);
  });

  pacSaveBtn.addEventListener("click", () => {
    const pac = readPacFromFields();
    if (!hasPacConfig(pac)) {
      api.toast("请填写 PAC URL 或导入脚本内容");
      return;
    }
    void persist({ ...current, pac }, "PAC 已保存").catch((error) => {
      api.toast(error instanceof Error ? error.message : String(error));
    });
  });

  pacApplyBtn?.addEventListener("click", () => {
    const pac = readPacFromFields();
    if (!hasPacConfig(pac)) {
      api.toast("请填写 PAC URL 或导入脚本内容");
      return;
    }
    void persist({ ...current, pac, activeId: PROXY_BUILTIN.PAC }, "已启用 PAC").catch((error) => {
      api.toast(error instanceof Error ? error.message : String(error));
    });
  });

  pacClearBtn?.addEventListener("click", () => {
    const activeId = current.activeId === PROXY_BUILTIN.PAC ? PROXY_BUILTIN.SYSTEM : current.activeId;
    void persist({ ...current, pac: { url: "", data: "" }, activeId }, "已清除 PAC").catch((error) => {
      api.toast(error instanceof Error ? error.message : String(error));
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[PROXY_SETTINGS_KEY]) current = normalizeProxySettings(changes[PROXY_SETTINGS_KEY].newValue);
    if (changes[FEATURES_KEY]) featureEnabled = changes[FEATURES_KEY].newValue?.proxy?.enabled !== false;
    if (changes[PROXY_SETTINGS_KEY] || changes[FEATURES_KEY]) paint();
  });

  clearForm();
  void reload().catch((error) => {
    stateEl.textContent = error instanceof Error ? error.message : String(error);
  });
}
