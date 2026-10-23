# 更改记录

2026-08-12 10:35:00

1. 接入多语言俚语词库（en / zh / ja / ko / tr 各约 100 条），并入智能翻译打分。
2. 土耳其语补充变音字符嗅探与 ASCII 俚语命中后的主语言校正。

2026-08-12 10:40:00

1. 翻译结果卡补齐发音按钮；输入与结果共用 TTS（Google TTS + speechSynthesis 回退）。
2. 发音中为喇叭增加 `is-speaking` 脉冲与声波动画（含 reduced-motion 降级）。

2026-08-12 10:48:00

1. mono 新增百度翻译通道：`formant.translate.baidu_app_id` / `baidu_secret`，`POST /client/newtab/translate/baidu`。
2. formant 增加百度结果卡；自动/Google 模式下 Google 失败后兜底百度；「全部」三路并行。

2026-08-12 11:05:00

1. 图片右键菜单「formant 图片另存为」→ PNG / JPG（OffscreenCanvas 转码 + downloads）。
2. manifest 增加 `downloads` 权限，版本至 1.3.2。

2026-08-12 11:12:00

1. 词库包插件化：`lexicon-runtime` 合并内置包与 `chrome.storage` 自定义包；打分改为读 runtime 缓存。
2. 新增 `option.html` 管理页（`options_ui` open_in_tab）；支持启用开关、新建/导入/导出/编辑自定义包。
3. popup 设置增加「词库管理」入口；版本至 1.4.0。

2026-08-12 11:13:17

1. 参照 mono 规范，为 formant 仓库补充 `AGENTS.md`、`DESIGN.md`、`LOGS.md`、`README.md`。
2. AGENTS 约束扩展目录边界、UTF-8 日志追加、MV3/密钥/词库与文件拆分规则；DESIGN 记录扩展蓝灰工具向视觉语言。

2026-08-12 11:16:17

1. 词库「导入 JSON」增加说明与方式选择：单语言文件；新建（默认）/ 合并到当前自定义包 / 替换当前自定义包条目；明确不改写内置包。
2. popup 标题旁显示扩展版本号（`v` + manifest.version）。

2026-08-12 11:18:46

1. `option.html` 改为通用扩展设置壳：左侧导航（概览 / 词库，预留翻译·同步），`#hash` 切换面板。
2. 词库逻辑拆到 `option-lexicon.js`；popup「词库管理」改为「扩展设置」。

2026-08-12 11:23:24

1. 扩展设置开放「翻译」「同步」面板：`option-translate.js` / `option-sync.js`，概览卡片可直达。
2. 翻译默认模式与目标语言持久化（`translateMode` / `translateTarget`），popup 与划词共用。
3. 同步面板复用 `sync.js`：环境 / Base URL / Client Key、保存与立即同步。

2026-08-12 11:26:25

1. popup 齿轮改为直接打开 `option.html#sync`；移除 popup 内 mono 连接表单。
2. 书签页「同步」改用已保存设置；未配置时提示前往扩展设置。

2026-08-12 11:30:21

1. 新增功能开关（`features.js` / `option.html#features`）：翻译总开关 + 弹窗/划词/右键；New Tab；图片另存为 PNG/JPG。
2. background 按开关重建右键菜单；划词与 popup 读取开关；New Tab 经 `newtab-entry.js` 关闭时跳转默认页。
3. 版本至 1.4.1。

2026-08-12 11:49:08

1. 整合 V2EX Plus 2.1.3 衍生模块：自动签到、未读 badge、V2EX 页面增强、sov2ex 菜单与微博图 referer 规则；保留 formant popup 图标入口且不替换图标。
2. 新增 `option.html#v2ex`，完整兼容上游 `chrome.storage.sync.options` 字段、默认值、样式商城/快捷键入口、标记用户/屏蔽用户/忽略主题管理及重置。
3. 功能开关新增 `features.v2ex.enabled`，关闭时停 alarms、badge、DNR、内容脚本增强与相关右键菜单；manifest 增加 `alarms`、`notifications`、`declarativeNetRequest` 和所需 host pattern。
4. 增加 GPLv3 `LICENSE`、V2EX Plus `COPYING`/`NOTICE` 与 README/AGENTS 许可及权限说明；版本至 1.5.0。

2026-08-12 11:51:16

1. Imgur 上传改为仅使用用户在 `option.html#v2ex` 填写的本机 Client ID，移除扩展包内的第三方 Client ID；该值不进入 V2EX sync schema。

2026-08-12 11:51:38

1. README 增加 V2EX 重载、签到、badge、页面增强/菜单共存与总开关的冒烟清单。

2026-08-12 11:54:01

1. V2EX 预览、相关回复、楼中楼和用户卡改为安全 DOM/净化片段，避免把远端 HTML 直接作为扩展注入内容执行。
2. formant 右键菜单重建串行化，保证翻译、图片另存为与 `formant.v2ex.sov2ex` 在快速改开关时最终一致。

2026-08-12 12:45:12

1. 整合 GitZip for github 1.0.5 的公开仓库下载能力：支持文件、目录、多选和整仓下载；匿名 GitHub API 配合浏览器原生 ZIP/download 运行时，不保存 PAT、不接入 OAuth、gitzip.org 回调或 token 同步。
2. 新增 `features.gitzip.enabled`、`option.html#gitzip` 选择方式/主题设置、GitHub scoped 内容脚本和 Shadow DOM 进度面板；版本提升至 1.6.0。
3. 右键菜单统一纳入 `ensureContextMenus()`，按 formant 自有 ID 选择性重建，保留翻译、图片另存为、V2EX sov2ex 与 formant popup，不再调用 `chrome.contextMenus.removeAll()`。
4. 补充 GitZip MIT、JSZip/Pako/FileSaver 上游 notices、README/AGENTS/DESIGN 说明，并完成 manifest 与脚本语法校验。

2026-08-12 12:46:11

1. GitHub 分支选择器兼容补充包含选择器自身，配合公开 branches API 保持带 `/` 分支名的解析回退。

2026-08-12 12:50:00

1. 修复新版 GitHub 同时渲染小屏/大屏文件链接时，GitZip 选择标记被插入隐藏小屏单元格的问题；现优先绑定可见链接，并在窗口尺寸切换时重新定位。
2. 实测 GitZip 上游仓库目录页的可见大屏文件/目录单元格可被选择器命中；选中任一项后右下角 Shadow DOM 下载面板显示。

2026-08-12 13:45:00

1. GitZip 悬浮下载面板改为接收并渲染已选文件/目录列表；保留下载过程日志，避免「已选 N 项」但正文空白。

2026-08-12 13:52:00

1. New Tab 的外观、天气城市和主页同步管理迁移到 `option.html#newtab`；齿轮通过运行时扩展 URL 打开该面板，不再保留主页内侧滑设置表单。
2. New Tab 右上刷新、同步改为文字按钮，并增加短状态反馈；刷新拉取主页及卡片数据，同步将本机主页推送到 mono。
3. 保存 New Tab 设置后通过 local storage 通知已打开的新标签页刷新外观；版本提升至 1.6.1。

2026-08-12 14:03:00

1. 整合 AutoPagerize 0.3.9（swdyh）自动翻页能力：滚动到底部自动加载下一页并插入当前页面；核心 XPath/滚动/DOM 插入逻辑保留 GPL 许可，扩展抽象层 MIT。
2. 内置约 2400 条站点规则（由上游 JSONP 转为纯 JSON），移除 wedata.net 自动更新；支持 microformat（`rel="next"`、`autopagerize_*` class）。
3. 新增 `features.autopagerize.enabled`、`option.html#autopagerize`（排除 URL、状态条开关）、`autopagerize-bridge.js`（siteinfo 存储、跨域 fetch、设置广播）；状态条使用 Shadow DOM。
4. manifest 增加 `autopagerize/content/*` 内容脚本（`http://*/*` + `https://*/*`，`all_frames: false`）和 `web_accessible_resources`（siteinfo.json）；版本提升至 1.7.0。

2026-08-12 14:20:00

1. 修复 Google 搜索不自动翻页：上游 wedata 规则仍指向旧 `id("nav")`/`id("nn")` DOM，现增加优先内置规则并更新 siteinfo 中 Google/Bing 条目（`#pnnext`、`#rso` 等）。
2. 同域下一页改由 content script 带 cookie 拉取，避免 background fetch 拿到同意页/空壳 HTML；跨域仍走 SW。
3. 修正 customSiteinfo 启动列表被错误展开、AutoPager 构造失败仍占用 `env.ap` 的问题；siteinfo storage 增加版本号以便规则更新后刷新缓存；版本提升至 1.7.1。

2026-08-12 14:28:00

1. 修复 AutoPagerize 红条 `Error!`：DOMParser 文档带 XHTML 命名空间时旧 XPath 前缀逻辑会抛错；HTML 文档改为直接 evaluate。
2. 放宽 Google/Bing 跨 TLD（如 google.com ↔ google.com.hk）同站判定；插入点丢失时重新定位；状态条展示具体失败原因便于排查；版本提升至 1.7.2。

2026-08-12 14:30:00

1. 修复 AutoPagerize 在 Chromium 上报 `MutationEvent is invalid`：插入节点改派发 `CustomEvent("AutoPagerize_DOMNodeInserted")`，页面加载完成改用 `Event` 构造函数；版本提升至 1.7.3。

2026-08-12 14:32:00

1. 加快 AutoPagerize 触底响应：去掉初始化时预置的 2s 冷却（此前滚到底也要等满间隔才 Loading）；请求节流改为只等待剩余时间，间隔降至 800ms，并提前约一屏触发预取；版本提升至 1.7.4。

2026-08-12 14:40:00

1. V2EX 楼中楼改为常驻显示：默认最多展示 5 条会话回复，超出显示「查看更多」，展开后可「收起」；仅收录当前楼层及之前的相关回复。
2. 设置面板去掉「楼中楼自动展开」（悬停展开已废弃）；保留 `autoNestedComment` 存储字段兼容上游；版本提升至 1.7.5。
3. README 明确自动签到依赖浏览器运行：关机/未开浏览器时不会签到，下次启动后再补当天。

2026-08-12 14:42:00

1. 修复 V2EX「相关回复」悬浮卡：原先链接与弹层共用 `data-formant-v2ex-related`，关闭时 `querySelector` 误删 `@用户名` 链接（只剩 `@`），弹层也无法消失；现改为独立 card 标记，并支持移入弹层不闪退；版本提升至 1.7.6。

2026-08-12 14:45:00

1. 修复 V2EX 用户信息卡偶现 unhover 不消失：异步拉资料返回后若鼠标已离开仍会插入卡片；去掉不可靠的 `:hover[data-…]` 判断，改为请求 token 丢弃过期结果，并在卡片上正确 cancel/schedule hide；版本提升至 1.7.7。

2026-08-12 14:55:00

1. New Tab 天气后台定时刷新：`chrome.alarms` 每 10 分钟仅调用天气接口（不碰汇率/节假日/主页），结果写入 `newtabCacheWeather` + `newtabCacheWeatherAt`。
2. 天气卡片展示「刚刚更新 / N 分钟前更新」；打开的 New Tab 每分钟刷新相对时间文案，storage 变更时自动重绘；版本提升至 1.7.8。

2026-08-12 14:58:00

1. 修复天气「N 分钟前」不显示：旧缓存只有天气数据没有 `weatherAt`；加载时回退/回填 `widgetsAt`，并把时间文案嵌到「城市 · 天气」同一行；版本提升至 1.7.9。

2026-08-12 15:10:00

1. 新增轻量代理：`chrome.proxy` 支持直连 / 系统代理 / 最多 5 条固定 HTTP·HTTPS·SOCKS；配置 `formantProxy`，总开关 `features.proxy.enabled`。
2. `option.html#proxy` 管理配置；popup 顶部快捷切换，保留 formant `default_popup`；未嵌入 SwitchyOmega 源码（仅概念参考）。
3. manifest 增加 `proxy` 权限，版本提升至 1.8.0；同步 README / AGENTS / 冒烟清单。

2026-08-12 15:20:00

1. 新增轻量扩展管理：`chrome.management` 列出/搜索/启用禁用其它扩展；总开关 `features.extensions.enabled`；入口仅 `option.html#extensions`（popup 不放列表）。
2. 新增 `extensions-manager.js`、`option-extensions.js`；排除 formant 自身与主题类；未嵌入「扩展管理器」源码（仅概念参考）。
3. manifest 增加 `management` 权限，版本提升至 1.8.1；同步 README / AGENTS / 冒烟清单。

2026-08-12 15:25:00

1. 代理默认改为系统代理；固定代理默认端口改为 7890。
2. 支持 PAC：可填 URL、粘贴脚本或导入 `.pac` 文件；`chrome.proxy` 应用 `pac_script`（本地内容优先于 URL）。
3. 版本提升至 1.8.2；同步 README / AGENTS / 冒烟清单。

2026-08-12 15:30:00

1. 修复 popup 翻译结果区内容过长被裁切且无法滚动：Chrome popup 在仅有 `max-height` + `overflow:hidden` 时结果区拿不到明确高度上限。
2. 结果列表 `.tr-cards` 与单卡 `.tr-card__body` 增加 `max-height` + `overflow-y:auto`；`body` 改为可纵向滚动；版本提升至 1.8.3。

