# 工作流硬性规则

# - 仓库目录硬性映射（禁止用切分支/stash 代替换目录）：

# 1. formant 扩展代码只改 `D:\code\formant`（主实现目录 `formant/`）。

# 2. 依赖的 mono API / Admin 配置只改 `D:\code\aphelios - mono`；禁止在 formant 目录里假装改后端，也禁止在 mono 里堆扩展前端。

# 3. 改哪边就直接进入对应文件夹操作；禁止用 `git checkout` / `git stash` 在目录间“假装切换项目”。

# - 先分析调用链与影响面（popup / background / content / newtab / option / mono 接口），再改代码。

# - 不要无目的全仓库 grep；优先从入口（manifest、background、translate-api、sync）顺着读。

# - 修改完成后做冒烟：重载扩展、核心路径点一遍（翻译 / New Tab / 书签同步 / 词库管理 / 图片另存为 / 滚动截屏 / 鼠标手势）。无 TypeScript 工程时不强制 tsc；若后续引入 TS 则改完须无 TS 错误。

# - New Tab 热点英语：与天气/假期/汇率同一行四卡（`1.35fr×4`）；词数读 `formant.vocab.card_size`（默认 5）；IPA 标在单词上方（不进马赛克）；释义+谐音默认马赛克点击揭开；发音用浏览器 TTS；已会词按 Client API Key 隔离；模型只配 `formant.vocab.model_key`。

# - 每次更改代码后都要同步更新 LOGS.md（不是 README.md），并追加更改记录。

# 硬性要求：必须追加到 LOGS.md 文末「上一条更改记录之后」，按时间正序排列；禁止插入到文件中间、开头或任意位置；禁止打乱已有记录顺序。

# 格式如下：

# # 更改记录(可以小于或者大于3点，下面只是例子)

# 2026-06-25 19:19:19

# 1.

# 2.

# 3.

# （若文件已有标题 `# 更改记录`，不要重复写标题，只追加时间戳与条目。）

# - LOGS.md / AGENTS.md / README.md / DESIGN.md 等中文 Markdown 编码硬性约束：

# 1. 文件必须始终为 UTF-8（推荐无 BOM）。禁止用系统默认编码（Windows 下常为 GBK/CP936）写入或追加。

# 2. 追加更改记录时，优先用编辑器/写入工具直接改文件；若必须用 Shell，PowerShell 禁止 `>>`、`Out-File`、`Set-Content` 的默认编码，须显式 `-Encoding utf8`（或等价 UTF-8 无 BOM 写法）；禁止把中文经管道/重定向按默认 code page 落盘。

# 3. 写入后须确认文件可被严格 UTF-8 解码，且正文不含 U+FFFD 替换字符；若出现乱码或混入 GBK 字节，必须先修复再继续追加，禁止在已损坏内容上继续写。

# 4. 根因说明：在 UTF-8 文件中用 GBK 追加中文会造成「同一文件混合编码」；随后按 UTF-8 打开并保存会把无法解码的字节变成 U+FFFD，造成不可逆丢失。

# - README.md 更新判定（与 LOGS.md 分开）：

# 需要更新：新增需求/功能、重构导致行为或架构变化、产品能力/入口/模块边界/对外依赖（mono 路由、权限、配置键）等发生变化时，必须基于当前 README 增量修订描述，使文档与现网一致。

# 不需要更新：无本质行为变化的改动，例如加/改 console、调整代码顺序、纯可读性整理、重命名仅限内部、样式微调且不改变产品能力等。

# - DESIGN.md：扩展 UI 视觉与 token 规则；改主题色、字号层级、圆角/阴影策略或跨页面视觉语言时须同步修订 DESIGN.md。

# - 密钥与配置：

# 1. 禁止把 DeepLX API Key、ChatAnywhere、Client API Key 等密钥写进扩展仓库或提交到 git。

# 2. 服务端密钥只放 mono Admin 配置（如 `formant.translate.*`）；扩展只保存用户填写的 mono Base URL + Client API Key（chrome.storage）。

# 3. 新增依赖 mono 的接口时，必须同步评估 Admin Web API 目录、config-definition、以及 formant README 中的接口说明。

# 4. 以后新增只存在本机的配置 JSON（API Key、Model、Client ID、Base URL 等用户填写的钥匙），必须同时接入 `option.html#sync` 的导出 / 导入（`option-keys.js`）。按面板名加字段；文件里没有的面板导入时不动。改了文件形状就递增 `version`，旧版本拒绝导入。不要另做第二套导入导出。密钥仍禁止写入仓库。

# - Chrome 扩展（MV3）规则：

# 1. 权限最小化；新增 `permissions` / `host_permissions` 须在 README 与 LOGS 说明用途。

