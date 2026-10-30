# formant Design System

Chrome 扩展（popup / New Tab / 划词面板 / option 管理页）共用一套冷静、工具向的浅色界面。主色是深蓝强调色，画布为冷灰白，卡片轻描边、少阴影，优先可读与密度，而不是营销站气氛。

## 1. Visual Theme & Atmosphere

formant 的气质是 **桌面效率工具**：窄 popup（固定约 380px 宽）、信息分区清晰（输入 → 路由提示 → 多引擎结果卡 → 外链），交互控件小而明确。视觉锚点是品牌蓝 `#1f4b99`，出现在主按钮、激活 chip、链接与发音中状态；其余大面积保持白/浅灰，避免紫色渐变、重阴影和装饰性插画抢注意力。

**Key Characteristics:**

- 冷中性画布（`#f4f6f9` / `#eef1f5`）+ 白表面（`#ffffff`）
- 单一品牌蓝强调，不用多色品牌阶梯
- 圆角克制：`10px` 卡片 / `7px` 控件；按钮偏方圆而非全 pill
- 描边分层（`#dde3ec`）优先于投影；阴影仅大面板偶尔轻用
- 字体栈系统 UI + 中文黑体兜底，等宽留给 JSON / 代码场景
- popup 高度受限，优先单列滚动与卡片堆叠，不做仪表盘式多栏 KPI

## 2. Color Palette & Roles

源文件：[`formant/popup.css`](formant/popup.css) `:root`，以及划词面板 / option 页对齐的同色系硬编码。

### Primary

- **Accent Blue** (`#1f4b99`): 主按钮、激活模式 chip、重要链接、发音中高亮
- **Accent Soft** (`#e8eef9`): 选中底、轻提示底、图标悬停衬底

### Surface & Background

- **BG 0** (`#eef1f5`): 更深一层画布 / 分区底
- **BG 1** (`#f4f6f9`): 默认页面底（popup body、option 页）
- **Surface** (`#ffffff`): 卡片、输入框、对话框
- **Line** (`#dde3ec` / `#e5eaf0`): 分割线与控件描边

### Neutrals & Text

- **Ink** (`#151a22`): 主文字
- **Muted** (`#667084`): 次级文字、占位、元信息

### Semantic

- **OK** (`#146c43`) / **OK BG** (`#eaf6ef`): 成功态
- **Danger** (`#b42318`) / **Danger BG** (`#fef3f2`): 错误、删除、跳过警示
- **DeepLX** (`#0b3a5b`) + 浅底 (`#e7eef5`): DeepLX 翻译卡品牌点缀（仅该提供方）

### Overlay / State

- 发音中：`rgba(31, 75, 153, 0.1)` 底 + accent 图标色，配合轻微 pulse / 声波透明度动画
- 卡片 dimmed：约 `opacity: 0.72` 表示跳过/待机
- New Tab 添加/编辑链接 dialog 请求中：白底 `0.72` 遮罩 + 22px accent 顶边圆环旋转；期间锁点击、Esc 与点遮罩关闭
- `prefers-reduced-motion: reduce` 时关闭装饰性动画

## 3. Typography Rules

### Font Family

- **UI:** `"Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`
- **Mono:** `"Cascadia Code", Consolas, monospace`（JSON 预ttify / 代码向表面）

### Hierarchy（popup 密度基准）

| Role | Size | Weight | Notes |
| --- | --- | --- | --- |
| Brand | 14–15px | 650–700 | header 产品名 |
| Section title | 13–14px | 600 | 卡片标题、管理页 h2 |
| Body | 13px | 400 | 译文正文 |
| Meta / hint | 11–12px | 400–550 | 路由提示、phonetic、同步摘要 |
| Chip / button | 11–13px | 550–600 | 模式切换、ghost 按钮 |

### Principles

- 中文界面文案简洁；路由 hint 一行说清「谁跑了 / 为何跳过」
- 译文 `pre-wrap` + `overflow-wrap`，长词不撑破窄 popup
- 管理页（option）可略放大标题，但仍保持同一色板与圆角语言

## 4. Layout & Components

### Popup（`popup.html`）

- 宽 **380px**、高 **600px**，纵向：header → 可选 settings → 输入区 → 模式 chip → 路由 hint → 结果卡（Google / GPT / DeepLX）→ footer 外链
- 打开 popup 时翻译输入框自动聚焦
- 顶栏图标：站点数据（存储盘） / 扩展管理 / 书签 / 设置；扩展与站点数据均为二级视图
- 二级视图顶栏统一：左 chevron + 蓝色「翻译」+ 黑字当前标题；右 muted 元信息；操作放顶栏下工具条
- 输入区右上：发音 + 清空；结果行右侧：发音
- 设置区折叠，不默认占首屏

### 划词面板（`translate-content.js` Shadow DOM）