2026-08-12 15:35:00

1. 调整 popup 垂直比例：输入区压到默认约 72px、上限 96px（去掉 `field-sizing: content` 抢高），结果区 `min-height: 280px` / `max-height: 420px`。
2. 去掉单卡正文矮上限，改由结果列表统一滚动，避免多引擎结果各自挤出小滚动条；版本提升至 1.8.4。

2026-08-12 15:40:00

1. popup 改为固定高度 560px + flex：输入区固定约 64px（框内滚动），结果区 `flex:1` 占满剩余高度并可滚动，避免长译文只露出开头几行。
2. Google 直连改 POST，降低长文本被 URL 截断风险；mono GPT 增加 `max_tokens: 4096` 并要求完整翻译、保留段落；版本提升至 1.8.5。

2026-08-12 15:50:00

1. 新增轻量站点数据提取：popup 二级视图读取当前页 Cookie / localStorage / sessionStorage；列表与原始视图、单条/全部复制；总开关 `features.siteData.enabled`。
2. 新增 `site-data.js`、`popup-site-data.js`；书签逻辑拆至 `popup-bookmarks.js` 以控制单文件行数；未嵌入「Cookie和Storage提取器」源码。
3. manifest 增加 `cookies` 权限，版本提升至 1.8.6；同步 README / AGENTS / 冒烟清单。

2026-08-12 16:00:00

1. 重做站点数据 popup：单壳布局（一套工具条 + 一块结果区），Tab 只切换数据源，避免三套面板因 `display:flex` 盖掉 `hidden` 同时占高互相挤压。
2. 修复从 popup 取当前标签：改用 `lastFocusedWindow`，消除 `Cannot read properties of undefined`；AGENTS 增补 popup 固定高度与布局硬性规则；版本提升至 1.8.7。

2026-08-12 16:05:00

1. Cookie 改为经 background `SITE_DATA_COOKIES` 读取，避免 popup 里 `chrome.cookies` 为 undefined 导致 `getAll` 报错。
2. 站点数据 header 压成单行（返回 + 标题 + origin），腾出结果区高度；AGENTS 补充 Cookie 走 SW 的约定；版本提升至 1.8.8。

2026-08-12 16:10:00

1. 站点数据支持单条删除：Cookie 经 `SITE_DATA_COOKIE_REMOVE`，Storage 经页面注入 `removeItem`；删除前确认。
2. 列表操作改为图标按钮（复制 / 删除 SVG）；Storage 仍保留「键」「值」快捷复制；版本提升至 1.8.9。

2026-08-12 16:15:00

1. 修复「读取 Cookie 失败」笼统报错：后台无响应时明确提示需重载扩展；Cookie 读取改用 callback API，并合并 url/domain 结果。
2. Cookie SW 逻辑拆到 `site-data-bridge.js`；版本提升至 1.8.10。

2026-08-12 16:20:00

1. 站点数据进入 popup 视图及切换 Cookie/Local/Session Tab 时自动读取当前页数据；原「获取」改为「刷新」手动重拉；版本提升至 1.8.11。

2026-08-12 16:55:00

1. 精简站点数据工具条：文案改为「刷新 / 复制 / 清除」，视图切为「列表 / 原文」分段按钮；去掉「刷新 Cookie」等冗长文案。
2. 新增当前 Tab「清除」全部（确认后）：Cookie 逐条 remove，Storage 走 `clear()`；同步 AGENTS / README；版本提升至 1.8.12。

2026-08-12 17:15:00

1. New Tab 新增第二行「热点英语」卡片（5 词：释义/谐音/TTS/剔除补位）；对接 mono `/client/newtab/vocab*`；本地缓存 `newtabCacheVocab`。
2. 第一行三卡改为 `1.35fr×3`，汇率卡内容垂直居中；新增 `newtab-vocab.js`；版本提升至 1.8.13。

2026-08-12 17:25:00

1. 文档同步：`formant.vocab.model_key` 在 Admin 改为从 AI 模型池下拉选择（mono 侧实现）。

2026-08-12 17:40:00

1. 热点英语改回与天气/假期/汇率同一行四卡（`1.35fr×4`）；喇叭/剔除贴紧单词；释义+谐音默认马赛克点击揭开。
2. 对接 mono `formant.vocab.card_size`（默认 5）；内容区加宽至 1280；版本提升至 1.8.14。

2026-08-12 17:55:00

1. 热点英语喇叭改为「英文单词 → 中文释义」循环朗读 5 次；版本提升至 1.8.15。

2026-08-12 18:05:00

1. 热点英语朗读：英↔中间隔约 1s；喇叭脉冲动画 + 遍数角标（如 2/5）；卡片增加「全部发音」按序逐词各读 5 遍（再点可停）；版本提升至 1.8.16。

2026-08-12 18:10:00

1. 「全部发音」时顶栏状态改为显示当前词中文释义 + 谐音（遍数仍在喇叭角标）。

2026-08-12 18:12:00

1. 「全部发音」顶栏状态补上英文：`word · 释义 · 谐音`。

2026-08-12 18:25:00

1. 热点英语朗读：英→中改为英文念完立刻接中文（去掉人为间隔）。

2026-08-12 18:30:00

1. 「全部发音」改为喇叭图标按钮，减少顶栏占宽。

2026-08-13 09:25:00

1. 修复换电脑 New Tab 只有「+」：空主页打开时自动从 mono 拉取；空主页「同步」不会覆盖云端；凭据尽量镜像到 `chrome.storage.sync`；空态提示区分未填 Key / 云端未上传。
2. 修复 GitZip 页签久置切回后 checkbox 闪烁：注入时暂停 MutationObserver、忽略自身 DOM 变更、复用行内勾选按钮而非反复拆装。
3. 版本提升至 1.8.17；同步 README / 设置页文案。

2026-08-13 09:28:00

1. 设置页顶栏 hero 补全模块清单：补上自动翻页 / 代理 / 扩展；概览副标题与左侧导航对齐。

2026-08-13 09:32:00

1. 概览卡片描述默认两行截断，超出省略号；hover 用自封装 `ui-tooltip` 显示全文（非原生 title）。
2. 新增 `option-tooltip.js`；版本提升至 1.8.18。

2026-08-13 10:20:00

1. 新增轻量鼠标手势（自研右键划动，未嵌入 smartUp）：默认关闭；`L/R/UD/DR/U/D` 对应后退/前进/刷新/关标签/到顶/到底。
2. 轨迹 Shadow DOM；位移不足放行系统菜单；输入框内不触发；动作经 background，不改 popup、不 `removeAll` 菜单。
3. 新增 `gestures-config.js` / `gestures-bridge.js` / `gestures/content/main.js` / `option-gestures.js`；总开关 `features.gestures.enabled`；版本提升至 1.8.19。

2026-08-13 10:28:00

1. New Tab 热点英语单词上方标注美式 IPA；释义与汉字谐音仍马赛克揭开。
2. 对接 mono 词条字段 `ipa`；旧缓存无音标时点卡片刷新即可；版本提升至 1.8.20。

2026-08-13 10:32:00

1. prod 环境 Base URL 改为 `https://www.oolaf.top`；已保存的 `https://mono.oolaf.top` 会在读取时改写为新地址。
2. 版本提升至 1.8.21。

2026-08-13 10:35:00

1. dev Base URL 改为 `http://localhost:3101`（本地 mono 是 HTTP，原先 https 会导致 Failed to fetch）。
2. 已保存的 `https://localhost:3101` 读取时改写为 http；切换环境下拉会直接保存。
3. New Tab 连不上时提示去「同步」面板，并带上实际 Base URL；版本提升至 1.8.22。

2026-08-13 10:40:00

1. 热点英语打开时若当前词没有 IPA，会向 mono 补音标（不整卡换词），不再只吃无音标的本地缓存。
2. 版本提升至 1.8.23。

2026-08-13 10:42:00

1. New Tab 卡片刷新改为单箭头回转图标；热点英语喇叭（全部发音 / 单词语）改用新的线性喇叭图标。
2. 描边用 currentColor，随按钮色走；版本提升至 1.8.24。

2026-08-13 10:48:00

1. popup 打开时翻译输入框自动聚焦。
2. 扩展管理放进 popup 二级视图（站点数据图标旁），option `#extensions` 仍保留；总开关关闭后隐藏入口。
3. 版本提升至 1.8.25。

2026-08-13 10:52:00

1. popup 站点数据顶栏图标改为存储盘线稿。
2. 二级 popup 顶栏统一：chevron + 蓝色「翻译」+ 黑字当前标题，右侧 muted 元信息；书签操作下放到工具条。
3. 返回按钮改用指定 chevron 图标；规则写入 AGENTS.md；版本提升至 1.8.26。

2026-08-13 10:54:00

1. popup 书签顶栏图标改为指定书签线稿；版本提升至 1.8.27。

2026-08-13 11:00:00

1. 鼠标手势映射可自定义并同步 mono：`GET/PUT /client/gestures`（同一组 Client API Key）。
2. 设置页「刷新」拉取、「同步」上传；空映射不会覆盖云端；路径重复会拒绝保存。
3. 总开关仍只存在本机；版本提升至 1.8.28。

2026-08-13 11:20:00

1. 书签与热点英语按 Client API Key 隔离；换 key 时清掉 New Tab / 词卡 / 手势本机缓存。
2. 空文件夹列表不再覆盖云端书签树；版本提升至 1.8.29。

2026-08-13 11:30:00

1. 扩展设置顶栏显示当前 Client API Key 指纹（不展示全文）；同步 / New Tab / 手势面板标明云端配置按 Key 隔离。
2. 换 Key 保存时提示本机 New Tab / 词卡 / 手势缓存已清空；版本提升至 1.8.30。

2026-08-13 11:40:00

1. 设置页 `#gestures` 改为画板绘制绑定：点动作的「绘制」，按住左键划路径后松手保存；网页上仍用右键划动。
2. 去掉 L/R/U/D 文本框；路径量化规则与页面手势一致；重复路径拒绝保存。
3. 版本提升至 1.8.31。

2026-08-13 12:10:00

1. 手势识别支持宽松圆圈（不必闭合）和 ✕（可两笔交叉）；刷新改为 `bypassCache` 强刷。
2. 设置页按固定行为 ID 做增删改查；列表同时显示箭头/圈/✕ 与预览图。
3. 预览图按 Client API Key 上传 S3，改绑按行为 ID 删除旧图；`edge://` / 商店页无法注入（浏览器限制）。版本提升至 1.8.32。

2026-08-13 14:08:00

1. 手势按转折分段识别，忽略起点抖动：↓→ 与 →↓ 不再认反（避免「刷新」L 形打成默认的「关闭」）。
2. 绕行序列与未闭合圈都按「圈」匹配，画圈刷新不再对不上。版本提升至 1.8.33。

2026-08-13 14:12:00

1. 设置页画板同时支持左键和右键划动；未在绘制时不再拦截右键菜单。
2. 网页手势在等待第二笔时若再点右键，不再把系统菜单永久吞掉；轨迹 overlay 不拦截点击。版本提升至 1.8.34。

2026-08-13 14:16:00

1. 右键划动改为 pointer 跟踪，不再用 `buttons===0` 误判结束（Edge 上会直接没轨迹、像没反应）。
2. 设置页画板同样按 pointerId 记录，不依赖 buttons。版本提升至 1.8.35。

2026-08-13 14:20:00

1. 网页手势 content 改回经典脚本（去掉 `type: module`），避免 Edge 注入失败导致完全没反应。
2. 同时监听 mouse 与 pointer，右键拖动不再被提前结束。版本提升至 1.8.36。

2026-08-13 14:22:51

1. 站点数据列表去掉底部「完整 JSON」复制，以及 Storage 的「键 / 值」按钮；整份数据用顶部「复制」，单条仍可用行内图标。
2. 键值改为完整文本 + 两行省略，可选中 Ctrl+C（不再截断进 DOM）。版本提升至 1.8.37。

2026-08-13 14:29:28

1. 站点数据切 Cookie/Local/Session 不再每次注入读页：已读缓存直接切，进入视图后后台预读另外两份，「刷新」才重拉。
2. 列表模式不再预先 JSON.stringify 进隐藏原文框，避免维基这类大 localStorage 切 Tab 卡顿。版本提升至 1.8.38。

2026-08-18 15:35:00

1. V2EX 楼中楼改为真树形重组：按 @用户（取对方本页最近一条更早回复）或 #楼层 找到父级，把整条原始回复节点移动到父级下方的子树容器里——移动而非复制，同一内容只出现一次，不再楼内重复渲染副本。
2. 子树容器带左侧层级线与「共 N 条回复 · 收起/展开」开关；父级被移动时整棵子树随节点一起移动；嵌套上限 10 层防过窄。
3. 树形重组排在折叠/悬停相关回复之后执行，既有按单元格绑定的事件与样式在移动后保留；树形模式不再依赖 replies API（纯 DOM 推断）。版本提升至 1.8.39。

2026-08-18 15:45:00