# 2. Service Worker（`background.js`）禁止假设长期常驻；异步逻辑要可重入，重要状态落 `chrome.storage`。

# 3. 内容脚本与页面隔离：UI 尽量 Shadow DOM；勿污染宿主页全局样式/全局变量。

# 4. 与页面通信走 `chrome.runtime` / `chrome.tabs` 消息；勿把密钥注入 content script 全局。

# 5. `options_ui` 页面为通用 `option.html`（`open_in_tab: true`）：壳层导航 + 多面板（`#general` / `#lexicon` / …）；新管理能力加面板模块，不要再为单项功能另开独立 options 页。词库逻辑在 `option-lexicon.js`。

# - 翻译与词库规则：

# 1. 路由打分读 `lexicon-runtime` 合并结果（内置包 + 自定义包），不要再把静态 `TRANSLATE_LEXICON_SORTED` 当唯一真相源。

# 2. 内置词库包只读；用户扩展走自定义包（storage）或 JSON 导入。

# 3. Google → mono Google → DeepLX（本机 Key，直连 api.deeplx.org）的失败兜底链路保持清晰；改路由须同步 popup / 划词面板文案。X / Discord / elitepvpers 仍只走 Google translate-pa，不调用 DeepLX。

# - 组件化与文件规模规则：

# 1. 按模块拆分（translate / lexicon / sync / newtab / image-save / speak / gestures / telegram / x-translate / discord / elitepvpers / linuxdo / freefq / huavod / gemini / gmail），避免 background 或 popup 无限膨胀。

# 2. 单个源码文件不能超过 500 行；接近上限时必须拆分。

# - 每次改完代码不要为了“验证”去跑无必要的全量 build/打包；以扩展重载 + 冒烟为准。

# - 若环境已接入 CodeGraph：每次开发完成后运行 `codegraph sync`，保持索引与代码同步。

# - V2EX Plus（GPLv3）集成规则：

# 1. `formant/v2ex-plus/` 是来自 V2EX Plus 2.1.3 的 GPLv3 衍生模块；必须保留其 `COPYING`、`NOTICE` 和 README 中的来源/许可说明。任何分发该整合的 formant 都须按 GPLv3 处理。

# 2. V2EX 兼容设置固定使用 `chrome.storage.sync.options`，字段名、默认值及 `checkinDate` 兼容上游；不要迁移到 formant local storage，也不要新增独立 options/manage 页。

# 3. V2EX 功能总开关只读 `features.v2ex.enabled`：关闭时必须停 alarm、badge、DNR、content 增强和 sov2ex 菜单；保留 formant popup 作为 action 点击入口，禁止接入上游 `action.onClicked`。

# 4. `v2ex-plus/` 内的上游衍生 content 模块允许因保留功能而接近 500 行；formant 自有 bridge、option 和 adapter 文件仍遵守单文件不超过 500 行规则。

# - GitZip（MIT，公开仓库模式）集成规则：

# 1. `formant/gitzip/` 是基于 GitZip for github 1.0.5 的 MIT 许可行为改造；必须保留 `LICENSE`、`NOTICE`、`THIRD_PARTY_NOTICES` 及 README 来源说明。整合 V2EX Plus 后，整个 formant 分发的 GPLv3 约束不变。

# 2. 仅支持公开 GitHub 仓库：禁止保存/读取/传递 GitHub PAT，禁止接入 OAuth、`gitzip.org` 回调、keysync、autosave 或上游独立 popup/options 页面；所有 GitHub API 请求不得附带 `Authorization`。

# 3. GitZip 总开关固定读取 `features.gitzip.enabled`；关闭后必须停止 GitHub 页面注入、悬浮下载面板和 `formant.gitzip.*` 菜单，同时保留 formant action popup。

# 4. GitHub 右键菜单只通过 `gitzip-bridge.js` 和 `background.js` 的 `ensureContextMenus()` 管理；禁止 GitZip 或其他模块调用 `chrome.contextMenus.removeAll()`，只可按 formant 自有 ID 移除/更新。

# 5. GitHub 内容脚本仅匹配 `*://github.com/*`，浮动进度面板必须使用 Shadow DOM；`formantGitzip` 只保存选择方式与主题，不得扩展为令牌存储。

# - AutoPagerize（GPL/MIT）集成规则：

# 1. `formant/autopagerize/` 核心逻辑来自 AutoPagerize 0.3.9（swdyh），GPL 许可（兼容 GPLv3）；扩展抽象层 MIT。必须保留 `LICENSE`、`NOTICE` 和 README 来源说明。

