import { FEATURES_KEY, isHlsEnabled, loadFeatures } from "./features.js";
import {
  HLS_SOURCES_MAX,
  feedName,
  hlsPlayerPageUrl,
  loadSourceStore,
  rememberFeed,
  saveSourceStore,
  setDefaultFeed,
} from "./hls/sources-store.js";
import { must, toast } from "./tools-dom.js";

/**
 * @param {HTMLElement} root
 */
export function mount(root) {
  root.innerHTML = `
    <header class="tl-head">
      <div>
        <h2>HLS</h2>
      </div>
      <div class="tl-row">
        <button type="button" class="tl-btn" data-play-default>打开播放</button>
      </div>
    </header>
    <section class="tl-card">
      <p class="tl-note" data-state>加载中…</p>
      <form class="hls-form" data-form>
        <span class="tl-label">名称（可选）</span>
        <input class="tl-input" data-name type="text" maxlength="40" placeholder="央视频道" />
        <span class="tl-label">地址</span>
        <div class="tl-row">
          <input class="tl-input tl-input--grow" data-url type="url" spellcheck="false" placeholder="https://example.com/tv.m3u" />
          <button type="submit" class="tl-btn">添加源</button>
        </div>
      </form>
      <p class="tl-note">保存 m3u / txt 到本机（formantHlsSources），不同步 mono。开关在设置 → 功能。</p>
      <div class="hls-feeds" data-list></div>
    </section>
  `;

  const form = /** @type {HTMLFormElement} */ (must("[data-form]", root));
  const nameEl = /** @type {HTMLInputElement} */ (must("[data-name]", root));
  const urlEl = /** @type {HTMLInputElement} */ (must("[data-url]", root));
  const listEl = must("[data-list]", root);
  const stateEl = must("[data-state]", root);
  const playBtn = /** @type {HTMLButtonElement} */ (must("[data-play-default]", root));

  /**
   * @param {string} url
   */
  async function openPlayer(url) {
    const features = await loadFeatures();
    if (!isHlsEnabled(features)) {
      toast("请先在设置 → 功能 里打开 HLS 播放");
      return;
    }
    await chrome.tabs.create({ url: hlsPlayerPageUrl(url) });
  }

  async function paint() {
    const [store, features] = await Promise.all([loadSourceStore(), loadFeatures()]);
    const on = isHlsEnabled(features);
    stateEl.textContent = on
      ? `已保存 ${store.items.length} / ${HLS_SOURCES_MAX} 条`
      : "HLS 播放已关闭，打开后才能播放这些源";
    playBtn.disabled = !on || store.items.length === 0;
    listEl.replaceChildren();
    if (!store.items.length) {
      const empty = document.createElement("p");
      empty.className = "tl-note";
      empty.textContent = "还没有列表源。添加一条 m3u / txt 地址后点播放。";
      listEl.appendChild(empty);
      return;
    }
    for (const item of store.items) {
      const row = document.createElement("div");
      row.className = "hls-feed";
      if (item.id === store.defaultId || item.url === store.defaultId) row.classList.add("is-active");
      const main = document.createElement("button");
      main.type = "button";
      main.className = "hls-feed__main";
      const strong = document.createElement("strong");
      strong.textContent = item.name || feedName(item.url);
      const small = document.createElement("small");
      small.textContent = item.url;
      main.append(strong, small);
      main.title = "设为默认并播放";
      main.addEventListener("click", async () => {
        await setDefaultFeed(item.id);
        await openPlayer(item.url);
        void paint();
      });
      const actions = document.createElement("div");
      actions.className = "hls-feed__actions";
      const play = document.createElement("button");
      play.type = "button";
      play.className = "tl-btn";
      play.textContent = "播放";
      play.disabled = !on;
      play.addEventListener("click", () => {
        void openPlayer(item.url);
      });
      const makeDefault = document.createElement("button");
      makeDefault.type = "button";
      makeDefault.className = "tl-btn tl-btn--ghost";
      makeDefault.textContent = "默认";
      makeDefault.disabled = item.id === store.defaultId || item.url === store.defaultId;
      makeDefault.addEventListener("click", async () => {
        await setDefaultFeed(item.id);
        toast("已设为默认源");
        void paint();
      });
      const del = document.createElement("button");
      del.type = "button";
      del.className = "tl-btn tl-btn--ghost";
      del.textContent = "删除";
      del.addEventListener("click", async () => {
        const next = await loadSourceStore();
        next.items = next.items.filter((feed) => feed.url !== item.url);
        await saveSourceStore(next);
        toast("已删除");
        void paint();
      });
      actions.append(play, makeDefault, del);
      row.append(main, actions);
      listEl.appendChild(row);
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = urlEl.value.trim();
    if (!/^https?:\/\//i.test(url)) {
      toast("请填写 http(s) 地址");
      return;
    }
    const store = await loadSourceStore();
    if (store.items.length >= HLS_SOURCES_MAX && !store.items.some((item) => item.url === url)) {
      toast(`最多 ${HLS_SOURCES_MAX} 条`);
      return;
    }
    await rememberFeed(url, nameEl.value.trim());
    nameEl.value = "";
    urlEl.value = "";
    toast("已保存到本机");
    void paint();
  });

  playBtn.addEventListener("click", async () => {
    const store = await loadSourceStore();
    const current =
      store.items.find((item) => item.id === store.defaultId || item.url === store.defaultId) || store.items[0];
    if (!current) {
      toast("先添加一条列表源");
      return;
    }
    await openPlayer(current.url);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.formantHlsSources || changes[FEATURES_KEY]) void paint();
  });

  void paint();
}
