import { parseUserscriptMeta } from "./parse.js";
import { listScripts, upsertFromSource } from "./store.js";

/**
 * 本机一次性种子（`userscript/_seed/`，不进仓库）：
 * 把从 Tampermonkey 对照下来的 .user.js 写入 formant 列表。
 * 已有同名或同一安装地址的脚本跳过。
 */
export async function importSeedIfNeeded() {
  /** @type {{ file?: string, installUrl?: string }[]} */
  let index = [];
  try {
    const res = await fetch(chrome.runtime.getURL("userscript/_seed/index.json"));
    if (!res.ok) return 0;
    const raw = await res.json();
    index = Array.isArray(raw) ? raw : [];
  } catch {
    return 0;
  }
  if (!index.length) return 0;

  const existing = await listScripts();
  const names = new Set(existing.map((item) => item.meta.name));
  const urls = new Set(existing.map((item) => item.installUrl).filter(Boolean));
  let added = 0;
  for (const item of index) {
    const file = String(item.file || "");
    if (!file || file.includes("..") || file.includes("/") || file.includes("\\")) continue;
    let source = "";
    try {
      const res = await fetch(chrome.runtime.getURL(`userscript/_seed/${file}`));
      if (!res.ok) continue;
      source = await res.text();
    } catch {
      continue;
    }
    if (!source.includes("==UserScript==")) continue;
    const installUrl = String(item.installUrl || "");
    let name = "";
    try {
      name = parseUserscriptMeta(source).name;
    } catch {
      continue;
    }
    if ((name && names.has(name)) || (installUrl && urls.has(installUrl))) continue;
    await upsertFromSource(source, { installUrl, enabled: true });
    if (name) names.add(name);
    if (installUrl) urls.add(installUrl);
    added += 1;
  }
  return added;
}
