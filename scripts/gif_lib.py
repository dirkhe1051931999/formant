"""Shared canvas helpers for README demo GIFs."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ICON_PATH = ROOT / "formant" / "icons" / "icon32.png"

W, H = 960, 540
BOX = (24, 104, 936, 524)
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
CHROME = (232, 234, 238)
YELLOW = (227, 179, 65)
RED = (180, 35, 24)
GREEN = (63, 185, 80)
MASK = (210, 216, 226)
GRAY = (140, 140, 140)

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


def scene(step: str, title: str, url: str, tab: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im, d = new_canvas(step, title)
    draw_browser(d, BOX, url, tab)
    return im, d


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


def panel(d: ImageDraw.ImageDraw, box: tuple[int, int, int, int]) -> None:
    d.rounded_rectangle(box, 12, fill=SURFACE, outline=LINE, width=1)


def ctx_menu(d: ImageDraw.ImageDraw, x: int, y: int, items: list[str], active: str | None = None) -> None:
    width = int(max(F_SM.getlength(s) for s in items) + 36)
    height = 10 + 28 * len(items)
    d.rounded_rectangle((x, y, x + width, y + height), 8, fill=SURFACE, outline=LINE, width=1)
    for i, s in enumerate(items):
        iy = y + 8 + i * 28
        if s == active:
            d.rounded_rectangle((x + 4, iy - 2, x + width - 4, iy + 22), 6, fill=ACCENT_SOFT)
            d.text((x + 12, iy), s, font=F_SM, fill=ACCENT)
        else:
            d.text((x + 12, iy), s, font=F_SM, fill=INK)


def toast(d: ImageDraw.ImageDraw, x: int, y: int, text: str, *, ok: bool = True) -> None:
    width = int(F_SM.getlength(text) + 28)
    fill = OK_BG if ok else (254, 243, 242)
    color = OK if ok else RED
    d.rounded_rectangle((x, y, x + width, y + 32), 8, fill=fill)
    d.text((x + 12, y + 6), text, font=F_SM, fill=color)


def play(filename: str, title: str, frames: list[tuple]) -> Path:
    gif = Gif()
    for step, url, tab, draw, ms in frames:
        im, d = scene(step, title, url, tab)
        if draw:
            draw(im, d)
        gif.add(im, ms)
    path = DOCS / filename
    gif.save(path)
    return path
