/** 工具箱列表与标题用的线性图标（24x24，描边取 currentColor）。 */

import { toast } from "./tools-dom.js";

const wrap = (body) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const TOOL_ICONS = {
  qr: wrap(
    '<rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/><path d="M14.5 14.5h2.5v2.5h-2.5zM20.5 14.5v2M14.5 20.5h2M20.5 20.5h-2.5v-2.5"/>',
  ),
  timestamp: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  json: wrap('<path d="M8.5 4C6.5 4 6 5 6 6.5v2C6 10 5 11.5 3.5 12 5 12.5 6 14 6 15.5v2C6 19 6.5 20 8.5 20M15.5 4c2 0 2.5 1 2.5 2.5v2c0 1.5 1 3 2.5 3.5-1.5.5-2.5 2-2.5 3.5v2c0 1.5-.5 2.5-2.5 2.5"/>'),
  diff: wrap('<rect x="3.5" y="4.5" width="7.5" height="15" rx="1.5"/><rect x="13" y="4.5" width="7.5" height="15" rx="1.5"/><path d="M6 9h2.5M6 12h2.5M15.5 12H18M15.5 15H18"/>'),
  compare: wrap('<path d="M4 7h5.2l1.3-1.6H14V16H4z"/><path d="M10.5 11H20v8H10.5z"/><path d="M6.2 10.2h2.6M13.2 14.4h3.2"/>'),
  "image-base64": wrap('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 3.5 3L16 12l4 4.5"/>'),
  codec: wrap('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'),
  company: wrap(
    '<path d="M4.5 20.5h15M7 20.5V6.5h6.5v14M13.5 10.5H17.5v10M9.2 9.5h1.2M9.2 12.5h1.2M9.2 15.5h1.2M15.2 13.2h1.1M15.2 16.2h1.1"/>',
  ),
  xiangqi: wrap(
    '<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/><path d="M4.5 9.5h15M4.5 14.5h15M9.5 4.5v15M14.5 4.5v15"/>',
  ),
  "image-prompt": wrap('<path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 10.9 10.1 9z"/><path d="M19 3.5v3M17.5 5h3M5 17v3M3.5 18.5h3"/>'),
  userscript: wrap('<path d="M8 6.5h8M8 10h5"/><rect x="5.5" y="4.5" width="13" height="15" rx="1.5"/><path d="m9 14.5 2 2 4-4"/>'),
  lighthouse: wrap('<path d="M12 3.5 8.5 10h7L12 3.5z"/><path d="M10 10v8.5h4V10M5.5 19.5h13M8.5 13.5h7"/>'),
  hls: wrap('<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="m11 9.5 4.5 2.5L11 14.5z"/>'),
};

const ui = (body) =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const UI_ICONS = {
  swap: ui('<path d="M7 8h11M15 5l3 3-3 3M17 16H6M9 13l-3 3 3 3"/>'),
  refresh: ui('<path d="M19.5 12a7.5 7.5 0 1 1-2.1-5.2"/><path d="M19.5 4.5V9h-4.5"/>'),
  back: ui('<path d="M14.5 6 8.5 12l6 6"/>'),
  file: ui('<path d="M7 3.5h6.2L18 8.2V20.5H7z"/><path d="M13 3.5V8h5"/>'),
  folder: ui('<path d="M3.5 8.5V18.5h17V10H11L9.2 8.5z"/>'),
  close: ui('<path d="M8 8l8 8M16 8l-8 8"/>'),
  recent: ui('<circle cx="12" cy="12" r="7.5"/><path d="M12 8.5V12l2.5 1.5"/>'),
  up: ui('<path d="m6 14 6-6 6 6"/>'),
  down: ui('<path d="m6 10 6 6 6-6"/>'),
  full: ui('<path d="M9 4.5H4.5V9M15 4.5h4.5V9M9 19.5H4.5V15M15 19.5h4.5V15"/>'),
  unfull: ui('<path d="M4.5 9H9V4.5M20 9h-4.5V4.5M4.5 15H9v4.5M20 15h-4.5v4.5"/>'),
};

/** @param {HTMLElement} button @param {HTMLElement} root */
export function bindFullscreen(button, root) {
  const host = () => /** @type {HTMLElement} */ (root.closest(".tl-panel") || root);
  const paint = () => {
    const on = document.fullscreenElement === host();
    const label = on ? "退出全屏" : "全屏";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = on ? UI_ICONS.unfull : UI_ICONS.full;
  };
  button.addEventListener("click", () => {
    const target = host();
    const leaving = Boolean(document.fullscreenElement);
    const run = leaving ? document.exitFullscreen() : target.requestFullscreen();
    void run.catch(() => toast(leaving ? "无法退出全屏" : "无法进入全屏", true));
  });
  document.addEventListener("fullscreenchange", paint);
}

export const GRIP_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';
