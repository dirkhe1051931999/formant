"""Site-specific feature GIFs."""

from __future__ import annotations

from gif_lib import (
    ACCENT,
    ACCENT_SOFT,
    F_BOLD,
    F_SM,
    F_TITLE,
    F_UI,
    GRAY,
    INK,
    LINE,
    MUTED,
    OK,
    SURFACE,
    callout,
    panel,
    pill,
    play,
    toast,
)


def render_v2ex():
    def draw(im, d, badge=False):
        d.text((56, 186), "V2EX", font=F_TITLE, fill=INK)
        d.text((56, 230), "今日已自动签到", font=F_UI, fill=OK if badge else MUTED)
        d.text((80, 280), "1. 有没有推荐的代理方案", font=F_UI, fill=INK)
        d.text((80, 314), "2. 求一份 Git 工作流", font=F_UI, fill=INK)
        if badge:
            d.ellipse((860, 186, 896, 222), fill=(180, 35, 24))
            d.text((870, 192), "3", font=F_BOLD, fill=SURFACE)
            callout(d, (56, 380), "未读角标不改 formant 图标")
        else:
            callout(d, (56, 380), "浏览器开着才会补签当天")

    play("v2ex.gif", "formant  ·  V2EX Plus", [
        ("后台自动签到", "https://www.v2ex.com/", "V2EX", lambda im, d: draw(im, d, False), 1200),
        ("未读角标", "https://www.v2ex.com/", "V2EX", lambda im, d: draw(im, d, True), 2400),
    ])


def render_gitzip():
    def draw(im, d, zipped=False):
        d.text((56, 186), "octo/demo", font=F_TITLE, fill=INK)
        files = ("README.md", "src/", "scripts/pack.py")
        for i, name in enumerate(files):
            y = 240 + i * 40
            d.rounded_rectangle((56, y, 76, y + 20), 4, outline=ACCENT, width=2)
            if i < 2:
                d.rectangle((60, y + 4, 72, y + 16), fill=ACCENT)
            d.text((88, y), name, font=F_UI, fill=INK)
        panel(d, (560, 230, 900, 400))
        d.text((580, 250), "GitZip 公开模式", font=F_BOLD, fill=INK)
        d.text((580, 286), "已选 2 项", font=F_SM, fill=MUTED)
        if zipped:
            toast(d, 580, 330, "正在保存 demo.zip")
        else:
            pill(d, (580, 330, 700, 356), "下载 ZIP", on=True)
        callout(d, (56, 430), "无 PAT，匿名 API 限额约 60/时")

    play("gitzip.gif", "formant  ·  GitZip", [
        ("勾选公开仓库文件", "https://github.com/octo/demo", "GitHub", lambda im, d: draw(im, d, False), 1400),
        ("生成 ZIP", "https://github.com/octo/demo", "GitHub", lambda im, d: draw(im, d, True), 2200),
    ])


def render_autopagerize():
    def draw(im, d, page2=False):
        d.text((56, 186), "搜索结果", font=F_TITLE, fill=INK)
        for i, title in enumerate(("formant 翻译扩展", "Chrome MV3 清单", "词库打分路由")):
            d.text((56, 236 + i * 36), f"{i + 1}. {title}", font=F_UI, fill=INK)
        if page2:
            d.line((56, 350, 900, 350), fill=LINE)
            d.text((56, 366), "自动插入第 2 页", font=F_SM, fill=ACCENT)
            d.text((56, 396), "4. New Tab 热点英语", font=F_UI, fill=INK)
            d.text((56, 432), "5. GitZip 公开下载", font=F_UI, fill=INK)
            callout(d, (560, 366), "linux.do 硬排除")
        else:
            d.text((56, 430), "滚动到底部…", font=F_SM, fill=MUTED)

    play("autopagerize.gif", "formant  ·  AutoPagerize", [
        ("第 1 页", "https://www.google.com/search?q=formant", "Google", lambda im, d: draw(im, d, False), 1100),
        ("到底自动接下一页", "https://www.google.com/search?q=formant", "Google", lambda im, d: draw(im, d, True), 2400),
    ])


