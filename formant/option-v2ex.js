import {
  DEFAULT_V2EX_OPTIONS,
  loadV2exImgurClientId,
  loadV2exOptions,
  normalizeV2exOptions,
  resetV2exOptions,
  saveV2exImgurClientId,
  saveV2exOptions,
  V2EX_IMGUR_CLIENT_ID_KEY,
  V2EX_OPTIONS_KEY,
} from "./v2ex-options.js";

/**
 * @typedef {{ toast: (text: string) => void }} PanelApi
 */

const GROUPS = [
  {
    title: "签到",
    fields: [
      ["checkin", "自动签到", "每 5 分钟检查一次；成功后当天不再重复签到", "checkbox"],
    ],
  },
  {
    title: "提醒",
    fields: [
      ["msgNote", "消息提醒", "每 3 分钟检查 V2EX 未读消息并更新扩展角标", "checkbox"],
      ["chickinNote", "签到成功提醒", "自动签到成功后显示浏览器通知", "checkbox"],
    ],
  },
  {
    title: "浏览",
    fields: [
      ["preview", "主题预览", "在主题列表中原地展开主题正文", "checkbox"],
      ["ignore", "主题忽略", "在主题列表中加入忽略操作", "checkbox"],
      ["fold", "自动折叠", "折叠超长主题正文与回复，点击回复体展开/收起", "checkbox"],
      ["jump", "跳过主题", "浏览主题翻页时直接跳到回复区", "checkbox"],
      ["newWindow", "新标签页浏览主题", "列表中的主题链接默认在新标签页打开", "checkbox"],
    ],
  },
  {
    title: "回复",
    fields: [
      ["replyUserNum", "回复楼层号", "回复时自动附加对方楼层号", "checkbox"],
      ["relateReply", "快速查看相关回复", "悬停 @ 用户查看其最近相关回复", "checkbox"],
      ["nestedComment", "楼中楼模式", "先并发拉齐评论分页（最多 100 页、4 路）再按 @ / #楼层 组树；跨页回复才会进同一棵树", "checkbox"],
      ["opReplyBg", "楼主回复背景", "默认关闭；打开后给带 OP 标记的回复铺背景", "checkbox"],
      ["replyColor", "楼主回复背景色", "需先开启「楼主回复背景」", "color"],
      ["replyA", "楼主回复背景透明度", "0 到 1", "range"],
      ["imageParsing", "图片解析", "将常见图片链接展开为图片预览", "checkbox"],
      ["thankColor", "感谢爱心颜色", "设置感谢区域的强调色", "color"],
      ["weekNewuser", "淡化新用户", "淡化最近一个月注册用户的回复", "checkbox"],
    ],
  },
  {
    title: "其他",
    fields: [
      ["vDaily", "启用 vDaily", "展示推荐主题/回复，并在浏览主题时提交公开主题数据", "checkbox"],
      ["userinfo", "快速查看用户信息", "悬停头像显示资料、关注、屏蔽与标记操作", "checkbox"],
      ["markColor", "标记用户颜色", "设置被标记用户头像框颜色", "color"],
      ["sov2ex", "使用 sov2ex 搜索", "替换 V2EX 页面内置搜索入口", "checkbox"],
      ["sov2exMenu", "右键 sov2ex 搜索", "选中文字后显示 sov2ex 右键菜单", "checkbox"],
      ["searchShortcut", "开启搜索快捷键", "按 / 聚焦 V2EX 搜索框", "checkbox"],
      ["dblclickToTop", "双击返回顶部", "双击页面空白区域平滑回到顶部", "checkbox"],
      ["base64", "Base64 解码", "选中 Base64 文本后显示可复制的解码结果", "checkbox"],
    ],
  },
];

/**
 * @param {string} name
 * @param {string} label
 * @param {string} hint
 * @param {"checkbox" | "color" | "range"} kind
 * @param {Record<string, any>} options
 */
function createSetting(name, label, hint, kind, options) {
  const row = document.createElement("label");
  row.className = "feature-row v2ex-setting";
  const copy = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = label;
  const description = document.createElement("small");
  description.textContent = hint;
  copy.append(title, description);

  const input = /** @type {HTMLInputElement} */ (document.createElement("input"));
  input.name = name;
  input.dataset.v2exOption = "true";
  input.type = kind;
  if (kind === "checkbox") {
    input.checked = Boolean(options[name]);
  } else if (kind === "color") {
    input.value = String(options[name]);
  } else {
    input.min = "0";
    input.max = "1";
    input.step = "0.05";
    input.value = String(options[name]);
    input.setAttribute("aria-label", label);
    const value = document.createElement("output");
    value.className = "v2ex-range-value";
    value.htmlFor = name;
    value.textContent = Number(options[name]).toFixed(2);
    row.append(copy, input, value);
    return row;
  }
  row.append(copy, input);
  return row;
}