# 2. 移除上游 wedata.net 自动更新端点；内置 `siteinfo.json`（由上游 JSONP 转换的纯 JSON）是主站点规则源，另有 `content/siteinfo-builtin.js` 高优先级覆盖（如现代 Google/Bing）；用户可在 `option.html#autopagerize` 配置排除规则。更新 bundled siteinfo 时须递增 `AUTOPAGERIZE_SITEINFO_VERSION` 以刷新 storage 缓存。

# 3. AutoPagerize 总开关固定读取 `features.autopagerize.enabled`；关闭后所有站点停止自动翻页，设置保留在 `chrome.storage.local.formantAutopagerize`。

# 4. 内容脚本匹配 `http://*/*` 和 `https://*/*`（`all_frames: false`）；同域下一页由 content script 带 cookie 拉取，跨域才走 background SW；状态条必须使用 Shadow DOM 隔离样式。`linux.do` 必须硬排除（Discourse 自带无限滚动），不依赖用户排除列表。

# 5. 下一页 HTML 解析后必须 `removeScripts` 再插入 DOM；不得在宿主页执行远端脚本。

# - 轻量鼠标手势规则：

# 1. 禁止整包嵌入 smartUp Gestures（含本机 Edge 扩展目录、minified JS、独立 popup/options、`onMessageExternal` / `executeScript({code})`）。formant 自研右键划动，行为仅参考常用映射。

# 2. 总开关固定读取 `features.gestures.enabled`（默认关闭，避免与已装 smartUp 双触发）；关闭后 content 立即停止划动与轨迹，映射保留在 `chrome.storage.local.formantGestures`，并可经 `GET/PUT /client/gestures` 按 Client API Key 同步到 mono（总开关本身不同步）。

# 3. 内容脚本仅匹配 `http://*/*` 和 `https://*/*`（`all_frames: false`）；只认右键（button === 2）；位移小于阈值必须放行原生右键菜单；`input` / `textarea` / `contenteditable` 内不触发。

# 4. 轨迹 overlay 必须 Shadow DOM；动作经 background `FORMANT_GESTURE_RUN`（后退 / 前进 / 刷新 / 关 http(s) 标签 / 滚动）；禁止改 `action.default_popup`，禁止 `contextMenus.removeAll()`，不新增权限。

# 5. 设置页 `#gestures`：固定行为 ID（back / forward / reload / closeTab / scrollTop / scrollBottom）支持增删改查。画板左键绘制；圈（O）不必闭合；✕（X）可两笔交叉。预览图按 Client API Key 存 S3（`formant/gestures/{apiKeyId}/{action}/`），改绑按行为 ID 删旧图；列表同时显示箭头/圈/✕ 与图片。刷新动作必须 `tabs.reload({ bypassCache: true })`。`edge://` / `chrome://` / 扩展商店无法注入。刷新=拉取、同步=上传；空映射不得覆盖云端已有自定义。同一手势不能绑两个动作。网页上仍只认右键划动。

# - 轻量 Proxy 规则：

# 1. 使用原生 `chrome.proxy.settings`（direct / system / pac_script / fixed_servers）；禁止整包嵌入 SwitchyOmega 或拷贝其 minified JS。

# 2. 配置仅存 `chrome.storage.local.formantProxy`（含 `pac.url` / `pac.data`）；默认 `activeId` 为 `system`；固定代理默认端口 `7890`；总开关读取 `features.proxy.enabled`，关闭时必须 `clear` 扩展代理控制并保留配置。

# 3. 完整管理在 `option.html#proxy`；popup 只做快捷切换，禁止另开 proxy popup 或改写 `action.default_popup`。

# 4. 首版不做代理认证（无 webRequestAuthProvider）；用户 profiles 上限 5 条；PAC 同时有 URL 与本地脚本时优先应用本地脚本。

# - 轻量扩展管理规则：

# 1. 使用原生 `chrome.management`（列表 / setEnabled）；禁止整包嵌入「扩展管理器」或拷贝其 minified JS。

# 2. 总开关读取 `features.extensions.enabled`；关闭时设置页只读提示，禁止主动改动其它扩展状态。

# 3. 完整管理在 `option.html#extensions`；popup 二级视图（与站点数据同级）可列表开关；禁止另开独立 popup 或改写 `action.default_popup`。列表须排除 `chrome.runtime.id` 与非 `extension` 类型。

# 4. 首版不做分组/锁定/别名/导入导出/角标。

# - 轻量站点数据提取规则：

# 1. 使用原生 `chrome.cookies` + `chrome.scripting.executeScript` 读取当前页 Cookie / localStorage / sessionStorage；禁止整包嵌入「Cookie和Storage提取器」或拷贝其源码。

# 2. 总开关读取 `features.siteData.enabled`；关闭时隐藏 popup 入口；允许单条删除与当前 Tab「清除」全部（均须确认）；不做任意写入或跨站批量操作。