- 浮动卡片，结构对齐 popup（query + 模式 + 三卡 + footer）
- 样式自包含，不泄漏到宿主页

### GitZip 下载面板（`gitzip/content/dashboard.js` Shadow DOM）

- GitHub 文件列表只插入紧凑的、带 `formant-` 前缀的选择标记；不重设宿主页的全局样式。
- 右下角进度面板必须使用 Shadow DOM，浅色状态复用 `#1f4b99`、`#151a22`、`#667084`、`#e5eaf0` 的工具色板。
- 默认「跟随系统」，可在 `option.html#gitzip` 固定浅色或深色；深色仅改变面板表面/文字对比，不引入新的品牌色或装饰性效果。

### New Tab（`newtab.html`）

- iTab 风格布局；部件与 mono `/client/newtab/*` 同步
- 页签图标是自绘房子：圆角方底 `#1f4b99`、白屋、青绿窗 `#9ad8c8`（与扩展 F 标同色板，图形不同）；`icons/newtab.svg` / `newtab.ico`
- 齿轮直接打开 `option.html#newtab`；New Tab 页不再承载侧滑设置表单，popup 内也不嵌套 mono 连接表单
- 右上「刷新」「同步」使用带文字的紧凑按钮，主同步按钮复用 accent 实心样式；运行状态以按钮下方短消息反馈
- 右上「工具」在刷新左侧。下拉是白底 14px 圆角列表，每项左侧 26px accent 浅底图标、右侧名称，悬停整行浅底且图标改实心 accent；多项时纵向排列。第一项「计算器」打开与生词本同动画的白底 dialog：标题 16px，副文「关闭后不保留」；对话区用户气泡靠右 accent，结果靠左 `#f2f5f9`，失败用 danger 浅底；底栏输入框 + accent「发送」
- 热点英语：IPA 约 9px muted，叠在单词正上方；释义/谐音仍与单词齐底，默认马赛克揭开
- 第一行四卡等宽（天气·万年历 / 假期·汇率 / 热点英语 / HLS）。天气卡右上角可翻到万年历，默认仍是天气。天气面预报下方空带里有一只走动的巴哥：按住抚摸（闭眼、吐舌、爱心），点一下挑逗（跳、汪），点空地会走过去。动作跟当天天气：晴天蹦跶、下雨/下雪时头顶一朵乌云在落雨或飘雪、热了吐舌、冷了发抖、打雷偶尔吓一跳。万年历是中国历：阳历在上，农历或节日/节气在下；节日用 accent 字、节气用 OK 绿 `#146c43`，都不铺底。只有国务院放假日铺浅红底、数字用 danger；连着的区间首日左侧圆角、末日右侧圆角、中间直角。月历固定 6 周，点年月弹出选月 dialog（动画与添加链接/生词本相同）。不另开一张卡。空闲时 HLS 卡与其它卡同玻璃底，标题 + `empty-status`；播放中才铺满深底 `#101826`。无完整播放条；hover / focus 才出半透明 HUD（切台、音量、打开播放页）
- 快捷图标右上角 18px 白底外链钮（箭头出框），点它新标签打开；点图标本体仍走当前标签（或「链接在新窗口打开」）
- 添加/编辑链接 dialog：保存、删除（及文件夹打散）请求 mono 时盖半透明 loading，期间锁表单与关闭

### AutoPagerize 状态条（`autopagerize/content/messagebar.js` Shadow DOM）

- 页面底部固定条，加载/错误/终止状态用 accent / danger / ink 三色区分。
- Shadow DOM 隔离样式，不泄漏到宿主页；`prefers-reduced-motion` 时关闭透明度过渡。

### Option（`option.html` 通用设置壳）

- 顶栏：产品名「扩展设置」+ 当前 Client API Key 指纹（只显示前后几位，点击进同步）+ 版本号
- 左导航切换模块（概览 / 功能 / New Tab / V2EX / GitZip / 自动翻页 / 手势 / 代理 / 扩展 / 词库 / 翻译 / 同步）；内容区按面板切换
- 功能面板：settings-card + feature-row 开关列表（嵌套项左边线缩进）
- 词库面板：双栏（左包列表 / 右条目表）+ 面板顶操作（新建 / 导入 / 导出）
- 翻译 / 同步：单栏 settings-card 表单；模式切换沿用 popup 四格 chip
- 主按钮 accent、次按钮 ghost；内置包只读提示用 muted
- 概览卡片描述默认两行截断（`ui-clamp-2`）；溢出时 hover 用自封装 `ui-tooltip` 展示全文（墨色底白字、可换行），不用原生 `title`
- 手势面板：虚线画板（捕获态 accent 边 + 十字光标）+ 添加行 + 绑定列表。每行左侧 72×54 预览图（S3 图或路径示意图），中为动作名 + 箭头/圈/✕，右侧「绘制 / 删除」。正在绘制的行用 accent 浅底。