1. V2EX 楼中楼子树紧凑化：隐藏子树回复的头像列与 10px 间隔列（用户名仍在楼层行内），单元格内边距 10px → 6px，负右边距回收父级右 padding，嵌套内容右缘与父级对齐。
2. 子树分隔线改虚线、首个子回复去顶线；悬停子树时左侧层级线加深，便于看清归属。版本提升至 1.8.40。

2026-08-18 16:00:00

1. 修复楼中楼子树左右溢出：去掉容器负右边距（子单元格右 padding 已为 0，二级起逐层越界），嵌套内容右缘回到与主列表一致的 10px 内边距。
2. 子树单元格先 `border: 0` 清掉 V2EX 原生实线分隔再画虚线，消除实线+虚线双线；第二级起缩进 46px → 20px，深层不再挤窄；开关加「⤷」前缀标明层级归属。版本提升至 1.8.41。

2026-08-18 16:10:00

1. 去掉超长回复的 hover 自动展开（划过图片突然撑开），改为点击回复体展开/收起，折叠态底部显示渐变「点击展开全文」提示条。
2. 折叠只对初始化时真正超高（>320px）的回复启用，短回复不再出现展开提示；点击链接/图片等交互元素不触发展开。版本提升至 1.8.42。

2026-08-18 16:20:00

1. New Tab 假期卡片常驻显示「今天 M月D日 周X」；假期/汇率缓存补独立时间戳（`newtabCacheHolidaysAt` / `newtabCacheExchangeAt`），旧缓存从 `widgetsAt` 回填；假期数据超过 24 小时时在该行追加「N 天前更新」。
2. 假期自动刷新：后台 10 分钟天气 alarm tick 里检测假期缓存跨天即补拉（打开的新标签页经 storage.onChanged 自动重绘）；打开新标签页再兜底一次——天气超过 30 分钟或假期跨天才请求接口，新鲜缓存零网络。版本提升至 1.8.43。

2026-08-18 16:25:00

1. 假期卡片「多久没更新」提示仅在数据超过 24 小时时出现（逻辑在 1.8.43 已落地），本次把提示文字改为琥珀警告色加粗（`.holiday-stale`），避免与 muted 元信息混在一起看不见。版本提升至 1.8.44。

2026-08-18 16:30:00

1. 汇率卡片与假期同款提示：数据（`newtabCacheExchangeAt`）超过 24 小时才在底部显示琥珀色「N 天前更新」，24 小时内不显示。
2. 打开新标签页的兜底自动刷新纳入汇率：超过 24 小时才请求接口；后台 10 分钟 alarm 仍只刷天气+跨天假期。版本提升至 1.8.45。

2026-08-20 10:05:00

1. 新增轻量 Telegram 受限媒体下载：`features.telegram.enabled` 默认关闭；仅 `web.telegram.org` / `webk` / `webz` 为已能看到的图片与视频补 Shadow DOM 保存按钮。
2. MAIN world 在页面内分片拉取视频并 `<a download>` 保存，不把整段文件塞进 Service Worker；未嵌入 TG Downloader，不接其云端站点，不新增权限。版本提升至 1.8.46。

2026-08-20 10:12:00

1. Telegram 受限下载改为默认开启（`features.telegram.enabled`）；内容脚本缺省按开处理（`!== false`）。
2. 设置页与 README 去掉「避免与 TG Downloader 双按钮 / 请先卸载」文案，改为说明默认开、仅 Telegram Web 受限图片/视频。版本提升至 1.8.47。

2026-08-20 10:18:00

1. 修正 V2EX 设置页间距：Imgur 输入与保存同一行；入口按钮与管理 Tab 拉开 12px；Tab 改用与「样式商城」同款 ghost 按钮。版本提升至 1.8.48。

2026-08-20 10:22:00

1. 主题帖默认拉齐评论分页后再组楼中楼：最多 100 页、4 路并发 fetch，解析后只导入回复单元格并一次性按楼层插入；图片懒加载，避免逐页插 DOM。版本提升至 1.8.49。

2026-08-20 10:28:00

1. 楼主回复背景改为默认关闭（`opReplyBg`）；打开后给 OP 单元格加内边距，避免楼中楼里背景贴死文字。版本提升至 1.8.50。

2026-08-20 11:22:00

1. Google 直连改为 `translate-pa.googleapis.com/v1/translate`（gtx）；失败仍走 mono Google 兜底。版本提升至 1.8.51。

2026-08-20 11:40:00

1. 新增 X/Twitter 时间线推文翻译：`features.xTranslate.enabled` 默认开启；`option.html#x-translate` 配置译文颜色（含色号）与字号，默认 `#8c8c8c` / 14px。
2. 内容脚本匹配 `x.com` / `pro.x.com` / `twitter.com`，串行翻可见 `tweetText`，Shadow DOM 展示；只走 `translateGooglePa`，不打 mono / GPT / 百度。版本提升至 1.8.52。

2026-08-20 15:10:00

1. 整页查看器与 DevTools 面板补上 JS / CSS 美化：打开 `.js` / `.css` 纯文本页（如 min.js）自动缩进；JSON 仍走树视图。
2. 自研 `code-format.js` / `code-viewer.js`，不嵌入 prettier。DevTools 面板改名为 formant，同时收集 JSON / JS / CSS 响应。版本提升至 1.8.53。

2026-08-20 15:16:00

1. JS / CSS 查看器补语法高亮：关键字、字符串、注释、数字、函数名、CSS 选择器/属性用与 JSON 树同一套配色。版本提升至 1.8.54。

2026-08-20 16:10:00

1. 新增 linux.do 列表飞书式表格换皮：`features.linuxdo.enabled` 默认开启；仅 `https://linux.do/` 非帖子页的 `.topic-list`，formant token + 约 48px 行高，藏欢迎横幅、紧凑分类 Tab。
2. 手法参考 linuxdo-lark-ui（MIT），未拷贝整份油猴、不改品牌/侧栏、不碰详情；AutoPagerize 硬排除 linux.do。版本提升至 1.8.55。

2026-08-20 16:18:00

1. linux.do 列表页按圈选隐藏多余控件：顶栏 logo/汉堡/语言、公告横幅、类别/标签下拉、侧栏底聊天与 Default/工具图标。版本提升至 1.8.56。

2026-08-20 16:28:00

1. linux.do 详情页同样隐藏列表页那套红圈控件；阅读向精简：去掉 topic-map 统计条、右侧楼层轴、楼主徽章与默认多余操作，点赞/回复常显。版本提升至 1.8.57。

2026-08-20 16:35:00

1. 详情页继续藏圈选控件：底部分享/书签/举报/未读与通知设置（保留绿色回复）、相关话题、标题下分类/tag/火箭、LINUX DO 标语条、表情统计与附议/火箭小条。版本提升至 1.8.58。

2026-08-20 16:48:00

1. 详情页补藏仍露出的附议/火箭小条与 LINUX DO 标语：正文后插件块、签名横图、cooked 内标语文案、帖内非楼主头像的胶囊行。版本提升至 1.8.59。

2026-08-21 09:10:00

1. New Tab 打开时自动对账云端主页：本机为空或 `revision` 落后则拉取，不再只在空主页时拉取；与天气首次打开补拉同类。
2. 「同步」改为 revision 保护：本机落后于云端时改用云端布局，不再按图标数量误判、也不再用旧电脑覆盖云端。空主页仍不会覆盖。版本提升至 1.8.60。

2026-08-21 09:45:00

1. New Tab 快捷图标改为直接请求各站 `{origin}/favicon.ico`，去掉 Google `s2/favicons` 探测。
2. 已存的 Google CDN 地址不再当自定义图标；手动填的非 Google 地址仍有效。版本提升至 1.8.61。

2026-08-21 09:50:00

1. New Tab 图标若站点 `/favicon.ico` 裂图，再回退 Google `s2/favicons`；不把 Google 地址写回保存字段。版本提升至 1.8.62。

2026-08-22 10:53:44

1. New Tab 快捷图标本机缓存：`favicon-cache.js` 将成功拉取的图标以 data URL 存 `newtabCacheFavicons`（按 origin / 自定义 src），渲染优先读缓存；未命中先文字占位再换图。
2. 主页增减改与云端对账后 reconcile：补缺失、清孤儿；14 天 stale-while-revalidate；不写回 home / mono。换 Client API Key 时清空该缓存。版本提升至 1.8.63。

2026-08-25 14:06:32

1. linux.do 列表页左键点帖子 `/t/` 链接改为 `window.open(..., "_blank")` 新标签打开，拦截 capture 避免 Discourse SPA 同页跳转；Ctrl/Cmd/Shift/Alt 仍交浏览器。关闭总开关后恢复原行为。版本提升至 1.8.64。

2026-08-25 14:18:39

1. linux.do 顶栏搜索面板与全页 `/search` 结果中的 `/t/` 帖子链接同样 `window.open(..., "_blank")` 新标签打开；分类/用户等非帖子链不动。版本提升至 1.8.65。

2026-08-25 15:35:56

1. linux.do 样式优先项落地：列表未读/新帖左侧 accent 竖条与加粗标题；底栏分类常显、tag 悬停再出、标题单行 ellipsis；数字列 tabular-nums。
2. 新增 `search.css`：顶栏搜索与全页结果标题/摘要/hover 对齐列表 token；`/search` 或搜索面板出现时挂 `formant-linuxdo`。
3. 详情加大楼间距；楼主帖左侧 accent 竖条；引用块与 `pre`/`code` 统一 fill 底与圆角。版本提升至 1.8.66。

2026-08-26 15:49:43

1. New Tab 添加/编辑链接 dialog：保存与删除（含文件夹打散）请求 mono 时显示半透明 loading，期间锁表单、按钮、Esc 与点遮罩关闭，避免连点或误以为卡住。版本提升至 1.8.67。

2026-08-27 09:32:09

1. 新增 freefq.com 帖子一键导出 TXT：`features.freefq.enabled` 默认开启；匹配 `freefq.com` / `www.freefq.com`（含 `/m/`），解除禁复制并挂 Shadow DOM「导出 TXT」。
2. PC 正文取 `td#text`、移动端取 `div.wz`，经 `FORMANT_FREEQ_EXPORT_TXT` + `chrome.downloads` 存 UTF-8（BOM）TXT；不走 mono、不新增权限。版本提升至 1.8.68。

2026-08-27 09:46:01

1. freefq 禁复制加强：除 CSS `user-select` 外，捕获阶段放行 copy/cut/选区/右键，清掉页尾脚本的 `onmousedown` / `onselectstart` / `oncontextmenu`，并短时轮询防再次绑定。版本提升至 1.8.69。

2026-08-27 10:38:42

1. 新增 huavod.com 控制台解锁：`features.huavod.enabled` 默认开启；动态 DNR 拦截页面发起的 `disable-devtool` 脚本。
2. MAIN world `document_start` 挂起 `DisableDevtool.isSuspend`，并无用户手势时吞掉 `history.back` / `history.go(-n)`，避免开 F12 被踢回上一页。版本提升至 1.8.70。

2026-08-27 10:41:31

1. `option.html` 概览文案补上 freefq / huavod；功能开关面板本身已含这两项（`freefq.enabled` / `huavod.enabled`）。

2026-09-03 10:50:13

1. 修复 New Tab 编辑图标链接后 favicon 变文字占位：默认 `{origin}/favicon.ico` 不再写入 `src`（PATCH 用空串清掉旧默认值），缓存键统一走 `origin:*`。
2. `cacheKeyForItem` 把默认 favicon / Google s2 视为非自定义；reconcile 时把历史 `src:.../favicon.ico` 缓存迁移到 `origin:`，避免编辑保存清掉可用图标。版本提升至 1.8.71。

2026-09-12 09:55:00

1. 翻译 popup 结果卡增加复制图标，点一下把译文写入剪贴板（成功后短暂变绿）。
2. 工具栏 popup 切浏览器标签会关，是 Chrome 对 `default_popup` 失焦即销毁的限制。顶栏增加弹出独立窗口：同一份 `popup.html?panel=1` 用 `chrome.windows.create` 打开，切标签不关；不改 `action.default_popup`、不新增权限。版本提升至 1.8.72。

2026-09-12 10:00:00

1. popup 关掉后记住上次原文和译文（`chrome.storage.session`）。再打开直接还原输入框和结果卡，不重新打翻译接口；改字 / 改模式 / 改目标语言才请求。关浏览器后清空。版本提升至 1.8.73。

2026-09-12 10:38:00

1. 上次翻译不再每次打开都还原。只有 popup 开着时切过浏览器标签，下次才带回原文和译文；自己关再开（点外面 / 再点图标）输入框为空并清掉快照。版本提升至 1.8.74。

2026-09-22 11:44:31

1. 新增 elitepvpers 帖子翻译：`features.elitepvpers.enabled` 默认开启。只翻列表帖子标题、帖子页标题、每楼标题和 `post_message` 正文，不翻导航、用户名和签名。
2. 译文走 Google translate-pa 直连（长楼分段），Shadow DOM 挂在原文后；颜色和字号复用 `option.html#x-translate`。关闭开关后立即卸译文。版本提升至 1.8.75。

2026-09-23 15:55:00

