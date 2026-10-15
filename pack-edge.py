#!/usr/bin/env python3
"""Build a Partner Center zip: manifest.json at the zip root, no unpacked junk."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "formant"
DIST = ROOT / "dist"
STORE = DIST / "store"
SKIP_DIRS = {"_metadata", "node_modules"}
SKIP_FILES = {".ds_store", "thumbs.db", "_store_promo.html", "_store_icon.png"}
SKIP_SUFFIXES = {".map", ".pem", ".crx"}


def skip(path: Path) -> bool:
    rel_parts = set(path.relative_to(SRC).parts[:-1])
    if rel_parts & SKIP_DIRS:
        return True
    if path.name.lower() in SKIP_FILES:
        return True
    if path.suffix.lower() in SKIP_SUFFIXES:
        return True
    return False


def iter_files() -> list[Path]:
    files = [p for p in SRC.rglob("*") if p.is_file() and not skip(p)]
    files.sort()
    return files


def read_version() -> str:
    manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))
    if "default_locale" not in manifest:
        raise SystemExit("manifest.json is missing default_locale")
    desc = manifest.get("description") or ""
    if not desc.startswith("__MSG_"):
        if len(desc) > 132:
            raise SystemExit(f"manifest description is {len(desc)} chars (max 132)")
    locales_dir = SRC / "_locales" / manifest["default_locale"] / "messages.json"
    if not locales_dir.is_file():
        raise SystemExit(f"missing {locales_dir}")
    messages = json.loads(locales_dir.read_text(encoding="utf-8"))
    short = messages["extensionDescription"]["message"]
    if len(short) > 132:
        raise SystemExit(f"short description is {len(short)} chars (max 132)")
    return str(manifest["version"])


def write_zip(version: str) -> Path:
    DIST.mkdir(parents=True, exist_ok=True)
    out = DIST / f"formant-{version}.zip"
    files = iter_files()
    if not any(p.name == "manifest.json" and p.parent == SRC for p in files):
        raise SystemExit("manifest.json must sit at the formant/ root")
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in files:
            arc = path.relative_to(SRC).as_posix()
            zf.write(path, arcname=arc)
    names = zipfile.ZipFile(out).namelist()
    if "manifest.json" not in names:
        raise SystemExit("zip root is missing manifest.json (do not nest a formant/ folder)")
    if any(n.startswith("_metadata/") or "/node_modules/" in n or n.startswith("node_modules/") for n in names):
        raise SystemExit("zip still contains _metadata or node_modules")
    return out


def load_font(size: int, cjk: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    latin = (
        Path(r"C:\Windows\Fonts\segoeui.ttf"),
        Path(r"C:\Windows\Fonts\arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    )
    cjk_faces = (
        Path(r"C:\Windows\Fonts\msyh.ttc"),
        Path(r"C:\Windows\Fonts\msyh.ttf"),
        Path(r"C:\Windows\Fonts\simhei.ttf"),
        Path(r"C:\Windows\Fonts\msyhbd.ttc"),
    )
    candidates = cjk_faces + latin if cjk else latin
    for candidate in candidates:
        if candidate.is_file():
            try:
                return ImageFont.truetype(str(candidate), size=size, index=0)
            except OSError:
                continue
    return ImageFont.load_default()


def write_store_images() -> None:
    icon = Image.open(SRC / "icons" / "icon128.png").convert("RGBA")
    STORE.mkdir(parents=True, exist_ok=True)

    logo = icon.resize((300, 300), Image.Resampling.LANCZOS)
    logo.save(STORE / "logo-300.png", "PNG")

    def tile(width: int, height: int, icon_size: int, font_size: int, name: str) -> None:
        canvas = Image.new("RGB", (width, height), "#f4f6f9")
        mark = icon.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
        gap = 28
        font = load_font(font_size)
        draw = ImageDraw.Draw(canvas)
        text = "formant"
        text_bbox = draw.textbbox((0, 0), text, font=font)
        text_w = text_bbox[2] - text_bbox[0]
        text_h = text_bbox[3] - text_bbox[1]
        total_w = icon_size + gap + text_w
        x = (width - total_w) // 2
        y_icon = (height - icon_size) // 2
        canvas.paste(mark, (x, y_icon), mark)
        text_x = x + icon_size + gap
        text_y = (height - text_h) // 2 - text_bbox[1]
        draw.text((text_x, text_y), text, font=font, fill="#151a22")
        canvas.save(STORE / name, "PNG")

    tile(440, 280, 128, 42, "tile-440x280.png")
    tile(1400, 560, 256, 96, "tile-1400x560.png")

    icon128 = icon.resize((128, 128), Image.Resampling.LANCZOS)
    icon128.save(STORE / "icon-128.png", "PNG")


def main() -> None:
    version = read_version()
    out = write_zip(version)
    write_store_images()
    size_mb = out.stat().st_size / (1024 * 1024)
    count = len(zipfile.ZipFile(out).namelist())
    print(f"zip    {out}  ({count} files, {size_mb:.2f} MB)")
    print(f"icon   {STORE / 'icon-128.png'}")
    print(f"shot   {STORE / 'screenshot-1280x800.png'}")
    print(f"shot   {STORE / 'screenshot-640x400.png'}")
    print(f"logo   {STORE / 'logo-300.png'}")
    print(f"tile   {STORE / 'tile-440x280.png'}")
    print(f"tile   {STORE / 'tile-1400x560.png'}")


if __name__ == "__main__":
    main()
