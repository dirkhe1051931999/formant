import {
  FEATURES_KEY,
  isSiteDataEnabled,
  loadFeatures,
} from "./features.js";
import {
  clearCookiesForUrl,
  clearPageStorage,
  copyText,
  formatCookiesRaw,
  formatStorageRaw,
  getActiveSiteTab,
  listCookiesForUrl,
  readPageStorage,
  removeCookie,
  removePageStorageKey,
} from "./site-data.js";

/** @typedef {{ showView: (name: string) => void }} SiteDataApi */

const COPY_ICON = `<svg viewBox="0 -0.5 25 25" fill="none" aria-hidden="true" focusable="false"><path d="M8.25005 8.5C8.25005 8.91421 8.58584 9.25 9.00005 9.25C9.41426 9.25 9.75005 8.91421 9.75005 8.5H8.25005ZM9.00005 8.267H9.75006L9.75004 8.26283L9.00005 8.267ZM9.93892 5.96432L10.4722 6.49171L9.93892 5.96432ZM12.2311 5V4.24999L12.2269 4.25001L12.2311 5ZM16.269 5L16.2732 4.25H16.269V5ZM18.5612 5.96432L18.0279 6.49171V6.49171L18.5612 5.96432ZM19.5 8.267L18.75 8.26283V8.267H19.5ZM19.5 12.233H18.75L18.7501 12.2372L19.5 12.233ZM18.5612 14.5357L18.0279 14.0083L18.5612 14.5357ZM16.269 15.5V16.25L16.2732 16.25L16.269 15.5ZM16 14.75C15.5858 14.75 15.25 15.0858 15.25 15.5C15.25 15.9142 15.5858 16.25 16 16.25V14.75ZM9.00005 9.25C9.41426 9.25 9.75005 8.91421 9.75005 8.5C9.75005 8.08579 9.41426 7.75 9.00005 7.75V9.25ZM8.73105 8.5V7.74999L8.72691 7.75001L8.73105 8.5ZM6.43892 9.46432L6.97218 9.99171L6.43892 9.46432ZM5.50005 11.767H6.25006L6.25004 11.7628L5.50005 11.767ZM5.50005 15.734L6.25005 15.7379V15.734H5.50005ZM8.73105 19L8.72691 19.75H8.73105V19ZM12.769 19V19.75L12.7732 19.75L12.769 19ZM15.0612 18.0357L14.5279 17.5083L15.0612 18.0357ZM16 15.733H15.25L15.2501 15.7372L16 15.733ZM16.75 15.5C16.75 15.0858 16.4143 14.75 16 14.75C15.5858 14.75 15.25 15.0858 15.25 15.5H16.75ZM9.00005 7.75C8.58584 7.75 8.25005 8.08579 8.25005 8.5C8.25005 8.91421 8.58584 9.25 9.00005 9.25V7.75ZM12.7691 8.5L12.7732 7.75H12.7691V8.5ZM15.0612 9.46432L15.5944 8.93694V8.93694L15.0612 9.46432ZM16.0001 11.767L15.2501 11.7628V11.767H16.0001ZM15.2501 15.5C15.2501 15.9142 15.5858 16.25 16.0001 16.25C16.4143 16.25 16.7501 15.9142 16.7501 15.5H15.2501ZM9.75005 8.5V8.267H8.25005V8.5H9.75005ZM9.75004 8.26283C9.74636 7.60005 10.0061 6.96296 10.4722 6.49171L9.40566 5.43694C8.65985 6.19106 8.24417 7.21056 8.25006 8.27117L9.75004 8.26283ZM10.4722 6.49171C10.9382 6.02046 11.5724 5.75365 12.2352 5.74999L12.2269 4.25001C11.1663 4.25587 10.1515 4.68282 9.40566 5.43694L10.4722 6.49171ZM12.2311 5.75H16.269V4.25H12.2311V5.75ZM16.2649 5.74999C16.9277 5.75365 17.5619 6.02046 18.0279 6.49171L19.0944 5.43694C18.3486 4.68282 17.3338 4.25587 16.2732 4.25001L16.2649 5.74999ZM18.0279 6.49171C18.494 6.96296 18.7537 7.60005 18.7501 8.26283L20.25 8.27117C20.2559 7.21056 19.8402 6.19106 19.0944 5.43694L18.0279 6.49171ZM18.75 8.267V12.233H20.25V8.267H18.75ZM18.7501 12.2372C18.7537 12.8999 18.494 13.537 18.0279 14.0083L19.0944 15.0631C19.8402 14.3089 20.2559 13.2894 20.25 12.2288L18.7501 12.2372ZM18.0279 14.0083C17.5619 14.4795 16.9277 14.7463 16.2649 14.75L16.2732 16.25C17.3338 16.2441 18.3486 15.8172 19.0944 15.0631L18.0279 14.0083ZM16.269 14.75H16V16.25H16.269V14.75ZM9.00005 7.75H8.73105V9.25H9.00005V7.75ZM8.72691 7.75001C7.6663 7.75587 6.65146 8.18282 5.90566 8.93694L6.97218 9.99171C7.43824 9.52046 8.07241 9.25365 8.73519 9.24999L8.72691 7.75001ZM5.90566 8.93694C5.15985 9.69106 4.74417 10.7106 4.75006 11.7712L6.25004 11.7628C6.24636 11.1001 6.50612 10.463 6.97218 9.99171L5.90566 8.93694ZM4.75005 11.767V15.734H6.25005V11.767H4.75005ZM4.75006 15.7301C4.73847 17.9382 6.51879 19.7378 8.72691 19.75L8.7352 18.25C7.35533 18.2424 6.2428 17.1178 6.25004 15.7379L4.75006 15.7301ZM8.73105 19.75H12.769V18.25H8.73105V19.75ZM12.7732 19.75C13.8338 19.7441 14.8486 19.3172 15.5944 18.5631L14.5279 17.5083C14.0619 17.9795 13.4277 18.2463 12.7649 18.25L12.7732 19.75ZM15.5944 18.5631C16.3402 17.8089 16.7559 16.7894 16.75 15.7288L15.2501 15.7372C15.2537 16.3999 14.994 17.037 14.5279 17.5083L15.5944 18.5631ZM16.75 15.733V15.5H15.25V15.733H16.75ZM9.00005 9.25H12.7691V7.75H9.00005V9.25ZM12.7649 9.24999C13.4277 9.25365 14.0619 9.52046 14.5279 9.99171L15.5944 8.93694C14.8486 8.18282 13.8338 7.75587 12.7732 7.75001L12.7649 9.24999ZM14.5279 9.99171C14.994 10.463 15.2537 11.1001 15.2501 11.7628L16.75 11.7712C16.7559 10.7106 16.3402 9.69106 15.5944 8.93694L14.5279 9.99171ZM15.2501 11.767V15.5H16.7501V11.767H15.2501Z" fill="currentColor"/></svg>`;

