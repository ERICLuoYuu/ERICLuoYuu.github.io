"""Draw the open-hand and closed-hand cursors used over the clothes.

    python tools/generate_cursors.py

Writes assets/ui/hand-open.svg, hand-open.png, hand-closed.svg and
hand-closed.png: 32 x 32, cream fill and brown ink like hand.svg, with the
hotspot at the palm centre (16, 16). Each hand is described once, as a palm
outline plus round-ended finger strokes, and drawn both as SVG and (for
browsers without SVG cursors) as a PNG.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
UI = ROOT / "assets" / "ui"
FILL = "#fbf3e2"
INK = "#3c2f27"
OUTLINE = 1.3  # ink width around the whole silhouette
SCALE = 4  # PNG supersampling


@dataclass(frozen=True)
class Stroke:
    """A round-ended finger: from (x1, y1) to (x2, y2), `width` wide."""

    x1: float
    y1: float
    x2: float
    y2: float
    width: float


@dataclass(frozen=True)
class Hand:
    name: str
    palm: tuple[tuple[float, float], ...]
    fingers: tuple[Stroke, ...]
    over: tuple[Stroke, ...]  # outlined separately, on top of the palm (a tucked thumb)
    creases: tuple[tuple[tuple[float, float], ...], ...]


def palm(left: float, right: float, top: float, bend: float) -> tuple[tuple[float, float], ...]:
    """Straight sides from `top` down to `bend`, then a round heel."""
    cx, rx = (left + right) / 2, (right - left) / 2
    heel = tuple((cx + rx * math.cos(math.radians(a)), bend + 7.2 * math.sin(math.radians(a))) for a in range(0, 181, 10))
    return ((left, top), (right, top), *heel)


OPEN = Hand(
    name="hand-open",
    palm=palm(9.2, 22.4, 14.5, 22.0),
    fingers=(
        Stroke(10.8, 16, 10.8, 6.8, 3.2),
        Stroke(14.2, 16, 14.2, 4.8, 3.2),
        Stroke(17.6, 16, 17.6, 5.6, 3.2),
        Stroke(20.9, 17, 20.9, 8.4, 3.0),
        Stroke(9.4, 22.2, 4.9, 16.2, 3.2),
    ),
    over=(),
    creases=(((12.5, 15.4), (12.5, 11.4)), ((15.9, 15.4), (15.9, 10.8)), ((19.3, 15.6), (19.3, 11.8))),
)

CLOSED = Hand(
    name="hand-closed",
    palm=palm(8.6, 23.0, 12.6, 21.6),
    fingers=(
        Stroke(10.6, 13.6, 10.6, 10.8, 3.3),
        Stroke(14.0, 13.4, 14.0, 9.8, 3.3),
        Stroke(17.4, 13.4, 17.4, 10.1, 3.3),
        Stroke(20.8, 13.8, 20.8, 11.4, 3.1),
    ),
    over=(Stroke(8.8, 20.6, 13.4, 17.6, 3.2),),
    creases=(((10.2, 16.2), (21.6, 16.2)), ((12.3, 12.6), (12.3, 15.0)), ((15.7, 12.4), (15.7, 15.0)), ((19.1, 12.6), (19.1, 15.0))),
)


def _num(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".")


def _strokes(strokes: tuple[Stroke, ...], color: str, extra: float) -> str:
    return "".join(
        f'<path d="M{_num(s.x1)} {_num(s.y1)} L{_num(s.x2)} {_num(s.y2)}" stroke="{color}" stroke-width="{_num(s.width + extra)}"/>'
        for s in strokes
    )


def svg(hand: Hand) -> str:
    points = " ".join(f"{_num(x)},{_num(y)}" for x, y in hand.palm)
    base_outline = f'<polygon points="{points}" fill="{INK}" stroke="{INK}" stroke-width="{_num(2 * OUTLINE)}"/>' + _strokes(hand.fingers, INK, 2 * OUTLINE)
    base_fill = f'<polygon points="{points}" fill="{FILL}"/>' + _strokes(hand.fingers, FILL, 0)
    over = _strokes(hand.over, INK, 2 * OUTLINE) + _strokes(hand.over, FILL, 0)
    creases = "".join(
        f'<path d="M{" L".join(f"{_num(x)} {_num(y)}" for x, y in line)}"/>' for line in hand.creases
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">\n'
        "  <!-- the hotspot is the palm centre (16,16) -->\n"
        f'  <g fill="none" stroke-linecap="round" stroke-linejoin="round">{base_outline}{base_fill}{over}</g>\n'
        f'  <g fill="none" stroke="{INK}" stroke-width="1" stroke-linecap="round" opacity=".55">{creases}</g>\n'
        "</svg>\n"
    )


def _rgba(color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    return (int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16), alpha)


def _capsule(draw: ImageDraw.ImageDraw, s: Stroke, width: float, color: tuple[int, int, int, int]) -> None:
    a, b, r = (s.x1 * SCALE, s.y1 * SCALE), (s.x2 * SCALE, s.y2 * SCALE), width * SCALE / 2
    draw.line([a, b], fill=color, width=round(2 * r))
    for x, y in (a, b):
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)


def _silhouette(palm_points: tuple[tuple[float, float], ...], strokes: tuple[Stroke, ...]) -> Image.Image:
    """Opaque where the hand part is, as an 8-bit mask at PNG drawing size."""
    mask = Image.new("L", (32 * SCALE, 32 * SCALE), 0)
    draw = ImageDraw.Draw(mask)
    if palm_points:
        draw.polygon([(x * SCALE, y * SCALE) for x, y in palm_points], fill=255)
    for s in strokes:
        _capsule(draw, s, s.width, 255)
    return mask


def _layer(img: Image.Image, mask: Image.Image) -> None:
    """Paint one part: its ink outline (the mask grown by OUTLINE), then its fill."""
    grow = 2 * round(OUTLINE * SCALE) + 1
    img.paste(Image.new("RGBA", img.size, _rgba(INK)), (0, 0), mask.filter(ImageFilter.MaxFilter(grow)))
    img.paste(Image.new("RGBA", img.size, _rgba(FILL)), (0, 0), mask)


def png(hand: Hand) -> Image.Image:
    img = Image.new("RGBA", (32 * SCALE, 32 * SCALE), (0, 0, 0, 0))
    _layer(img, _silhouette(hand.palm, hand.fingers))
    if hand.over:
        _layer(img, _silhouette((), hand.over))
    draw = ImageDraw.Draw(img)
    for line in hand.creases:
        draw.line([(x * SCALE, y * SCALE) for x, y in line], fill=_rgba(INK, 140), width=SCALE)
    return img.resize((32, 32), Image.LANCZOS)


def main() -> None:
    UI.mkdir(parents=True, exist_ok=True)
    for hand in (OPEN, CLOSED):
        (UI / f"{hand.name}.svg").write_text(svg(hand), encoding="utf-8")
        png(hand).save(UI / f"{hand.name}.png")
        print(f"wrote assets/ui/{hand.name}.svg and .png")


if __name__ == "__main__":
    main()
