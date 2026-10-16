/** 工具箱列表与标题用的线性图标（24x24，描边取 currentColor）。 */

const wrap = (body) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const TOOL_ICONS = {
  qr: wrap(
    '<rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/><path d="M14.5 14.5h2.5v2.5h-2.5zM20.5 14.5v2M14.5 20.5h2M20.5 20.5h-2.5v-2.5"/>',
  ),
  timestamp: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  json: wrap('<path d="M8.5 4C6.5 4 6 5 6 6.5v2C6 10 5 11.5 3.5 12 5 12.5 6 14 6 15.5v2C6 19 6.5 20 8.5 20M15.5 4c2 0 2.5 1 2.5 2.5v2c0 1.5 1 3 2.5 3.5-1.5.5-2.5 2-2.5 3.5v2c0 1.5-.5 2.5-2.5 2.5"/>'),
  diff: wrap('<rect x="3.5" y="4.5" width="7.5" height="15" rx="1.5"/><rect x="13" y="4.5" width="7.5" height="15" rx="1.5"/><path d="M6 9h2.5M6 12h2.5M15.5 12H18M15.5 15H18"/>'),
  "image-base64": wrap('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 3.5 3L16 12l4 4.5"/>'),
  codec: wrap('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'),
  company: wrap(
    '<path d="M4.5 20.5h15M7 20.5V6.5h6.5v14M13.5 10.5H17.5v10M9.2 9.5h1.2M9.2 12.5h1.2M9.2 15.5h1.2M15.2 13.2h1.1M15.2 16.2h1.1"/>',
  ),
  xiangqi: wrap(
    '<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/><path d="M4.5 9.5h15M4.5 14.5h15M9.5 4.5v15M14.5 4.5v15"/>',
  ),
  "image-prompt": wrap('<path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 10.9 10.1 9z"/><path d="M19 3.5v3M17.5 5h3M5 17v3M3.5 18.5h3"/>'),
};

export const GRIP_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';