/**
 * @param {string} source
 * @param {string} identifier
 */
function idsFromV2exPage(source, identifier) {
  const match = source.match(new RegExp(`\\b${identifier}\\s*=\\s*\\[([^\\]]*)\\]`));
  return match?.[1]?.match(/\d+/g) || [];
}

/**
 * @param {string} url
 */
async function fetchJson(url) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/**
 * @param {string} value
 */
function v2exUrl(value) {
  try {
    return new URL(value, "https://www.v2ex.com/").href;
  } catch {
    return "https://www.v2ex.com/";
  }
}

/**
 * @param {PanelApi} api
 */
export function initV2exPanel(api) {
  const { toast } = api;
  const form = document.getElementById("v2exSettings");
  const stateEl = document.getElementById("v2exState");
  const management = document.getElementById("v2exManagement");
  const checkinBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("v2exCheckinNow"));
  const resetBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("v2exReset"));
  const stylesBtn = document.getElementById("v2exStyles");
  const shortcutsBtn = document.getElementById("v2exShortcuts");
  const imgurInput = /** @type {HTMLInputElement | null} */ (document.getElementById("v2exImgurClientId"));
  const imgurSaveBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("v2exImgurSave"));
  const imgurMeta = document.getElementById("v2exImgurMeta");
  if (!form || !stateEl || !management) return;

  /** @type {Record<string, any>} */
  let options = { ...DEFAULT_V2EX_OPTIONS, userMarkList: [] };
  let activeManager = "marks";

  function renderSettings() {
    form.replaceChildren();
    for (const group of GROUPS) {
      const card = document.createElement("section");
      card.className = "settings-card";
      const heading = document.createElement("h3");
      heading.textContent = group.title;
      card.append(heading);
      for (const [name, label, hint, kind] of group.fields) {
        card.append(createSetting(name, label, hint, /** @type {any} */ (kind), options));
      }
      form.append(card);
    }
  }

  async function removeMarkedUser(username) {
    options.userMarkList = options.userMarkList.filter((item) => item !== username);
    options = await saveV2exOptions(options);
    renderSettings();
    await renderManagement();
    toast("已取消标记用户");
  }

  function makeManagerTabs() {
    const tabs = document.createElement("div");
    tabs.className = "v2ex-manager-tabs";
    for (const [id, label] of [
      ["marks", "标记用户"],
      ["blocked", "屏蔽用户"],
      ["ignored", "忽略主题"],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = id === activeManager ? "btn btn--ghost is-active" : "btn btn--ghost";
      button.textContent = label;
      button.addEventListener("click", () => {
        activeManager = id;
        void renderManagement();
      });
      tabs.append(button);
    }
    return tabs;
  }

  function makeEmpty(text) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = text;
    return empty;
  }

  async function renderMarkedUsers(list) {
    if (!list.length) return makeEmpty("暂无标记用户。");
    const wrapper = document.createElement("div");
    wrapper.className = "v2ex-manager-list";
    for (const username of list) {
      const row = document.createElement("div");
      row.className = "v2ex-manager-row";
      const link = document.createElement("a");
      link.href = `https://www.v2ex.com/member/${encodeURIComponent(username)}`;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = username;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn--ghost";
      remove.textContent = "取消标记";
      remove.addEventListener("click", () => void removeMarkedUser(username));
      row.append(link, remove);
      wrapper.append(row);
    }
    return wrapper;
  }

  async function renderRemoteList(kind) {
    const identifier = kind === "blocked" ? "blocked" : "ignored_topics";
    const label = kind === "blocked" ? "屏蔽用户" : "忽略主题";
    try {
      const response = await fetch("https://www.v2ex.com/", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const ids = idsFromV2exPage(await response.text(), identifier);
      if (!ids.length) return makeEmpty(`暂无${label}。请确认已登录 V2EX。`);

      const wrapper = document.createElement("div");
      wrapper.className = "v2ex-manager-list";
      const rows = await Promise.all(
        ids.map(async (id) => {
          try {
            if (kind === "blocked") {
              const user = await fetchJson(`https://www.v2ex.com/api/members/show.json?id=${id}`);
              return {
                text: user?.username || `用户 #${id}`,
                href: v2exUrl(user?.url || `/member/${id}`),
              };
            }
            const topics = await fetchJson(`https://www.v2ex.com/api/topics/show.json?id=${id}`);
            const topic = Array.isArray(topics) ? topics[0] : null;
            return {
              text: topic?.title || `主题 #${id}`,
              href: v2exUrl(topic?.url || `/t/${id}`),
            };
          } catch {
            return { text: `${label} #${id}`, href: "https://www.v2ex.com/" };
          }
        }),
      );
      for (const item of rows) {
        const row = document.createElement("div");
        row.className = "v2ex-manager-row";
        const link = document.createElement("a");
        link.href = item.href;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.textContent = item.text;
        row.append(link);
        wrapper.append(row);
      }
      return wrapper;
    } catch (error) {
      return makeEmpty(`读取${label}失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function renderManagement() {
    management.replaceChildren(makeManagerTabs(), makeEmpty("加载中…"));
    const content =
      activeManager === "marks"
        ? await renderMarkedUsers(options.userMarkList)
        : await renderRemoteList(activeManager);
    management.replaceChildren(makeManagerTabs(), content);
  }

  async function hydrate() {
    const [loadedOptions, imgurClientId] = await Promise.all([
      loadV2exOptions(),
      loadV2exImgurClientId(),
    ]);
    options = loadedOptions;
    renderSettings();
    if (imgurInput) imgurInput.value = imgurClientId;
    if (imgurMeta) {
      imgurMeta.textContent = imgurClientId
        ? "已保存本机 Imgur Client ID；刷新 V2EX 页面后可上传。"
        : "未保存 Imgur Client ID；图片上传按钮会提示你先配置。";
    }
    stateEl.textContent = "已加载 V2EX Plus 兼容设置；页面增强在刷新 V2EX 页面后生效。";
    await renderManagement();
  }

  form.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.v2exOption) return;
    const key = input.name;
    const value =
      input.type === "checkbox" ? input.checked : input.type === "range" ? Number(input.value) : input.value;
    options[key] = value;
    if (input.type === "range") {
      const output = input.parentElement?.querySelector("output");
      if (output) output.textContent = Number(value).toFixed(2);
    }
    void saveV2exOptions(options)
      .then((next) => {
        options = next;
        toast("V2EX 设置已保存");
      })
      .catch((error) => toast(error instanceof Error ? error.message : String(error)));
  });

  checkinBtn?.addEventListener("click", async () => {
    checkinBtn.disabled = true;
    stateEl.textContent = "正在执行 V2EX 签到…";
    try {
      const response = await chrome.runtime.sendMessage({ type: "V2EX_CHECKIN_NOW" });
      if (!response?.ok) throw new Error(response?.error || "签到失败");
      stateEl.textContent = response.result?.message || "签到完成";
      toast(stateEl.textContent);
    } catch (error) {
      stateEl.textContent = error instanceof Error ? error.message : String(error);
      toast(stateEl.textContent);
    } finally {
      checkinBtn.disabled = false;
    }
  });

  resetBtn?.addEventListener("click", async () => {
    if (!window.confirm("确定恢复 V2EX Plus 的全部默认设置吗？")) return;
    options = await resetV2exOptions();
    renderSettings();
    await renderManagement();
    toast("已恢复 V2EX Plus 默认设置");
  });

  stylesBtn?.addEventListener("click", () => {
    void chrome.tabs.create({ url: "https://vdaily.huguotao.com/store" });
  });
  shortcutsBtn?.addEventListener("click", () => {
    void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });
  imgurSaveBtn?.addEventListener("click", async () => {
    imgurSaveBtn.disabled = true;
    try {
      const saved = await saveV2exImgurClientId(imgurInput?.value);
      if (imgurInput) imgurInput.value = saved;
      if (imgurMeta) {
        imgurMeta.textContent = saved
          ? "已保存本机 Imgur Client ID；刷新 V2EX 页面后可上传。"
          : "已清除 Imgur Client ID。";
      }
      toast(saved ? "已保存 Imgur Client ID" : "已清除 Imgur Client ID");
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    } finally {
      imgurSaveBtn.disabled = false;
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes[V2EX_OPTIONS_KEY]) return;
    const beforeMarks = options.userMarkList.join("\u0000");
    options = normalizeV2exOptions(changes[V2EX_OPTIONS_KEY].newValue);
    renderSettings();
    if (activeManager === "marks" || beforeMarks !== options.userMarkList.join("\u0000")) {
      void renderManagement();
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[V2EX_IMGUR_CLIENT_ID_KEY]) return;
    const next = String(changes[V2EX_IMGUR_CLIENT_ID_KEY].newValue || "");
    if (imgurInput && document.activeElement !== imgurInput) imgurInput.value = next;
    if (imgurMeta) {
      imgurMeta.textContent = next
        ? "已保存本机 Imgur Client ID；刷新 V2EX 页面后可上传。"
        : "未保存 Imgur Client ID；图片上传按钮会提示你先配置。";
    }
  });

  void hydrate();
}
