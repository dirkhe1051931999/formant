"""Popup / New Tab / tools / office feature GIFs."""

from __future__ import annotations

from gif_lib import (
    ACCENT,
    ACCENT_SOFT,
    F_BOLD,
    F_IPA,
    F_MONO,
    F_SM,
    F_TITLE,
    F_UI,
    F_WORD,
    INK,
    LINE,
    MASK,
    MUTED,
    OK,
    PAGE,
    SURFACE,
    callout,
    ctx_menu,
    panel,
    paste_icon,
    pill,
    play,
    toast,
)


def _popup(im, d, heading="formant"):
    panel(d, (560, 176, 916, 500))
    paste_icon(im, (576, 192), 20)
    d.text((604, 192), heading, font=F_BOLD, fill=INK)


def render_translate():
    def before(im, d):
        d.text((56, 190), "输入俚语，自动打分走 Google / GPT", font=F_UI, fill=MUTED)
        _popup(im, d)
        d.rounded_rectangle((576, 228, 900, 292), 8, fill=PAGE, outline=LINE, width=1)
        d.text((588, 248), "piece of cake", font=F_UI, fill=INK)
        pill(d, (576, 304, 630, 330), "自动", on=True)
        pill(d, (638, 304, 700, 330), "Google", on=False)
        d.text((588, 360), "翻译中…", font=F_SM, fill=MUTED)

    def after(im, d):
        d.text((56, 190), "词库命中后走 Google，DeepLX 作失败兜底", font=F_UI, fill=MUTED)
        _popup(im, d)
        d.rounded_rectangle((576, 228, 900, 292), 8, fill=PAGE, outline=LINE, width=1)
        d.text((588, 248), "piece of cake", font=F_UI, fill=INK)
        pill(d, (576, 304, 630, 330), "自动", on=True)
        d.rounded_rectangle((576, 344, 900, 430), 10, fill=SURFACE, outline=LINE, width=1)
        d.text((588, 360), "谷歌翻译", font=F_SM, fill=MUTED)
        d.text((588, 386), "小菜一碟。", font=F_WORD, fill=INK)
        callout(d, (56, 250), "popup / 划词 / 右键同一套路由")

    play("translate.gif", "formant  ·  智能翻译", [
        ("popup 输入", "https://example.com", "页面", before, 1100),
        ("词库命中 · 谷歌译文", "https://example.com", "页面", after, 2400),
    ])


def render_newtab():
    def draw(im, d, revealed=False):
        d.rounded_rectangle((56, 184, 900, 248), 18, fill=SURFACE, outline=LINE, width=1)
        d.text((76, 204), "搜索或输入网址", font=F_UI, fill=MUTED)
        gap, n = 12, 4
        w = (900 - 56 - gap * (n - 1)) // n
        cards = (("天气", "上海  22°", "多云"), ("假期", "国庆  还剩 3 天", "调休已计入"), ("汇率", "USD → CNY", "7.12"), ("热点英语", "piece of cake", "/piːs əv keɪk/"))
        for i, (title, main, sub) in enumerate(cards):
            x0 = 56 + i * (w + gap)
            d.rounded_rectangle((x0, 268, x0 + w, 430), 10, fill=SURFACE, outline=LINE, width=1)
            d.text((x0 + 14, 280), title, font=F_SM, fill=MUTED)
            if title == "热点英语":
                d.text((x0 + 14, 304), sub, font=F_IPA, fill=ACCENT)
                d.text((x0 + 14, 326), main, font=F_WORD, fill=INK)
                if revealed:
                    d.text((x0 + 14, 364), "(小菜一碟)", font=F_UI, fill=INK)
                else:
                    d.rounded_rectangle((x0 + 14, 360, x0 + w - 14, 412), 8, fill=MASK)
                    d.text((x0 + 22, 376), "点击揭开", font=F_SM, fill=MUTED)
            else:
                d.text((x0 + 14, 316), main, font=F_BOLD, fill=INK)
                d.text((x0 + 14, 348), sub, font=F_SM, fill=MUTED)

    play("newtab.gif", "formant  ·  New Tab", [
        ("同一行四卡", "chrome://newtab", "New Tab", lambda im, d: draw(im, d, False), 1400),
        ("热点英语揭开释义", "chrome://newtab", "New Tab", lambda im, d: draw(im, d, True), 2400),
    ])


