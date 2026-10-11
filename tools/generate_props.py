"""Small props that lie in the box: the silica-gel desiccant packet.

    python tools/generate_props.py

The packet copies the look of a common Tyvek sachet (white embossed paper,
crimped seal bands, black warning text) without any maker's name or URL.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "art" / "desiccant.webp"

UNIT_PX = 4  # pixels per parcel unit in the final image
SIZE = (42, 60)  # parcel units, matches CONTENTS.desiccant
SS = 2  # supersampling factor
SEAL = 0.14  # share of the height taken by each crimped seal band
LINES = ["SILICA GEL", "\u201cDO NOT EAT\u201d", "THROW AWAY", "DESICCANT", "", "SILICA GEL", "\u201cDO NOT EAT\u201d", "THROW AWAY"]
FONT = Path("C:/Windows/Fonts/arial.ttf")


def outline(w: int, h: int) -> list[tuple[float, float]]:
    """Packet silhouette: long sides pinched in a little toward the middle."""
    pinch = w * 0.025
    left = [(pinch * np.sin(np.pi * t), h * t) for t in np.linspace(0, 1, 40)]
    right = [(w - pinch * np.sin(np.pi * t), h * (1 - t)) for t in np.linspace(0, 1, 40)]
    return left + right


def paper(w: int, h: int, seed: int = 3) -> np.ndarray:
    """Off-white Tyvek-like paper: fine fibres plus a soft puffy centre."""
    rng = np.random.default_rng(seed)
    base = np.full((h, w), 243.0)
    fibres = Image.fromarray((rng.random((h // 3, w // 3)) * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR)
    base += (np.asarray(fibres, dtype=float) - 128) * 0.035
    yy, xx = np.mgrid[0:h, 0:w]
    edge = np.minimum(xx, w - 1 - xx) / (w / 2)
    base -= (1 - np.clip(edge * 2.2, 0, 1)) * 14  # sides curve away from the light
    crease = np.sin((xx * 0.8 + yy * 0.35) / w * 7.0) * 2.2
    return np.clip(base + crease, 0, 255)


def emboss_band(draw: ImageDraw.ImageDraw, w: int, top: float, bottom: float) -> None:
    """Crimped seal: a grid of tiny raised squares."""
    cell = 9 * SS
    for y in np.arange(top + 2, bottom - cell * 0.6, cell):
        for x in np.arange(2, w - cell * 0.6, cell):
            x0, y0, x1, y1 = x, y, x + cell * 0.72, y + cell * 0.72
            draw.line([(x0, y1), (x0, y0), (x1, y0)], fill=(255, 255, 255, 150), width=SS)
            draw.line([(x0, y1), (x1, y1), (x1, y0)], fill=(150, 150, 145, 120), width=SS)


def text_block(draw: ImageDraw.ImageDraw, w: int, h: int) -> None:
    font = ImageFont.truetype(str(FONT), size=int(h * 0.058))
    top, bottom = h * (SEAL + 0.06), h * (1 - SEAL - 0.04)
    step = (bottom - top) / len(LINES)
    jitter = [0.0, 0.02, 0.03, 0.0, 0.0, 0.0, 0.02, 0.03]
    for i, line in enumerate(LINES):
        if not line:
            continue
        width = draw.textlength(line, font=font)
        x = (w - width) / 2 + jitter[i] * w
        draw.text((x, top + step * i), line, font=font, fill=(28, 28, 28, 225))


def main() -> None:
    w, h = SIZE[0] * UNIT_PX * SS, SIZE[1] * UNIT_PX * SS
    gray = paper(w, h)
    rgb = np.stack([gray, gray, gray * 0.985], axis=-1).astype(np.uint8)
    packet = Image.fromarray(rgb).convert("RGBA")

    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).polygon(outline(w, h), fill=255)
    packet.putalpha(mask)

    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    emboss_band(draw, w, 0, h * SEAL)
    emboss_band(draw, w, h * (1 - SEAL), h)
    for y in (h * SEAL, h * (1 - SEAL)):
        draw.line([(0, y), (w, y)], fill=(170, 170, 165, 110), width=SS)
    text_block(draw, w, h)
    overlay = overlay.filter(ImageFilter.GaussianBlur(0.35 * SS))
    packet = Image.alpha_composite(packet, Image.composite(overlay, Image.new("RGBA", (w, h)), mask))

    final = packet.resize((w // SS, h // SS), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    final.save(OUT, "WEBP", quality=88, method=6)
    print(f"{OUT.relative_to(ROOT)}: {final.width} x {final.height}, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