# 3. 入口固定为 popup 二级视图（与书签同级）；禁止另开独立 popup 或改写 `action.default_popup`；仅支持 http/https 活动标签。

# 4. 首版不做跨站批量导出、DevTools 面板或编辑功能。

# - 轻量 Telegram 受限媒体下载规则：

# 1. 禁止整包嵌入 TG Downloader（含本机 Edge 扩展目录、minified JS、独立 popup、`identity`、igtools.ai / vidsaver.io / tgvideodownloader.com）。formant 自研，仅保存当前已登录用户在 Telegram Web 里已经能看到的图片/视频。

# 2. 总开关固定读取 `features.telegram.enabled`（默认开启）；关闭后立即停止观察、卸 Shadow DOM 按钮，MAIN world hook 不再响应下载。

# 3. 内容脚本仅匹配 `https://web.telegram.org/*`、`https://webk.telegram.org/*`、`https://webz.telegram.org/*`（`all_frames: false`）。允许保存的普通会话不插按钮，用 Telegram 自带下载。

# 4. 下载钮与进度条必须 Shadow DOM；大文件在页面 MAIN world 用 blob + `<a download>` 保存，禁止把整段视频经 `chrome.runtime` 传 data URL。禁止改 `action.default_popup`，禁止 `contextMenus.removeAll()`，不新增权限。

# 5. 首版只做图片与视频；不做贴纸 / 音乐 / 语音 / Stories。

# - 轻量 X 推文翻译规则：

# 1. 禁止整包嵌入 Post Translator / Tweet Google Translate（含本机 Edge 扩展目录、jQuery、minified JS、独立 popup）。formant 自研：只给当前已登录用户在 X 时间线已经能看到的推文正文补译文。

# 2. 总开关固定读取 `features.xTranslate.enabled`（默认开启）；关闭后立即停扫、卸 Shadow DOM 译文。外观存 `chrome.storage.local.formantXTranslate`（颜色 / 字号），**不同步到 mono**；总开关本身也不同步。

# 3. 内容脚本仅匹配 `https://x.com/*`、`https://pro.x.com/*`、`https://twitter.com/*`（`all_frames: false`）。找 `div[data-testid='tweetText']`；串行翻译（同时只翻 1 条）。目标语言读 `translateTarget`。

# 4. 译文必须 Shadow DOM；样式用用户选的颜色和字号（默认 `#8c8c8c` / `14px`）。设置在 `option.html#x-translate`。禁止改 `action.default_popup`，禁止 `contextMenus.removeAll()`，不新增权限。

# 5. **这条路径只走 Google translate-pa（gtx）**，禁止 `translateGoogle()` / `translateSmart()` / `clientPost` / GPT / DeepLX，避免花 Client API Key。失败静默跳过该条，稍后重试。popup / 划词的 Google 仍可走现有 mono 兜底。

# - 轻量 linux.do 列表规则：

# 1. 禁止整包嵌入 linuxdo-lark-ui 油猴或其它 linux.do 换皮脚本。列表换皮参考其「CSS 盖 Discourse `.topic-list` + 幂等列名 + MutationObserver」手法；必须保留 `formant/linuxdo/LICENSE` 与 `NOTICE`。

# 2. 总开关固定读取 `features.linuxdo.enabled`（默认开启）；关闭后立即去掉 `formant-linuxdo` / `formant-linuxdo-list` / `formant-linuxdo-topic` class、停 observer、卸列名与隐藏标记。总开关不同步到 mono。若本机已装同类油猴会双层换皮，关掉其一即可。

# 3. 内容脚本仅匹配 `https://linux.do/*`（`all_frames: false`）。列表页：表格结构、紧凑分类 Tab；未读/新帖左侧 accent 竖条；底栏分类常显、tag 悬停再出。列表与顶栏/全页搜索内 `/t/` 帖子链接左键 `window.open(..., "_blank")` 新标签（不包装 pushState；修饰键交浏览器）；搜索面板与列表共用 token。详情页 `/t/`：阅读向精简（藏统计条、右侧楼层轴、装饰徽章；点赞/回复常显，分享等悬停才出）；楼主帖左侧 accent 竖条；引用/代码块统一 fill。列表与详情都隐藏顶栏 logo/汉堡/语言、公告、类别/标签、侧栏底聊天与工具条。禁止改 favicon；禁止碰楼中楼重排、列表预览、聊天页/私信/管理。侧栏导航分区本身不重排。

# 4. 宿主页 CSS 选择器必须挂在 `html.formant-linuxdo` / `-list` / `-topic` 前缀下（无法 Shadow DOM）。配色用 formant token（`#1f4b99` 等），不要飞书蓝或文档行图标。禁止 MAIN world / `history.pushState` 包装。禁止改 `action.default_popup`，禁止 `contextMenus.removeAll()`，不新增权限。