def render_image_save():
    def before(im, d):
        d.rounded_rectangle((80, 190, 420, 420), 10, fill=(90, 120, 160))
        d.text((200, 290), "photo.jpg", font=F_SM, fill=SURFACE)
        ctx_menu(d, 360, 250, ["复制图片", "formant 图片另存为 PNG", "formant 图片另存为 JPG"], "formant 图片另存为 PNG")

    def after(im, d):
        d.rounded_rectangle((80, 190, 420, 420), 10, fill=(90, 120, 160))
        toast(d, 460, 260, "已保存 photo.png")
        callout(d, (460, 320), "扩展内转码，不走 mono")

    play("image-save.gif", "formant  ·  图片另存为", [
        ("图片上右键", "https://cdn.example.com/photo.jpg", "图片", before, 1400),
        ("转成 PNG / JPG 下载", "https://cdn.example.com/photo.jpg", "图片", after, 2200),
    ])


def render_screenshot():
    def capturing(im, d):
        d.text((56, 190), "长文第一屏……", font=F_TITLE, fill=INK)
        for i in range(6):
            d.rounded_rectangle((56, 240 + i * 28, 700, 258 + i * 28), 4, fill=LINE)
        panel(d, (720, 400, 916, 500))
        d.text((736, 420), "整页滚动截屏", font=F_SM, fill=MUTED)
        d.rounded_rectangle((736, 452, 900, 468), 6, fill=ACCENT_SOFT)
        d.rounded_rectangle((736, 452, 820, 468), 6, fill=ACCENT)
        d.text((736, 476), "3 / 8 屏", font=F_SM, fill=ACCENT)

    def done(im, d):
        d.text((56, 190), "拼接完成，顶栏不重复", font=F_TITLE, fill=INK)
        d.rounded_rectangle((80, 240, 360, 480), 8, fill=SURFACE, outline=LINE, width=1)
        d.rectangle((80, 240, 360, 270), fill=ACCENT)
        d.text((96, 246), "文档标题", font=F_SM, fill=SURFACE)
        for i in range(8):
            d.rounded_rectangle((96, 286 + i * 20, 340, 298 + i * 20), 3, fill=LINE)
        toast(d, 400, 300, "已保存 page.png")
        callout(d, (400, 360), "右键：整页或可见区域")

    play("screenshot.gif", "formant  ·  滚动截屏", [
        ("逐屏采集", "https://blog.example.com/long", "长文", capturing, 1400),
        ("拼成一张 PNG", "https://blog.example.com/long", "长文", done, 2400),
    ])


def render_office():
    def chips(im, d):
        _popup(im, d)
        d.text((576, 236), "oolafOffice", font=F_SM, fill=MUTED)
        for i, name in enumerate(("起始页", "Word", "Excel", "PPT")):
            pill(d, (576 + i * 80, 268, 644 + i * 80, 294), name, on=i == 1)
        callout(d, (56, 250), "popup 快捷条或右键打开")

    def word(im, d):
        d.text((56, 186), "Quire · Word", font=F_TITLE, fill=INK)
        d.rounded_rectangle((56, 230, 900, 500), 10, fill=SURFACE, outline=LINE, width=1)
        d.text((80, 250), "转正审批表.docx", font=F_BOLD, fill=INK)
        d.text((80, 290), "姓名　　部门　　考评内容", font=F_UI, fill=MUTED)
        d.text((80, 330), "本机打开 / 另存为真实 .docx，不走 mono。", font=F_UI, fill=INK)

    play("office.gif", "formant  ·  oolafOffice", [
        ("点 Word", "https://example.com", "页面", chips, 1400),
        ("扩展页编辑 docx", "chrome-extension://formant/oolafoffice/quire/", "Word", word, 2400),
    ])


def render_proxy():
    def draw(im, d, active="系统"):
        _popup(im, d)
        d.text((576, 236), "代理", font=F_SM, fill=MUTED)
        for i, name in enumerate(("直连", "系统", "PAC", "7890")):
            pill(d, (576 + i * 78, 270, 644 + i * 78, 296), name, on=name == active)
        if active == "7890":
            d.text((576, 330), "SOCKS5  127.0.0.1:7890", font=F_MONO, fill=INK)
            toast(d, 576, 380, "已切换自定义代理")
        else:
            d.text((576, 330), "跟随系统代理", font=F_UI, fill=MUTED)

    play("proxy.gif", "formant  ·  代理", [
        ("默认系统代理", "https://example.com", "页面", lambda im, d: draw(im, d, "系统"), 1200),
        ("popup 切到 7890", "https://example.com", "页面", lambda im, d: draw(im, d, "7890"), 2200),
    ])


