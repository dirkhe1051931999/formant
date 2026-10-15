import {
  createCustomPack,
  deleteCustomPack,
  LEXICON_LANG_LABELS,
  loadLexiconState,
  normalizeLexiconLang,
  setPackEnabled,
  updateCustomPack,
} from "./lexicon-runtime.js";

/**
 * @typedef {import("./translate-lexicon.js").LexiconPack} LexiconPack
 * @typedef {import("./translate-lexicon.js").LexiconPackEntry} LexiconPackEntry
 * @typedef {{ toast: (text: string) => void }} LexiconPanelApi
 */

/**
 * @param {LexiconPanelApi} api
 */
export function initLexiconPanel(api) {
  const { toast } = api;

  /** @type {LexiconPack[]} */
  let packs = [];
  /** @type {string | null} */
  let activePackId = null;
  /** @type {string | null} */
  let editingEntryId = null;
  /** @type {"create" | "merge" | "replace"} */
  let pendingImportMode = "create";

  const builtinList = document.getElementById("builtinList");
  const customList = document.getElementById("customList");
  const customEmpty = document.getElementById("customEmpty");
  const packTitle = document.getElementById("packTitle");
  const packMeta = document.getElementById("packMeta");
  const entryBody = document.getElementById("entryBody");
  const searchInput = /** @type {HTMLInputElement | null} */ (document.getElementById("searchInput"));
  const btnAddEntry = /** @type {HTMLButtonElement | null} */ (document.getElementById("btnAddEntry"));
  const btnDeletePack = /** @type {HTMLButtonElement | null} */ (document.getElementById("btnDeletePack"));
  const editorBar = document.getElementById("editorBar");
  const packNameInput = /** @type {HTMLInputElement | null} */ (document.getElementById("packNameInput"));
  const packLangSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById("packLangSelect"));
  const entryDialog = /** @type {HTMLDialogElement | null} */ (document.getElementById("entryDialog"));
  const entryForm = /** @type {HTMLFormElement | null} */ (document.getElementById("entryForm"));
  const entryDialogTitle = document.getElementById("entryDialogTitle");
  const entryPhrase = /** @type {HTMLInputElement | null} */ (document.getElementById("entryPhrase"));
  const entryMeaning = /** @type {HTMLInputElement | null} */ (document.getElementById("entryMeaning"));
  const entryTags = /** @type {HTMLInputElement | null} */ (document.getElementById("entryTags"));
  const entryExamples = /** @type {HTMLTextAreaElement | null} */ (document.getElementById("entryExamples"));
  const importDialog = /** @type {HTMLDialogElement | null} */ (document.getElementById("importDialog"));
  const importForm = /** @type {HTMLFormElement | null} */ (document.getElementById("importForm"));
  const importTargetHint = document.getElementById("importTargetHint");
  const fileImport = /** @type {HTMLInputElement | null} */ (document.getElementById("fileImport"));

  if (!searchInput || !btnAddEntry || !btnDeletePack || !entryForm || !importForm || !fileImport) {
    console.warn("[formant] lexicon panel DOM incomplete");
    return;
  }

  /**
   * @param {string} text
   */
  function escapeHtml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function activePack() {
    return packs.find((pack) => pack.id === activePackId) || null;
  }

  async function refresh() {
    packs = await loadLexiconState();
    if (activePackId && !packs.some((pack) => pack.id === activePackId)) {
      activePackId = packs[0]?.id || null;
    }
    if (!activePackId) activePackId = packs[0]?.id || null;
    renderPackLists();
    renderActivePack();
  }

  /**
   * @param {LexiconPack[]} list
   * @param {HTMLElement | null} root
   */
  function renderPackGroup(list, root) {
    if (!root) return;
    root.innerHTML = list
      .map((pack) => {
        const active = pack.id === activePackId ? " is-active" : "";
        return `<button type="button" class="pack-item${active}" data-pack-id="${escapeHtml(pack.id)}">
        <span>
          <div class="pack-item__name">${escapeHtml(pack.name)}</div>
          <div class="pack-item__meta">${escapeHtml(LEXICON_LANG_LABELS[pack.lang] || pack.lang)} · ${pack.entries.length} 条</div>
        </span>
        <label class="pack-item__toggle" data-stop="1">
          <input type="checkbox" data-enable-id="${escapeHtml(pack.id)}" ${pack.enabled ? "checked" : ""} />
          启用
        </label>
      </button>`;
      })
      .join("");
  }

  function renderPackLists() {
    renderPackGroup(
      packs.filter((pack) => pack.builtin),
      builtinList,
    );
    const customs = packs.filter((pack) => !pack.builtin);
    renderPackGroup(customs, customList);
    if (customEmpty) customEmpty.hidden = customs.length > 0;
  }

  function renderActivePack() {
    const pack = activePack();
    if (!pack) {
      if (packTitle) packTitle.textContent = "选择左侧词库";
      if (packMeta) packMeta.textContent = "";
      if (entryBody) {
        entryBody.innerHTML = `<tr><td colspan="4" class="muted">请选择左侧词库包</td></tr>`;
      }
      btnAddEntry.hidden = true;
      btnDeletePack.hidden = true;
      if (editorBar) editorBar.hidden = true;
      return;
    }

    if (packTitle) packTitle.textContent = pack.name;
    if (packMeta) {
      packMeta.textContent = pack.builtin
        ? `${LEXICON_LANG_LABELS[pack.lang]} · 内置（只读，内容随扩展更新）· ${pack.entries.length} 条`
        : `${LEXICON_LANG_LABELS[pack.lang]} · 自定义 · ${pack.entries.length} 条`;
    }

    const editable = !pack.builtin;
    btnAddEntry.hidden = !editable;
    btnDeletePack.hidden = !editable;
    if (editorBar) editorBar.hidden = !editable;
    if (editable && packNameInput && packLangSelect) {
      packNameInput.value = pack.name;
      packLangSelect.value = pack.lang;
    }

    const q = searchInput.value.trim().toLowerCase();
    const rows = pack.entries.filter((entry) => {
      if (!q) return true;
      const hay = `${entry.phrase} ${entry.meaning || ""} ${(entry.tags || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });

    if (!entryBody) return;
    if (!rows.length) {
      entryBody.innerHTML = `<tr><td colspan="4" class="muted">没有匹配的条目</td></tr>`;
      return;
    }

    entryBody.innerHTML = rows
      .map((entry) => {
        const tags = (entry.tags || []).join(", ");
        const actions = editable
          ? `<div class="row-actions">
            <button type="button" data-edit-id="${escapeHtml(entry.id || "")}">编辑</button>
            <button type="button" class="danger" data-remove-id="${escapeHtml(entry.id || "")}">删除</button>
          </div>`
          : `<span class="muted">只读</span>`;
        return `<tr>
        <td>${escapeHtml(entry.phrase)}</td>
        <td>${escapeHtml(entry.meaning || "")}</td>
        <td>${escapeHtml(tags)}</td>
        <td class="col-actions">${actions}</td>
      </tr>`;
      })
      .join("");
  }

  /**
   * @param {LexiconPackEntry[]} entries
   * @param {LexiconPackEntry} next
   */
  function upsertEntry(entries, next) {
    const phraseKey = next.phrase.toLowerCase();
    const idx = entries.findIndex(
      (entry) =>
        (next.id && entry.id === next.id) || String(entry.phrase || "").toLowerCase() === phraseKey,
    );
    if (idx >= 0) {
      const copy = [...entries];
      copy[idx] = { ...entries[idx], ...next };
      return copy;
    }
    return [...entries, next];
  }

  /**
   * @param {LexiconPackEntry | null} [entry]
   */
  function openEntryDialog(entry = null) {
    if (!entryDialog || !entryPhrase || !entryMeaning || !entryTags || !entryExamples) return;
    editingEntryId = entry?.id || null;
    if (entryDialogTitle) entryDialogTitle.textContent = entry ? "编辑条目" : "添加条目";
    entryPhrase.value = entry?.phrase || "";
    entryMeaning.value = entry?.meaning || "";
    entryTags.value = (entry?.tags || []).join(", ");
    entryExamples.value = (entry?.examples || []).join("\n");
    entryDialog.showModal();
    entryPhrase.focus();
  }

  /**
   * @param {unknown} json
   * @param {string} fileName
   */
  function parseImportPayload(json, fileName) {
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      throw new Error("JSON 须为对象：{ name, lang, entries }");
    }
    const row = /** @type {Record<string, unknown>} */ (json);
    if (Array.isArray(row.packs)) {
      throw new Error("暂不支持一次导入多语言 packs；请按语言拆成多个文件");
    }
    if (!Array.isArray(row.entries)) {
      throw new Error("缺少 entries 数组（单个语言的条目列表）");
    }
    return {
      name: String(row.name || fileName.replace(/\.json$/i, "")).trim() || "导入词库",
      lang: normalizeLexiconLang(row.lang),
      entries: row.entries,
    };
  }

  /**
   * @param {LexiconPackEntry[]} base
   * @param {LexiconPackEntry[]} incoming
   */
  function mergeEntries(base, incoming) {
    /** @type {Map<string, LexiconPackEntry>} */
    const map = new Map();
    for (const entry of base) {
      const phrase = String(entry.phrase || "").trim();
      if (!phrase) continue;
      map.set(phrase.toLowerCase(), entry);
    }
    for (const entry of incoming) {
      const phrase = String(entry.phrase || "").trim();
      if (!phrase) continue;
      const key = phrase.toLowerCase();
      const prev = map.get(key);
      map.set(key, {
        ...prev,
        ...entry,
        id: entry.id || prev?.id || `e_${crypto.randomUUID().slice(0, 8)}`,
        phrase,
      });
    }
    return [...map.values()];
  }

  function syncImportDialogState() {
    const pack = activePack();
    const canTargetCustom = Boolean(pack && !pack.builtin);
    const mergeRadio = /** @type {HTMLInputElement | null} */ (document.getElementById("importModeMerge"));
    const replaceRadio = /** @type {HTMLInputElement | null} */ (
      document.getElementById("importModeReplace")
    );
    if (mergeRadio) mergeRadio.disabled = !canTargetCustom;
    if (replaceRadio) replaceRadio.disabled = !canTargetCustom;
    if (!canTargetCustom) {
      const createRadio = /** @type {HTMLInputElement | null} */ (
        importForm.querySelector('input[name="importMode"][value="create"]')
      );
      if (createRadio) createRadio.checked = true;
    }
    if (importTargetHint) {
      if (canTargetCustom && pack) {
        importTargetHint.textContent = `当前自定义包：${pack.name}（${LEXICON_LANG_LABELS[pack.lang]} · ${pack.entries.length} 条）`;
      } else {
        importTargetHint.textContent = "未选中自定义包时，只能「新建自定义包」。";
      }
    }
  }

  /**
   * @param {MouseEvent} event
   */
  async function onPackListClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const enable = /** @type {HTMLInputElement | null} */ (target.closest("input[data-enable-id]"));
    if (enable) {
      event.stopPropagation();
      const id = enable.getAttribute("data-enable-id") || "";
      await setPackEnabled(id, enable.checked);
      await refresh();
      toast(enable.checked ? "已启用词库包" : "已停用词库包");
      return;
    }

    if (target.closest("[data-stop]")) return;
    const item = target.closest("[data-pack-id]");
    if (!item) return;
    activePackId = item.getAttribute("data-pack-id");
    renderPackLists();
    renderActivePack();
  }

  builtinList?.addEventListener("click", onPackListClick);
  customList?.addEventListener("click", onPackListClick);
  searchInput.addEventListener("input", () => renderActivePack());

  document.getElementById("btnNew")?.addEventListener("click", async () => {
    const name = window.prompt("新词库名称", "我的补充词库");
    if (name == null) return;
    const lang = window.prompt("语言代码：en / zh / ja / ko / tr", "en") || "en";
    const pack = await createCustomPack({ name, lang: normalizeLexiconLang(lang), entries: [] });
    activePackId = pack.id;
    await refresh();
    toast("已创建自定义词库包");
  });

  document.getElementById("btnImport")?.addEventListener("click", () => {
    syncImportDialogState();
    importDialog?.showModal();
  });

  document.getElementById("importCancel")?.addEventListener("click", () => {
    importDialog?.close();
  });

  importForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const modeInput = /** @type {HTMLInputElement | null} */ (
      importForm.querySelector('input[name="importMode"]:checked')
    );
    pendingImportMode = /** @type {"create" | "merge" | "replace"} */ (modeInput?.value || "create");
    if (pendingImportMode !== "create") {
      const pack = activePack();
      if (!pack || pack.builtin) {
        toast("合并/替换需要先选中左侧自定义包");
        return;
      }
    }
    importDialog?.close();
    fileImport.click();
  });

  fileImport.addEventListener("change", async (event) => {
    const input = /** @type {HTMLInputElement} */ (event.currentTarget);
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const payload = parseImportPayload(json, file.name);
      const mode = pendingImportMode;
      pendingImportMode = "create";

      if (mode === "create") {
        const pack = await createCustomPack(payload);
        activePackId = pack.id;
        await refresh();
        toast(`已新建「${pack.name}」（${LEXICON_LANG_LABELS[pack.lang]}）· ${pack.entries.length} 条`);
        return;
      }

      const pack = activePack();
      if (!pack || pack.builtin) {
        toast("当前不是自定义包，已取消导入");
        return;
      }
      if (payload.lang !== pack.lang) {
        const ok = window.confirm(
          `文件语言是 ${LEXICON_LANG_LABELS[payload.lang]}，当前包是 ${LEXICON_LANG_LABELS[pack.lang]}。仍要写入当前包吗？`,
        );
        if (!ok) return;
      }

      /** @type {LexiconPackEntry[]} */
      const incoming = payload.entries
        .map((row, index) => {
          const item = row && typeof row === "object" ? /** @type {Record<string, unknown>} */ (row) : {};
          return {
            id: String(item.id || "").trim() || `e_${index + 1}`,
            phrase: String(item.phrase || "").trim(),
            meaning: String(item.meaning || ""),
            examples: Array.isArray(item.examples)
              ? item.examples.map((x) => String(x || "").trim()).filter(Boolean)
              : [],
            tags: Array.isArray(item.tags)
              ? item.tags.map((x) => String(x || "").trim()).filter(Boolean)
              : [],
            kind: /** @type {const} */ ("slang"),
          };
        })
        .filter((row) => row.phrase);
      const nextEntries = mode === "replace" ? incoming : mergeEntries(pack.entries, incoming);
      await updateCustomPack(pack.id, nextEntries, {
        name: pack.name,
        lang: pack.lang,
      });
      await refresh();
      const latest = packs.find((row) => row.id === pack.id);
      const count = latest?.entries.length ?? nextEntries.length;
      toast(
        mode === "replace"
          ? `已替换「${pack.name}」为 ${count} 条`
          : `已合并进「${pack.name}」，现共 ${count} 条`,
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "导入失败");
    }
  });

  document.getElementById("btnExport")?.addEventListener("click", () => {
    const pack = activePack();
    if (!pack) {
      toast("请先选择词库包");
      return;
    }
    const payload = {
      name: pack.name,
      lang: pack.lang,
      entries: pack.entries.map((entry) => ({
        id: entry.id,
        phrase: entry.phrase,
        meaning: entry.meaning || "",
        examples: entry.examples || [],
        tags: entry.tags || [],
        kind: entry.kind || "slang",
        weight: entry.weight,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pack.name || "lexicon"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("已导出");
  });

  btnAddEntry.addEventListener("click", () => openEntryDialog(null));

  btnDeletePack.addEventListener("click", async () => {
    const pack = activePack();
    if (!pack || pack.builtin) return;
    if (!window.confirm(`确定删除词库「${pack.name}」？`)) return;
    await deleteCustomPack(pack.id);
    activePackId = null;
    await refresh();
    toast("已删除词库包");
  });

  document.getElementById("btnSavePackMeta")?.addEventListener("click", async () => {
    const pack = activePack();
    if (!pack || pack.builtin || !packNameInput || !packLangSelect) return;
    await updateCustomPack(pack.id, pack.entries, {
      name: packNameInput.value,
      lang: normalizeLexiconLang(packLangSelect.value),
    });
    await refresh();
    toast("包信息已保存");
  });

  entryBody?.addEventListener("click", (event) => {
    const pack = activePack();
    if (!pack || pack.builtin) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const editId = target.getAttribute("data-edit-id");
    if (editId != null && editId !== "") {
      const entry = pack.entries.find((row) => row.id === editId);
      if (entry) openEntryDialog(entry);
      return;
    }
    const removeId = target.getAttribute("data-remove-id");
    if (removeId != null && removeId !== "") {
      void (async () => {
        const next = pack.entries.filter((row) => row.id !== removeId);
        await updateCustomPack(pack.id, next);
        await refresh();
        toast("已删除条目");
      })();
    }
  });

  document.getElementById("entryCancel")?.addEventListener("click", () => {
    entryDialog?.close();
  });

  entryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const pack = activePack();
    if (!pack || pack.builtin || !entryPhrase || !entryMeaning || !entryTags || !entryExamples) return;
    const phrase = entryPhrase.value.trim();
    if (!phrase) return;
    const tags = entryTags.value
      .split(/[,，]/)
      .map((x) => x.trim())
      .filter(Boolean);
    const examples = entryExamples.value
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    const nextEntry = {
      id: editingEntryId || `e_${crypto.randomUUID().slice(0, 8)}`,
      phrase,
      meaning: entryMeaning.value.trim(),
      tags,
      examples,
      kind: /** @type {const} */ ("slang"),
    };
    const next = upsertEntry(pack.entries, nextEntry);
    await updateCustomPack(pack.id, next);
    entryDialog?.close();
    await refresh();
    toast("条目已保存");
  });

  void refresh();
}