def render_telegram():
    def draw(im, d, saved=False):
        panel(d, (200, 190, 760, 470))
        d.rounded_rectangle((230, 220, 730, 400), 10, fill=(40, 60, 90))
        d.text((300, 290), "受限频道里的视频", font=F_SM, fill=SURFACE)
        d.ellipse((680, 236, 716, 272), fill=ACCENT)
        d.text((690, 242), "↓", font=F_BOLD, fill=SURFACE)
        if saved:
            d.rounded_rectangle((230, 410, 730, 430), 4, fill=ACCENT_SOFT)
            d.rounded_rectangle((230, 410, 600, 430), 4, fill=ACCENT)
            toast(d, 230, 436, "已保存 video.mp4")
        else:
            callout(d, (56, 430), "普通会话用 Telegram 自带下载")

    play("telegram.gif", "formant  ·  Telegram 下载", [
        ("受限媒体补保存钮", "https://web.telegram.org/k/", "Telegram", lambda im, d: draw(im, d, False), 1400),
        ("页面内拼装后下载", "https://web.telegram.org/k/", "Telegram", lambda im, d: draw(im, d, True), 2200),
    ])


def render_x_translate():
    def draw(im, d, zh=False):
        d.text((56, 186), "Home / For you", font=F_SM, fill=MUTED)
        panel(d, (56, 220, 900, 360))
        d.text((80, 236), "@alice", font=F_BOLD, fill=INK)
        d.text((80, 268), "The launch was a piece of cake.", font=F_UI, fill=INK)
        if zh:
            d.text((80, 304), "这次上线简直小菜一碟。", font=F_SM, fill=GRAY)
            callout(d, (56, 390), "只走 Google translate-pa，不花 Key")
        else:
            d.text((80, 304), "等待扫描推文正文…", font=F_SM, fill=MUTED)

    play("x-translate.gif", "formant  ·  X 推文翻译", [
        ("时间线原文", "https://x.com/home", "X", lambda im, d: draw(im, d, False), 1100),
        ("正文下补灰色译文", "https://x.com/home", "X", lambda im, d: draw(im, d, True), 2400),
    ])


def render_discord():
    def draw(im, d, translated=False):
        d.text((56, 186), "# general", font=F_TITLE, fill=INK)
        d.text((56, 236), "alice   The deploy was a piece of cake", font=F_UI, fill=INK)
        d.text((56, 272), "bob     Ship it", font=F_UI, fill=INK)
        if translated:
            d.text((120, 256), "这次发布简直小菜一碟", font=F_SM, fill=GRAY)
            pill(d, (760, 450, 860, 480), "翻译", on=False)
            callout(d, (56, 340), "点了才翻当前页，不自动翻历史")
        else:
            pill(d, (760, 450, 860, 480), "翻译", on=True)
            callout(d, (56, 340), "右下角手动翻译")

    play("discord.gif", "formant  ·  Discord 翻译", [
        ("右下角按钮", "https://discord.com/channels/1/2", "Discord", lambda im, d: draw(im, d, False), 1200),
        ("当前页消息补译文", "https://discord.com/channels/1/2", "Discord", lambda im, d: draw(im, d, True), 2400),
    ])


def render_elitepvpers():
    def draw(im, d, zh=False):
        d.text((56, 186), "PvP Forum", font=F_TITLE, fill=INK)
        d.text((56, 236), "WTS gold · fast delivery", font=F_UI, fill=INK)
        d.text((56, 272), "Looking for raid group tonight", font=F_UI, fill=INK)
        if zh:
            d.text((56, 256), "出金币 · 极速发货", font=F_SM, fill=GRAY)
            d.text((56, 292), "今晚找团本队伍", font=F_SM, fill=GRAY)
            callout(d, (56, 360), "只翻标题和楼层正文")
        else:
            d.text((56, 330), "扫描帖子标题…", font=F_SM, fill=MUTED)

    play("elitepvpers.gif", "formant  ·  elitepvpers 翻译", [
        ("版块列表原文", "https://www.elitepvpers.com/forum/", "elitepvpers", lambda im, d: draw(im, d, False), 1100),
        ("标题下补译文", "https://www.elitepvpers.com/forum/", "elitepvpers", lambda im, d: draw(im, d, True), 2400),
    ])


