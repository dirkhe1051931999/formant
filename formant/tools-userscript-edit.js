import { must, toast } from "./tools-dom.js";
import { NEW_TEMPLATE, usSend, userscriptHref } from "./tools-userscript-lib.js";

/**
 * @param {HTMLElement} root
 * @param {{ view: string, id: string }} opt
 */
export async function mountUserscriptEdit(root, opt) {
  let source = NEW_TEMPLATE;
  let scriptId = opt.id || "";
  let installUrl = "";

  if (opt.view === "edit" && opt.id) {
    const res = await usSend("FORMANT_US_GET", { id: opt.id });
    if (!res.script) throw new Error("脚本不存在");
    source = res.script.source;
    installUrl = res.script.installUrl || "";
  }

  root.innerHTML = `
    <section class="tl-card">
      <div class="tl-row">
        <button type="button" class="tl-btn" data-save>保存</button>
        <button type="button" class="tl-btn tl-btn--ghost" data-file>选文件</button>
        <button type="button" class="tl-btn tl-btn--ghost" ${opt.view === "edit" ? "" : "hidden"} data-update>检查更新</button>
        <input class="tl-input tl-input--grow" data-url placeholder="从 http(s) .user.js 地址导入" ${opt.view === "import" ? "" : "hidden"} />
        <button type="button" class="tl-btn tl-btn--ghost" data-pull ${opt.view === "import" ? "" : "hidden"}>拉取</button>
        <span class="tl-meta" data-hint></span>
      </div>
      <input type="file" accept=".js,.user.js,text/plain" data-pick hidden />
      <span class="tl-label">脚本源码</span>
      <textarea class="tl-textarea us-editor" data-src spellcheck="false"></textarea>
    </section>
  `;

  const src = /** @type {HTMLTextAreaElement} */ (must("[data-src]", root));
  const urlEl = /** @type {HTMLInputElement} */ (must("[data-url]", root));
  const hint = must("[data-hint]", root);
  const pick = /** @type {HTMLInputElement} */ (must("[data-pick]", root));
  src.value = source;
  urlEl.value = installUrl;

  async function save() {
    const text = src.value;
    const res = await usSend("FORMANT_US_SAVE", {
      source: text,
      id: scriptId || undefined,
      installUrl: urlEl.value.trim() || undefined,
    });
    scriptId = res.script?.id || scriptId;
    toast("已保存，已打开的页面请刷新");
    location.hash = userscriptHref("list");
  }

  async function pull() {
    const url = urlEl.value.trim();
    if (!url) {
      toast("请填写脚本地址", true);
      return;
    }
    hint.textContent = "拉取中…";
    const res = await usSend("FORMANT_US_FETCH", { url });
    src.value = res.source || "";
    installUrl = url;
    hint.textContent = "已拉取，确认后保存";
  }

  root.addEventListener("click", (event) => {
    const btn = event.target instanceof HTMLElement ? event.target.closest("button") : null;
    if (!btn) return;
    if (btn.matches("[data-save]")) {
      void save().catch((error) => toast(error instanceof Error ? error.message : String(error), true));
      return;
    }
    if (btn.matches("[data-file]")) {
      pick.click();
      return;
    }
    if (btn.matches("[data-pull]")) {
      void pull().catch((error) => {
        hint.textContent = "";
        toast(error instanceof Error ? error.message : String(error), true);
      });
      return;
    }
    if (btn.matches("[data-update]")) {
      hint.textContent = "检查中…";
      void usSend("FORMANT_US_UPDATE", { id: scriptId })
        .then((res) => {
          if (res.newer) {
            src.value = res.source || src.value;
            hint.textContent = `有新版本 ${res.version}，已填入，请保存`;
            toast("发现更新");
          } else {
            hint.textContent = `已是最新（${res.version || "当前"}）`;
            toast("没有更新");
          }
        })
        .catch((error) => {
          hint.textContent = "";
          toast(error instanceof Error ? error.message : String(error), true);
        });
    }
  });

  pick.addEventListener("change", () => {
    const file = pick.files && pick.files[0];
    pick.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      src.value = String(reader.result || "");
      hint.textContent = file.name;
    };
    reader.onerror = () => toast("读取文件失败", true);
    reader.readAsText(file, "utf-8");
  });
}
