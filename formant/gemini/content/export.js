(() => {
  "use strict";

  const HOST_ID = "formant-gemini-export";
  const FEATURES_KEY = "formantFeatures";
  const TURN_SELECTOR = "div.conversation-container";
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let enabled = true;
  let busy = false;
  let host;
  let button;
  let menu;
  let status;

  function safeName(value) {
    return String(value || "Gemini 对话").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim().slice(0, 80) || "Gemini 对话";
  }

  function save(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.style.display = "none";
    document.documentElement.append(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 30000);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function setStatus(value, error = false) {
    if (!status) return;
    status.textContent = value;
    status.dataset.error = String(error);
    status.hidden = !value;
  }

  function imageUrl(img) {
    const candidates = [img.getAttribute("data-src"), img.currentSrc, img.getAttribute("src")].filter(Boolean);
    const raw = candidates.find((value) => /^https:\/\//i.test(value)) || candidates[0] || "";
    if (!raw || raw.startsWith("data:")) return raw;
    try { return new URL(raw, location.href).href; } catch { return ""; }
  }

  function isAttachmentUrl(url) {
    if (!url) return false;
    if (/^(blob:|data:image\/)/i.test(url)) return true;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && (
        parsed.hostname === "googleusercontent.com" || parsed.hostname.endsWith(".googleusercontent.com") ||
        parsed.hostname === "gemini.google.com" || /\.(?:png|jpe?g|webp|avif)(?:$|[?#])/i.test(parsed.pathname)
      );
    } catch { return false; }
  }

  function extractPart(element, role) {
    if (!element) return null;
    const clone = element.cloneNode(true);
    clone.querySelectorAll("button, svg, script, style, [aria-hidden='true'], [role='button']").forEach((node) => node.remove());
    clone.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
    clone.querySelectorAll("p, div, li, pre, blockquote, h1, h2, h3, h4").forEach((node) => node.append("\n"));
    const text = (clone.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
    const images = [...element.querySelectorAll("img")].map(imageUrl).filter(isAttachmentUrl);
    if (!text && !images.length) return null;
    return { role, text, images: [...new Set(images)] };
  }

  function readTurns(imageTasks) {
    return [...document.querySelectorAll(TURN_SELECTOR)].map((turn) => {
      let user = extractPart(turn.querySelector("user-query"), "user");
      let ai = extractPart(turn.querySelector("model-response"), "assistant");
      for (const img of turn.querySelectorAll("img")) {
        const url = imageUrl(img);
        if (!isAttachmentUrl(url) || user?.images.includes(url) || ai?.images.includes(url)) continue;
        const isAi = !!img.closest("model-response, response-container");
        if (isAi) { ai ||= { role: "assistant", text: "", images: [] }; ai.images.push(url); }
        else { user ||= { role: "user", text: "", images: [] }; user.images.push(url); }
      }
      if (!user && !ai) return null;
      if (imageTasks) for (const part of [user, ai]) for (const url of part?.images || []) {
        if (!imageTasks.has(url)) imageTasks.set(url, fetchImage(url).then(
          (blob) => ({ blob }),
          (error) => ({ error }),
        ));
      }
      const stable = turn.getAttribute("data-turn-id") || turn.getAttribute("data-id") || turn.id;
      const key = stable || JSON.stringify([user?.text, ai?.text, user?.images, ai?.images]);
      return { key, parts: [user, ai].filter(Boolean) };
    }).filter(Boolean);
  }

  function scrollParent(node) {
    let fallback = null;
    for (let el = node?.parentElement; el; el = el.parentElement) {
      if (el.scrollHeight <= el.clientHeight + 50) continue;
      fallback ||= el;
      if (/auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
    }
    return fallback || document.scrollingElement || document.documentElement;
  }

  async function collectTurns(imageTasks) {
    const initial = readTurns(imageTasks);
    if (!initial.length) throw new Error("未找到 Gemini 对话，请打开一条已加载的对话");
    const scroller = scrollParent(document.querySelector(TURN_SELECTOR));
    const originalTop = scroller.scrollTop;
    const originalUrl = location.href;
    const ordered = [...initial];
    let quietAtTop = 0;
    let lastGrowth = Date.now();
    try {
      for (let attempt = 0; attempt < 240; attempt += 1) {
        if (!enabled || location.href !== originalUrl) throw new Error("导出已中止：页面或功能状态发生变化");
        setStatus(`正在加载历史对话 · ${ordered.length} 轮`);
        const before = scroller.scrollTop;
        scroller.scrollTop = Math.max(0, before - Math.max(500, scroller.clientHeight * 0.85));
        await sleep(650);
        const snapshot = readTurns(imageTasks);
        if (!snapshot.length) throw new Error("加载历史时对话内容消失");
        const known = new Set(ordered.map((turn) => turn.key));
        const overlap = snapshot.findIndex((turn) => known.has(turn.key));
        if (overlap < 0) throw new Error("历史消息与当前对话无法衔接，无法确认导出完整性");
        const prefix = snapshot.slice(0, overlap).filter((turn) => !known.has(turn.key));
        if (prefix.length) { ordered.unshift(...prefix); lastGrowth = Date.now(); }
        const atTop = scroller.scrollTop <= 2;
        const loading = !!document.querySelector("[aria-busy='true'], mat-spinner, .loading-spinner");
        quietAtTop = atTop && !loading && !prefix.length ? quietAtTop + 1 : 0;
        if (quietAtTop >= 15 && Date.now() - lastGrowth >= 10000) return ordered;
      }
      throw new Error("历史对话加载超时，未生成部分导出文件");
    } finally {
      if (location.href === originalUrl && scroller.isConnected) scroller.scrollTop = originalTop;
    }
  }

  async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("图片编码失败"));
      reader.readAsDataURL(blob);
    });
  }

  async function fetchImage(url) {
    if (url.startsWith("data:image/") || url.startsWith("blob:")) return fetch(url).then((res) => res.blob());
    const result = await chrome.runtime.sendMessage({ type: "FORMANT_GEMINI_EXPORT_IMAGE", url });
    if (!result?.ok || !result.base64) throw new Error(result?.error || "图片下载失败");
    const binary = atob(result.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: result.mime || "image/png" });
  }

  async function decodeImage(blob) {
    try { return await createImageBitmap(blob); } catch { /* Some Gemini images only decode through HTMLImageElement. */ }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally { URL.revokeObjectURL(url); }
  }

  async function prepareImages(turns, imageTasks) {
    const images = new Map();
    let number = 0;
    for (const turn of turns) for (const part of turn.parts) for (const url of part.images) {
      if (images.has(url)) continue;
      number += 1;
      setStatus(`正在保存图片 · ${number}`);
      let blob;
      try {
        const captured = imageTasks.get(url) ? await imageTasks.get(url) : { blob: await fetchImage(url) };
        if (captured.error) throw captured.error;
        const source = captured.blob;
        const bitmap = await decodeImage(source);
        try {
          const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
          const width = Math.max(1, Math.round(bitmap.width * scale));
          const height = Math.max(1, Math.round(bitmap.height * scale));
          blob = new Blob([await toJpeg(bitmap, width, height)], { type: "image/jpeg" });
        } finally { bitmap.close?.(); }
      }
      catch (error) { throw new Error(`第 ${number} 张图片获取失败：${error.message}`); }
      images.set(url, { blob, dataUrl: await blobToDataUrl(blob), name: `图片-${String(number).padStart(3, "0")}.jpg` });
    }
    return images;
  }

  function textOutput(turns, images, title) {
    const out = [title, ""];
    for (const turn of turns) for (const part of turn.parts) {
      out.push(part.role === "user" ? "我：" : "Gemini：", part.text);
      for (const url of part.images) out.push(`[图片附件：${images.get(url).name}]`);
      out.push("");
    }
    return out.join("\n");
  }

  function htmlOutput(turns, images, title) {
    const body = turns.flatMap((turn) => turn.parts.map((part) => `<section><h2>${part.role === "user" ? "我" : "Gemini"}</h2><div class="text">${escapeHtml(part.text)}</div>${part.images.map((url) => `<figure><img src="${images.get(url).dataUrl}" alt="${escapeHtml(images.get(url).name)}"><figcaption>${escapeHtml(images.get(url).name)}</figcaption></figure>`).join("")}</section>`)).join("\n");
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font:15px/1.7 system-ui,"Microsoft YaHei",sans-serif;max-width:850px;margin:40px auto;padding:0 24px;color:#1d2633;background:#fff}h1{font-size:24px}section{border:1px solid #d8e1ec;border-radius:12px;padding:18px 22px;margin:18px 0}h2{font-size:15px;color:#4036b5;margin:0 0 12px}.text{white-space:pre-wrap;overflow-wrap:anywhere}img{display:block;max-width:100%;height:auto;border-radius:8px}figure{margin:18px 0 0}figcaption{font-size:12px;color:#66758a;margin-top:6px}@media print{body{margin:0}section{break-inside:avoid}}</style><h1>${escapeHtml(title)}</h1>${body}</html>`;
  }

  async function toJpeg(source, width, height, quality = 0.78) {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("PDF 图片压缩失败");
    return new Uint8Array(await blob.arrayBuffer());
  }

  function pdfFromJpegs(pages, title) {
    const enc = new TextEncoder(), chunks = [], offsets = [];
    let size = 0;
    const push = (part) => { const bytes = typeof part === "string" ? enc.encode(part) : part; chunks.push(bytes); size += bytes.length; };
    const object = (id, data) => { offsets[id] = size; push(`${id} 0 obj\n`); data(); push("\nendobj\n"); };
    push("%PDF-1.4\n");
    object(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
    object(2, () => push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] /Count ${pages.length} >>`));
    pages.forEach((jpeg, i) => {
      const page = 3 + i * 3, content = page + 1, image = page + 2;
      object(page, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im ${image} 0 R >> >> /Contents ${content} 0 R >>`));
      const command = "q 595 0 0 842 0 0 cm /Im Do Q";
      object(content, () => push(`<< /Length ${command.length} >>\nstream\n${command}\nendstream`));
      object(image, () => { push(`<< /Type /XObject /Subtype /Image /Width 1190 /Height 1684 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); push(jpeg); push("\nendstream"); });
    });
    const xref = size, total = 3 + pages.length * 3;
    push(`xref\n0 ${total}\n0000000000 65535 f \n`);
    for (let i = 1; i < total; i++) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
    push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(chunks, { type: "application/pdf" });
  }

  async function pdfOutput(turns, images, title) {
    const W = 1190, H = 1684, margin = 78, lineHeight = 35;
    const pages = [];
    let canvas, ctx, y;
    const newPage = async () => {
      if (canvas) pages.push(await toJpeg(canvas, W, H));
      canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
      ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, W, H); y = margin;
    };
    const line = async (value, bold = false) => {
      if (y + lineHeight > H - margin) await newPage();
      ctx.fillStyle = bold ? "#4036b5" : "#1d2633";
      ctx.font = `${bold ? "bold " : ""}27px "Microsoft YaHei", sans-serif`;
      ctx.fillText(value, margin, y, W - margin * 2); y += lineHeight;
    };
    await newPage(); await line(title, true); y += 20;
    for (const turn of turns) for (const part of turn.parts) {
      await line(part.role === "user" ? "我：" : "Gemini：", true);
      for (const paragraph of part.text.split("\n")) {
        let current = "";
        for (const char of paragraph) {
          ctx.font = '27px "Microsoft YaHei", sans-serif';
          if (ctx.measureText(current + char).width > W - margin * 2 && current) { await line(current); current = ""; }
          current += char;
        }
        await line(current || " ");
      }
      for (const url of part.images) {
        const bitmap = await decodeImage(images.get(url).blob);
        try {
          const scale = Math.min((W - margin * 2) / bitmap.width, 650 / bitmap.height, 1);
          const iw = bitmap.width * scale, ih = bitmap.height * scale;
          if (y + ih > H - margin) await newPage();
          ctx.drawImage(bitmap, margin, y, iw, ih); y += ih + 20;
        } finally { bitmap.close?.(); }
      }
      y += 22;
    }
    pages.push(await toJpeg(canvas, W, H));
    return pdfFromJpegs(pages, title);
  }

  async function exportChat(format) {
    if (busy) return;
    busy = true; button.disabled = true; menu.hidden = true;
    try {
      const imageTasks = new Map();
      const turns = await collectTurns(imageTasks);
      const images = await prepareImages(turns, imageTasks);
      if (!enabled) throw new Error("Gemini 功能已关闭");
      const title = safeName(document.querySelector(".conversation-title")?.textContent || document.title.replace(/\s*[-|].*$/, ""));
      const stem = `${title}_${new Date().toISOString().replace(/[:.]/g, "-")}`;
      setStatus(`正在生成 ${format.toUpperCase()} · ${turns.length} 轮`);
      if (format === "txt") {
        save(new Blob([textOutput(turns, images, title)], { type: "text/plain;charset=utf-8" }), `${stem}.txt`);
        for (const item of images.values()) save(item.blob, `${stem}_${item.name}`);
      } else if (format === "html") {
        save(new Blob([htmlOutput(turns, images, title)], { type: "text/html;charset=utf-8" }), `${stem}.html`);
      } else {
        save(await pdfOutput(turns, images, title), `${stem}.pdf`);
      }
      setStatus(`已导出 ${turns.length} 轮对话、${images.size} 张图片`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      busy = false; button.disabled = false;
    }
  }

  function ensureUi() {
    if (host?.isConnected) return;
    host = document.createElement("div"); host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>:host{all:initial;position:fixed;right:18px;bottom:24px;z-index:2147483645;font:13px/1.4 "Segoe UI","Microsoft YaHei",sans-serif;color:#fff}button{font:inherit;cursor:pointer}.main{border:0;border-radius:999px;background:rgba(21,26,34,.88);color:#fff;padding:9px 15px;box-shadow:0 4px 14px #0004}.main:hover{background:rgba(64, 54, 181,.95)}.main:disabled{opacity:.55;cursor:wait}.menu{position:absolute;right:0;bottom:48px;min-width:125px;padding:6px;background:#151a22;box-shadow:0 6px 22px #0005;border-radius:10px}.menu button{display:block;width:100%;text-align:left;border:0;border-radius:6px;padding:9px 10px;color:#fff;background:transparent}.menu button:hover{background:#4036b5}.status{position:absolute;right:0;bottom:48px;width:240px;padding:9px 12px;background:#151a22;border-radius:9px;box-shadow:0 4px 14px #0004}.status[data-error=true]{background:#8b2d34}.menu:not([hidden])+.status{bottom:178px}[hidden]{display:none!important}</style><div class="menu" hidden><button data-format="txt">纯文本 (.txt)</button><button data-format="html">网页 (.html)</button><button data-format="pdf">PDF (.pdf)</button></div><div class="status" hidden></div><button class="main" type="button" aria-label="导出 Gemini 对话">↓ 导出</button>`;
    button = shadow.querySelector(".main"); menu = shadow.querySelector(".menu"); status = shadow.querySelector(".status");
    button.addEventListener("click", () => { if (!busy) { menu.hidden = !menu.hidden; setStatus(""); } });
    menu.addEventListener("click", (event) => { const format = event.target?.dataset?.format; if (format) void exportChat(format); });
    document.documentElement.append(host);
  }

  function syncUi() { if (enabled) ensureUi(); else { host?.remove(); host = null; } }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[FEATURES_KEY]) return;
    enabled = changes[FEATURES_KEY].newValue?.gemini?.enabled !== false; syncUi();
  });
  chrome.storage.local.get(FEATURES_KEY).then((data) => {
    enabled = data[FEATURES_KEY]?.gemini?.enabled !== false; syncUi();
  }).catch(() => syncUi());
})();