# 5. AutoPagerize 必须硬排除 `linux.do`（Discourse 自带无限滚动），与本开关无关。首版不另开 options 面板。

# - 轻量 freefq 导出规则：

# 1. 禁止整包嵌入第三方「网页解除复制 / 文章下载」扩展。formant 自研：仅处理 freefq.com 帖子详情里已经渲染在 DOM 的正文，一键导出 UTF-8 TXT。

# 2. 总开关固定读取 `features.freefq.enabled`（默认开启）；关闭后立即卸 Shadow DOM 导出钮、去掉 `formant-freefq-unlock`、恢复站点原禁复制钩子。总开关不同步到 mono。

# 3. 内容脚本仅匹配 `*://freefq.com/*`、`*://www.freefq.com/*`（`all_frames: false`）。PC 正文优先 `td#text`，移动端 `/m/` 用 `div.wz`；标题读 `.title_info h1` / `h3.bt`。导出经 background `FORMANT_FREEQ_EXPORT_TXT` + `chrome.downloads`（已有 downloads 权限），不新增权限。

# 4. 导出钮必须 Shadow DOM；开启时须放开划选/复制/右键（清站点 on* 钩子 + 捕获阶段拦住页尾重绑）。禁止改 `action.default_popup`，禁止 `contextMenus.removeAll()`。首版不另开 options 面板、不同步 mono。

# - 轻量 huavod 控制台解锁规则：

# 1. 禁止整包嵌入第三方 DevTools unlock 扩展。formant 自研：仅针对 huavod.com 上的 `disable-devtool`（开 F12 会 `history.back` / 清页）。

# 2. 总开关固定读取 `features.huavod.enabled`（默认开启）；关闭后撤 DNR 拦截并停止 MAIN world 挂起。总开关不同步到 mono。

# 3. 内容脚本匹配 `*://huavod.com/*`、`*://www.huavod.com/*`（`all_frames: true`）：`document_start` MAIN world 挂起 `DisableDevtool.isSuspend`，并无用户手势时吞掉 `history.back` / `history.go(-n)`；background 动态 DNR 拦截 URL 含 `disable-devtool` 的 script（initiator 限 huavod）。不新增权限（已有 `declarativeNetRequest`）。

# 4. 禁止改 `action.default_popup`，禁止 `contextMenus.removeAll()`。首版不另开 options 面板。

# - 轻量 Discord 聊天翻译规则：

# 1. 禁止整包嵌入第三方 Discord 翻译扩展。formant 自研：只在用户点击时翻译当前频道已渲染的消息正文，不翻成员列表、输入框、侧栏，也不自动翻上滚新加载的历史。

# 2. 总开关固定读取 `features.discord.enabled`（默认开启）；关闭后立即卸右下角按钮和 Shadow DOM 译文。总开关不同步到 mono。译文颜色 / 字号复用 `chrome.storage.local.formantXTranslate`，目标语言读 `translateTarget`。译文记录只留在页面内存，刷新即清空，不写 `chrome.storage`。

# 3. 内容脚本匹配 `https://discord.com/*`、`https://ptb.discord.com/*`、`https://canary.discord.com/*`（`all_frames: false`）。按钮只在 `/channels/` 显示。窗口键是 `/channels/{guild|@me}/{channelId}`。当前页是 `[data-list-id="chat-messages"]` 里 `[id^="message-content-"]` 的 id 列表。换频道为新窗口；同一频道 id 列表变化为新页。串行翻译，同时只翻 1 条。已翻过的正文被页面重绘时只从内存补回，不因此请求新页。

# 4. 译文和按钮必须 Shadow DOM。这条路径只走 Google translate-pa（gtx），禁止 `translateGoogle()` / `translateSmart()` / `clientPost` / GPT / DeepLX。失败留到下一次点击重试。禁止改 `action.default_popup`，禁止 `contextMenus.removeAll()`，不新增权限，不另开 options 面板。

# 5. 例外（仅输入框译英文，`discord/content/input.js` + `FORMANT_DISCORD_INPUT_TRANSLATE`）：输入框右侧图标（样式与相邻 Discord 图标一致），用户点菜单才请求；可选 Google（translate-pa）或 GPT（`translateGpt`，经 mono，消耗 Client API Key）。仅此入口允许 GPT；禁止 `translateSmart()` / DeepLX / 自动触发 / 不点选就请求。聊天消息翻译（第 4 条）不变。引擎偏好存 `formantDiscordInput`（无密钥，不同步）。

# - 轻量 elitepvpers 帖子翻译规则：

# 1. 禁止整包嵌入第三方论坛翻译扩展。formant 自研：只给 elitepvpers 已渲染的帖子标题和楼层正文补译文，不翻导航、用户名、签名或整页。