1. 新增 Gemini 下载去水印：`features.gemini.enabled` 默认开启。`option.html#features` 增加说明和「启用 Gemini 下载去水印」；概览文案同步。
2. 在 gemini.google.com / business.gemini.google 拦截 googleusercontent 的 `gg` / `rd` 成图，升到原图尺寸后按右下角蒙版反混合。关闭开关后下载恢复原图。不新增权限。版本提升至 1.8.76。

2026-09-23 16:20:00

1. popup 顶栏新增识图入口：`features.imagePrompt.enabled` 默认开启。关闭后隐藏按钮。只在 popup 内上传或填写图片 URL，不注入网页、不加右键菜单。
2. 识别走 `option.html#image-prompt` 配置的 OpenAI 兼容视觉模型（`chrome.storage.local.formantImagePrompt`）。长边压到约 1280px 后再请求；结果在上传区下方，含中文 / English / JSON 和识别中的进度动画。不走 mono。版本提升至 1.8.77。

2026-09-23 16:30:00

1. 识图从 popup 二级视图改为新标签页 `image-prompt.html`。顶栏按钮只负责打开该页；上传、URL、结果和识别动画都在标签页里。版本提升至 1.8.78。

2026-09-23 16:45:00

1. 识图提示词改为按画面分区写的长段落：原样引用可见文字，圈选、打码和水印计入画面。送模型前长边改为约 1600px、JPEG 质量 0.92，并提高输出长度上限。版本提升至 1.8.79。

2026-09-23 17:40:00

1. 去掉 `background.js` 里重复的 `handleGeminiMessage` 导入。重复导入会让 service worker 解析失败，划词、右键、X 和 elitepvpers 的翻译请求发不出去，面板一直停在「翻译中」；popup 在页面内直接调翻译，所以不受影响。版本提升至 1.8.80。

2026-09-29 14:50:00

1. 新增 HLS 播放：`features.hls.enabled` 默认开启。主框架打开以 `.m3u8` 结尾的地址时改到扩展播放页；地址栏关键字 `m3u8` 同样打开。`option.html#features` 增加说明和开关。
2. 播放页用一份 hls.js 1.6.10，原生 JS（`$` 只做 `querySelector`），不用 jQuery。底栏支持倍速和 0/90/180/270 旋转，记在 `formantHls`。新增权限 `webNavigation`。版本提升至 1.8.81。

2026-09-29 15:46:00

1. 播放页左右方向键控制进度：每次 5 秒，按住 Shift 为 30 秒。之前只绑了倍速和旋转，进度条步进又只有 0.1 秒，所以左右键几乎不起作用。
2. 底栏增加「存 MP4」：下载当前 m3u8 分片，MPEG-TS 用 mux.js 封装，fMP4 直接拼接，支持 AES-128。直播只保存已经列出的分片。版本提升至 1.8.82。

2026-09-29 15:54:00

1. 播放页的倍速、旋转和音量不再写入 `chrome.storage`。关掉标签后再打开，回到 1 倍速和 0°。顺手清掉以前留下的 `formantHls`。版本提升至 1.8.83。

2026-09-29 15:56:00

1. HLS 播放页改成 formant 浅色：冷灰画布、白卡片画面区、描边次按钮，主操作「存 MP4」用品牌蓝。去掉近黑底播放器皮肤。版本提升至 1.8.84。

2026-09-30 11:05:00

1. 新增 Gmail 当前邮箱：`features.gmail.enabled` 默认开启。只在 mail.google.com 顶栏问号和设置左边显示当前账号邮箱，点击复制。
2. 邮箱优先读账号按钮，读不到再用页面 GLOBALS。关闭开关后卸掉这块文字。不新增权限。版本提升至 1.8.85。

2026-09-30 11:12:00

1. Gmail 顶栏邮箱不再用只读输入框，避免末尾字母被裁切或挡住。文字按内容撑开，旁边的空白不够时让出宽度。版本提升至 1.8.86。

2026-09-30 15:20:00

1. 新增本地 Axure 原型：`features.axure.enabled` 默认开启。`file://` 打开的 Axure HTML 在各框架之间转发已有事件消息，首页标 `pluginDetected`。`option.html#features` 增加说明和开关。
2. 上游 0.7.0 脚本没有 jQuery。内容脚本用 `$` 做 `querySelector`，与 HLS 播放页同一写法。不拷贝官方扩展包，不新增权限。版本提升至 1.8.87。

2026-09-30 15:32:00

1. 新增 Vue 组件检查：`features.vue.enabled` 默认开启。DevTools 增加「Vue」面板，可看组件树、props / setup / data、Pinia 或 Vuex 当前状态，并高亮选中组件。`option.html#features` 增加说明和开关。
2. 不拷贝 Vue.js devtools 6.6.4 的 webpack 包和 popup。页面 hook 与面板都用 `$` 做 `querySelector`，不引入 jQuery。不新增权限，不改工具栏 popup。版本提升至 1.8.88。

2026-09-30 15:45:00

1. 当前标签检测到 Vue 时，在 formant 工具栏图标右上角加上绿色 V。离开页面或关闭开关后恢复原来的图标，不用角标文字。
2. Vue 2 legacy 与 Vue 3 一起收集：`init` / `vuex:init`、`__vue__` 组件树，以及 Vuex 当前状态。Pinia 和 Vuex 可以同时出现。版本提升至 1.8.89。

2026-09-30 16:45:00

1. 工具栏右上角的绿色 V 改为事先画好的图标。页面加载完后由后台直接检查 `__vue__` / `__vue_app__`，Vue 挂载稍晚时会再查两次。之前在 service worker 里现画图标，Edge 经常画失败，所以角标出不来。版本提升至 1.8.90。

2026-09-30 17:20:00

1. `option.html#sync` 可导出 / 导入本机钥匙 JSON。文件含同步的 Base URL 与 Client API Key、识图的 Base URL / API Key / Model、V2EX 的 Imgur Client ID。缺的面板不覆盖。更换 Client API Key 时仍清空本机 New Tab / 手势缓存。
2. New Tab、GitZip、自动翻页、手势、代理、扩展、词库、翻译、X 推文和功能开关没有单独的密钥，不进这份文件。版本提升至 1.8.91。

2026-09-30 17:25:00

1. `AGENTS.md` 约定：以后新增只存在本机的配置 JSON，都要接入 `option.html#sync` 现有的钥匙导出 / 导入，不另做一套。

2026-10-07 09:18:00

1. New Tab 假期卡片：今天落在假期区间内时，左侧显示「当前是某假期」和日期，大号天数改为距离下一个假期，并用品牌蓝底块醒目标出；右侧改为其后的假期，不再把「还有 0 天」当作倒计时。
2. 假期接口改为 `limit=5`，进行中时右侧仍能列出 3 个后续假期。版本提升至 1.8.92。

2026-10-07 09:22:00

1. 假期进行中时卡片减负：去掉当前假期起止日期和「今天」一行，避免日期被挤成两行；右侧后续假期只留名称和天数。左侧让出更多宽度给「距下一个假期还有 N 天」。版本提升至 1.8.93。

2026-10-07 09:24:00

1. New Tab 天气卡片的逐日预报在周几上方显示月-日（如 10-08），方便对上具体日期。版本提升至 1.8.94。

2026-10-07 09:32:00

1. New Tab 汇率卡片按 1 USD 兑换本机所选币种。刷新按钮旁增加编辑：滑块设置显示条数（1–5），列表可更换币种并拖拽排序。
2. 偏好写入 `chrome.storage.local.formantExchange`，只跟这台电脑走，不同步 mono，也不随 Client API Key 清空。版本提升至 1.8.95。

2026-10-07 09:40:00

1. 假期进行中时，左侧仍只显示「当前是某假期」和距下一个假期的天数；右侧后续假期恢复名称、日期区间和天数。两列不再把左边拉宽，避免倒计时块压住右侧节日名。版本提升至 1.8.96。

2026-10-07 09:41:00

1. 汇率编辑的币种下拉改为全球流通法币，补上越南盾以及原先没有的非洲、中亚、太平洋等货币。基准仍是 1 USD，美元本身不在列表里。上游没给出有效汇率时显示「—」，不显示 0.00。版本提升至 1.8.97。

2026-10-07 09:49:00

1. 假期进行中时，距下一个假期的大号天数下面补上该假期的日期区间，例如「86天」下面显示元旦的 01.01。版本提升至 1.8.98。

2026-10-07 09:57:00

1. 汇率编辑改为可搜索。输入国家或货币（如「美元」/ USD / 「越南」）会列出对应国家，同一货币可以对应多个国家；选中后写入该国货币。国家与货币的对应写在 `newtab-exchange-countries.js`。
2. 越南盾 VND 放回字母序，排在委内瑞拉玻利瓦尔和瓦努阿图瓦图之间，不再单独提前。版本提升至 1.8.99。

2026-10-07 10:05:00

1. 汇率卡片列表上方增加换算：输入金额、选择币种，按 1 USD 的报价折合成人民币。请求里总会带上 CNY，列表里没选人民币也能换算。
2. 列表行距和四边留白随显示条数变化，1 条更疏，5 条更紧。版本提升至 1.8.100。

2026-10-07 10:30:00

1. 热点英语卡片右上角可翻到「生词本」。两面同属英语学习，切换用 3D 翻转；当前面记在 `formantVocabFace`，刷新后仍停在上次那一面。
2. 划词和 popup 翻译成功后，只把单个英文单词写入本机 `formantStudyWords`（句子、中文和其他语言不记）。最近 5 条直接显示英文、音标、译文和朗读，移出按钮较弱，且不走「已会」接口。更多单词在对话框里分页。生词本没有刷新。版本提升至 1.8.101。

2026-10-07 10:32:00

1. 下一个假期卡片右侧固定为接下来的 3 个假期，假期内左侧多占「当前假期 + 下一个」时也不少一条。假期接口改为一次取 6 条。
2. 汇率列表 1–5 条都留出行距，5 条不再把行距收到 1px、也不再缩小字号和卡片内边距。版本提升至 1.8.102。

2026-10-07 10:36:00

1. 翻译框不再把输入过程中的半截词写进生词本。翻译仍马上出结果；生词本等这轮输入停住约 1 秒，或失焦时，只记框里最后的英文单词。同一轮里先停在 he 再写成 hello，会用 hello 换掉 he。划词仍是译完就记。版本提升至 1.8.103。

2026-10-07 10:38:00

1. 下一个假期右侧固定 3 个。假期内左边仍是下一个假期，右边是再往后的 3 个（国庆期间为春节、清明节、劳动节）。不是假日时，右边是最近的 3 个，包含左边正在倒计时的那个。
2. 假期缓存条数不够填满右侧时视为过期，打开新标签页会自动再拉。版本提升至 1.8.104。

2026-10-07 10:42:00

1. 页面划词翻译会等生词写入本机完成后再结束这次翻译请求，避免记录被服务进程提前关掉丢掉。选中的英文单词若带首尾标点（如 hello,）仍记这个词。版本提升至 1.8.105。

2026-10-07 10:46:00

1. 生词本在英文上方显示 Google 给出的单词读音。记下单词时会去取；已经在列表里、还没有音标的，打开新标签页后补上。
2. 生词本没有单词时不再显示「划词或在翻译窗输入单词后会出现在这里」。版本提升至 1.8.106。

2026-10-07 10:51:00

1. 生词本为空时在卡片中央显示 empty-status「暂无生词」，不再留白。版本提升至 1.8.107。

2026-10-07 11:10:00

1. Discord 聊天增加手动翻译。`discord.com`（含 ptb / canary）的 `/channels/` 右下角有「翻译」按钮，点一次只翻当前频道已经加载的消息。换频道算新窗口，同一频道里消息列表变了算新页；不点就不会翻上滚加载出来的历史。译文走和 X 推文相同的 Google 直连，不走 mono。记录只在当次页面内存里，刷新后清空。总开关是 `features.discord.enabled`，颜色和字号共用 X 推文设置。版本提升至 1.8.108。

2026-10-07 11:24:00

1. 生词本不再记下功能词，例如 it、he、she、who、where、if、else、to、on，以及同类的冠词、代词、介词、连词、疑问词、be/do/have 和情态动词。划词和翻译框都走这道过滤。打开新标签页时，列表里已有的这类词会删掉。版本提升至 1.8.109。

2026-10-07 11:28:00

1. 生词本再排除不可能是单词的乱串：连续三个相同字母（aaaaaa）、整段落在键盘行或列上（asdf、qwerty、qaz）、顺着字母表排的（abcd），以及英文里几乎不出现的字母组合（qweadg）。hello、queue、rhythm 这类正常词仍会记。已经在列表里的，打开新标签页时删掉。版本提升至 1.8.110。

2026-10-07 11:40:00

1. 生词本音标不再只读 Google 返回里的一个固定位置。那个位置有的词是空的（所以 decisions 没有音标），有的词是音节拆分（outlook 显示成 ˈout look）。划词和翻译框都改读单词读音字段；不像音标的拆分会丢掉，打开新标签页时再补。版本提升至 1.8.111。

2026-10-07 11:44:00