def render_extensions():
    def draw(im, d, off=False):
        _popup(im, d, "扩展管理")
        rows = (("uBlock Origin", True), ("formant 以外的扩展", not off), ("JSONVue", True))
        for i, (name, on) in enumerate(rows):
            y = 236 + i * 56
            d.text((576, y), name, font=F_UI, fill=INK)
            d.rounded_rectangle((820, y, 878, y + 24), 12, fill=ACCENT if on else MASK)
            knob = 854 if on else 826
            d.ellipse((knob, y + 2, knob + 20, y + 22), fill=SURFACE)
        callout(d, (56, 250), "列表排除 formant 自身")

    play("extensions.gif", "formant  ·  扩展管理", [
        ("popup 列出已装扩展", "https://example.com", "页面", lambda im, d: draw(im, d, False), 1200),
        ("一键禁用", "https://example.com", "页面", lambda im, d: draw(im, d, True), 2200),
    ])


def render_site_data():
    def draw(im, d, tab="Cookie"):
        _popup(im, d, "站点数据")
        for i, name in enumerate(("Cookie", "Local", "Session")):
            pill(d, (576 + i * 90, 232, 650 + i * 90, 258), name, on=name == tab)
        d.text((576, 280), "sessionid   httponly", font=F_MONO, fill=INK)
        d.text((576, 308), "theme       dark", font=F_MONO, fill=MUTED)
        pill(d, (576, 360, 640, 386), "复制", on=False)
        pill(d, (652, 360, 716, 386), "清除", on=False)
        callout(d, (56, 250), "只读当前 http(s) 标签")

    play("site-data.gif", "formant  ·  站点数据", [
        ("读取 Cookie", "https://app.example.com", "应用", lambda im, d: draw(im, d, "Cookie"), 1400),
        ("切换 Local", "https://app.example.com", "应用", lambda im, d: draw(im, d, "Local"), 2200),
    ])


def render_gestures():
    def trail(im, d, done=False):
        d.text((56, 190), "右键划动  ↓→  关闭标签", font=F_UI, fill=MUTED)
        d.line((200, 240, 200, 380), fill=ACCENT, width=6)
        d.line((200, 380, 360, 380), fill=ACCENT, width=6)
        d.ellipse((350, 370, 370, 390), fill=ACCENT)
        if done:
            toast(d, 400, 300, "关闭当前标签")
        else:
            callout(d, (400, 260), "位移太小仍出系统菜单")

    play("gestures.gif", "formant  ·  鼠标手势", [
        ("右键划 DR", "https://example.com/article", "文章", lambda im, d: trail(im, d, False), 1400),
        ("执行关闭标签", "https://example.com/article", "文章", lambda im, d: trail(im, d, True), 2200),
    ])


def render_tools():
    def draw(im, d, tool="二维码"):
        panel(d, (48, 176, 280, 510))
        d.text((64, 192), "工具箱", font=F_BOLD, fill=INK)
        for i, name in enumerate(("二维码", "时间戳", "JSON 美化", "JSON 对比", "图片 Base64", "编码转换", "识图")):
            y = 228 + i * 36
            if name == tool:
                d.rounded_rectangle((56, y - 6, 268, y + 24), 8, fill=ACCENT_SOFT)
            d.text((72, y), name, font=F_UI, fill=ACCENT if name == tool else INK)
        panel(d, (300, 176, 916, 510))
        d.text((324, 196), tool, font=F_TITLE, fill=INK)
        if tool == "二维码":
            d.rounded_rectangle((340, 250, 500, 410), 8, fill=INK)
            d.text((360, 430), "生成 / 识别都在本机", font=F_SM, fill=MUTED)
        else:
            d.text((324, 250), '{"id": 12345678901234567890}', font=F_MONO, fill=INK)
            d.text((324, 290), "超出 2^53 的整数保持原文", font=F_SM, fill=MUTED)

    play("tools.gif", "formant  ·  工具箱", [
        ("popup 图标打开新标签", "chrome-extension://formant/tools.html#qr", "工具箱", lambda im, d: draw(im, d, "二维码"), 1400),
        ("JSON 美化保大正整数", "chrome-extension://formant/tools.html#json", "工具箱", lambda im, d: draw(im, d, "JSON 美化"), 2400),
    ])