def render_linuxdo():
    def before(im, d):
        d.text((56, 186), "最新", font=F_TITLE, fill=INK)
        d.text((56, 236), "话题卡片 · 头像 · 分类徽章", font=F_UI, fill=MUTED)
        d.rounded_rectangle((56, 280, 900, 360), 8, fill=SURFACE, outline=LINE, width=1)
        d.text((80, 304), "求推荐 MV3 扩展脚手架", font=F_UI, fill=INK)

    def after(im, d):
        d.text((56, 186), "最新", font=F_TITLE, fill=INK)
        xs = (72, 400, 520, 640, 760)
        headers = ("标题", "所有者", "回复", "浏览", "最近活跃")
        for x, h in zip(xs, headers):
            d.text((x, 230), h, font=F_SM, fill=MUTED)
        d.line((56, 258, 900, 258), fill=LINE)
        d.rectangle((56, 270, 60, 318), fill=ACCENT)
        d.text((72, 280), "求推荐 MV3 脚手架", font=F_BOLD, fill=INK)
        d.text((400, 280), "alice", font=F_SM, fill=MUTED)
        d.text((520, 280), "12", font=F_SM, fill=MUTED)
        d.text((640, 280), "3.1k", font=F_SM, fill=MUTED)
        d.text((760, 280), "2 小时前", font=F_SM, fill=MUTED)
        callout(d, (56, 360), "左键新标签打开帖子")

    play("linuxdo.gif", "formant  ·  linux.do 列表", [
        ("Discourse 原列表", "https://linux.do/", "linux.do", before, 1100),
        ("换成 formant 表格", "https://linux.do/", "linux.do", after, 2400),
    ])


def render_hupu():
    def before(im, d):
        d.rectangle((24, 162, 936, 210), fill=(200, 40, 40))
        d.text((56, 174), "手机虎扑  下载 App  游戏中心", font=F_SM, fill=SURFACE)
        d.text((56, 230), "帖子标题", font=F_TITLE, fill=INK)
        d.rounded_rectangle((56, 280, 900, 430), 0, fill=(245, 245, 245), outline=(180, 180, 180), width=2)

    def after(im, d):
        d.rectangle((24, 162, 936, 210), fill=SURFACE)
        d.text((56, 174), "首页   NBA   步行街", font=F_SM, fill=ACCENT)
        d.text((56, 230), "帖子标题", font=F_TITLE, fill=INK)
        panel(d, (56, 270, 900, 460))
        d.text((80, 290), "楼主", font=F_BOLD, fill=INK)
        d.text((80, 324), "正文收进一张白卡，表情包同高。", font=F_UI, fill=INK)
        pill(d, (80, 400, 160, 426), "上一帖", on=False)
        pill(d, (172, 400, 252, 426), "下一帖", on=False)
        callout(d, (300, 390), "去 App 推广，主色下划线")

    play("hupu.gif", "formant  ·  虎扑简洁版式", [
        ("站点红顶栏", "https://bbs.hupu.com/642898219.html", "虎扑", before, 1100),
        ("白卡 + 上下帖", "https://bbs.hupu.com/642898219.html", "虎扑", after, 2400),
    ])