1. 生词本音标改为有道美式音标。Google 译成中文时带上的是译文拼音（Decisions 显示成 juéding），不是英文读音；有的词这个字段为空（Marketplace 没有音标）。拼音和把单词本身拆开的结果都会丢掉，打开新标签页时按单词重新取。版本提升至 1.8.112。

2026-10-07 15:29:00

1. JSON / JS / CSS 美化工具栏增加下载。保存的是美化后的内容，文件名用当前页面或 DevTools 请求的路径。JSON 在复制按钮旁，JS / CSS 为 Download。版本提升至 1.8.113。

2026-10-07 16:42:00

1. 去掉百度翻译。popup 与划词的第三路改为 DeepLX：`POST https://api.deeplx.org/{apiKey}/translate`。自动 / Google 模式里 Google 失败后走 DeepLX；「全部」三路并行。API Key 在设置「翻译」填写，存在本机 `formantDeeplx`，不进仓库、不经 mono。X、Discord、elitepvpers 仍只走 Google 直连。
2. 本机钥匙除了导入文件，还可以把 JSON 贴进文本框再导入。钥匙文件版本升到 2，并带上 DeepLX API Key；旧版 version 1 拒绝导入。版本提升至 1.8.114。

2026-10-07 17:22:00

1. 生词本「查看更多」弹窗补上与链接编辑 dialog 相同的开闭动画（淡入、轻微上移、遮罩过渡）。Esc 与点遮罩关闭也会走关闭动画。版本提升至 1.8.115。

2026-10-08 17:56:00

1. 划词翻译不再把「Cannot read properties of undefined (reading 'ok')」写进每一张结果卡。某一路结果缺失时只标该路失败，自动模式下被跳过的 ChatGPT 保持跳过；Google 失败仍会继续兜底 DeepLX。版本提升至 1.8.116。

2026-10-10 09:40:00

1. Discord 输入框右侧新增弱化翻译图标（`discord/content/input.js`，Shadow DOM）：点击弹出菜单选 Google（translate-pa，同 X 推文）或 GPT（mono，消耗 Client API Key），把输入框内容译成英文并整段替换，不会自动发送。请求期间输入变化则放弃替换；最近一次引擎存 `formantDiscordInput`。
2. `discord-bridge.js` 新增 `FORMANT_DISCORD_INPUT_TRANSLATE` / `translateDiscordInput()`；`main.js` 随总开关启停；manifest 注册 `input.js`。聊天消息翻译仍只走 Google，不受影响。
3. 同步更新 AGENTS.md（Discord 规则新增输入框 GPT 例外）、README、option.html 说明。版本提升至 1.8.117。

2026-10-10 09:55:00

1. 修复 Discord 输入框翻译后文字无法用 Backspace 删除、且与占位符叠在一起：原先用 `execCommand("insertText"/"delete")` 直接改 DOM，Slate 内部模型没更新。改为全选后派发粘贴事件（失败再试 `beforeinput` insertFromPaste），由 Slate 自己写入；不再直接改 DOM。版本提升至 1.8.118。

2026-10-10 10:08:00

1. Discord 输入框翻译图标不再弱化：去掉半透明，图标改 24px，颜色与悬停底色改用 Discord 的 `--interactive-icon-default` / `--interactive-icon-hover` / `--background-modifier-hover` 变量（带回退），与旁边礼物 / GIF 等图标一致；菜单底色、文字同样跟随 Discord 主题变量。垂直位置上移 6px 与相邻图标对齐。
2. 同步更新 README、AGENTS.md、option.html 描述。版本提升至 1.8.119。

2026-10-10 10:30:00

1. Discord 输入框翻译不再直接替换：翻译完成后在图标上方弹出预览卡（上为原文，下为译文），点「替换」才写入输入框；替换后卡片变为「撤回 / 完成」，撤回把原文写回。输入框被改动 / 发送 / 切频道时卡片自动关闭，Esc 也可关闭。
2. 写入与撤回均走 Slate 粘贴路径；撤回前会校验输入框内容仍是译文，否则提示无法撤回。同步更新 README、option.html。版本提升至 1.8.120。

2026-10-10 10:52:00

1. Discord 输入框翻译去掉预览弹窗：选好引擎后译文直接写入输入框（少一步「替换」），原文以一条细栏贴在输入框正上方（新增 `discord/content/input-strip.js`，Shadow DOM，宽度与输入框一致），栏内「撤回」恢复原文、「×」关闭。
2. 输入框被改动 / 发送 / 切频道 / Esc 时细栏自动消失；撤回前校验输入框仍是译文。`input.js` 瘦身到约 420 行；manifest 注册 `input-strip.js`；同步 README、option.html。版本提升至 1.8.121。

2026-10-10 14:12:00

1. Discord 输入框翻译补上明确的进行中与报错提示：翻译期间输入框上方细栏显示转圈和「正在用 Google/GPT 翻译…」；失败显示红色错误原因（8 秒后消失或点「×」），其它提示（空输入、已撤回等）同样走这条细栏。
2. `input-strip.js` 新增 `status(text, kind)`；`input.js` 去掉原先图标旁的小浮层 toast。版本提升至 1.8.122。

2026-10-10 15:40:00

1. New Tab 生词本释义改取有道英汉词典：带词性（n. / v. / adj. …）、每个词性最多 3 个义项，仍只占一行（超出省略号，悬停看全文）；词典查不到时退回 Google 译文。已有的旧生词在打开新标签页时自动补查词性释义。
2. 发音只读一遍（原先英→中循环 5 次），不再显示 1/5 遍数角标；朗读中文时去掉词性标记，只读前两个义项。热点英语的喇叭同步改为一遍。
3. study-words.js 新增 lookupDict / speechMeaning / hasPosMeaning；同步 README；版本提升至 1.8.123。

2026-10-10 15:50:00

1. New Tab 生词本单词列固定宽度 84px（超长单词/音标省略号），释义统一从同一条竖线开始，不再因单词长短把释义左右挤动。仅改 ewtab.css，仅作用于生词本行，热点英语不变。

2026-10-10 15:58:00

1. 修复 New Tab 生词本长释义把同一行左边三张卡（天气 / 假期 / 汇率）挤窄：.widget-row 四列改为 epeat(4, minmax(0, 1.35fr))（窄屏两列同改 minmax(0, 1fr)），.widget 加 min-width: 0，四卡宽度不再随内容撑开。

2026-10-10 16:05:00

1. 修复上一条改动后生词本翻面错位（文字跑到左边汇率卡上）：根因是 .vocab-flip__inner 的 grid 单列按最长释义撑宽，3D 翻转轴随之偏出卡外。现 .vocab-flip__inner 单列锁为 minmax(0, 1fr)，.vocab-flip / .vocab-flip__face / .study-face__body / .vocab-item--study 均加 min-width: 0，长释义只在卡内省略号截断。


2026-10-10 16:25:00

1. 新增「工具箱」独立扩展页 `tools.html`（吸收 FeHelper 的 6 个工具，全部用原生 JS 重写，未带入 jQuery / Vue / evalCore）：二维码生成与识别、时间戳转换（秒/毫秒、时区、FILETIME、世界时间表）、JSON 美化（格式化/压缩/键排序/嵌套展开/大整数无损/JSONP，输出复用 `viewer.js` 的 `OolafJsonViewer` 树视图）、JSON 对比（结构差异清单 + 左右行高亮 + 纯文本行对比）、图片 Base64 互转（选文件/拖拽/粘贴/URL）、编码转换（Unicode/URL/UTF-16/Base64/Hex/HTML 实体/URL 参数/JWT/字符串转义/MD5/SHA-1/SHA-256/Gzip）。去掉了 FE 的 AI 解码、条形码、Proto Hex 等。
2. 入口：popup 顶栏「识图」图标换成「工具箱」图标（`popup-image-prompt.js` 改为 `popup-tools.js`），图标总数不变，翻译仍是 popup 主界面；识图作为工具箱左侧列表最后一项（链到原 `image-prompt.html`，功能与 `imagePrompt.enabled` 不变）。新增总开关 `features.tools.enabled`（默认开启）：popup 图标在「工具箱或识图任一开启」时显示；关闭工具箱后只保留识图入口。`option.html#features` 增加「工具箱」卡片并更新识图说明。
3. 新文件（均 ≤ 500 行）：`tools.html/css`、`tools-panels.css`、`tools-page.js`（hash 路由 + 懒加载）、`tools-dom.js`（`$` = querySelector、`$$` = querySelectorAll、复制/下载/粘贴/拖拽/脚本按需加载）、`tools-timestamp.js`、`tools-image-base64.js`、`tools-codec.js` + `tools-codec-lib.js` + `tools-md5.js`、`tools-qr.js` + `tools-qr-decode.js`、`tools-json.js` + `tools-json-lib.js`、`tools-diff.js` + `tools-diff-core.js`。第三方库放 `tools/vendor/`：qrcode-generator 1.4.4（MIT，生成）、zxing.min.js（Apache-2.0，来自 FeHelper 2026.7.28，识别），附 `tools/vendor/NOTICE`。
4. 无新增权限、不改 `action.default_popup`、不走 mono、无密钥或本机配置 JSON（不需接入 `option-keys.js`）；扩展页 CSP 下无 eval。MD5 与时间戳、编码、JSON、对比的纯函数已用 Node 对拍（MD5 对 `crypto`、编码往返、大整数、diff）；页面用本机静态服务 + chrome stub 冒烟了编码转换、时间戳、JSON（文本/树）、对比、二维码生成→识别往返、Base64→图片。版本升到 1.8.124。

2026-10-10 17:10:00

1. 修复工具箱控件间距：`tools.css` 里 `.tl-card > * + *` 统一卡片内子块纵向间距（拖拽区与 URL 行、文本框与按钮行不再贴在一起），标签仍紧贴控件；并排布局（`.tl-grid` / `.qr-layout` / `.js-layout` / `.df-sides`）里的卡片取消 `.tl-card + .tl-card` 的上外边距，左右卡片顶部对齐（图片 Base64 右侧卡片原先错位）；空的状态行 `:empty` 不再占位。
2. JSON 美化支持多页：顶部「页 N」标签，「+」新增（最多 20 页）、「×」关闭（至少留一页，页内有内容时先确认）。每页各自保存输入，切页后重新格式化；数据只在内存，刷新即重置，不写 `chrome.storage`。
3. 识图并入工具箱面板：新增 `tools-image-prompt.js`，和二维码一样左右布局（左：拖拽 / 选文件 / 粘贴 / URL；右：中文 / English / JSON 结果与复制），顶栏有状态与「模型设置」（跳 `option.html#image-prompt`）。删除独立页 `image-prompt.html` / `image-prompt.css` / `image-prompt-page.js`；`imagePrompt.enabled` 与 `formantImagePrompt` 不变。
4. 工具箱支持排序与标题图标：左侧列表可拖动重排（顺序存 `chrome.storage.local.formantToolsOrder`，仅工具 id 顺序，无密钥、不同步）；新增 `tools-icons.js`，列表项和各面板标题都带线性图标（选中项图标反色）。
5. 去掉二级描述话术：侧栏「本机运行，不上传内容」、列表项下的「格式化 / 压缩 / 查看」等小字、识图的外链说明，以及各工具面板标题下的说明段落。
6. 无新增权限；版本升到 1.8.125。已用本机静态服务 + chrome stub 冒烟：图片 Base64 间距、二维码、时间戳、JSON 多页增删切换、识图面板、列表拖拽排序。

2026-10-10 17:30:00

1. JSON 美化「文本」视图加语法着色：结果改为带颜色的只读 `pre`（`tools-json-lib.js` 新增 `highlightJson`，键 / 字符串 / 数字 / 布尔 / null 复用 `oolaf-json-*` 类名，超过 40 万字符只转义不上色）；原 textarea 只存值（复制 / 替换输入 / 下载照旧）。配色在 `.js-code` 下固定浅色，不跟系统深色走。
2. 「树视图」不再显示 viewer 自带的工具条（搜索 / Tree·Raw / 层级 / 展开收起 / 复制下载等），`render` 传 `showToolbar: false`，复制 / 下载用面板自己的按钮。

2026-10-12 11:45:00