# 2. 总开关固定读取 `features.elitepvpers.enabled`（默认开启）；关闭后立即停扫、卸 Shadow DOM 译文。总开关不同步到 mono。译文颜色 / 字号复用 `chrome.storage.local.formantXTranslate`，目标语言读 `translateTarget`。

# 3. 内容脚本仅匹配 `*://elitepvpers.com/*`、`*://www.elitepvpers.com/*`（`all_frames: false`）。列表标题 `a[id^="thread_title_"]`；帖子页标题 `h1[itemprop="headline"]`（否则短 `div.cwhead`）；楼层标题 `td[id^="td_post_"] > div.smallfont`；正文 `div[id^="post_message_"]`。串行翻译，同时只翻 1 条。

# 4. 译文必须 Shadow DOM。这条路径只走 Google translate-pa（gtx），禁止 `translateGoogle()` / `translateSmart()` / `clientPost` / GPT / DeepLX。失败静默跳过，稍后重试。禁止改 `action.default_popup`，禁止 `contextMenus.removeAll()`，不新增权限，不另开 options 面板。

# - 轻量 Gemini 去水印规则：

# 1. 禁止整包嵌入 Gemini 水印助手 / gemini-watermark-remover。formant 自研 fetch 钩子：只处理 gemini.google.com 与 business.gemini.google 上 googleusercontent 的 `gg` / `rd` 成图，下载时去掉右下角水印。蒙版与反混合保留 MIT 来源说明（`gemini/NOTICE`）。

# 2. 总开关固定读取 `features.gemini.enabled`（默认开启）；关闭后 MAIN world 不再改写这些图片响应。总开关不同步到 mono。设置只在 `option.html#features`，含说明文字，不另开面板。

# 3. 内容脚本匹配 `https://gemini.google.com/*`、`https://business.gemini.google/*`（`all_frames: false`）。`document_start` MAIN world 挂钩 `fetch`；隔离世界经 `FORMANT_GEMINI_FETCH` 让 service worker 拉原图（内容脚本 fetch 会被 CORS 拦住），再在页面里反混合。不新增权限。禁止改 `action.default_popup`，禁止 `contextMenus.removeAll()`。

# - 轻量 HLS 播放规则：

# 1. 禁止整包嵌入 Native HLS Playback（含 jQuery、多版本 hls.js、独立 popup）。formant 自研：只把主框架打开的 `.m3u8` 改到扩展播放页。只附带一份 hls.js 1.6.10（Apache-2.0，`hls/NOTICE`）。

# 2. 总开关固定读取 `features.hls.enabled`（默认开启）；关闭后不再劫持 `.m3u8` 导航，地址栏关键字 `m3u8` 也不再打开播放页。总开关不同步到 mono。倍速、旋转、音量只留在当前播放页，关闭标签后回到 1x / 0°，不写 `chrome.storage`。设置只在 `option.html#features`，含说明文字，不另开面板。

# 3. 只处理主框架，pathname（忽略大小写、query、hash）以 `.m3u8` 结尾。不处理 iframe，不注入页面里已有的 `<video>`。播放页脚本用原生 JS：`$` 只是 `querySelector`，事件用 `addEventListener`，禁止引入 jQuery。

# 4. 权限只新增 `webNavigation`。禁止改 `action.default_popup`，禁止 `contextMenus.removeAll()`。

# 5. 播放页 `←` `→` 快退 / 快进（5 秒，Shift 为 30 秒）。「存 MP4」只封装当前播放列表：MPEG-TS 走 mux.js 6.3.0（Apache-2.0，见 `hls/NOTICE`），fMP4 拼接 init + 分片，AES-128 在页面内解密。不引入 ffmpeg，不支持 SAMPLE-AES。直播只保存当前已列出的分片。

# - 轻量 Gmail 邮箱规则：

# 1. 只在 `https://mail.google.com/*` 顶栏显示当前登录的 Google 邮箱，方便选中和点击复制。其它域名不注入。

# 2. 总开关固定读取 `features.gmail.enabled`（默认开启）；关闭后立即卸掉这块文字。总开关不同步到 mono。设置只在 `option.html#features`，含说明文字，不另开面板。

# 3. 内容脚本仅匹配 `https://mail.google.com/*`（`all_frames: false`）。邮箱优先读账号按钮 `aria-label`，读不到再用 MAIN world 的 `GLOBALS`。文字放在问号（支持）和齿轮（设置）左边的空白；必须 Shadow DOM。禁止改 `action.default_popup`，禁止 `contextMenus.removeAll()`，不新增权限。

# - 轻量 Axure 本地原型规则：