### 鼠标手势轨迹（`gestures/content/main.js` Shadow DOM）

- 页面上只插入 `#formant-gestures-trail` 宿主；折线与动作标签在 Shadow DOM 内，不泄漏宿主全局样式。
- 折线用 accent `#1f4b99`，动作名用 ink 底白字小标签；`prefers-reduced-motion` 时去掉透明度变化。
- 未超过位移阈值不画轨迹，以免干扰原生右键菜单。

### linux.do 话题列表（`linuxdo/content/list.css`）

- 共用 chrome 挂在 `html.formant-linuxdo`；列表表格规则挂在 `html.formant-linuxdo-list`，避免泄漏到帖子详情。
- 文件表：约 48px 行高、12px 表头 muted、13px 标题 ink；悬停用 BG 1 `#f4f6f9`；激活 Tab 底边 2px accent `#1f4b99`。
- 未读/新帖（`unread` / `unseen-topic` / `new-topic` / `has-unseen`）：标题列 inset 3px accent 竖条 + 标题字重 650；未读角标用 accent-soft。
- 底栏密度：分类常显、tag 默认隐藏悬停再出；标题/底栏单行 ellipsis，数字列 `tabular-nums`。
- 深色只跟站点 `dark-scheme` 换中性底/字，不引入飞书蓝或文档行图标。

### linux.do 搜索（`linuxdo/content/search.css`）

- 规则挂在 `html.formant-linuxdo`（顶栏面板 + 全页 `/search` 的 `.fps-result`）。
- 标题 13px / 650、hover 行用 `--fd-row-hover`、摘要与分类 muted；高亮词用 accent-soft。

### linux.do 话题详情（`linuxdo/content/topic.css`）

- 阅读向：去掉 topic-map 统计条和右侧楼层轴；标题 20px / 正文 14px；点赞与回复常显，分享等悬停才出。
- 楼间距约 18/14；楼主帖左侧 3px accent 竖条（隐藏原 Discourse `::before/::after` 装饰）。
- `blockquote` / `aside.quote`：左线 + fill 底；`pre`/`code`：fill 底、6px 圆角、等宽字体。
- 话题回复用自有 `button.formant-linuxdo-reply` 常显右下角 pill（accent 底白字）；一进 `/t/` 就出现，不依赖滑到页底的 `#topic-footer-buttons`。composer 打开 / 全屏时隐藏。

### freefq 导出钮（`freefq/content/main.js` Shadow DOM）

- 页面只插入 `#formant-freefq-export` 宿主；按钮在 Shadow DOM 内，不泄漏宿主全局样式。
- 右下角 pill：accent `#1f4b99` 底白字；成功用 OK 绿、失败用 Danger 红；忙碌态降低透明度并禁用点击。

### Shared control language

- **Primary button:** accent 实心、白字、`border-radius: 8–10px`
- **Ghost button:** 浅底或白底 + line 边框
- **Chips / tabs:** 四等分网格；激活态 accent 底白字
- **Cards:** 白底 + 1px line；头部 brand + 可选 select/badge
- **Inputs:** 白底、line 边框、focus 时 accent 环（低透明）

## 5. Motion

- 用途：反馈（发音中）、轻过渡（设置展开），不做大面积装饰动效
- 发音：`speak-pulse` + 声波 opacity；尊重 `prefers-reduced-motion`
- 避免无限闪烁营销动效、强 glow、紫霓虹

## 6. Do / Don’t

**Do**

- 新 UI 复用 CSS 变量（`--accent` `--ink` `--muted` `--line`…）
- 多引擎结果用并列卡片，跳过态 dimmed + 可「改用」
- 管理页与 popup 保持同一蓝灰体系

**Don’t**

- 引入与 mono Admin Starbucks 绿体系混用（那是后台，不是扩展）
- 默认上深色模式、紫渐变、大阴影卡片墙
- 在首屏堆统计条、徽章贴纸、多 CTA

## 7. HLS 播放页

`hls/player.html` 是全屏黑底播放器（交互参考 DPlayer，未嵌入其源码）：画面铺满，控件叠在视频上，空闲约 3 秒后底栏与标题淡出并藏指针。进度条已播段用 `#4c7fd4`（品牌蓝在黑底上的可读变体），缓冲段浅白，悬停才放大滑块并出时间 tip。喇叭旁是可展开音量条。齿轮面板里调倍速和旋转。频道列表是右侧深色抽屉。直播显示红「直播」标、进度不可拖。居中 bezel / 转圈只作短反馈。旋转只作用在 `<video>` 上，底栏不转。这是媒体页例外，其它扩展界面仍走浅色 token，不要把这套黑底控件搬去 popup / option。