1. 新增「虎扑简洁版式」：`formant/hupu/` 内容脚本匹配 `*://bbs.hupu.com/*`（`all_frames: false`，`document_idle`），不新增权限、不走 mono。`bootstrap.js` 读 `features.hupu.enabled`（默认开启，不同步）；`main.js` 给 `html` 加 `formant-hupu` / `formant-hupu-thread`（路径 `/{id}.html`），关闭后立即清 class 与图片标记并停掉 observer。
2. 表情大小不一的收拢：`main.js` 按图片真实尺寸给帖子正文与引用里的 `<img>` 打 `formant-hupu-emoji`（最长边 < 64，20px 高）/ `formant-hupu-sticker`（最长边 ≤ 480 且长宽比 ≤ 2，统一 88px 高，引用里 56px）/ `formant-hupu-photo`（大图，回帖最大 360px、主帖 520px、引用 160px）；懒加载图靠捕获阶段 `load` 补标。
3. 样式拆成 5 个文件（均 < 500 行）：`base.css`（顶栏改白底两层导航，藏 App 推广 / 游戏中心，logo 转深色，主色下划线与登录钮；页脚）、`thread.css`（主帖白卡、标题、分页、面包屑）、`replies.css`（回帖行距、「点灭 / 只看此人 / 举报」悬停才显、引用块浅底、图片规则）、`aside.css`（右侧最热 / 最新帖卡片与两行截断、回复框、吸顶标题条蓝色按钮）、`list.css`（板块列表关注 / 发帖 / Tab 下划线换主色）。站点 CSS Modules 带 hash，一律用 `[class*="前缀__"]`；面包屑 / 分页挂 `html.formant-hupu`（列表页共用），其余帖子页规则挂 `html.formant-hupu-thread`。
4. 接入设置：`features.js` 增加 `hupu` 默认值 / 规整 / `isHupuEnabled`；`option-features.js` 与 `option.html` 在「功能」面板增加「虎扑帖子」开关与说明；`manifest.json` 增加内容脚本条目与描述，版本升到 1.8.126；README 补功能说明、目录与冒烟清单。
5. 已在 `https://bbs.hupu.com/642898219.html` 与 `/mavericks` 用 CDP 注入同一份 CSS / `main.js` 对照截图验证（顶栏、帖子卡、回帖、引用、吸顶条、侧栏）；尚未在已登录状态下验证顶栏下拉。需在 `edge://extensions` 重载 formant 后再点一遍。

2026-10-12 11:50:00

1. 修虎扑换皮首屏闪旧样式：内容脚本改为 `document_start`。顶栏 / 分页 / 列表规则从 `html.formant-hupu` 改成 `html:not(.formant-hupu-off)`，manifest CSS 注入后立刻生效，不再等 JS 加 class、也不等 `chrome.storage`。
2. `bootstrap.js` 第一行按路径同步挂 `formant-hupu` / `formant-hupu-thread`（帖子页规则仍要这个 class）；读到开关关闭后再加 `formant-hupu-off` 并卸 class。`main.js` 默认按开启立刻 `apply()`，不再先 `enabled = false` 再等 ready，避免多等一帧。
3. 版本升到 1.8.127。重载扩展后打开帖子页：不应再先闪红顶栏 / 灰底。关闭开关后刷新应仍是站点原样。

2026-10-12 11:55:00

1. 虎扑帖子详情加「上一帖 / 下一帖」：标题下一条、底部一条固定条（Shadow DOM）。顺序跟板块列表一致：上一帖是列表里更靠上的，下一帖是更靠下的。同标签跳转，不用回列表。
2. 关键点：不依赖从列表带过来的 referrer。列表页把当前页 tid 写入 `chrome.storage.local.formantHupuNav`（跨新标签可读）；详情页若缓存没有当前 tid，用面包屑板块 slug 同域拉取 `/{board}`、`/{board}-2`…（最多 10 页）定位邻居。直接打开详情 URL 也能用。找不到则下一帖变成回板块。
3. 新文件 `hupu/content/nav-lib.js`、`nav.js`（均 < 500 行）；`manifest.json` 接入，版本 1.8.128。不新增权限。重载后：直接打开帖子应能看到上下帖；从列表新标签进详情再点下一帖应到列表下一条。

2026-10-12 12:35:00

1. 修虎扑帖子页底栏被打穿：步行街长帖里回帖分页被拉成整列蓝条，回复框挤到右边，底部「上一帖 / 下一帖」只剩一行提示。
2. 分页 `.hupu-rc-pagination` 强制横排（li 固定 32px 高、不占满宽）；主栏改成纵向拉满，`#hupu-compact-editor` 独占一行。侧栏标题的 `display:-webkit-box` 只挂在 `index_right-post-item__` 里，避免打到主栏。
3. 上下帖导航去掉 `:host { all: initial }`（会把按钮行收没），用 `data-box` 重绘，标题下插入条强制 `width:100%`。版本 1.8.129。重载扩展后再打开多页回帖的步行街帖，底部分页应横排，回复框在分页下面，底部应能看到上一帖 / 下一帖两个按钮。

2026-10-13 15:50:00

1. 新增「滚动截屏」：网页右键「formant 截屏」可截可见区域或整页滚动拼接 PNG。按需注入 `screenshot/content/main.js`（不写进 manifest 常驻匹配），`captureVisibleTab` 逐屏采集，OffscreenCanvas 拼接后 `chrome.downloads` 另存为。进度条 Shadow DOM；第一屏之后隐藏 fixed/sticky，避免顶栏重复；高度锁在开始时的 scrollHeight（最多 80 屏）。
2. 总开关 `features.screenshot.enabled` 默认开启，只在 `option.html#features`，不同步 mono。关闭后隐藏该菜单。不新增权限，不改 `action.default_popup`，不调用 `contextMenus.removeAll()`。只处理 http/https。
3. 新文件 `screenshot-bridge.js`、`screenshot-compose.js`、`screenshot/content/main.js`（均 < 500 行）；接入 `features.js` / `option-features.js` / `background.js`；同步 README、AGENTS.md。版本升到 1.8.130。

2026-10-13 15:55:00

1. 修滚动截屏右键没反应、也不下载：Service Worker 不能 `URL.createObjectURL`，改为和图片另存为一样的 FileReader data URL；失败再走页面 `<a download>`。
2. 菜单改成两条顶层项「formant 整页滚动截屏 / formant 截取可见区域」，一点即截，避免点子菜单父级没事件。页面通信改 `scripting.executeScript` 调 isolated-world 调度器，不再依赖可能被其它 content listener 干扰的 `tabs.sendMessage`。
3. 失败在页角弹出提示（不只靠系统通知）；`tab.url` 空时回退 `info.pageUrl`。版本 1.8.131。

2026-10-13 17:55:00

1. 把 VibeOffice 的 Word（Quire）/ Excel（Ledger）/ PPT（Lectern）向量复制进独立目录 `formant/vibeoffice/`，不覆盖现有 formant 文件。抽内联脚本以符合扩展 CSP；`chrome-extension:` 下不注册 PWA Service Worker、不请求远程 updater；目录链接落到 `index.html`。
2. 总开关 `features.office.enabled` 默认开启，只在 `option.html#features`。网页右键「formant Office」打开起始页 / Word / Excel / PPT。不新增权限，不改 `action.default_popup`，不调用 `contextMenus.removeAll()`，不走 mono，不进工具箱面板。
3. 新文件 `office-bridge.js`；接入 `features.js` / `option-features.js` / `background.js`；同步 README、AGENTS.md。版本升到 1.8.132。

2026-10-13 18:07:47

1. 修 Excel（Ledger）导出 PDF / 画布把 Wingdings 2 空复选框画成英镑符号或空白框：`0xA3`（£）显示映射为 Unicode `□`，xlsx 保存仍写原字符与字体。
2. 画布按 run 绘制：符号 run 用 Arial（canvas 不会按 CSS 回退缺字），中文 run 仍用宋体等原字体。顺带修了 `drawText` 在符号单元格上先赋值未声明的 `text` 导致整格不画。
3. 版本升到 1.8.133。重载扩展后打开含「绩效等级: £S £A £B £C」的表，格子和导出 PDF 应是 `□S □A □B □C`。

2026-10-13 18:22:00

1. 套件更名为 oolafOffice：目录 `formant/vibeoffice/` 改为 `formant/oolafoffice/`，注释 / 文案 / `APP_NAME` / IndexedDB 与 localStorage 键一并改名。NOTICE 仍保留上游 VibeOffice 出处；`chrome-extension:` 下仍不请求 `vibeoffice.work/updater`。
2. popup 主界面代理行下方增加 oolafOffice 快捷条（起始页 / Word / Excel / PPT），不增加顶栏图标。网页右键改为「formant oolafOffice」，子项保留。关闭 `features.office.enabled` 后快捷条和右键菜单一起隐藏。
3. 新文件 `popup-office.js`；`office-bridge.js` 路径改到 `oolafoffice/`。版本升到 1.8.134。

2026-10-14 09:25:00

1. 扩展设置概览增加「Edge 实验项」：选择本机 Local State 导出 JSON（只含改过的 `enabled_labs_experiments`）。导入先读 JSON，再把该数组整表覆盖写回 Local State，其它字段保持原样。
2. 不注入 `edge://flags`，不新增权限。写完后需结束所有 Edge 进程再打开，只关窗口会被内存里的旧列表盖掉。
3. 新文件 `edge-flags.js`、`option-edge-flags.js`。版本升到 1.8.135。

2026-10-14 09:32:00

1. oolafOffice 界面去掉 VibeOffice 痕迹：起始页删除 Feedback / GitHub 链接；About 与 Quire / Ledger / Lectern 任务窗去掉「2003 Web Edition」；开源许可页不再链到上游仓库，并去掉未随扩展分发的桌面（Tauri）条目。
2. `suite.js` 不再请求远程 updater、不再注册页面 Service Worker。NOTICE 仍保留上游出处。
3. 修对话框与侧栏按钮 hover 字色：Classic 保持墨色，Paper 主按钮保持白字；popup oolafOffice 快捷条 hover 也不再漂成错色。版本升到 1.8.136。

2026-10-14 09:40:00

1. oolafOffice 套件 logo 换成用户提供的 Word 文档 SVG：`icons/icon.svg`、maskable、favicon.ico、192/512/apple-touch 均由此导出。
2. 起始页左上角 / 欢迎图 / 标签页图标 / About 与各编辑器任务窗共用同一套标记；Quire / Ledger / Lectern 不再各画自己的旧图标。
3. 版本升到 1.8.137。

2026-10-14 09:45:00

1. 去掉「Edge 实验项」：概览里的导出 / 导入入口、`edge-flags.js`、`option-edge-flags.js` 一并删除。不再读写 Edge 的 Local State。
2. 版本升到 1.8.138。

2026-10-14 09:48:00

1. popup 固定高度从 560px 提到 600px（Chrome / Edge action popup 常见上限），空结果卡 `min-height` 略收，默认主界面三张引擎卡不再出现纵向滚动条。
2. 长译文仍只在结果区内滚动。版本升到 1.8.139。

2026-10-14 10:15:00

1. 修 Quire 打开中文审批表类 `.docx` 表格错位：`pctN` 底纹按「底色→前景色」混合（`pct10` 为浅灰，不再接近黑底）；行级 `tblPrEx` 边框参与绘制；东亚竖排 `tbRlV` / `tbLrV` 映射为 CSS writing-mode，跨行竖排字绝对定位以免撑爆首行。
2. 纵向合并允许在行与行之间分页，下一页补出剩余合并格，不再把整组考评行整块推走。版本升到 1.8.140。

2026-10-14 10:20:00

1. 按网上常见 Office 兼容问题补齐 oolafOffice：Word 百分比表宽 / 自动适应溢出缩放、嵌套表继承宽度、`noWrap` / `gridAfter`、缺失 grid 时用 `wPct` 重建；Excel CJK 自动换行、内置 `numFmtId` 27–58 年/月/日、主题 `majorEa` / `minorEa` 参与画布字体；PPT 读取 `a:ea` / `a:cs` 与主题东亚字体，表格单元格强制换行，竖排保留 `eaVert` 并用 writing-mode。
2. 套件字体栈：Arial / Calibri 等西文缺东亚字形时回退微软雅黑 / 宋体；Quire run 同时用 latin + EA + CS；Lectern 写出时 latin / ea / cs 可各写自己的 typeface。
3. 版本升到 1.8.141。重载后打开审批表、含中文换行/日期的 xlsx、含中文标题或竖排表的 pptx，对照桌面 Office / Google Drive 看列宽、折行、日期和字体。

2026-10-14 10:35:00

1. 修 Quire 宽表偏右：`jc=center` 且表宽大于版心时，CSS `margin:auto` 会变成 0 只往右溢。改为负 `margin-left`，左右对称伸进页边，与 Word / Google Drive 一致。
2. Ctrl / ⌘ + 滚轮改走套件自己的缩放（Quire / Ledger / Lectern），窗口捕获并 `preventDefault`，不再触发浏览器网页缩放。版本升到 1.8.142。

2026-10-14 10:50:00

1. 修 Quire 竖排合并格文字溢到表尾签字区 / 页脚：`writing-mode` 只挂在格内 `.cf`，不再挂在 `td` 上（单元格盒子转轴后会把标签画到合并区下面）。跨行竖排绝对定位 + `overflow:hidden`，按 `vAlign` 在合并格里居中，不再撑破行高。
2. 版本升到 1.8.143。重载后打开审批表：左侧「考评内容」竖排应停在合并格内，不应压到总分 / 签字行。

2026-10-14 11:05:00

1. 修 Quire 双栏文档图片撑破右栏：`1.docx` 这类 `w:cols num=2` 说明书里，产品图 / 参数表图比单栏宽，Word / Google 会按栏宽等比缩小。现在按栏宽（或单元格宽）缩放行内图，栏加 `overflow:hidden`，不再盖住右栏文字。
2. 版本升到 1.8.144。重载后打开该说明书：左栏标题+图+技术指标，右栏勾选指令，两栏不应重叠。

2026-10-14 11:25:00

