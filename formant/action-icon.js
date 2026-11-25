/** Unified toolbar `F` icon renderer: top-right framework badge + dynamic adblock count. */

const TECH_BADGES = {
  vue: { name: "Vue", short: "V", bg: "#42b883", fg: "#ffffff" },
  nuxt: { name: "Nuxt", short: "N", bg: "#00dc82", fg: "#0b1a14" },
  next: { name: "Next.js", short: "NX", bg: "#111827", fg: "#ffffff" },
  react: { name: "React", short: "R", bg: "#0ea5e9", fg: "#ffffff" },
  angular: { name: "Angular", short: "A", bg: "#dd0031", fg: "#ffffff" },
  astro: { name: "Astro", short: "As", bg: "#ff5d01", fg: "#ffffff" },
  wordpress: { name: "WordPress", short: "W", bg: "#21759b", fg: "#ffffff" },
  svelte: { name: "Svelte", short: "S", bg: "#ff3e00", fg: "#ffffff" },
  solid: { name: "Solid", short: "So", bg: "#2c4f7c", fg: "#ffffff" },
  remix: { name: "Remix", short: "Rx", bg: "#121212", fg: "#ffffff" },
  vitepress: { name: "VitePress", short: "VP", bg: "#646cff", fg: "#ffffff" },
  docusaurus: { name: "Docusaurus", short: "D", bg: "#2e8555", fg: "#ffffff" },
  shopify: { name: "Shopify", short: "Sh", bg: "#95bf47", fg: "#102006" },
};

/** @type {Map<number, { vue: boolean, tech: string | null, adCount: number }>} */
const tabStates = new Map();
/** @type {Promise<ImageBitmap> | null} */
let baseBitmapPromise = null;

function getBaseBitmap() {
  if (!baseBitmapPromise) {
    baseBitmapPromise = fetch(chrome.runtime.getURL("icons/icon32.png"))
      .then((res) => res.blob())
      .then((blob) => createImageBitmap(blob));
  }
  return baseBitmapPromise;
}

function getState(tabId) {
  let state = tabStates.get(tabId);
  if (!state) {
    state = { vue: false, tech: null, adCount: 0 };
    tabStates.set(tabId, state);
  }
  return state;
}

function resolveFramework(state) {
  if (state.tech === "nuxt") return "nuxt";
  if (state.tech && TECH_BADGES[state.tech]) return state.tech;
  if (state.vue) return "vue";
  return null;
}

/**
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * @param {OffscreenCanvasRenderingContext2D} ctx
 * @param {number} size
 * @param {string} text
 * @param {string} bg
 * @param {string} fg
 * @param {"top-right" | "bottom-right"} corner
 */
function drawBadge(ctx, size, text, bg, fg, corner) {
  const s = size / 32;
  const h = Math.round(16 * s);
  const pad = Math.round(2.5 * s);
  ctx.font = `800 ${Math.round(11.5 * s)}px "Segoe UI", Arial, sans-serif`;
  const textW = Math.ceil(ctx.measureText(text).width);
  const w = Math.max(h, Math.min(size, textW + pad * 2));
  const x = size - w;
  const y = corner === "top-right" ? 0 : size - h;
  const radius = Math.max(2, Math.round(4 * s));

  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = Math.max(1, s);
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + 0.5 * s);
  ctx.restore();
}

/**
 * @param {number} size
 * @param {string | null} framework
 * @param {number} adCount
 */
async function renderSize(size, framework, adCount) {
  const bitmap = await getBaseBitmap();
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, size, size);

  const techMeta = framework ? TECH_BADGES[framework] : null;
  if (techMeta) {
    drawBadge(ctx, size, techMeta.short, techMeta.bg, techMeta.fg, "top-right");
  }
  if (adCount > 0) {
    const label = adCount > 99 ? "99+" : String(adCount);
    const corner = techMeta ? "bottom-right" : "top-right";
    drawBadge(ctx, size, label, "#dc2626", "#ffffff", corner);
  }
  return ctx.getImageData(0, 0, size, size);
}

/**
 * @param {number} tabId
 */
async function paintTab(tabId) {
  const state = tabStates.get(tabId);
  if (!state) return;
  const framework = resolveFramework(state);
  const parts = ["formant"];
  if (framework && TECH_BADGES[framework]) parts.push(TECH_BADGES[framework].name);
  if (state.adCount > 0) parts.push(`已拦截 ${state.adCount}`);

  try {
    if (!framework && state.adCount <= 0) {
      await chrome.action.setIcon({
        tabId,
        path: {
          16: "icons/icon16.png",
          32: "icons/icon32.png",
          48: "icons/icon48.png",
          128: "icons/icon128.png",
        },
      });
    } else {
      const [img16, img32] = await Promise.all([
        renderSize(16, framework, state.adCount),
        renderSize(32, framework, state.adCount),
      ]);
      if (img16 && img32) {
        await chrome.action.setIcon({ tabId, imageData: { 16: img16, 32: img32 } });
      }
    }
    await chrome.action.setTitle({ tabId, title: parts.join(" · ") });
  } catch {
    // Tab may have closed before paint finished.
  }
}

export async function setTabVue(tabId, present) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  const state = getState(tabId);
  const next = Boolean(present);
  if (state.vue === next) return;
  state.vue = next;
  await paintTab(tabId);
}

export async function setTabTech(tabId, techId) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  const state = getState(tabId);
  const next = techId && TECH_BADGES[techId] ? techId : null;
  if (state.tech === next) return;
  state.tech = next;
  await paintTab(tabId);
}

export async function setTabAdCount(tabId, count) {
  if (!Number.isInteger(tabId) || tabId < 0) return;
  const state = getState(tabId);
  const next = Math.max(0, Number(count) || 0);
  if (state.adCount === next) return;
  state.adCount = next;
  await paintTab(tabId);
}

export function clearTabIcon(tabId) {
  tabStates.delete(tabId);
}

export async function clearAllTechIcons() {
  const jobs = [];
  for (const [tabId, state] of tabStates) {
    if (!state.tech) continue;
    state.tech = null;
    jobs.push(paintTab(tabId));
  }
  await Promise.all(jobs);
}

export async function clearAllAdCounts() {
  const jobs = [];
  for (const [tabId, state] of tabStates) {
    if (!state.adCount) continue;
    state.adCount = 0;
    jobs.push(paintTab(tabId));
  }
  await Promise.all(jobs);
}

/**
 * @param {number} tabId
 * @returns {{ framework: string | null, frameworkName: string | null, adCount: number }}
 */
export function getTabIconInfo(tabId) {
  const state = tabStates.get(tabId);
  if (!state) return { framework: null, frameworkName: null, adCount: 0 };
  const framework = resolveFramework(state);
  const frameworkName = framework && TECH_BADGES[framework] ? TECH_BADGES[framework].name : null;
  return { framework, frameworkName, adCount: state.adCount };
}
