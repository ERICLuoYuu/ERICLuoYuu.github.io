"""Garments for the clothes pile: textures and cloth data.

    python tools/generate_clothes.py      (or: npm run clothes)

Draws each garment as a flat-lay illustration (assets/clothes/<id>.webp, with
transparency around it) and writes assets/clothes/garments.json: its size in
parcel units (fitted to the figure in the owner's pack), the coverage grid the cloth mesh is built from, and how the
fabric behaves. Then run `node tools/build-pile.mjs` to settle the pile.

The traditional pieces are a qipao, a mandarin-collar blouse and a horse-face
(mamianqun) skirt; the contemporary ones are simple high-street basics. No
brand names or logos appear anywhere.
"""

from __future__ import annotations

import json
import math
import random
import sys
import zlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))  # run as a script: make `clothes` importable
from clothes.fit import CELL, cell_grid, fit, grid_shape  # noqa: E402
from pack_body import pack_record  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "clothes"

PX = 2.4  # texture pixels per pattern unit
SS = 2  # supersampling while drawing
S = PX * SS  # drawing pixels per unit
COVER = 0.3  # a grid cell is cloth when at least this share of it is opaque

Point = tuple[float, float]


@dataclass(frozen=True)
class Garment:
    id: str
    label: str
    size: tuple[int, int]
    material: dict
    draw: Callable[["Canvas"], None] = field(repr=False)


# ─── drawing helpers ──────────────────────────────────────────────────────────


def catmull(points: list[Point], closed: bool = True, steps: int = 10) -> list[Point]:
    """A smooth curve through the given points."""
    pts = points + points[:3] if closed else [points[0], *points, points[-1]]
    out: list[Point] = []
    count = len(points) if closed else len(points) - 1
    for i in range(count):
        p0, p1, p2, p3 = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                       + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
                for k in (0, 1)
            ))
    if not closed:
        out.append(points[-1])
    return out


def mirror(half: list[Point], width: float) -> list[Point]:
    """Right half of a symmetric outline (top centre → bottom centre) → full outline."""
    left = [(width - x, y) for x, y in reversed(half)]
    return half + left