1. oolafOffice 快捷键不再被浏览器抢走：`L.bindAppKeys` 在窗口捕获阶段 `preventDefault`（不 `stopPropagation`），F5 / Shift+F5、Ctrl+S / P / F / R / O / N、功能键、Ctrl++/−、Alt+←/→、非输入框 Backspace 等走套件命令。复制粘贴不拦截。
2. Quire / Ledger / Lectern 都挂上该层；Lectern F5 / Shift+F5 放映，放映中 F5 回到首页。版本升到 1.8.145。

2026-10-14 11:40:00

1. 修 Quire 中文公文行距过疏：`wcx.docx` 这类 Normal `line=408`（1.7 倍）+ `docGrid type=lines` linePitch=312 时，对齐网格应按字号占格，不应再乘 `lineFactor` 和自动倍数（原先 14pt 被算成两格再 ×1.7）。run 在网格下不再自设 line-height，避免撑开行盒。
2. 版本升到 1.8.146。重载后打开该文档，正文行距应接近桌面 Word。

2026-10-14 11:55:00

1. 修 Ledger 左键双击偶发跳到 XEC1048536 一类末行末列：选区边框双击原先按 Ctrl+方向走，空单元格会落到 `MAXR-1` / `MAXC-1`。双击边框改为进入编辑；Ctrl+方向停在已用区域，不再整表 1048576 / XFD。命中测试也限制在当前可见行列。
2. 版本升到 1.8.147。

2026-10-14 17:45:00

1. 为 Edge Add-ons 上传整理程序包：清单改为 i18n 名称/短描述，补 `default_locale: zh_CN` 与 `_locales/zh_CN`、`_locales/en`（短描述压到 132 字以内）；增加 `homepage_url`。
2. 新增 `pack-edge.py`：打 zip 根目录即为扩展（排除 `_metadata/`、`node_modules/`），并导出商店 Logo / 宣传图到 `dist/store/`。版本升到 1.8.148。

2026-10-14 17:50:00

1. 按商店「基本信息」收紧短描述（中英均不超过 80 字），并导出 128×128 图标、1280×800 / 640×400 宣传图。版本升到 1.8.149。

2026-10-15 09:29:18

1. 修 oolafOffice 自定义几何（`custGeom`）发虚/呈块状：`path@w/h` 是路径本地坐标系（如 293×238），不是 EMU。原先整段 `emu2pt` 再保留三位小数，轮廓被压成约 20 格，`bird.pptx` 左侧鸟形与微软 PPT 差一截。
2. Lectern `pptx-read.js` 与共用 `dml.js`：字面坐标按路径盒缩放到形状点；guide 名仍按 EMU 换算。自绘自由曲线（点单位、写出时再乘 12700）不受影响。
3. 版本升到 1.8.150。重载后打开该 pptx，左侧鸟应是平滑矢量，不再呈像素块。

2026-10-15 09:37:08

1. 修 Ledger 打开 `test.xlsx` 表头全红、合并蓝条缺右边框：共享字符串是「`*` 红 + 中文黑」，但 `mappedRuns` 只在符号字体时才返回 runs，整格套了单元格红字。
2. `layout.js` 对富文本一律返回 runs；`render.js` 按 run 上色。合并区右边/底边改从右上/左下格取边框（`A4:C4` 的右边在 C4）。
3. 版本升到 1.8.151。重载后打开该表：星号红、文字黑，第 4 行蓝条应有完整黑框。

2026-10-15 09:39:13

1. 修 Ledger 中文星期格式：自定义格式 `aaa` / `aaaa` 原先被当成普通字母，格子里直接显示 aaa，而不是周一、星期二。
2. `numfmt.js` 按 Excel 东亚约定解析：`aaa`→周日…周六，`aaaa`→星期日…星期六；节上 LCID 为日语 411 时用 日/月曜日。`TEXT` 与单元格格式共用此路径。
3. 版本升到 1.8.152。重载后打开工时统计表，「周几」列应显示周一、周二，不再是 aaa。

2026-10-15 09:45:58

1. 修 Quire 打开 CJJ181 一类报告时多出空白页、分页位置和桌面 Word 不一致：`w:br type="page"` 被画进段落（隐藏标记仍占一行+段后距），溢出后再分页就会叠出一页；页首的分页符、仅承载分节符的空段、以及「分页符已结束本节 / 下一节仍要新页」也会再开一页。
2. `layout.js`：分页符不再占高，页首重复分页符吞掉；空 `sectPr` 段不占正文；分节换页时丢掉无正文的过渡页；手动分页后取消段前距（与现网 Word 一致）。固定表若宽于栏宽则缩到栏内（`.pg-col` 会裁掉溢出版心的右侧），并尊重 `tblW` 的 dxa。
3. 版本升到 1.8.153。重载后打开该报告：分页符/分节符附近不应再多一页空白，宽表右侧不应被裁切。

2026-10-15 09:54:30

1. 项目从 `D:\code\oolaf - formant`（oolaf 仓 `formant` 分支）迁到独立仓库 `D:\code\formant`（`dirkhe1051931999/formant`，`main`），准备公开。
2. `AGENTS.md` 工作目录改为 `D:\code\formant`；README 本地加载改为选本仓库 `formant` 目录，不再写死旧路径。

2026-10-15 10:00:40

1. 加 GitHub Actions：`main` 每次提交（及手动触发）用 `pack-edge.py --zip-only` 打扩展 zip，发到 Releases，标签 `v<manifest.version>`；同版本再推会覆盖附件。
2. `pack-edge.py` 的 Pillow 只在出商店图时才 import，CI 不再依赖 PIL。版本升到 1.8.154。

2026-10-15 10:09:00

1. `AGENTS.md` 不再纳入 git：加入根目录 `.gitignore`（`/AGENTS.md`），并用 `git rm --cached` 从版本库删除，GitHub 上已上传的副本会随本次提交消失。
2. 本机文件保留，Cursor / 本地协作规则不受影响。README 去掉对仓库内该文件的目录项与链接，避免公开仓死链。

2026-10-15 10:52:52

1. README 增加「快速开始」，用 GIF 演示第一次配置（加载未打包扩展 + `option.html#sync` 填 Client API Key）和日常使用（popup 翻译、划词、New Tab 四卡）。
2. 新增 `scripts/render_readme_gifs.py`（Pillow）与 `docs/setup.gif`、`docs/usage.gif`，配色跟 formant 浅色 token；示例钥匙用占位符，不写入真实密钥。

2026-10-15 11:00:12

1. 能力总览每个功能补一张示例 GIF（翻译、New Tab、工具箱、识图、截屏、oolafOffice、词库、书签、图片另存为、Telegram、GitZip、V2EX、AutoPagerize、手势、代理、扩展管理、站点数据、代码美化，以及 X / Discord / elitepvpers / linux.do / 虎扑 / freefq / huavod / Gemini / Gmail / Axure / Vue / HLS）。
2. 生成脚本拆成 `gif_lib.py` / `gif_intro.py` / `gif_features_a.py` / `gif_features_b.py`，`python scripts/render_readme_gifs.py` 一次出齐；各文件不超过 500 行。

2026-10-15 15:25:00

1. linux.do 详情页底栏「回复」改为右下角固定浮层（accent pill），不用再滑到帖子底部；打开回复框 / 草稿 / 全屏时隐藏，避免挡住输入区。
2. 版本升到 1.8.155。重载后打开 `/t/`：滚动中途也应看到右下角回复钮，点开后该钮消失。

2026-10-15 15:28:00

1. 修正 linux.do 回复钮：Discourse 的 `#topic-footer-buttons` 要滑到最后一楼才插入，只把它 `position:fixed` 仍会「滑到底才出现」。
2. 改为进帖即挂自有右下角「回复」（常显），点击再触发站点原 create/reply；页底原生底栏隐藏，打开回复框时浮钮隐藏。
3. 版本升到 1.8.156。重载后打开 `/t/`：不用滚动，右下角就应有回复。

2026-10-16 11:39:31

1. Ledger（oolafOffice Excel）补上 Excel 97–2003 二进制 `.xls`（BIFF8）读取：原先 OLE 复合文档会当成「请先另存为 xlsx」直接失败。
2. 新增 `ledger/js/xls.js`，复用 `officeCrypto.cfb` 读 Workbook 流；能打开中文表名/单元格、数字、公式、合并格、列宽和日期序列。打开后保存仍走另存为 `.xlsx`，不写回二进制 `.xls`。加密码的旧版 `.xls` 仍不支持。
3. 打开对话框、起始页、帮助文案、README / NOTICE 写上 `.xls`。版本升到 1.8.157。重载后用起始页或 Excel 页打开本机 `.xls`，格子和公式应能显示，另存为 `.xlsx` 后桌面 Excel 能打开。

2026-10-16 11:50:12

1. 修 Ledger 打开真实 `.xls`（「副本定制化软件明细0927.xls」）弹窗 `Cannot read properties of undefined (reading 'map')`：BIFF8 SELECTION 写成了 `{r1,c1}`，网格 `G.vs()` 却对 `sel.ranges.map` 取值。
2. 选区改为 `{ r, c, ranges }`，网格对残缺选区做兜底；公式区域 token 按 rwFirst/rwLast/col 解析（`SUM(M2:M6)` 不再变成跨四万行）；`ptgFuncVar 255` 还原 `_xlfn.COUNTIFS(...)`。默认 ROW 记录不再铺 6 万空行。
3. 版本升到 1.8.158。重载后打开该 `.xls` 应直接进网格，不再弹 Ledger 2003 错误框。

2026-10-16 14:07:11

1. 修 Ledger 打开该 `.xls` 中文乱码和格子丢失：共享字符串跨 CONTINUE 时，读字符用 `need()` 先跳进下一段，把段首的 Unicode 标志 `0x01` 当成正文，于是「表展示」变成「栁喈㩜」，后面 SST 全部错位（长格乱码、EI 列空）。
2. CONTINUE 分段只在字符数据边界读 `fHighByte`，不再当正文。该表「低空安全管控服务平台」E763 起恢复为「设备情况详情列表展示」等，与桌面 Excel 一致。
3. 版本升到 1.8.159。重载后再打开该文件，「实时追踪 / 信息展示」各行中文和 EI/EQ 应齐。

2026-10-16 17:11:08

1. 工具箱增加「企业查询」：填企业名或统一社会信用代码，用天眼查 / 企查查 / 爱企查 / 启信宝等公开检索页打开新标签（回车默认天眼查，「常用四站」一次开四个）。可读取当前窗口最近访问的 http(s) 页选区。最近关键字只存 `formantCompanySearch`，不同步。
2. **未嵌入**「企业背景信息查询 14.851.69.10」的 Vue 打包、全站 content、DNR、独立 popup / options。不新增权限，不改 `action.default_popup`，不走 mono。
3. 版本升到 1.8.160。重载后打开工具箱，左侧应有「企业查询」；输入公司名点天眼查应新开检索页。

2026-10-16 17:50:00

1. 工具箱增加「象棋」人机：红方点选走棋，AI 在 Worker 里用迭代加深 + αβ（叶子只算子力/位置表，无假 sleep）。合步过滤自杀与飞将；将死或困毙判负。本机记忆 `formantXiangqi`（课表 / 开局档案 / 错题本），可锁定等级或清空。
2. 搜索数值参考 shibing624/chinese-chess-ai（Apache-2.0，`xiangqi/NOTICE`）。**未嵌入**其页面、样式、音效。不新增权限，不改 `action.default_popup`，不走 mono。
3. 版本升到 1.8.161。重载后打开工具箱，左侧应有「象棋」；走一步后 AI 应在约 1 秒内回手。

2026-10-19 09:20:00

1. 象棋盘面改成更接近实物：木色底、双线边框、炮位/兵林角标、九宫斜线、楚河汉界，棋子为浅色双圈楷体（红黑字）。走子滑动、吃子淡出、选子脉动、将军震动；选子/走子/吃子/将军/胜负/悔棋/新局用本机 Web Audio，可关，尊重 `prefers-reduced-motion`。
2. 渲染与音效拆到 `tools-xiangqi-board.js` / `tools-xiangqi-audio.js`，未拷 chinese-chess-ai 的 `audio.js`。音效开关存在 `formantXiangqi.sound`。
3. 版本升到 1.8.162。重载后打开象棋：走一步应看到棋子滑过去并听到落子声。

2026-10-19 09:28:00

1. 象棋对局写入 `formantXiangqi.game`，刷新工具箱页接着下。侧栏加人机 / 教学 / 双人，以及入门～加力与「自动」难度。教学模式用本机着法讲解（怎么走、为什么），可点「讲解提示」；双人同一棋盘轮走，悔一步。去掉「不走 mono…」说明文案。
2. 讲解在 `tools-xiangqi-teach.js`，不调用 GPT/mono。版本升到 1.8.163。

2026-10-19 09:35:00

1. 象棋侧栏收成两个下拉（模式、难度）+ 新局/悔棋，音效和清空记忆改成文字链，去掉右侧讲解框。
2. 教学文案改到棋盘气泡上，句子改成白话。版本升到 1.8.164。

2026-10-19 09:50:00

