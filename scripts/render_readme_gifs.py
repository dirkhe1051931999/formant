"""Render README demo GIFs into docs/."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ICON_PATH = ROOT / "formant" / "icons" / "icon32.png"

W, H = 960, 540
BG = (238, 241, 245)
PAGE = (244, 246, 249)
SURFACE = (255, 255, 255)
INK = (21, 26, 34)
MUTED = (102, 112, 132)
LINE = (221, 227, 236)
ACCENT = (31, 75, 153)
ACCENT_SOFT = (232, 238, 249)
OK = (20, 108, 67)
OK_BG = (234, 246, 239)
TITLEBAR = (246, 247, 249)
CHROME = (232, 234, 238)
YELLOW = (227, 179, 65)
RED = (180, 35, 24)
GREEN = (63, 185, 80)
MASK = (210, 216, 226)

MONO = "C:\\Windows\\Fonts\\cascadiamono.ttf"
MONO_FALLBACK = "C:\\Windows\\Fonts\\consola.ttf"
CN = "C:\\Windows\\Fonts\\msyh.ttc"
CN_BOLD = "C:\\Windows\\Fonts\\msyhbd.ttc"


def font(path: str, size: int, fallback: str | None = None) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        if fallback:
            return ImageFont.truetype(fallback, size)
        return ImageFont.truetype(MONO_FALLBACK, size)


F_TITLE = font(CN_BOLD, 22, CN)
F_STEP = font(CN, 16, CN)
F_UI = font(CN, 14, CN)
F_SM = font(CN, 12, CN)
F_BOLD = font(CN_BOLD, 14, CN)
F_MONO = font(MONO, 13, MONO_FALLBACK)
F_WORD = font(CN_BOLD, 16, CN)
F_IPA = font(MONO, 11, MONO_FALLBACK)

try:
    APP_ICON = Image.open(ICON_PATH).convert("RGBA")
except OSError:
    APP_ICON = None


class Gif:
    def __init__(self) -> None:
        self.frames: list[Image.Image] = []
        self.durations: list[int] = []

    def add(self, im: Image.Image, ms: int) -> None:
        self.frames.append(im.convert("RGB"))
        self.durations.append(ms)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        base = self.frames[0].quantize(colors=64, method=Image.Quantize.MEDIANCUT)
        quantized = [base] + [
            frame.quantize(palette=base, dither=Image.Dither.NONE) for frame in self.frames[1:]
        ]
        quantized[0].save(
            path,
            save_all=True,
            append_images=quantized[1:],
            duration=self.durations,
            loop=0,
            optimize=True,
            disposal=2,
        )


def paste_icon(im: Image.Image, xy: tuple[int, int], size: int) -> None:
    if APP_ICON is None:
        return
    icon = APP_ICON.resize((size, size), Image.Resampling.LANCZOS)
    im.paste(icon, xy, icon)


def new_canvas(step: str, title: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((16, 12, 944, 64), 12, fill=SURFACE, outline=LINE, width=1)
    d.ellipse((36, 28, 52, 44), fill=RED)
    d.ellipse((60, 28, 76, 44), fill=YELLOW)
    d.ellipse((84, 28, 100, 44), fill=GREEN)
    paste_icon(im, (118, 22), 24)
    d.text((150, 22), title, font=F_TITLE, fill=INK)
    d.text((16, 76), step, font=F_STEP, fill=ACCENT)
    return im, d


def draw_browser(d: ImageDraw.ImageDraw, box: tuple[int, int, int, int], url: str, tab: str) -> None:
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, 12, fill=SURFACE, outline=LINE, width=1)
    d.rounded_rectangle((x0, y0, x1, y0 + 58), 12, fill=CHROME)
    d.rectangle((x0, y0 + 40, x1, y0 + 58), fill=CHROME)
    d.rounded_rectangle((x0 + 16, y0 + 10, x0 + 150, y0 + 36), 8, fill=SURFACE)
    d.text((x0 + 28, y0 + 14), tab, font=F_SM, fill=INK)
    d.rounded_rectangle((x0 + 168, y0 + 12, x1 - 16, y0 + 38), 16, fill=SURFACE)
    d.text((x0 + 184, y0 + 16), url, font=F_MONO, fill=MUTED)
    d.rectangle((x0, y0 + 58, x1, y1), fill=PAGE)
    d.rounded_rectangle(box, 12, outline=LINE, width=1)


def callout(d: ImageDraw.ImageDraw, xy: tuple[int, int], text: str) -> None:
    x0, y0 = xy
    parts = text.split("\n")
    width = int(max(F_SM.getlength(part) for part in parts) + 24)
    height = 16 + 20 * len(parts)
    d.rounded_rectangle((x0, y0, x0 + width, y0 + height), 10, fill=(255, 248, 230), outline=YELLOW, width=2)
    for i, part in enumerate(parts):
        d.text((x0 + 12, y0 + 8 + i * 20), part, font=F_SM, fill=(122, 86, 12))


def pill(d: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str, *, on: bool) -> None:
    fill = ACCENT if on else SURFACE
    color = SURFACE if on else INK
    outline = ACCENT if on else LINE
    d.rounded_rectangle(box, 8, fill=fill, outline=outline, width=1)
    d.text((box[0] + 10, box[1] + 5), text, font=F_SM, fill=color)


def field(d: ImageDraw.ImageDraw, x: int, y: int, w: int, label: str, value: str, *, focus: bool = False) -> None:
    d.text((x, y), label, font=F_SM, fill=MUTED)
    outline = ACCENT if focus else LINE
    d.rounded_rectangle((x, y + 18, x + w, y + 48), 7, fill=SURFACE, outline=outline, width=2 if focus else 1)
    d.text((x + 10, y + 24), value, font=F_MONO, fill=INK)


def type_frames(gif: Gif, render, prefix: str, typed: str, *, char_ms: int = 36, pause: int = 280) -> str:
    for i in range(0, len(typed) + 1, 2):
        gif.add(render(prefix + typed[:i]), char_ms)
    done = prefix + typed
    gif.add(render(done), pause)
    return done


def render_setup() -> None:
    gif = Gif()
    box = (24, 104, 936, 524)

    def chrome_page(dev_on: bool, loaded: bool, tip: str | None) -> Image.Image:
        im, d = new_canvas("步骤 1 / 3    加载未打包扩展", "formant  ·  第一次配置")
        draw_browser(d, box, "chrome://extensions", "扩展程序")
        d.text((48, 178), "扩展程序", font=F_TITLE, fill=INK)
        d.text((720, 184), "开发者模式", font=F_SM, fill=MUTED)
        d.rounded_rectangle((830, 182, 888, 208), 12, fill=ACCENT if dev_on else MASK)
        knob = 866 if dev_on else 838
        d.ellipse((knob, 184, knob + 20, 206), fill=SURFACE)
        if dev_on:
            pill(d, (48, 226, 220, 256), "加载已解压的扩展程序", on=True)
        if loaded:
            d.rounded_rectangle((48, 278, 340, 430), 10, fill=SURFACE, outline=LINE, width=1)
            paste_icon(im, (68, 298), 32)
            d.text((112, 298), "formant", font=F_BOLD, fill=INK)
            d.text((112, 320), "1.8.154", font=F_SM, fill=MUTED)
            d.text((68, 352), "智能翻译、New Tab、书签同步", font=F_SM, fill=MUTED)
            d.rounded_rectangle((68, 386, 140, 412), 12, fill=OK_BG)
            d.text((80, 390), "已启用", font=F_SM, fill=OK)
        if tip:
            callout(d, (700, 280), tip)
        return im

    gif.add(chrome_page(False, False, "先打开开发者模式"), 900)
    gif.add(chrome_page(True, False, "再加载 formant 目录"), 1100)
    gif.add(chrome_page(True, False, "选择\nD:\\code\\formant\\formant"), 1400)
    gif.add(chrome_page(True, True, "扩展已加载"), 1600)

    def sync_page(env: str, base: str, key: str, saved: bool, tip: str | None, focus: str = "key") -> Image.Image:
        im, d = new_canvas("步骤 2 / 3    打开同步，填写 Client API Key", "formant  ·  第一次配置")
        draw_browser(d, box, "chrome-extension://formant/option.html#sync", "扩展设置")
        d.rectangle((25, 163, 210, 523), fill=SURFACE)
        d.line((210, 163, 210, 523), fill=LINE)
        for i, name in enumerate(("概览", "功能", "New Tab", "翻译", "同步")):
            y = 180 + i * 36
            on = name == "同步"
            if on:
                d.rounded_rectangle((36, y - 6, 196, y + 24), 8, fill=ACCENT_SOFT)
            d.text((48, y), name, font=F_UI, fill=ACCENT if on else INK)
        d.text((236, 176), "同步", font=F_TITLE, fill=INK)
        d.text((236, 208), "连接 mono。New Tab / 书签 / 词卡按 Client API Key 隔离。", font=F_SM, fill=MUTED)
        d.rounded_rectangle((236, 244, 916, 470), 10, fill=SURFACE, outline=LINE, width=1)
        d.text((256, 258), "mono 连接", font=F_BOLD, fill=INK)
        field(d, 256, 288, 200, "环境", env, focus=focus == "env")
        field(d, 480, 288, 410, "mono Base URL", base, focus=focus == "base")
        field(d, 256, 352, 634, "Client API Key", key, focus=focus == "key")
        pill(d, (256, 420, 318, 450), "保存", on=True)
        pill(d, (330, 420, 430, 450), "立即同步", on=False)
        if saved:
            d.rounded_rectangle((700, 418, 896, 452), 8, fill=OK_BG)
            d.text((716, 424), "同步设置已保存", font=F_SM, fill=OK)
        if tip:
            callout(d, (700, 176), tip)
        return im

    gif.add(sync_page("dev（本地）", "http://localhost:3101", "", False, "点齿轮打开同步", "env"), 800)
    gif.add(sync_page("prod", "https://www.oolaf.top", "", False, "生产环境选 prod", "env"), 1100)
    type_frames(
        gif,
        lambda current: sync_page("prod", "https://www.oolaf.top", current, False, "只填本机钥匙，不进仓库"),
        "",
        "ock_live_xxxxxxxx",
        char_ms=40,
        pause=400,
    )
    gif.add(sync_page("prod", "https://www.oolaf.top", "ock_live_xxxxxxxx", True, None), 900)

    done, d = new_canvas("步骤 3 / 3    保存后即可翻译、开 New Tab、同步书签", "formant  ·  第一次配置")
    draw_browser(d, box, "chrome-extension://formant/option.html#sync", "扩展设置")
    d.rounded_rectangle((80, 200, 880, 460), 14, fill=SURFACE, outline=LINE, width=1)
    paste_icon(done, (112, 232), 40)
    d.text((168, 232), "配置完成", font=F_TITLE, fill=INK)
    lines = (
        "Client API Key 只存在 chrome.storage.local，界面只显示指纹。",
        "popup 翻译、New Tab 热点英语、书签同步都按这把 Key 隔离。",
        "换电脑可在同步面板导出本机钥匙 JSON，不要把密钥写进仓库。",
    )
    for i, line in enumerate(lines):
        d.text((168, 286 + i * 32), line, font=F_UI, fill=INK)
    d.rounded_rectangle((168, 392, 360, 428), 8, fill=OK_BG)
    d.text((184, 398), "可以开始使用 formant", font=F_SM, fill=OK)
    gif.add(done, 2400)
    gif.save(DOCS / "setup.gif")


def render_usage() -> None:
    gif = Gif()
    box = (24, 104, 936, 524)

    def popup_page(text: str, translated: bool, tip: str | None) -> Image.Image:
        im, d = new_canvas("步骤 1 / 3    点工具栏图标，自动翻译", "formant  ·  日常使用")
        draw_browser(d, box, "https://news.example.com", "新闻")
        d.text((56, 190), "Today's briefing", font=F_TITLE, fill=INK)
        d.text((56, 230), "Markets opened mixed. Analysts said it was a piece of cake.", font=F_UI, fill=MUTED)
        d.rounded_rectangle((560, 176, 916, 500), 12, fill=SURFACE, outline=LINE, width=1)
        paste_icon(im, (576, 192), 20)
        d.text((604, 192), "formant", font=F_BOLD, fill=INK)
        d.rounded_rectangle((576, 228, 900, 292), 8, fill=PAGE, outline=LINE, width=1)
        d.text((588, 240), text or "输入要翻译的文本…", font=F_UI, fill=INK if text else MUTED)
        pill(d, (576, 304, 630, 330), "自动", on=True)
        pill(d, (638, 304, 700, 330), "Google", on=False)
        pill(d, (708, 304, 756, 330), "GPT", on=False)
        d.rounded_rectangle((576, 344, 900, 430), 10, fill=SURFACE, outline=LINE, width=1)
        d.ellipse((588, 356, 610, 378), fill=ACCENT)
        d.text((593, 358), "G", font=F_SM, fill=SURFACE)
        d.text((618, 356), "谷歌翻译", font=F_SM, fill=INK)
        if translated:
            d.text((588, 388), "小菜一碟。", font=F_WORD, fill=INK)
            d.text((576, 444), "词库命中俚语，走 Google", font=F_SM, fill=ACCENT)
        else:
            d.text((588, 388), "翻译结果将显示在这里", font=F_SM, fill=MUTED)
        if tip:
            callout(d, (56, 300), tip)
        return im

    gif.add(popup_page("", False, "点工具栏 formant 图标"), 900)
    type_frames(
        gif,
        lambda current: popup_page(current, False, "输入后自动路由"),
        "",
        "piece of cake",
        char_ms=42,
        pause=360,
    )
    gif.add(popup_page("piece of cake", True, None), 1800)

    def select_page(show_icon: bool, show_panel: bool) -> Image.Image:
        im, d = new_canvas("步骤 2 / 3    网页划词，浮动面板补译文", "formant  ·  日常使用")
        draw_browser(d, box, "https://docs.example.com/guide", "文档")
        d.text((56, 186), "Getting started", font=F_TITLE, fill=INK)
        before, word, after = "The rollout was a ", "piece of cake", " after we loaded formant."
        x = 56
        y = 230
        w0 = int(F_UI.getlength(before))
        ww = int(F_UI.getlength(word))
        d.text((x, y), before, font=F_UI, fill=INK)
        d.rounded_rectangle((x + w0 - 4, y - 4, x + w0 + ww + 4, y + 24), 4, fill=(255, 236, 179))
        d.text((x + w0, y), word, font=F_UI, fill=INK)
        d.text((x + w0 + ww, y), after, font=F_UI, fill=INK)
        icon_x = x + int(F_UI.getlength(before + word + after)) + 16
        if show_icon:
            d.ellipse((icon_x, y - 8, icon_x + 36, y + 28), fill=ACCENT)
            d.text((icon_x + 8, y - 2), "译", font=F_SM, fill=SURFACE)
        if show_panel:
            d.rounded_rectangle((56, 290, 500, 470), 12, fill=SURFACE, outline=LINE, width=1)
            d.text((76, 306), "划词翻译", font=F_BOLD, fill=INK)
            pill(d, (76, 340, 130, 366), "自动", on=True)
            d.rounded_rectangle((76, 382, 480, 448), 10, fill=PAGE, outline=LINE, width=1)
            d.text((92, 394), "谷歌翻译", font=F_SM, fill=MUTED)
            d.text((92, 416), "小菜一碟。", font=F_WORD, fill=INK)
            callout(d, (540, 300), "选中文字后点译")
        return im

    gif.add(select_page(False, False), 700)
    gif.add(select_page(True, False), 900)
    gif.add(select_page(True, True), 2000)

    def newtab_page(revealed: bool) -> Image.Image:
        im, d = new_canvas("步骤 3 / 3    新标签页四卡：天气 / 假期 / 汇率 / 热点英语", "formant  ·  日常使用")
        draw_browser(d, box, "chrome://newtab", "New Tab")
        d.rounded_rectangle((56, 184, 900, 248), 18, fill=SURFACE, outline=LINE, width=1)
        d.text((76, 204), "搜索或输入网址", font=F_UI, fill=MUTED)
        gap, count = 12, 4
        card_w = (900 - 56 - gap * (count - 1)) // count
        cards = (
            ("天气", "上海  22°", "多云"),
            ("假期", "国庆  还剩 3 天", "调休已计入"),
            ("汇率", "USD → CNY", "7.12"),
            ("热点英语", "piece of cake", "/piːs əv keɪk/"),
        )
        for i, (title, main, sub) in enumerate(cards):
            x0 = 56 + i * (card_w + gap)
            d.rounded_rectangle((x0, 268, x0 + card_w, 430), 10, fill=SURFACE, outline=LINE, width=1)
            d.text((x0 + 14, 280), title, font=F_SM, fill=MUTED)
            if title == "热点英语":
                d.text((x0 + 14, 304), sub, font=F_IPA, fill=ACCENT)
                d.text((x0 + 14, 326), main, font=F_WORD, fill=INK)
                if revealed:
                    d.text((x0 + 14, 364), "(小菜一碟)", font=F_UI, fill=INK)
                    d.text((x0 + 14, 388), "皮斯 欧夫 凯克", font=F_SM, fill=MUTED)
                else:
                    d.rounded_rectangle((x0 + 14, 360, x0 + card_w - 14, 412), 8, fill=MASK)
                    d.text((x0 + 26, 376), "点击揭开释义", font=F_SM, fill=MUTED)
            else:
                d.text((x0 + 14, 316), main, font=F_BOLD, fill=INK)
                d.text((x0 + 14, 348), sub, font=F_SM, fill=MUTED)
        return im

    gif.add(newtab_page(False), 1400)
    gif.add(newtab_page(True), 2400)
    gif.save(DOCS / "usage.gif")


if __name__ == "__main__":
    render_setup()
    render_usage()
    for name in ("setup.gif", "usage.gif"):
        path = DOCS / name
        print(f"{path}  {path.stat().st_size / 1024:.1f} KB")