# 1. 禁止整包嵌入 Axure RP Extension（含本机 Edge 扩展目录、图标、固定扩展 ID 公钥）。formant 自研：只给本地 `file://` 发布的 Axure HTML 在框架之间转发已有的 `axureEventSenderDiv` / `axureEventReceiverDiv` 消息。

# 2. 总开关固定读取 `features.axure.enabled`（默认开启）；关闭后立即停监听、去掉 `pluginDetected`。总开关不同步到 mono。设置只在 `option.html#features`，含说明文字，不另开面板。

# 3. 内容脚本仅匹配 `file://*`（`all_frames: true`，`document_end`）。没有这两个事件节点的本地文件直接返回。选择器用 `$`（`querySelector`），禁止引入 jQuery。首页有 `#mainFrame` 时给 `body` 标 `pluginDetected`。禁止改 `action.default_popup`，禁止 `contextMenus.removeAll()`，不新增权限。浏览器仍须在扩展详情里允许访问文件 URL。若同时装着官方 Axure RP Extension，关掉其一。

# - 轻量 Vue 组件检查规则：

# 1. 禁止整包嵌入 Vue.js devtools（含本机 Edge 扩展目录、webpack `build/`、独立 popup、图标和固定扩展 ID 公钥）。formant 自研：只在 DevTools 增加「Vue」面板，查看组件树、props / setup / data、Pinia 或 Vuex 的当前状态，并高亮选中组件。

# 2. 总开关固定读取 `features.vue.enabled`（默认开启）；关闭后已打开页面停止检查，新页面不再注入 hook。总开关不同步到 mono。设置只在 `option.html#features`，含说明文字。检查界面是现有 `devtools_page` 上的第二个面板，不另开 popup。

# 3. hook 用 `chrome.scripting.registerContentScripts` 注入 `http://*/*` 与 `https://*/*`（`world: "MAIN"`，`document_start`，`all_frames: true`）。页面上已有 `__VUE_DEVTOOLS_GLOBAL_HOOK__` 时不覆盖。Vue 2 走 `init` / `vuex:init` 和 `__vue__`，Vue 3 走 `app:init`。选择器用 `$`（`querySelector`），禁止引入 jQuery。高亮层必须 Shadow DOM。检测到 Vue 时只改当前标签的工具栏图标，在 formant 图标右上角加绿色 V；离开页面或关闭开关后恢复。不用 `setBadgeText`。禁止改 `action.default_popup`，禁止 `contextMenus.removeAll()`，不新增权限。生产构建需要 Vue 的 devtools 标志。只检查 DevTools 所看的顶层页面。若同时装着官方 Vue.js devtools，关掉其一。

# - 轻量工具箱规则：

# 1. 禁止整包嵌入 FeHelper（前端助手）（含本机 Edge 扩展目录、Vue 页面、jQuery、evalCore、minified JS、AI 功能、捐赠入口）。formant 自研：只做二维码（生成 / 识别）、时间戳、JSON 美化、JSON 对比、图片 Base64、编码转换；功能范围参考 FeHelper 2026.7.28（MIT），第三方库只有 qrcode-generator（MIT）与 zxing（Apache-2.0），放 `formant/tools/vendor/` 并保留 `NOTICE`。

# 2. 入口固定为 popup 顶栏「工具箱」图标（`#toolsNavBtn`，`popup-tools.js`）→ 新标签页 `tools.html`；识图是工具箱内的左右布局面板（`tools-image-prompt.js`，`imagePrompt.enabled` 不变，不再有独立页）。列表项可拖拽排序（`chrome.storage.local.formantToolsOrder`，仅 id 顺序），标题带图标（`tools-icons.js`），不写二级说明话术；JSON 美化多页只存内存，刷新重置。popup 顶栏图标总数不得继续增加（宽度已满）；新增同类小工具只加进工具箱列表，不要再加顶栏图标。禁止改 `action.default_popup`，禁止 `contextMenus.removeAll()`，不新增权限。

# 3. 总开关固定读取 `features.tools.enabled`（默认开启，不同步到 mono）；图标可见条件 = 工具箱或识图任一开启，关闭工具箱后列表只剩识图。设置只在 `option.html#features`，含说明文字，不另开面板。

# 4. 禁止引入 jQuery / Vue；选择器统一 `tools-dom.js` 的 `$`（`querySelector`）与 `$$`（`querySelectorAll`）。每个工具一个模块 `export function mount(root)`，纯函数放 `*-lib.js` / `*-core.js`，由 `tools-page.js` 懒加载；单个源码文件不超过 500 行（vendor 除外）。扩展页 CSP 不允许 eval / 内联脚本。

# 5. 全部在本机运行，不上传内容、不走 mono、不保存密钥或本机配置 JSON（因此不接入 `option-keys.js`）；JSON 树视图复用 `viewer.js`（`window.OolafJsonViewer`），不要另写一套。JSON 工具须保留超出 2^53 的整数原文；编码转换不做 AI 解码。