def render_image_prompt():
    def draw(im, d, done=False):
        panel(d, (48, 176, 460, 510))
        d.rounded_rectangle((72, 210, 436, 400), 10, fill=(70, 90, 70))
        d.text((160, 290), "上传或粘贴 URL", font=F_SM, fill=SURFACE)
        panel(d, (480, 176, 916, 510))
        d.text((500, 196), "识图", font=F_TITLE, fill=INK)
        if done:
            d.text((500, 250), "中文提示词", font=F_SM, fill=MUTED)
            d.text((500, 278), "左侧绿底产品图，右下角水印。", font=F_UI, fill=INK)
            d.text((500, 330), "English prompt", font=F_SM, fill=MUTED)
            d.text((500, 358), "A product shot on green…", font=F_UI, fill=INK)
        else:
            d.text((500, 250), "用本机视觉模型反解，不走 mono", font=F_UI, fill=MUTED)

    play("image-prompt.gif", "formant  ·  识图", [
        ("工具箱内左右布局", "chrome-extension://formant/tools.html#image-prompt", "识图", lambda im, d: draw(im, d, False), 1200),
        ("中英分区提示词", "chrome-extension://formant/tools.html#image-prompt", "识图", lambda im, d: draw(im, d, True), 2400),
    ])


def render_lexicon():
    def draw(im, d, imported=False):
        d.text((56, 186), "词库", font=F_TITLE, fill=INK)
        packs = (("builtin:en", "英语俚语", True), ("builtin:zh", "汉语习语", True), ("custom:work", "团队用语", imported))
        for i, (pid, name, on) in enumerate(packs):
            y = 236 + i * 70
            panel(d, (56, y, 900, y + 60))
            d.text((80, y + 10), name, font=F_BOLD, fill=INK)
            d.text((80, y + 32), pid, font=F_MONO, fill=MUTED)
            d.text((760, y + 18), "已启用" if on else "导入自定义包", font=F_SM, fill=OK if on else ACCENT)
        if imported:
            callout(d, (56, 460), "内置只读，自定义走 JSON")

    play("lexicon.gif", "formant  ·  词库包", [
        ("内置包可停用", "chrome-extension://formant/option.html#lexicon", "扩展设置", lambda im, d: draw(im, d, False), 1200),
        ("导入自定义 JSON", "chrome-extension://formant/option.html#lexicon", "扩展设置", lambda im, d: draw(im, d, True), 2400),
    ])


def render_bookmarks():
    def draw(im, d, synced=False):
        _popup(im, d, "书签")
        d.text((576, 236), "书签栏", font=F_SM, fill=MUTED)
        d.text((576, 264), "├ 工作", font=F_UI, fill=INK)
        d.text((576, 292), "└ 文档", font=F_UI, fill=INK)
        pill(d, (576, 340, 668, 366), "立即同步", on=True)
        if synced:
            toast(d, 576, 392, "创建 2 · 更新 0 · 删除 0")
        else:
            d.text((576, 392), "尚未同步", font=F_SM, fill=MUTED)

    play("bookmarks.gif", "formant  ·  书签同步", [
        ("popup 书签树", "https://example.com", "页面", lambda im, d: draw(im, d, False), 1200),
        ("并集写入当前 Key", "https://example.com", "页面", lambda im, d: draw(im, d, True), 2400),
    ])


def render_code():
    def ugly(im, d):
        d.text((56, 186), "ai-summary.min.js", font=F_TITLE, fill=INK)
        d.text((56, 240), "function n(t){return t&&t.x?t.x+1:0}", font=F_MONO, fill=MUTED)
        callout(d, (56, 300), "打开 JS / CSS / JSON 直链")

    def pretty(im, d):
        d.text((56, 186), "美化后的 JavaScript", font=F_TITLE, fill=INK)
        d.text((56, 236), "function n(t) {", font=F_MONO, fill=INK)
        d.text((56, 260), "  return t && t.x ? t.x + 1 : 0;", font=F_MONO, fill=INK)
        d.text((56, 284), "}", font=F_MONO, fill=INK)
        pill(d, (56, 340, 160, 366), "Copy pretty", on=False)
        pill(d, (172, 340, 280, 366), "Download", on=False)
        callout(d, (56, 400), "DevTools 面板同样美化 Response")

    play("code.gif", "formant  ·  JSON / JS / CSS 美化", [
        ("压缩源码", "https://cdn.example.com/ai.min.js", "JS", ugly, 1100),
        ("缩进 + 高亮", "https://cdn.example.com/ai.min.js", "JS", pretty, 2400),
    ])


RENDERERS = [
    render_translate,
    render_newtab,
    render_image_save,
    render_screenshot,
    render_office,
    render_proxy,
    render_extensions,
    render_site_data,
    render_gestures,
    render_tools,
    render_image_prompt,
    render_lexicon,
    render_bookmarks,
    render_code,
]
