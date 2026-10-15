const $ = (sel, root = document) => root.querySelector(sel);

const meta = /** @type {HTMLElement} */ ($("#meta"));
const note = /** @type {HTMLElement} */ ($("#note"));
const workspace = /** @type {HTMLElement} */ ($("#workspace"));
const tree = /** @type {HTMLElement} */ ($("#tree"));
const detail = /** @type {HTMLElement} */ ($("#detail"));
const refreshBtn = /** @type {HTMLButtonElement} */ ($("#refresh"));

/** @type {any} */
let current = null;
/** @type {number | null} */
let selectedId = null;
/** @type {string} */
let selectedStore = "";

function featureOn(raw) {
  const features = raw && typeof raw === "object" ? raw : {};
  const vue = /** @type {{ enabled?: boolean }} */ (features).vue;
  return !vue || vue.enabled !== false;
}

/**
 * @param {string} expression
 */
function inspect(expression) {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval(expression, (result, exception) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message || "eval failed" });
        return;
      }
      if (exception) {
        const info = /** @type {{ value?: string, description?: string }} */ (exception);
        resolve({ error: info.value || info.description || "eval failed" });
        return;
      }
      resolve(result);
    });
  });
}

function showNote(text) {
  note.hidden = !text;
  note.textContent = text;
  document.body.classList.toggle("is-blocked", Boolean(text));
  workspace.hidden = Boolean(text);
}

/**
 * @param {any} node
 * @param {number} depth
 */
function addNode(node, depth) {
  if (!node) return;
  const row = document.createElement("button");
  row.type = "button";
  row.className = "row";
  row.style.paddingLeft = `${8 + depth * 12}px`;
  row.textContent = node.name || "Anonymous";
  row.dataset.id = String(node.id);
  if (node.id === selectedId) row.classList.add("is-on");
  tree.append(row);
  for (const child of node.children || []) addNode(child, depth + 1);
}

function paintTree() {
  tree.replaceChildren();
  const apps = current?.apps || [];
  meta.textContent = apps.length ? `${apps.length} 个应用` : "";
  for (const app of apps) {
    const label = document.createElement("div");
    label.className = "app-label";
    label.textContent = `Vue ${app.version || "?"}`;
    tree.append(label);
    addNode(app.tree, 0);
    if (app.hasPinia) addStore(app, "pinia", "Pinia 状态");
    if (app.hasVuex) addStore(app, "vuex", "Vuex 状态");
  }
}

/**
 * @param {any} app
 * @param {string} kind
 * @param {string} label
 */
function addStore(app, kind, label) {
  const store = document.createElement("button");
  store.type = "button";
  store.className = "store";
  store.dataset.store = `${app.vue2 ? "2" : "3"}:${app.index}:${kind}`;
  store.textContent = label;
  if (store.dataset.store === selectedStore) store.classList.add("is-on");
  tree.append(store);
}

async function showDetails() {
  if (selectedStore) {
    const [gen, index, kind] = selectedStore.split(":");
    const payload = await inspect(
      `window.__FORMANT_VUE__ && window.__FORMANT_VUE__.store(${Number(index)}, ${gen === "2"}, ${JSON.stringify(kind || "vuex")})`,
    );
    detail.textContent = payload?.error
      ? String(payload.error)
      : JSON.stringify(payload, null, 2);
    return;
  }
  if (selectedId == null) {
    detail.textContent = "选择左侧组件";
    return;
  }
  const payload = await inspect(
    `window.__FORMANT_VUE__ && window.__FORMANT_VUE__.details(${Number(selectedId)})`,
  );
  detail.textContent = payload?.error
    ? String(payload.error)
    : JSON.stringify(payload, null, 2);
  chrome.devtools.inspectedWindow.eval(
    `window.__FORMANT_VUE__ && window.__FORMANT_VUE__.highlight(${Number(selectedId)})`,
  );
}

async function loadTree() {
  const data = await chrome.storage.local.get("formantFeatures");
  if (!featureOn(data.formantFeatures)) {
    current = null;
    showNote("Vue 检查已关闭。可在扩展设置 → 功能 中重新开启，然后刷新页面。");
    chrome.devtools.inspectedWindow.eval(
      "window.__FORMANT_VUE__ && window.__FORMANT_VUE__.setEnabled(false)",
    );
    return;
  }
  const snapshot = await inspect(
    "window.__FORMANT_VUE__ ? window.__FORMANT_VUE__.snapshot() : { missing: true, apps: [] }",
  );
  if (snapshot?.error) {
    current = null;
    showNote(String(snapshot.error));
    return;
  }
  if (snapshot?.missing) {
    current = null;
    showNote("这个页面还没有 formant 的 Vue hook。打开开关后请刷新页面。只检查顶层页面。");
    return;
  }
  if (snapshot?.enabled === false) {
    current = null;
    showNote("Vue 检查已关闭。可在扩展设置 → 功能 中重新开启，然后刷新页面。");
    return;
  }
  current = snapshot;
  const apps = snapshot?.apps || [];
  if (!apps.length) {
    showNote("没有检测到 Vue。生产构建需要带 devtools 标志。只检查顶层页面，iframe 里的应用不会出现在这里。");
    tree.replaceChildren();
    meta.textContent = "";
    return;
  }
  showNote("");
  paintTree();
  await showDetails();
}

tree.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest("button") : null;
  if (!target) return;
  if (target.dataset.store) {
    selectedStore = target.dataset.store;
    selectedId = null;
  } else if (target.dataset.id) {
    selectedId = Number(target.dataset.id);
    selectedStore = "";
  }
  paintTree();
  void showDetails();
});

refreshBtn.addEventListener("click", () => {
  selectedId = null;
  selectedStore = "";
  detail.textContent = "选择左侧组件";
  chrome.devtools.inspectedWindow.eval(
    "window.__FORMANT_VUE__ && window.__FORMANT_VUE__.highlight(null)",
  );
  void loadTree();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    chrome.devtools.inspectedWindow.eval(
      "window.__FORMANT_VUE__ && window.__FORMANT_VUE__.highlight(null)",
    );
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.formantFeatures) return;
  void loadTree();
});

chrome.devtools.network.onNavigated.addListener(() => {
  selectedId = null;
  selectedStore = "";
  void loadTree();
});

void loadTree();
