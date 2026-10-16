import {
  FEATURES_KEY,
  isImagePromptEnabled,
  isToolsEnabled,
  loadFeatures,
  normalizeFeatures,
} from "./features.js";
import { $, $$ } from "./tools-dom.js";
import { GRIP_ICON, TOOL_ICONS } from "./tools-icons.js";

/**
 * @typedef {{ mount: (root: HTMLElement) => void }} ToolModule
 */

/** 本机排序，只存工具 id 顺序，不含密钥，不同步。 */
const ORDER_KEY = "formantToolsOrder";

const TOOLS = [
  { id: "qr", title: "二维码", gate: "tools", load: () => import("./tools-qr.js") },
  { id: "timestamp", title: "时间戳", gate: "tools", load: () => import("./tools-timestamp.js") },
  { id: "json", title: "JSON 美化", gate: "tools", load: () => import("./tools-json.js") },
  { id: "diff", title: "JSON 对比", gate: "tools", load: () => import("./tools-diff.js") },
  { id: "image-base64", title: "图片 Base64", gate: "tools", load: () => import("./tools-image-base64.js") },
  { id: "codec", title: "编码转换", gate: "tools", load: () => import("./tools-codec.js") },
  { id: "company", title: "企业查询", gate: "tools", load: () => import("./tools-company.js") },
  { id: "xiangqi", title: "象棋", gate: "tools", load: () => import("./tools-xiangqi.js") },
  { id: "image-prompt", title: "识图", gate: "imagePrompt", load: () => import("./tools-image-prompt.js") },
];

const nav = /** @type {HTMLElement} */ ($("#toolsNav"));
const main = /** @type {HTMLElement} */ ($("#toolsMain"));
const empty = /** @type {HTMLElement} */ ($("#toolsEmpty"));

/** @type {Map<string, HTMLElement>} */
const panels = new Map();
let toolsOn = true;
let imagePromptOn = true;
let activeId = "";
/** @type {string[]} */
let order = TOOLS.map((t) => t.id);

/** 已保存顺序里未知的 id 丢弃，新增工具按默认顺序补在后面。 */
function normalizeOrder(saved) {
  const known = TOOLS.map((t) => t.id);
  const list = Array.isArray(saved) ? saved.filter((id) => known.includes(id)) : [];
  for (const id of known) if (!list.includes(id)) list.push(id);
  return [...new Set(list)];
}

function visibleIds() {
  return order.filter((id) => {
    const tool = TOOLS.find((t) => t.id === id);
    return tool && (tool.gate === "tools" ? toolsOn : imagePromptOn);
  });
}