# - 轻量滚动截屏规则：

# 1. 禁止整包嵌入 GoFullPage / Awesome Screenshot / 其它截屏扩展。formant 自研：按需注入内容脚本，用 `chrome.tabs.captureVisibleTab` 逐屏采集，OffscreenCanvas 拼接后 `chrome.downloads` 保存 PNG。

# 2. 总开关固定读取 `features.screenshot.enabled`（默认开启）；关闭后隐藏右键菜单。总开关不同步到 mono。设置只在 `option.html#features`，含说明文字，不另开面板。

# 3. 入口为页面右键「formant 整页滚动截屏」/「formant 截取可见区域」（各一条顶层菜单，一点即截）。内容脚本按需 `scripting.executeScript` 调 isolated-world 调度器，不依赖 `tabs.sendMessage`，不写进 manifest 常驻匹配。只处理 http / https 主框架。进度条必须 Shadow DOM；截每一屏前先藏 overlay。失败要在页面上提示，不能只靠系统通知。下载用 FileReader data URL（SW 没有 `createObjectURL`）。禁止改 `action.default_popup`，禁止 `contextMenus.removeAll()`，不新增权限。

# 4. 整页以开始时的 scrollHeight 为上限（最多 80 屏）；第一屏之后隐藏 fixed / sticky，避免顶栏重复。超长页缩小以适配画布上限。不走 mono，不保存密钥。

# - 轻量 Office（oolafOffice）规则：

# 1. 把上游 VibeOffice 的 Quire / Ledger / Lectern **向量复制**进 `formant/oolafoffice/`（独立目录，产品名 oolafOffice）。禁止把上游文件覆盖到现有 formant 路径；禁止嵌入 Tauri `desktop/`、`public/sw.js`、PWA manifest、远程 updater。保留 `LICENSE`、`NOTICE` 与字体/词库许可说明（NOTICE 须保留上游 VibeOffice 出处）。Apache-2.0 可与整包 GPLv3 并存。

# 2. 总开关固定读取 `features.office.enabled`（默认开启）；关闭后隐藏 popup 快捷条和右键菜单。总开关不同步到 mono。设置只在 `option.html#features`，含说明文字和起始页链接，不另开面板。

# 3. 入口为 popup 主界面快捷条（起始页 / Word / Excel / PPT）+ 网页右键「formant oolafOffice」子菜单，`chrome.tabs.create` 打开扩展页。不把三套编辑器 `mount()` 进 `tools.html`，不增加 popup 顶栏图标。禁止改 `action.default_popup`，禁止 `contextMenus.removeAll()`，不新增权限。扩展页须无内联脚本；`chrome-extension:` 下禁止请求 `vibeoffice.work/updater`、禁止注册页面 Service Worker。目录 URL 必须落到 `index.html`。

# 4. `oolafoffice/` 上游衍生文件视为 vendor，不受单文件 500 行限制；formant 自有胶水（`office-bridge.js`、`popup-office.js` 等）仍遵守。不走 mono，不保存密钥。

# 5. Wingdings / Webdings / Symbol 只在显示和导出 PDF 时映射成 Unicode（如 Wingdings 2 的 0xA3/£ → □）；xlsx 保存仍写原字符与字体。画布按 run 绘制：符号 run 用 Arial，中文 run 仍用原字体。禁止为了显示去改 workbook 原文。

# - popup 固定高度与布局规则（硬性）：

# 1. popup 可视高度有限（当前约 600px）；任何二级视图必须用「单壳 + flex」：顶栏/Tab/工具条 `flex-shrink: 0`，结果区唯一 `flex: 1; min-height: 0; overflow: auto`。

# 2. 禁止同一视图里并排堆叠多套完整面板（例如 Cookie/Local/Session 三套工具条同时占高）；Tab 只切换数据源，共用一套工具条与一块结果区。

# 3. 给元素设置 `display: flex/grid/block` 时，必须同步处理 `[hidden] { display: none !important; }`，禁止 `display` 盖掉 `hidden` 导致「藏不住的面板」互相挤压。

# 4. 结果区高度必须明显大于输入/工具条占用；长内容只在结果区内滚动，不要靠再堆第二、第三块工具条挤掉结果。

# 5. 从 popup 读当前标签页时用 `lastFocusedWindow`（或等价），不要用会指到扩展窗本身的 `currentWindow`。

# 7. 二级视图顶栏统一：左为返回（chevron 图标 + 蓝色「翻译」）+ 当前页黑字标题；右为 muted 元信息（URL / 计数等）。禁止各二级页自造另一套顶栏。操作按钮放顶栏下方工具条，不要塞进顶栏。
