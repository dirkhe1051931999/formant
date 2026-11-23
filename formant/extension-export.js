import "./oolafoffice/common/zip.js";
import { normalizeManagedExtension } from "./extensions-manager.js";

const edgeStore = "https://edge.microsoft.com/extensionwebstorebase/v1/crx";
const chromeStore = "https://clients2.google.com/service/update2/crx";
const source = document.getElementById("exportSource");
const status = document.getElementById("exportStatus");

/** @param {ArrayBuffer} buffer */
export function unpackStoreZip(buffer) {
  if (buffer.byteLength < 16) throw new Error("应用商店返回的安装包不完整。");
  const header = new DataView(buffer);
  if (header.getUint32(0, true) !== 0x34327243 || header.getUint32(4, true) !== 3) {
    throw new Error("应用商店返回了无法识别的 CRX 安装包。");
  }
  const offset = 12 + header.getUint32(8, true);
  if (offset > buffer.byteLength - 22 || header.getUint32(offset, true) !== 0x04034b50) {
    throw new Error("安装包缺少有效的 ZIP 内容。");
  }
  return new Uint8Array(buffer, offset);
}

async function downloadStoreZip(item) {
  const browserVersion = navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || "";
  const stores = /\bEdg\//.test(navigator.userAgent) ? [edgeStore, chromeStore] : [chromeStore, edgeStore];
  const availableVersions = new Set();
  let lastError;

  for (const store of stores) {
    try {
      const url = new URL(store);
      url.searchParams.set("response", "redirect");
      url.searchParams.set("acceptformat", "crx3");
      if (browserVersion) url.searchParams.set("prodversion", browserVersion);
      url.searchParams.set("x", `id=${item.id}&installsource=ondemand&uc`);
      const response = await fetch(url, { credentials: "omit", signal: AbortSignal.timeout(20_000) });
      if (response.status === 204 || response.status === 404) continue;
      if (!response.ok) throw new Error(`应用商店请求失败（HTTP ${response.status}）。`);

      const zip = unpackStoreZip(await response.arrayBuffer());
      const manifestEntry = (await globalThis.L.zip.read(zip)).get("manifest.json");
      if (!manifestEntry) throw new Error("安装包缺少 manifest.json。");
      const manifest = JSON.parse(new TextDecoder().decode(await manifestEntry.bytes()));
      if (manifest.version !== item.version) {
        if (typeof manifest.version === "string") availableVersions.add(manifest.version);
        continue;
      }
      return new Blob([zip], { type: "application/zip" });
    } catch (error) {
      lastError = error;
    }
  }

  if (availableVersions.size) {
    throw new Error(`已安装版本为 ${item.version}，应用商店提供的版本为 ${[...availableVersions].join("、")}。无法导出同版本 ZIP。`);
  }
  throw lastError || new Error("应用商店没有可下载的安装包。");
}

async function init() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id || !/^[a-p]{32}$/.test(id)) throw new Error("扩展 ID 无效。");
  const item = normalizeManagedExtension(await chrome.management.get(id));
  if (!item) throw new Error("找不到可导出的扩展。");

  source.textContent = `${item.name} · ${item.version}`;
  if (item.installType === "development") {
    throw new Error("开发者模式加载的扩展没有商店安装包，请从源码目录打包。");
  }
  const zip = await downloadStoreZip(item);
  const filename = `${item.name}-${item.version}.zip`.replace(/[\\/:*?"<>|]/g, "-");
  const url = URL.createObjectURL(zip);
  try {
    await chrome.downloads.download({ url, filename, saveAs: false });
    status.textContent = `已开始下载 ${filename}`;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

void init().catch((error) => {
  status.textContent = `导出失败：${error instanceof Error ? error.message : String(error)}`;
});