class Canvas:
    """A garment-sized drawing surface in parcel units, supersampled."""

    def __init__(self, width: int, height: int, seed: str):
        self.w, self.h = width, height
        self.size = (round(width * S), round(height * S))
        self.rng = random.Random(seed)
        self.mask = Image.new("L", self.size, 0)
        self.image = Image.new("RGBA", self.size, (0, 0, 0, 0))

    def px(self, points: list[Point]) -> list[Point]:
        return [(x * S, y * S) for x, y in points]

    def shape(self, outline: list[Point]) -> None:
        ImageDraw.Draw(self.mask).polygon(self.px(outline), fill=255)

    def cut(self, outline: list[Point]) -> None:
        ImageDraw.Draw(self.mask).polygon(self.px(outline), fill=0)

    def layer(self) -> tuple[Image.Image, ImageDraw.ImageDraw]:
        img = Image.new("RGBA", self.size, (0, 0, 0, 0))
        return img, ImageDraw.Draw(img)

    def paint(self, img: Image.Image, clip: Image.Image | None = None) -> None:
        """Composite a layer onto the garment, kept inside the silhouette."""
        alpha = ImageChops.multiply(img.getchannel("A"), clip or self.mask)
        img.putalpha(alpha)
        self.image = Image.alpha_composite(self.image, img)

    def fabric(self, color: str, grain: float = 0.035, weave: str | None = None) -> None:
        """Base colour with fine fibre noise and an optional knit/weave direction."""
        w, h = self.size
        rng = np.random.default_rng(zlib.crc32(color.encode()))  # hash() of a str changes from run to run
        noise = rng.standard_normal((h // 2 + 1, w // 2 + 1)).astype(np.float32)
        noise = np.asarray(Image.fromarray(noise).resize((w, h), Image.BILINEAR))
        if weave == "knit":
            noise = noise * 0.6 + np.sin(np.arange(w) / (S * 0.9))[None, :] * 0.5
        elif weave == "twill":
            yy, xx = np.mgrid[0:h, 0:w]
            noise = noise * 0.6 + np.sin((xx + yy) / (S * 0.8)) * 0.45
        base = np.array(Image.new("RGB", (1, 1), color).getpixel((0, 0)), dtype=np.float32)
        rgb = np.clip(base[None, None, :] * (1 + grain * noise[..., None]), 0, 255).astype(np.uint8)
        img = Image.fromarray(rgb).convert("RGBA")
        self.paint(img)

    def line(self, points: list[Point], color, width: float, smooth: bool = False) -> None:
        img, draw = self.layer()
        pts = catmull(points, closed=False, steps=8) if smooth else points
        draw.line(self.px(pts), fill=color, width=max(1, round(width * S)), joint="curve")
        self.paint(img)

    def dashes(self, points: list[Point], color, width: float, dash: float = 3.0, gap: float = 2.0) -> None:
        """A stitched line: short dashes along the path."""
        img, draw = self.layer()
        pts = catmull(points, closed=False, steps=16) if len(points) > 2 else points
        run, on = 0.0, True
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            seg = math.hypot(x1 - x0, y1 - y0)
            t = 0.0
            while t < seg:
                step = min(seg - t, (dash if on else gap) - run)
                a = (x0 + (x1 - x0) * t / seg, y0 + (y1 - y0) * t / seg)
                b = (x0 + (x1 - x0) * (t + step) / seg, y0 + (y1 - y0) * (t + step) / seg)
                if on:
                    draw.line(self.px([a, b]), fill=color, width=max(1, round(width * S)))
                t += step
                run += step
                if run >= (dash if on else gap) - 1e-6:
                    run, on = 0.0, not on
        self.paint(img)

    def edge(self, color, width: float) -> None:
        """Piping or a hem along the whole outline."""
        ring = self.mask.filter(ImageFilter.MaxFilter(3)).point(lambda v: 255 if v > 0 else 0)
        inner = self.mask.filter(ImageFilter.MinFilter(max(3, int(width * S) | 1)))
        band = ImageChops.subtract(ring, inner)
        img = Image.new("RGBA", self.size, color)
        self.paint(img, clip=ImageChops.multiply(band, self.mask))

    def shade_edges(self, depth: float = 4.0, strength: int = 46) -> None:
        """Darken just inside the silhouette, as if the fabric curls away."""
        blurred = self.mask.filter(ImageFilter.GaussianBlur(depth * S))
        inv = ImageChops.invert(blurred).point(lambda v: min(255, v * 2))
        shade = Image.new("RGBA", self.size, (20, 12, 8, 0))
        shade.putalpha(inv.point(lambda v: v * strength // 255))
        self.paint(shade)

    def finish(self, path: Path, cols: int, rows: int) -> tuple[Image.Image, dict]:
        final = self.image.resize((round(self.w * PX), round(self.h * PX)), Image.LANCZOS)
        final.save(path, "WEBP", quality=82, method=6)
        alpha = np.asarray(final.getchannel("A"), dtype=np.float32) / 255
        return final, cell_grid(alpha, cols, rows, cloth=COVER)


# ─── motifs ───────────────────────────────────────────────────────────────────


def frog_button(c: Canvas, x: float, y: float, angle: float, color, scale: float = 1.0) -> None:
    """Pankou: a knotted button with two looped arms."""
    img, draw = c.layer()
    ca, sa = math.cos(angle), math.sin(angle)
    def at(u: float, v: float) -> Point:
        return ((x + (u * ca - v * sa) * scale) * S, (y + (u * sa + v * ca) * scale) * S)
    width = max(1, round(1.6 * scale * S))
    for side in (-1, 1):
        loop = [at(side * u, 2.6 * math.sin(math.pi * u / 9)) for u in np.linspace(0, 9, 12)]
        back = [at(side * u, -2.6 * math.sin(math.pi * u / 9)) for u in np.linspace(9, 0, 12)]
        draw.line(loop + back, fill=color, width=width, joint="curve")
    r = 2.2 * scale * S
    cx, cy = at(-5, 0)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    c.paint(img)


def peony(draw: ImageDraw.ImageDraw, x: float, y: float, r: float, color, rng: random.Random) -> None:
    """A round brocade medallion: petals around a centre."""
    turn = rng.uniform(0, math.tau)
    for ring, (radius, petals) in enumerate(((r, 8), (r * 0.62, 6))):
        for k in range(petals):
            a = turn + ring * 0.3 + k * math.tau / petals
            px, py = x + math.cos(a) * radius * 0.55, y + math.sin(a) * radius * 0.55
            pr = radius * 0.38
            draw.ellipse([(px - pr) * S, (py - pr) * S, (px + pr) * S, (py + pr) * S], outline=color, width=max(1, round(0.9 * S)))
    cr = r * 0.18
    draw.ellipse([(x - cr) * S, (y - cr) * S, (x + cr) * S, (y + cr) * S], fill=color)


def cloud(draw: ImageDraw.ImageDraw, x: float, y: float, r: float, color) -> None:
    """Xiangyun: a small auspicious cloud of three curls."""
    for dx, dy, rr in ((0, 0, r), (r * 1.1, r * 0.35, r * 0.75), (-r * 1.05, r * 0.4, r * 0.7)):
        box = [(x + dx - rr) * S, (y + dy - rr) * S, (x + dx + rr) * S, (y + dy + rr) * S]
        draw.arc(box, 180, 470, fill=color, width=max(1, round(1.0 * S)))


def flower(draw: ImageDraw.ImageDraw, x: float, y: float, r: float, petal, centre) -> None:
    for k in range(5):
        a = k * math.tau / 5
        px, py = x + math.cos(a) * r * 0.55, y + math.sin(a) * r * 0.55
        pr = r * 0.48
        draw.ellipse([(px - pr) * S, (py - pr) * S, (px + pr) * S, (py + pr) * S], fill=petal)
    cr = r * 0.25
    draw.ellipse([(x - cr) * S, (y - cr) * S, (x + cr) * S, (y + cr) * S], fill=centre)


# ─── the garments ─────────────────────────────────────────────────────────────


def qipao(c: Canvas) -> None:
    w = c.w
    half = [(95, 0), (116, 3), (130, 14), (160, 24), (186, 42), (182, 64), (152, 72), (157, 104), (145, 150),
            (139, 172), (152, 214), (161, 240), (158, 300), (153, 360), (151, 398), (95, 400)]
    c.shape(catmull(mirror(half, w), steps=8))
    c.fabric("#a3142b", grain=0.05, weave="twill")
    img, draw = c.layer()
    for _ in range(26):
        x, y = c.rng.uniform(20, 170), c.rng.uniform(40, 390)
        if c.rng.random() < 0.55:
            peony(draw, x, y, c.rng.uniform(9, 14), (222, 170, 72, 150), c.rng)
        else:
            cloud(draw, x, y, c.rng.uniform(4, 6), (222, 170, 72, 130))
    c.paint(img)
    # side slits, darts and the curved placket (dajin)
    for x0, x1 in ((40, 37), (150, 153)):
        c.line([(x0, 318), (x1, 399)], (60, 6, 16, 200), 1.6)
    for x in (70, 120):
        c.line([(x, 150), (x + (95 - x) * 0.04, 205)], (70, 8, 18, 110), 1.0)
    placket = [(100, 9), (112, 22), (132, 34), (150, 50), (155, 70)]
    c.line(placket, (243, 226, 192, 255), 2.6, smooth=True)
    # mandarin collar
    collar = catmull([(72, 1), (95, -1), (118, 1), (120, 12), (95, 14), (70, 12)], steps=6)
    img, draw = c.layer()
    draw.polygon(c.px(collar), fill=(140, 14, 34, 255), outline=(243, 226, 192, 255), width=round(2.2 * S))
    c.paint(img)
    c.edge((243, 226, 192, 255), 2.6)
    gold = (232, 196, 110, 255)
    for x, y, a in ((101, 8, 0.2), (131, 33, 0.7), (151, 55, 1.2), (155, 86, 1.5), (151, 112, 1.6)):
        frog_button(c, x, y, a, gold, 0.9)
    c.shade_edges()


def blouse(c: Canvas) -> None:
    w = c.w
    half = [(150, 0), (172, 4), (212, 18), (262, 70), (296, 142), (276, 166), (240, 120), (216, 92), (216, 160),
            (218, 228), (150, 230)]
    c.shape(catmull(mirror(half, w), steps=8))
    c.fabric("#f1e8d4", grain=0.03)
    img, draw = c.layer()
    for j in range(0, 230, 14):
        for i in range(0, 300, 14):
            x, y = i + (7 if (j // 14) % 2 else 0), j
            draw.regular_polygon(((x * S, y * S), 2.2 * S), 4, rotation=45, outline=(214, 200, 168, 140))
    c.paint(img)
    for side in (1, -1):
        cx = 150 + side * 0
        cuff = [(150 + side * 126, 132), (150 + side * 146, 142)] if side == 1 else [(24, 132), (4, 142)]
        c.line([(150 + side * 66, 92), (150 + side * 92, 120)], (190, 176, 146, 120), 1.0)
        c.line(cuff, (200, 186, 156, 200), 1.6)
        del cx
    c.line([(160, 9), (176, 28), (196, 48), (214, 76)], (205, 190, 158, 255), 2.2, smooth=True)
    collar = catmull([(126, 1), (150, -1), (174, 1), (176, 12), (150, 15), (124, 12)], steps=6)
    img, draw = c.layer()
    draw.polygon(c.px(collar), fill=(236, 226, 204, 255), outline=(196, 180, 146, 255), width=round(1.4 * S))
    c.paint(img)
    navy = (44, 58, 92, 255)
    for x, y, a in ((161, 8, 0.3), (180, 31, 0.8), (199, 52, 0.9), (213, 76, 1.1)):
        frog_button(c, x, y, a, navy, 0.75)
    c.dashes([(6, 140), (40, 168)], (190, 176, 146, 255), 0.7)
    c.dashes([(294, 140), (260, 168)], (190, 176, 146, 255), 0.7)
    c.dashes([(84, 222), (150, 226), (216, 222)], (190, 176, 146, 255), 0.7)
    c.edge((214, 200, 170, 255), 1.4)
    c.shade_edges(strength=38)


def mamianqun(c: Canvas) -> None:
    outline = catmull([(72, 0), (208, 0), (212, 24), (262, 130), (280, 258), (140, 262), (0, 258), (18, 130), (68, 24)], steps=10)
    c.shape(outline)
    c.fabric("#1c2a4d", grain=0.05, weave="twill")
    img, draw = c.layer()
    for k in range(-14, 15):  # pressed pleats fanning out from the waist
        if abs(k) < 3:
            continue
        top = 140 + k * 4.6
        bottom = 140 + k * 10.4
        tone = (255, 255, 255, 22) if k % 2 else (0, 0, 0, 40)
        draw.polygon(c.px([(top, 22), (top + 2.3, 22), (bottom + 5.2, 262), (bottom, 262)]), fill=tone)
        draw.line(c.px([(top, 22), (bottom, 262)]), fill=(8, 14, 30, 120), width=round(0.8 * S))
    c.paint(img)
    gold = (214, 172, 84, 255)
    face = [(122, 22), (158, 22), (176, 216), (104, 216)]
    for a, b in zip(face, face[1:] + face[:1]):
        c.line([a, b], gold, 1.2)
    img, draw = c.layer()
    for k in range(9):  # embroidered hem band: clouds over waves
        cloud(draw, 22 + k * 30, 226, 5.5, gold)
    for k in range(40):
        x = k * 7.2
        draw.arc([x * S, 240 * S, (x + 7.2) * S, 248 * S], 180, 360, fill=gold, width=round(1.0 * S))
    c.paint(img)
    c.line([(6, 216), (274, 216)], gold, 1.6)
    c.line([(2, 252), (278, 252)], gold, 1.6)
    band = [(72, 0), (208, 0), (210, 22), (70, 22)]
    img, draw = c.layer()
    draw.polygon(c.px(band), fill=(238, 229, 208, 255))
    c.paint(img)
    c.dashes([(72, 19), (208, 19)], (186, 170, 136, 255), 0.6)
    c.shade_edges()


def tee(c: Canvas, base: str, stripes: bool) -> None:
    w = c.w
    if stripes:
        half = [(150, 14), (200, 6), (228, 14), (270, 92), (296, 152), (268, 170), (232, 100), (230, 180), (232, 258), (150, 260)]
    else:
        half = [(145, 9), (172, 4), (228, 16), (288, 60), (268, 108), (226, 90), (226, 180), (228, 248), (145, 250)]  # outline follows the back neckline
    c.shape(catmull(mirror(half, w), steps=8))
    c.fabric(base, grain=0.03, weave="knit")
    if stripes:
        img, draw = c.layer()
        for y in range(30, 262, 22):
            draw.rectangle([0, y * S, c.size[0], (y + 9) * S], fill=(31, 45, 77, 255))
        c.paint(img)
        c.dashes([(98, 12), (150, 17), (202, 12)], (140, 140, 140, 200), 0.6)
    else:
        # the back of the neckline shows through the crew neck, then the rib band
        back = catmull([(118, 4), (145, 9), (172, 4), (172, 6), (145, 23), (118, 6)], steps=6)
        img, draw = c.layer()
        draw.polygon(c.px(back), fill=(222, 218, 208, 255))
        c.paint(img)
        neck = catmull([(116, 6), (145, 23), (174, 6)], closed=False, steps=12)
        c.line(neck, (214, 210, 200, 255), 4.6)
        c.dashes([(117, 11), (145, 28), (173, 11)], (176, 172, 162, 255), 0.6)
    for points in ([(16, 104), (40, 96)], [(274, 104), (250, 96)]) if not stripes else ([(10, 156), (36, 168)], [(290, 156), (264, 168)]):
        c.dashes(points, (150, 146, 138, 220), 0.6)
    c.dashes([(70, 242), (145, 245), (220, 242)] if not stripes else [(72, 252), (150, 255), (228, 252)], (150, 146, 138, 220), 0.6)
    c.edge((0, 0, 0, 36), 1.0)
    c.shade_edges(strength=34)


def slip_skirt(c: Canvas) -> None:
    outline = catmull([(40, 0), (160, 0), (164, 12), (184, 140), (196, 266), (100, 272), (4, 266), (16, 140), (36, 12)], steps=10)
    c.shape(outline)
    c.fabric("#d9bf9b", grain=0.025)
    img, draw = c.layer()
    for k in range(7):  # soft bias-cut sheen
        x = 20 + k * 30
        draw.line(c.px([(x, 20), (x + 26, 268)]), fill=(255, 246, 228, 44), width=round(6 * S))
    c.paint(img.filter(ImageFilter.GaussianBlur(4 * S)))
    img, draw = c.layer()
    for x in range(42, 160, 4):  # gathered elastic waist
        draw.line(c.px([(x, 1), (x + 1, 11)]), fill=(150, 120, 86, 90), width=max(1, round(0.6 * S)))
    c.paint(img)
    c.line([(38, 11), (162, 11)], (170, 140, 104, 160), 0.9)
    c.dashes([(8, 262), (100, 268), (192, 262)], (160, 132, 96, 200), 0.6)
    c.shade_edges(strength=30)


def ruched_top(c: Canvas) -> None:
    w = c.w
    half = [(110, 38), (124, 44), (138, 46), (148, 22), (150, 6), (178, 8), (214, 40), (204, 70), (180, 62), (174, 120),
            (176, 188), (110, 190)]
    c.shape(catmull(mirror(half, w), steps=8))
    c.fabric("#d01c38", grain=0.04, weave="knit")
    img, draw = c.layer()
    for k in range(16):  # gathers radiating from the centre seam
        y = 46 + k * 5.2
        for side in (-1, 1):
            pts = [(110, y), (110 + side * 16, y - 3 + k * 0.2), (110 + side * 34, y + 2)]
            draw.line(c.px(catmull(pts, closed=False, steps=6)), fill=(120, 6, 24, 120), width=max(1, round(0.9 * S)))
    c.paint(img)
    c.line([(110, 38), (110, 124)], (130, 8, 28, 200), 1.4)
    img, draw = c.layer()
    for k in range(30):  # lettuce-edged neckline
        t = k / 29
        x = 70 + 80 * t
        y = 6 + 38 * math.sin(math.pi * t) * (0.75 + 0.25 * math.cos(2 * math.pi * t))
        draw.ellipse([(x - 1.8) * S, (y - 1.8) * S, (x + 1.8) * S, (y + 1.8) * S], fill=(232, 72, 96, 200))
    c.paint(img)
    c.dashes([(48, 184), (110, 186), (172, 184)], (120, 8, 26, 200), 0.6)
    c.shade_edges(strength=40)


def floral_skirt(c: Canvas) -> None:
    hem = [(4 + 222 * t, 293 + 2.4 * math.sin(t * math.pi * 44)) for t in np.linspace(1, 0, 400)]  # lettuce edge
    outline = [(50, 0), (180, 0), (184, 14), (208, 150), (226, 292)] + hem[1:-1] + [(4, 292), (22, 150), (46, 14)]
    c.shape(outline)
    c.fabric("#2a93d4", grain=0.035)
    img, draw = c.layer()
    for _ in range(330):
        x, y = c.rng.uniform(0, 230), c.rng.uniform(14, 300)
        leaf = (46, 132, 92, 210)
        draw.ellipse([(x + 2) * S, (y - 1) * S, (x + 5) * S, (y + 1) * S], fill=leaf)
        petal = c.rng.choice([(235, 92, 138, 255), (214, 56, 74, 255), (246, 160, 186, 255)])
        flower(draw, x, y, c.rng.uniform(2.2, 3.2), petal, (255, 236, 200, 255))
    c.paint(img)
    img, draw = c.layer()
    draw.rectangle([0, 0, c.size[0], 13 * S], fill=(36, 128, 186, 255))
    for x in range(52, 180, 4):
        draw.line(c.px([(x, 1), (x + 1, 12)]), fill=(14, 70, 112, 110), width=max(1, round(0.6 * S)))
    c.paint(img)
    c.edge((70, 170, 230, 220), 1.6)
    c.shade_edges(strength=36)


GARMENTS = [
    Garment("qipao", "qipao", (190, 400), {"stretchCompliance": 0, "bendCompliance": 3e-4, "friction": 0.35, "sheen": 0.75}, qipao),
    Garment("blouse", "mandarin-collar blouse", (300, 230), {"stretchCompliance": 0, "bendCompliance": 3e-4, "friction": 0.4, "sheen": 0.4}, blouse),
    Garment("mamianqun", "horse-face skirt", (280, 262), {"stretchCompliance": 0, "bendCompliance": 6e-5, "friction": 0.5, "sheen": 0.3}, mamianqun),
    Garment("tee-white", "white T-shirt", (290, 250), {"stretchCompliance": 0, "bendCompliance": 1.5e-4, "friction": 0.6, "sheen": 0.04},
            lambda c: tee(c, "#f4f2ec", stripes=False)),
    Garment("tee-breton", "striped T-shirt", (300, 260), {"stretchCompliance": 0, "bendCompliance": 1.2e-4, "friction": 0.6, "sheen": 0.04},
            lambda c: tee(c, "#f3eee2", stripes=True)),
    Garment("slip-skirt", "satin slip skirt", (200, 272), {"stretchCompliance": 0, "bendCompliance": 4e-4, "friction": 0.3, "sheen": 0.8}, slip_skirt),
    Garment("ruched-top", "red ruched top", (220, 190), {"stretchCompliance": 0, "bendCompliance": 2e-4, "friction": 0.55, "sheen": 0.12}, ruched_top),
    Garment("floral-skirt", "floral midi skirt", (230, 300), {"stretchCompliance": 0, "bendCompliance": 6e-4, "friction": 0.45, "sheen": 0.1}, floral_skirt),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    records = []
    for g in GARMENTS:
        scale = fit(g.id, g.size[1])
        size = [round(g.size[0] * scale, 2), round(g.size[1] * scale, 2)]
        canvas = Canvas(*g.size, seed=f"garment:{g.id}")
        g.draw(canvas)
        path = OUT / f"{g.id}.webp"
        image, grid = canvas.finish(path, *grid_shape(*size))
        records.append({
            "id": g.id,
            "label": g.label,
            "texture": path.relative_to(ROOT).as_posix(),
            "pxPerUnit": round(PX / scale, 4),
            "size": size,
            "grid": grid,
            "material": g.material,
        })
        covered = grid["cells"].count("1") / len(grid["cells"])
        print(f"{g.id:13s} {image.width}x{image.height}px  {path.stat().st_size // 1024:3d} KB  cloth cells {covered:.0%}")
    records.append(pack_record(ROOT))  # the pack: one more, stiff and heavy, body (kind "film")
    data = {"spacing": CELL, "pxPerUnit": PX, "garments": records}
    (OUT / "garments.json").write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
