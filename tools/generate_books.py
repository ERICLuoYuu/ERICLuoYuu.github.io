"""Covers for the owner's books, lying in the lower right of the box.

    python tools/generate_books.py [out]        (default: assets/books; or npm run books)

Plain typographic covers drawn in code: the titles exactly as the owner wrote
them, in the site's open-licensed fonts (assets/fonts, SIL OFL). No publisher
names, logos or cover art. Sizes match BOOKS in js/scene/geometry.js.
"""

from __future__ import annotations

import argparse
import sys
import zlib
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "assets" / "fonts"
BOLD = FONTS / "noto-sans-latin-700-normal.woff2"
REGULAR = FONTS / "noto-sans-latin-400-normal.woff2"
PX = 8  # cover pixels per parcel unit: the titles stay sharp on a dense screen
MARGIN = 0.12  # share of the cover's width kept clear on each side of the lettering
LEADING = 1.12  # line height, as a multiple of the type size


@dataclass(frozen=True)
class Book:
    id: str
    title: str
    author: str  # '' when the owner named none
    size: tuple[int, int]  # parcel units, as BOOKS in js/scene/geometry.js
    lines: tuple[str, ...]  # how the title breaks on the cover; joined with spaces they are the title
    ground: str  # the cover's colour
    ink: str  # the lettering's colour
    panel: str | None = None  # a band or label behind the title...
    panel_box: tuple[float, float, float, float] = (0, 0, 1, 1)  # ...its left, top, right, bottom as shares of the cover
    title_top: float = 0.14  # where the title starts, as a share of the height
    largest: float = 0.2  # the biggest the title may be set, as a share of the cover's width
    rules: tuple[float, ...] = ()  # heights of thin rules in the panel's colour, as shares of the height
    grain: float = 5.0  # strength of the paper or cloth texture, in levels


BOOKS = (
    Book("hunter-x-hunter", "Hunter × Hunter", "", (50, 78), ("Hunter", "×", "Hunter"),
         ground="#f3efe6", ink="#ffffff", panel="#2e8b57", panel_box=(0, 0.08, 1, 0.6),
         title_top=0.12, largest=0.18, rules=(0.9,)),
    Book("dictionary", "German-Chinese dictionary", "", (70, 96), ("German-Chinese", "dictionary"),
         ground="#1f2c47", ink="#1f2c47", panel="#efe5cc", panel_box=(0.14, 0.2, 0.86, 0.46),
         title_top=0.28, largest=0.11, rules=(0.12, 0.88), grain=9.0),
    Book("solitude", "One Hundred Years of Solitude", "Gabriel García Márquez", (58, 88),
         ("One Hundred", "Years of", "Solitude"), ground="#d9a23a", ink="#3b2414",
         title_top=0.12, largest=0.16, rules=(0.7,)),
    Book("siddhartha", "Siddhartha", "Hermann Hesse", (56, 86), ("Siddhartha",),
         ground="#2f5d62", ink="#f1e8d6", title_top=0.3, largest=0.2, rules=(0.24, 0.42)),
)


def fit_font(text: str, path: Path, width: float, largest: int) -> ImageFont.FreeTypeFont:
    """The font at the largest size, up to `largest` px, at which `text` fits `width` px."""
    for size in range(largest, 5, -1):
        font = ImageFont.truetype(str(path), size)
        if font.getlength(text) <= width:
            return font
    return ImageFont.truetype(str(path), 6)


def textured(img: Image.Image, seed: str, strength: float) -> Image.Image:
    """Fine, even paper or cloth grain, the same for the same book every time."""
    rng = np.random.default_rng(zlib.crc32(seed.encode()))
    noise = rng.normal(0, strength, (img.height, img.width, 1))
    return Image.fromarray(np.clip(np.asarray(img, np.float32) + noise, 0, 255).astype(np.uint8))


def cover(book: Book) -> Image.Image:
    """The book's front cover at PX pixels per unit: ground, panel, title, author."""
    w, h = book.size[0] * PX, book.size[1] * PX
    img = Image.new("RGB", (w, h), book.ground)
    draw = ImageDraw.Draw(img)
    left, top, right, bottom = book.panel_box
    if book.panel:
        draw.rectangle([left * w, top * h, right * w, bottom * h], fill=book.panel)
    rule = book.panel or book.ink
    for y in book.rules:
        draw.rectangle([MARGIN * w, y * h - 0.6 * PX, (1 - MARGIN) * w, y * h + 0.6 * PX], fill=rule)
    room = ((right - left) - 2 * MARGIN) * w if book.panel else (1 - 2 * MARGIN) * w
    size = min(fit_font(line, BOLD, room, round(book.largest * w)).size for line in book.lines)
    font = ImageFont.truetype(str(BOLD), size)
    y = book.title_top * h
    for line in book.lines:
        draw.text((w / 2, y), line, font=font, fill=book.ink, anchor="ma")
        y += size * LEADING
    if book.author:
        byline = fit_font(book.author, REGULAR, (1 - 2 * MARGIN) * w, round(size * 0.5))
        draw.text((w / 2, 0.86 * h), book.author, font=byline, fill=book.ink, anchor="ma")
    return textured(img, f"book:{book.id}", book.grain)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("out", nargs="?", default=str(ROOT / "assets" / "books"))
    out = Path(parser.parse_args(argv).out)
    out.mkdir(parents=True, exist_ok=True)
    for book in BOOKS:
        path = out / f"{book.id}.webp"
        cover(book).save(path, "WEBP", quality=88, method=6)
        print(f"{path}: {book.size[0] * PX} x {book.size[1] * PX}, {path.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