const DELETE_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M6 7V18C6 19.1046 6.89543 20 8 20H16C17.1046 20 18 19.1046 18 18V7M6 7H5M6 7H8M18 7H19M18 7H16M10 11V16M14 11V16M8 7V5C8 3.89543 8.89543 3 10 3H14C15.1046 3 16 3.89543 16 5V7M8 7H16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * @param {string} text
 * @param {number} max
 */
function truncate(text, max) {
  const value = String(text ?? "");
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

/**
 * @param {HTMLButtonElement} btn
 */
function flashOk(btn) {
  btn.classList.add("is-ok");
  window.setTimeout(() => btn.classList.remove("is-ok"), 900);
}

/**
 * @param {string} title
 * @param {string} svg
 * @param {"copy" | "delete"} kind
 */
function iconButton(title, svg, kind) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `sd-icon-btn sd-icon-btn--${kind}`;
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.innerHTML = svg;
  return btn;
}

/**
 * Single-shell site data view: one toolbar + one result pane.
 * @param {SiteDataApi} api
 */
export function initPopupSiteData(api) {
  const navBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("siteDataNavBtn"));
  const backBtn = document.getElementById("backSiteDataBtn");
  const originEl = document.getElementById("siteDataOrigin");
  const noteEl = document.getElementById("siteDataNote");
  const tabsEl = document.getElementById("siteDataTabs");
  const fetchBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("siteDataFetch"));
  const copyAllBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("siteDataCopyAll"));
  const clearAllBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("siteDataClearAll"));
  const listEl = document.getElementById("siteDataList");
  const rawEl = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("siteDataRaw"));
  if (!navBtn || !originEl || !tabsEl || !fetchBtn || !copyAllBtn || !clearAllBtn || !listEl || !rawEl) return;

  let featureEnabled = true;
  /** @type {"cookie" | "local" | "session"} */
  let activeKind = "cookie";
  /** @type {"list" | "raw"} */
  let viewMode = "list";
  /** @type {import("./site-data.js").SiteCookie[]} */
  let cookies = [];
  /** @type {Record<string, string>} */
  let localData = {};
  /** @type {Record<string, string>} */
  let sessionData = {};
  let rawCookie = "";
  let rawLocal = "";
  let rawSession = "";
  let statusError = "";
  let lastPageUrl = "";
  let lastTabId = 0;
  let loadedForUrl = "";
  /** @type {{ cookie: boolean, local: boolean, session: boolean }} */
  let loadedKinds = { cookie: false, local: false, session: false };
  /** @type {{ cookie: number, local: number, session: number }} */
  let loadGen = { cookie: 0, local: 0, session: 0 };
  /** @type {Partial<Record<"cookie" | "local" | "session", Promise<void>>>} */
  let inFlight = {};
  let fetchSeq = 0;

  function setFeatureUi() {
    navBtn.hidden = !featureEnabled;
    if (noteEl) {
      noteEl.hidden = featureEnabled;
      noteEl.textContent = "站点数据提取已关闭，可在扩展设置 → 功能中启用";
    }
  }

  function itemCount() {
    if (activeKind === "cookie") return cookies.length;
    return Object.keys(activeKind === "local" ? localData : sessionData).length;
  }

  function syncChrome() {
    tabsEl.querySelectorAll("[data-site-tab]").forEach((btn) => {
      const on = btn.getAttribute("data-site-tab") === activeKind;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("[data-site-view]").forEach((btn) => {
      const on = btn.getAttribute("data-site-view") === viewMode;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    clearAllBtn.disabled = Boolean(statusError) || itemCount() === 0;
    listEl.hidden = viewMode !== "list";
    rawEl.hidden = viewMode !== "raw";
  }

  function currentRaw() {
    if (statusError) return statusError;
    if (activeKind === "cookie") {
      if (!loadedKinds.cookie) return "读取中…";
      if (!rawCookie) rawCookie = formatCookiesRaw(cookies);
      return rawCookie;
    }
    if (activeKind === "local") {
      if (!loadedKinds.local) return "读取中…";
      if (!rawLocal) rawLocal = formatStorageRaw(localData);
      return rawLocal;
    }
    if (!loadedKinds.session) return "读取中…";
    if (!rawSession) rawSession = formatStorageRaw(sessionData);
    return rawSession;
  }

  /** @param {"cookie" | "local" | "session"} kind */
  function invalidateRaw(kind) {
    if (kind === "cookie") rawCookie = "";
    else if (kind === "local") rawLocal = "";
    else rawSession = "";
  }

  function resetCaches() {
    cookies = [];
    localData = {};
    sessionData = {};
    rawCookie = "";
    rawLocal = "";
    rawSession = "";
    loadedKinds = { cookie: false, local: false, session: false };
    loadGen = { cookie: loadGen.cookie + 1, local: loadGen.local + 1, session: loadGen.session + 1 };
    inFlight = {};
  }

  function showLoading() {
    const empty = document.createElement("p");
    empty.className = "sd-empty";
    empty.textContent = "读取中…";
    listEl.replaceChildren(empty);
    if (viewMode === "raw") rawEl.value = "读取中…";
  }

  /**
   * @param {ParentNode} parent
   * @param {string} key
   * @param {string} value
   * @param {() => Promise<void>} onDelete
   */
  function appendRow(parent, key, value, onDelete) {
    const item = document.createElement("div");
    item.className = "sd-item";
    const main = document.createElement("div");
    main.className = "sd-item__main";
    const keyEl = document.createElement("strong");
    keyEl.className = "sd-item__key";
    keyEl.textContent = key;
    if (key.length <= 80) keyEl.title = key;
    const valueEl = document.createElement("span");
    valueEl.className = "sd-item__value";
    valueEl.textContent = value;
    if (value.length <= 240) valueEl.title = value;
    main.append(keyEl, valueEl);

    const actions = document.createElement("div");
    actions.className = "sd-item__actions";

    const copyBtn = iconButton("复制", COPY_ICON, "copy");
    copyBtn.addEventListener("click", () => {
      void copyText(`${key}=${value}`)
        .then(() => flashOk(copyBtn))
        .catch((error) => console.warn("[formant] copy failed", error));
    });
    const delBtn = iconButton("删除", DELETE_ICON, "delete");
    delBtn.addEventListener("click", () => {
      if (!window.confirm(`确定删除「${truncate(key, 40)}」？`)) return;
      delBtn.disabled = true;
      void onDelete()
        .then(() => {
          invalidateRaw(activeKind);
          paint();
        })
        .catch((error) => {
          delBtn.disabled = false;
          paintError(error);
        });
    });
    actions.append(copyBtn, delBtn);
    item.append(main, actions);
    parent.append(item);
  }

  function paintList() {
    if (statusError) {
      const empty = document.createElement("p");
      empty.className = "sd-empty";
      empty.textContent = statusError;
      listEl.replaceChildren(empty);
      return;
    }

    if (activeKind === "cookie") {
      if (!loadedKinds.cookie) {
        showLoading();
        return;
      }
      if (!cookies.length) {
        const empty = document.createElement("p");
        empty.className = "sd-empty";
        empty.textContent = "暂无数据";
        listEl.replaceChildren(empty);
        return;
      }
      const frag = document.createDocumentFragment();
      for (const cookie of cookies) {
        appendRow(frag, cookie.name, cookie.value, async () => {
          if (!lastPageUrl) throw new Error("缺少页面 URL");
          await removeCookie(cookie, lastPageUrl);
          cookies = cookies.filter((item) => item !== cookie);
        });
      }
      listEl.replaceChildren(frag);
      return;
    }

    const data = activeKind === "local" ? localData : sessionData;
    if (!loadedKinds[activeKind]) {
      showLoading();
      return;
    }
    const keys = Object.keys(data).sort((a, b) => a.localeCompare(b, "zh-CN"));
    if (!keys.length) {
      const empty = document.createElement("p");
      empty.className = "sd-empty";
      empty.textContent = "暂无数据";
      listEl.replaceChildren(empty);
      return;
    }
    const frag = document.createDocumentFragment();
    for (const key of keys) {
      appendRow(frag, key, data[key], async () => {
        if (!lastTabId) throw new Error("缺少标签页");
        await removePageStorageKey(lastTabId, activeKind === "local" ? "local" : "session", key);
        if (activeKind === "local") delete localData[key];
        else delete sessionData[key];
      });
    }
    listEl.replaceChildren(frag);
  }

  function syncRawView() {
    if (viewMode === "raw") rawEl.value = currentRaw();
  }

  function paint() {
    statusError = "";
    syncChrome();
    syncRawView();
    paintList();
  }

  function paintError(error) {
    statusError = error instanceof Error ? error.message : String(error);
    syncChrome();
    syncRawView();
    paintList();
  }

  /**
   * @param {import("./site-data.js").SiteDataTab} tab
   * @param {"cookie" | "local" | "session"} kind
   */
  async function loadKind(tab, kind) {
    const pending = inFlight[kind];
    if (pending) return pending;
    const gen = loadGen[kind];
    const pageUrl = tab.url;
    const task = (async () => {
      if (kind === "cookie") {
        const list = await listCookiesForUrl(tab.url);
        if (gen !== loadGen[kind] || loadedForUrl !== pageUrl) return;
        cookies = list;
        rawCookie = "";
        loadedKinds.cookie = true;
        return;
      }
      const data = await readPageStorage(tab.id, kind);
      if (gen !== loadGen[kind] || loadedForUrl !== pageUrl) return;
      if (kind === "local") {
        localData = data;
        rawLocal = "";
        loadedKinds.local = true;
      } else {
        sessionData = data;
        rawSession = "";
        loadedKinds.session = true;
      }
    })().finally(() => {
      if (inFlight[kind] === task) delete inFlight[kind];
    });
    inFlight[kind] = task;
    return task;
  }

  /**
   * @param {{ force?: boolean, prefetchOthers?: boolean }} [opts]
   */
  async function fetchActive(opts = {}) {
    const force = Boolean(opts.force);
    const prefetchOthers = Boolean(opts.prefetchOthers);
    const seq = ++fetchSeq;
    fetchBtn.disabled = true;
    try {
      const tab = await getActiveSiteTab();
      if (seq !== fetchSeq) return;
      lastPageUrl = tab.url;
      lastTabId = tab.id;
      if (tab.url !== loadedForUrl) {
        resetCaches();
        loadedForUrl = tab.url;
      }
      originEl.textContent = tab.origin;
      originEl.title = tab.url;

      if (force) {
        loadedKinds[activeKind] = false;
        loadGen[activeKind] += 1;
        delete inFlight[activeKind];
        invalidateRaw(activeKind);
      }

      if (!loadedKinds[activeKind]) showLoading();
      await loadKind(tab, activeKind);
      if (seq !== fetchSeq) return;
      paint();

      if (prefetchOthers) {
        const others = /** @type {const} */ (["cookie", "local", "session"]).filter(
          (kind) => kind !== activeKind,
        );
        void Promise.all(others.map((kind) => loadKind(tab, kind))).catch((error) => {
          console.warn("[formant] site data prefetch failed", error);
        });
      }
    } catch (error) {
      if (seq !== fetchSeq) return;
      paintError(error);
    } finally {
      if (seq === fetchSeq) fetchBtn.disabled = false;
    }
  }

  async function clearActive() {
    const count = itemCount();
    if (!count) return;
    const label =
      activeKind === "cookie" ? "Cookie" : activeKind === "local" ? "Local Storage" : "Session Storage";
    if (!window.confirm(`确定清除当前页全部 ${label}（${count} 项）？此操作不可恢复。`)) return;

    clearAllBtn.disabled = true;
    try {
      if (!lastPageUrl || !lastTabId) {
        const tab = await getActiveSiteTab();
        lastPageUrl = tab.url;
        lastTabId = tab.id;
      }
      if (activeKind === "cookie") {
        await clearCookiesForUrl(lastPageUrl);
        cookies = [];
      } else if (activeKind === "local") {
        await clearPageStorage(lastTabId, "local");
        localData = {};
      } else {
        await clearPageStorage(lastTabId, "session");
        sessionData = {};
      }
      invalidateRaw(activeKind);
      paint();
    } catch (error) {
      paintError(error);
    } finally {
      clearAllBtn.disabled = itemCount() === 0;
    }
  }

  tabsEl.addEventListener("click", (event) => {
    const btn = event.target instanceof Element ? event.target.closest("[data-site-tab]") : null;
    if (!(btn instanceof HTMLElement)) return;
    const next = /** @type {"cookie" | "local" | "session"} */ (btn.dataset.siteTab || "cookie");
    if (next === activeKind) return;
    activeKind = next;
    syncChrome();
    if (loadedKinds[next] && loadedForUrl === lastPageUrl) {
      paint();
      return;
    }
    void fetchActive();
  });

  document.querySelector(".sd-view-toggle")?.addEventListener("click", (event) => {
    const btn = event.target instanceof Element ? event.target.closest("[data-site-view]") : null;
    if (!(btn instanceof HTMLElement)) return;
    const next = btn.dataset.siteView === "raw" ? "raw" : "list";
    if (next === viewMode) return;
    viewMode = next;
    syncChrome();
    syncRawView();
  });

  fetchBtn.addEventListener("click", () => {
    void fetchActive({ force: true });
  });
  copyAllBtn.addEventListener("click", () => {
    void copyText(currentRaw())
      .then(() => flashOk(copyAllBtn))
      .catch((error) => console.warn("[formant] copy failed", error));
  });
  clearAllBtn.addEventListener("click", () => {
    void clearActive();
  });

  navBtn.addEventListener("click", () => {
    if (!featureEnabled) return;
    api.showView("siteData");
    void fetchActive({ prefetchOthers: true });
  });
  backBtn?.addEventListener("click", () => api.showView("translate"));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[FEATURES_KEY]) return;
    featureEnabled = changes[FEATURES_KEY].newValue?.siteData?.enabled !== false;
    setFeatureUi();
    if (!featureEnabled) api.showView("translate");
  });

  void loadFeatures().then((features) => {
    featureEnabled = isSiteDataEnabled(features);
    setFeatureUi();
  });

  paint();
}