1. 象棋教学改为对战讲解：对方走完后，本机再算一步红方应着，气泡说明对方走了什么、建议你走哪步、为什么、思路是什么（不走 GPT/mono）。
2. 气泡右上角加 ×，只关掉当前条；对方再走、点「讲解提示」或关掉后再点棋，仍会出新气泡。版本升到 1.8.165。

2026-10-19 10:05:00

1. New Tab 设置增加「链接在新窗口打开」（`option.html#newtab`），写入主页 `baseConfig.openLinksInNewWindow`，随布局同步到 mono。
2. 开启后快捷图标用 `target="_blank"`，搜索提交也新开标签；关闭时仍替换当前 New Tab。默认关闭。版本升到 1.8.166。

2026-10-19 10:20:00

1. New Tab 页签换成自绘房子 ico（`icons/newtab.ico` / SVG / 16–48 PNG）：品牌蓝底、白屋、青绿窗，不再用浏览器默认文档图标。
2. 用 `chrome_settings_overrides.homepage` 接到 `newtab-home.html`：点浏览器主页按钮时，已有 New Tab 则激活该标签并后退回到当前页（如 V2EX）；没有则打开 New Tab。不新增 permissions。版本升到 1.8.167。

2026-10-19 10:25:00

1. 修主页按钮跳转：`tabs.get` / `goBack` / `update` 改回调并读掉 `runtime.lastError`，过期 tab id 不再刷「No tab with id」。
2. 去掉与已有 `host_permissions` 重复的 `optional_host_permissions`（`http://*/*` / `https://*/*`）。GitZip 在 dashboard 未就绪时不再 `setTheme`。版本升到 1.8.168。

2026-10-19 10:30:00

1. 去掉 `chrome_settings_overrides.homepage: newtab-home.html`：Chrome/Edge 只接受 http(s) 主页，相对路径会「无法加载扩展」。
2. 主页按钮改为：浏览器主页设成「新标签页」后，进覆盖页时若已有 New Tab 则激活并后退。删除 `newtab-home.html/js`。版本升到 1.8.169。

2026-10-19 10:35:00

1. 修 New Tab 蓝屏：主页跳转在 `goBack` 失败时仍 `return`，`newtab.js` 没跑，只剩默认浅蓝底和右上角按钮。
2. 改为先渲染主页，再尝试切到已打开的 New Tab。版本升到 1.8.170。

2026-10-19 10:40:00

1. 不再劫持浏览器主页按钮。改为快捷键 Ctrl+Home（命令 `formantNewtab`）：已有 New Tab 则切过去，没有则新开，当前页不动。
2. 去掉覆盖页里的主页跳转逻辑，避免再把页面渲成蓝屏。重载后若快捷键没绑上，到扩展快捷键页手动设 Ctrl+Home。版本升到 1.8.171。

2026-10-19 10:50:00

1. New Tab 页签没有房子图标：Chrome/Edge 把覆盖页当成 `chrome://newtab`，不读页面 `<link rel="icon">`。
2. 覆盖入口改为 `newtab-boot.html`，立刻跳到 `newtab.html`，并用绝对 PNG 地址写入 favicon。版本升到 1.8.172。

2026-10-19 10:55:00

1. New Tab 快捷图标拉站点 `/favicon.ico` 得到 404 时不再 `console.warn`。没有图标就用文字占位，属正常 miss。版本升到 1.8.173。

2026-10-19 11:00:00

1. 去掉 `newtab-boot.html` 跳转：覆盖页改回直接 `newtab.html`，新标签地址栏重新为空。Ctrl+Home 新开时用 `chrome://newtab/`，不再 `tabs.create` 扩展 URL。
2. 页签房子图标在真正的新标签覆盖页上，Chrome/Edge 仍可能显示默认文档图标。版本升到 1.8.174。

2026-10-19 12:05:00

1. 工具箱增加「油猴」：右侧 panel 管理已安装脚本（开关 / 筛选 / 当前页 / 导出 / 删除）；新建、导入（粘贴 / 文件 / URL）、Greasy Fork 搜索、编辑走 `#userscript/...` 二级页。兼容常见 UserScript 头与 `GM_*` / `GM.*`。
2. **未嵌入** Tampermonkey 5.5.1（本机 Edge `iikmkjmpaadaobahmlepeloendndfphd`）源码。注入优先 `chrome.userScripts`（新增权限 `userScripts`），不可用时退回内容脚本。总开关 `features.userscript.enabled`。不走 mono。
3. 版本升到 1.8.175。重载后打开工具箱应有「油猴」；安装一段 `@match` 脚本并刷新匹配页应能执行。新版浏览器若提示，需在扩展详情开启「允许运行用户脚本」。

2026-10-19 13:55:00

1. 对照本机 Tampermonkey 里已启用的 3 条脚本，从 Greasy Fork 拉源码放进本机 `userscript/_seed/`（gitignore，不进仓库）。扩展启动时若列表里还没有同名脚本就自动写入。
2. 版本升到 1.8.176。重载 formant 后打开工具箱 → 油猴，应看到这 3 条。若 Tampermonkey 仍开着，同一页会跑两遍，关掉其一。

2026-10-19 14:05:00

1. 工具箱增加 Lighthouse：右侧是历史报告列表，新建测评 / 报告详情走 `#lighthouse/new` 与 `#lighthouse/view/{id}`。测评走 Google PSI v5（与官方扩展 100.0.0.5 同一后端），可选手机/桌面与四类分数。
2. **未嵌入**本机 Edge `blipmdconlkpinefehnmjammfjpmpbjk` 的 popup-bundle。不能测 localhost 或需登录页。报告最多 20 条，存 `formantLighthouse`。不新增权限，不走 mono。
3. 版本升到 1.8.177。重载后工具箱左侧应有 Lighthouse；对一个公开站点测评后列表应出现分数。

2026-10-19 14:08:00

1. Lighthouse「PSI 请求太频繁」是 Google 免费 `runPagespeed` 接口没 API Key、配额很小。官方扩展并不调这个接口，只打开 `pagespeed.web.dev`。
2. 开始测评改为先开网页版；接口有额度才把分数写入列表，429 不再当成失败卡死。版本升到 1.8.178。

2026-10-19 14:12:00

1. 工具箱左侧目录按「编码 / 检索 / 网页 / 休闲」分组：编码含二维码到编码转换，检索含企业查询与识图，网页含油猴与 Lighthouse，休闲含象棋。
2. 仍只存 `formantToolsOrder`；拖拽只在同一组内生效。版本升到 1.8.179。

2026-10-19 14:22:00

1. HLS 播放页支持 `.m3u` 频道列表：主框架打开 `.m3u` 与 `.m3u8` 一样改到扩展播放页。列表按 EXTINF 解析，左侧选台，上下键换台；条目再走 hls.js。「存 MP4」保存当前频道。
2. 带 `#EXT-X-TARGETDURATION` / `#EXT-X-STREAM-INF` 的 `.m3u` 仍当单路 HLS。未嵌入第三方播放扩展。版本升到 1.8.180。

2026-10-19 14:36:00

1. HLS 播放页改成叠层控件（交互参考 DPlayer，未嵌入其源码）：点画面播停、空闲藏底栏、进度条带缓冲、音量条、齿轮倍速 / 旋转、双击全屏。`.m3u` 频道改到右侧抽屉。
2. 快捷键：空格播停，`F` 全屏，`M` 静音，`↑` `↓` 音量，`N` / `P` 换台。倍速旋转音量仍不写存储。版本升到 1.8.181。

2026-10-19 14:42:00

1. HLS 支持 TVBox `.txt` 频道表（`名称,地址` / `#genre#`，`#` 分隔的多线路只播第一条）。右侧抽屉按分组列出。
2. 主框架打开 `.txt` 时先嗅内容，不像频道表就不劫持，避免抢走普通文本。版本升到 1.8.182。

2026-10-19 15:08:00

1. IPTV 列表按台名合并（`CCTV-1` / `cctv1` 算同一个），多线路失败自动切源；更新时间那一行不进列表。
2. 抽屉显示当前 m3u/txt 与正在播的地址，可复制。底栏可管理已保存的列表源，并可查看列表源码。版本升到 1.8.183。

2026-10-19 15:14:00

1. `option.html#hls` 可添加 / 删除 / 设默认 m3u、txt 列表源，点「打开播放」进播放页。数据在本机 `formantHlsSources`，与播放页共用，不同步 mono。
2. 总开关仍在「功能」。版本升到 1.8.184。

2026-10-19 15:28:00

1. `option.html#sync` 增加「本机配置」JSON：导出 / 选文件导入 / 粘贴导入。含功能开关、New Tab（含链接新窗口打开）、V2EX、GitZip、自动翻页、手势、代理、X 推文样式、HLS 列表源、翻译模式、工具箱顺序、Discord 输入翻译、汇率币种。不含密钥、词库包、油猴与生词本。
2. 钥匙与配置两份文件用 `version` / `kind` 区分，互相导入会提示走错卡片。文件里没有的面板不动。版本升到 1.8.185。

2026-10-19 15:42:00

1. HLS 列表源从 `option.html#hls` 挪到工具箱「休闲」`tools.html#hls`：添加 / 删除 / 设默认 / 打开播放，数据仍是 `formantHlsSources`。
2. 总开关仍是设置 → 功能的 `features.hls.enabled`；关掉后工具箱不再列出 HLS，也不再劫持 .m3u8。旧的 `#hls` 设置页会跳到工具箱。版本升到 1.8.186。

2026-10-19 15:55:00

1. New Tab 把「下一个假期」和「汇率」合成一张卡，右上角用与热点英语/生词本相同的翻转图标切换；当前面存在本机 `formantHxFace`。
2. 第一行改为三卡等宽（`1.35fr×3`）：天气 / 假期·汇率 / 热点英语。版本升到 1.8.187。

2026-10-19 16:12:00

1. 工具箱 HLS 点播放先选位置：New Tab 第四卡或独立播放页；上次选择会标出。会话在本机 `formantHlsSession`，不进配置 JSON。
2. New Tab 第一行改回四卡（`1.35fr×4`），空位是 HLS 迷你播放：hover 切台 / 音量，图标打开当前 m3u 的完整播放页。天气刷新时卡片节点留下，避免拆掉画面。版本升到 1.8.188。

2026-10-19 16:18:00

1. New Tab HLS 卡空闲时不再用深底：与天气 / 汇率 / 生词本同玻璃底，标题 HLS，中间 `empty-status`（暂无播放 / 暂无播放源）。
2. 真正播起来才铺满深色画面。版本升到 1.8.189。

2026-10-19 16:22:00

1. New Tab HLS 不再记住播放中状态：刷新第四卡回到 empty。`formantHlsSession` 只留上次播放位置和一次性投放。
2. 切台 / 音量只在当前页有效。版本升到 1.8.190。

2026-10-19 17:40:00

1. New Tab HLS 空闲卡右上角增加播放按钮，播本机已保存源；有 `result.m3u8` 时优先它，否则用默认源。
2. 刷新后仍回到 empty，不记录播放中状态。版本升到 1.8.191。

2026-10-19 17:46:00

1. HLS 播放页频道抽屉「列表 / 播放」地址行右侧改为复制图标，点一下复制对应地址。
2. 版本升到 1.8.192。

2026-10-20 09:30:00

1. Quire 补上 Word 97–2003 `.doc` 读取（`quire/js/docbin.js`，走已有 `L.docbin` 入口）：正文、基本字体/对齐、表格单元格；打开后另存为 `.docx`。
2. 起始页 / 功能说明 / README 写明可打开 `.doc`，与 Excel 打开 `.xls` 同一套说法。版本升到 1.8.193。

2026-10-20 09:40:00

1. `.doc` 打开不再弹警告框，只在状态栏提示另存为 `.docx`。
2. 按行 TAP（`sprmTDefTable`）还原列宽和 `gridSpan`，页眉里的 PNG/JPEG 会读出来。

2026-10-20 09:50:00

1. Quire 表格左边框被 Word 2003 负缩进拉出 `.pg-col` 裁切区：compat 不再让表往左挂出，左对齐至少留 0.5pt，`.doc` 表补 `tblPr.ind` 和黑色框线。
2. 版本升到 1.8.194。

2026-10-20 09:55:00

1. 表不再左挂之后会贴满栏宽，右边框又被 `.pg-col` 裁掉；缩表时先扣掉左边距和右侧 0.5pt，左右外框都留在栏内。
2. 版本升到 1.8.195。

2026-10-22 10:40:00

1. 新增 GitHub issues 纯外文翻译：`features.githubIssues.enabled` 默认开启；只翻 github.com 的 issues 列表标题、详情标题和评论正文，固定译成中文。
2. 含汉字的中文或中外夹杂不翻；导航、用户名、标签和代码块不翻。走 Google translate-pa，不走 mono。颜色和字号复用 X 推文面板。
3. 版本升到 1.8.196。

2026-10-23 11:45:24

1. X 推文、elitepvpers、GitHub issues 翻译改为默认关闭。内容脚本只有开关明确为开才扫描并请求；打开后才把当前页可见的他人正文发给 Google translate-pa，关闭后立即停止。
2. 设置页说明写明发送对象、用途，以及关闭即停。已在本机保存为开启的配置保持原样。版本升到 1.8.197。