const currentId = () => decodeURIComponent(location.hash.replace(/^#/, ""));

function renderNav() {
  nav.textContent = "";
  for (const id of visibleIds()) {
    const tool = /** @type {(typeof TOOLS)[number]} */ (TOOLS.find((t) => t.id === id));
    const a = document.createElement("a");
    a.className = "tl-nav__item";
    a.href = `#${tool.id}`;
    a.dataset.tool = tool.id;
    a.draggable = true;
    a.title = "拖动可调整顺序";
    a.innerHTML = `<span class="tl-ico">${TOOL_ICONS[/** @type {keyof typeof TOOL_ICONS} */ (tool.id)] || ""}</span><strong></strong><span class="tl-nav__grip">${GRIP_ICON}</span>`;
    /** @type {HTMLElement} */ (a.querySelector("strong")).textContent = tool.title;
    nav.appendChild(a);
  }
  markActive();
}

function markActive() {
  for (const a of $$(".tl-nav__item[data-tool]", nav)) a.classList.toggle("is-active", a.dataset.tool === activeId);
}

/* ---- 拖拽排序 ---- */
let dragId = "";

function clearDropMarks() {
  for (const a of $$(".tl-nav__item", nav)) a.classList.remove("is-drop-before", "is-drop-after", "is-dragging");
}

nav.addEventListener("dragstart", (event) => {
  const item = /** @type {HTMLElement} */ (event.target).closest(".tl-nav__item");
  if (!item || !event.dataTransfer) return;
  dragId = /** @type {HTMLElement} */ (item).dataset.tool || "";
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", dragId);
  item.classList.add("is-dragging");
});

nav.addEventListener("dragover", (event) => {
  if (!dragId) return;
  event.preventDefault();
  const item = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest(".tl-nav__item"));
  for (const a of $$(".tl-nav__item", nav)) a.classList.remove("is-drop-before", "is-drop-after");
  if (!item || item.dataset.tool === dragId) return;
  const rect = item.getBoundingClientRect();
  item.classList.add(event.clientY < rect.top + rect.height / 2 ? "is-drop-before" : "is-drop-after");
});

nav.addEventListener("drop", (event) => {
  if (!dragId) return;
  event.preventDefault();
  const item = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest(".tl-nav__item"));
  const targetId = item?.dataset.tool || "";
  if (item && targetId && targetId !== dragId) {
    const rect = item.getBoundingClientRect();
    const after = event.clientY >= rect.top + rect.height / 2;
    const next = order.filter((id) => id !== dragId);
    const at = next.indexOf(targetId) + (after ? 1 : 0);
    next.splice(at, 0, dragId);
    order = next;
    void chrome.storage.local.set({ [ORDER_KEY]: order });
    renderNav();
  }
  dragId = "";
  clearDropMarks();
});

nav.addEventListener("dragend", () => {
  dragId = "";
  clearDropMarks();
});

/** @param {string} id */
async function ensurePanel(id) {
  const existing = panels.get(id);
  if (existing) return existing;
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) return null;
  const section = document.createElement("section");
  section.className = "tl-panel";
  section.dataset.tool = id;
  section.hidden = true;
  main.appendChild(section);
  panels.set(id, section);
  try {
    const mod = /** @type {ToolModule} */ (await tool.load());
    mod.mount(section);
    const heading = $(".tl-head h2", section);
    if (heading) {
      const ico = document.createElement("span");
      ico.className = "tl-ico tl-ico--lg";
      ico.innerHTML = TOOL_ICONS[/** @type {keyof typeof TOOL_ICONS} */ (id)] || "";
      heading.prepend(ico);
    }
  } catch (error) {
    console.warn("[formant] tool mount failed", id, error);
    const msg = document.createElement("p");
    msg.className = "tl-note tl-note--error";
    msg.textContent = `加载失败：${error instanceof Error ? error.message : String(error)}`;
    section.appendChild(msg);
  }
  return section;
}

async function route() {
  const ids = visibleIds();
  const wanted = currentId();
  const id = ids.includes(wanted) ? wanted : ids[0] || "";

  empty.hidden = ids.length > 0;
  for (const [key, el] of panels) el.hidden = key !== id;
  activeId = id;
  markActive();
  if (!id) return;
  if (wanted !== id) history.replaceState(null, "", `#${id}`);
  const section = await ensurePanel(id);
  if (section && activeId === id) section.hidden = false;
}

/** @param {import("./features.js").FormantFeatures} features */
function applyFeatures(features) {
  toolsOn = isToolsEnabled(features);
  imagePromptOn = isImagePromptEnabled(features);
  renderNav();
  void route();
}

window.addEventListener("hashchange", () => void route());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[FEATURES_KEY]) applyFeatures(normalizeFeatures(changes[FEATURES_KEY].newValue));
  if (changes[ORDER_KEY]) {
    order = normalizeOrder(changes[ORDER_KEY].newValue);
    renderNav();
  }
});

void Promise.all([loadFeatures(), chrome.storage.local.get(ORDER_KEY)]).then(([features, stored]) => {
  order = normalizeOrder(stored[ORDER_KEY]);
  applyFeatures(features);
});