def render_freefq():
    def draw(im, d, exporting=False):
        d.text((56, 186), "某节点分享帖", font=F_TITLE, fill=INK)
        d.text((56, 236), "正文可以划选复制了。", font=F_UI, fill=INK)
        d.text((56, 270), "ss://example  vmess://example", font=F_UI, fill=MUTED)
        pill(d, (760, 430, 900, 470), "导出 TXT", on=True)
        if exporting:
            toast(d, 56, 340, "已保存 某节点分享帖.txt")
        else:
            callout(d, (56, 340), "解开禁复制，只导出当前 DOM")

    play("freefq.gif", "formant  ·  freefq 导出", [
        ("帖子详情可划选", "https://freefq.com/dig/int/demo.html", "freefq", lambda im, d: draw(im, d, False), 1200),
        ("一键 UTF-8 TXT", "https://freefq.com/dig/int/demo.html", "freefq", lambda im, d: draw(im, d, True), 2400),
    ])


def render_huavod():
    def blocked(im, d):
        d.text((56, 186), "直播页", font=F_TITLE, fill=INK)
        d.rounded_rectangle((56, 230, 900, 400), 10, fill=(20, 20, 20))
        d.text((80, 300), "F12 → history.back()，页面被踢走", font=F_UI, fill=(248, 81, 73))

    def unlocked(im, d):
        d.text((56, 186), "直播页", font=F_TITLE, fill=INK)
        d.rounded_rectangle((56, 230, 620, 470), 10, fill=(20, 20, 20))
        panel(d, (640, 230, 900, 470))
        d.text((660, 250), "DevTools", font=F_BOLD, fill=INK)
        d.text((660, 290), "Console", font=F_SM, fill=MUTED)
        d.text((660, 320), "> 可用", font=F_UI, fill=OK)
        callout(d, (56, 430), "拦 disable-devtool，不踢页")

    play("huavod.gif", "formant  ·  huavod 控制台", [
        ("未解锁会被踢回", "https://huavod.com/liveplay/538-1.html", "huavod", blocked, 1100),
        ("F12 留在原址", "https://huavod.com/liveplay/538-1.html", "huavod", unlocked, 2400),
    ])


def render_gemini():
    def draw(im, d, clean=False):
        d.text((56, 186), "Gemini", font=F_TITLE, fill=INK)
        d.rounded_rectangle((80, 230, 420, 480), 10, fill=(70, 90, 130))
        d.text((150, 330), "生成图", font=F_SM, fill=SURFACE)
        if not clean:
            d.text((300, 440), "Gemini", font=F_BOLD, fill=(230, 230, 230))
            callout(d, (460, 280), "下载时去掉右下角水印")
        else:
            toast(d, 460, 300, "已保存 image.png")
            callout(d, (460, 360), "只处理 gg / rd 成图")

    play("gemini.gif", "formant  ·  Gemini 去水印", [
        ("成图带水印", "https://gemini.google.com/app", "Gemini", lambda im, d: draw(im, d, False), 1200),
        ("下载已反混合", "https://gemini.google.com/app", "Gemini", lambda im, d: draw(im, d, True), 2400),
    ])


def render_gmail():
    def draw(im, d, copied=False):
        d.rectangle((24, 162, 936, 214), fill=SURFACE)
        d.text((56, 176), "Gmail", font=F_BOLD, fill=INK)
        d.text((560, 176), "you@gmail.com", font=F_UI, fill=ACCENT)
        d.text((760, 176), "?   ⚙", font=F_UI, fill=MUTED)
        d.rounded_rectangle((80, 240, 900, 480), 10, fill=SURFACE, outline=LINE, width=1)
        d.text((100, 270), "收件箱", font=F_TITLE, fill=INK)
        if copied:
            toast(d, 560, 220, "已复制邮箱")
        else:
            callout(d, (56, 360), "点顶栏邮箱即可复制")

    play("gmail.gif", "formant  ·  Gmail 邮箱", [
        ("问号左边显示当前邮箱", "https://mail.google.com/mail/", "Gmail", lambda im, d: draw(im, d, False), 1400),
        ("点击复制", "https://mail.google.com/mail/", "Gmail", lambda im, d: draw(im, d, True), 2200),
    ])


def render_axure():
    def draw(im, d, linked=False):
        d.text((56, 186), "index.html  ·  file://", font=F_TITLE, fill=INK)
        panel(d, (56, 230, 300, 500))
        d.text((76, 250), "页面列表", font=F_SM, fill=MUTED)
        d.text((76, 286), "首页", font=F_UI, fill=ACCENT if linked else INK)
        d.text((76, 318), "详情", font=F_UI, fill=INK)
        panel(d, (320, 230, 900, 500))
        d.text((340, 250), "#mainFrame", font=F_SM, fill=MUTED)
        d.text((340, 290), "pluginDetected" if linked else "等待跨框架消息", font=F_BOLD, fill=OK if linked else MUTED)
        if linked:
            callout(d, (340, 360), "转发已有 Axure 事件节点")

    play("axure.gif", "formant  ·  Axure 原型", [
        ("本地 HTML", "file:///D:/proto/index.html", "原型", lambda im, d: draw(im, d, False), 1200),
        ("框架间跳转可用", "file:///D:/proto/index.html", "原型", lambda im, d: draw(im, d, True), 2400),
    ])


def render_vue():
    def draw(im, d, open_panel=False):
        d.text((56, 186), "ShopApp", font=F_TITLE, fill=INK)
        d.rounded_rectangle((56, 230, 420, 470), 10, fill=SURFACE, outline=LINE, width=1)
        d.text((80, 260), "<ProductCard>", font=F_UI, fill=INK)
        if open_panel:
            d.rounded_rectangle((80, 250, 400, 310), 6, outline=ACCENT, width=2)
            panel(d, (450, 176, 916, 510))
            d.text((470, 196), "Vue", font=F_BOLD, fill=OK)
            d.text((470, 236), "App", font=F_SM, fill=MUTED)
            d.text((490, 264), "ProductCard", font=F_UI, fill=ACCENT)
            d.text((470, 320), "props.price = 42", font=F_SM, fill=INK)
            d.text((470, 348), "pinia.cart.count = 3", font=F_SM, fill=INK)
            callout(d, (470, 400), "工具栏图标右上角绿 V")
        else:
            callout(d, (56, 400), "DevTools 第二个面板")

    play("vue.gif", "formant  ·  Vue 组件", [
        ("检测到 Vue 页面", "https://shop.example.com/", "Shop", lambda im, d: draw(im, d, False), 1100),
        ("组件树 / props / Pinia", "https://shop.example.com/", "Shop", lambda im, d: draw(im, d, True), 2400),
    ])


def render_hls():
    def draw(im, d, playing=False):
        d.rounded_rectangle((56, 186, 900, 420), 10, fill=(10, 12, 18))
        d.polygon([(430, 260), (430, 360), (520, 310)], fill=SURFACE)
        d.rounded_rectangle((56, 430, 900, 500), 8, fill=SURFACE, outline=LINE, width=1)
        d.text((80, 450), "1.0x   0°", font=F_SM, fill=MUTED)
        pill(d, (200, 446, 280, 476), "存 MP4", on=playing)
        if playing:
            d.rounded_rectangle((300, 456, 700, 466), 4, fill=ACCENT_SOFT)
            d.rounded_rectangle((300, 456, 480, 466), 4, fill=ACCENT)
            callout(d, (56, 360), "主框架 .m3u8 改开播放页")
        else:
            d.text((320, 450), "live.m3u8", font=F_SM, fill=MUTED)

    play("hls.gif", "formant  ·  HLS 播放", [
        ("打开 .m3u8", "https://cdn.example.com/live.m3u8", "HLS", lambda im, d: draw(im, d, False), 1100),
        ("倍速 / 旋转 / 存 MP4", "chrome-extension://formant/hls/player.html", "播放", lambda im, d: draw(im, d, True), 2400),
    ])


RENDERERS = [
    render_v2ex,
    render_gitzip,
    render_autopagerize,
    render_telegram,
    render_x_translate,
    render_discord,
    render_elitepvpers,
    render_linuxdo,
    render_hupu,
    render_freefq,
    render_huavod,
    render_gemini,
    render_gmail,
    render_axure,
    render_vue,
    render_hls,
]
