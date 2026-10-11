"""Construction details — seams, stitching, hems, trims and fastenings — as colour and relief."""

from __future__ import annotations

import math
from typing import Callable

import numpy as np
from PIL import Image, ImageChops, ImageDraw

from .canvas import Canvas, S
from .curves import Point, along, catmull, dash_segments, offset

Shapes = Callable[[ImageDraw.ImageDraw, object], None]
THREAD_WIDTH = 0.35


def emboss(c: Canvas, shapes: Shapes, colour=None, height: float = 1.0, blur: float = 0.25) -> None:
    """Draw `shapes(draw, fill)` in `colour` (if any) and raise them by `height` in the relief."""
    if colour is not None:
        img, draw = c.layer()
        shapes(draw, colour)
        c.paint(img)
    ink, draw = c.ink()
    shapes(draw, 255)
    c.raise_(ink, height, blur)


def smooth(path: list[Point], on: bool = True) -> list[Point]:
    return catmull(path, closed=False, steps=12) if on and len(path) > 2 else path


def line(c: Canvas, path: list[Point], width: float) -> Shapes:
    pts, w = c.px(path), max(1, round(width * S))
    return lambda draw, fill: draw.line(pts, fill=fill, width=w, joint="curve")


def stitches(c: Canvas, path: list[Point], thread, dash: float = 1.6, gap: float = 0.8,
             width: float = THREAD_WIDTH, curve: bool = True) -> None:
    """A row of running stitches."""
    segments = dash_segments(smooth(path, curve), dash, gap)
    w = max(1, round(width * S))

    def shapes(draw, fill):
        for a, b in segments:
            draw.line(c.px([a, b]), fill=fill, width=w)

    emboss(c, shapes, thread, height=0.5, blur=0.08)


def seam(c: Canvas, path: list[Point], depth: float = 1.0, curve: bool = True) -> None:
    """Two pieces sewn together: a groove, with the seam allowance pressed up on either side."""
    pts = smooth(path, curve)
    emboss(c, line(c, pts, 2.4), None, height=0.35, blur=0.5)
    emboss(c, line(c, pts, 0.5), None, height=-depth, blur=0.2)


def topstitched_seam(c: Canvas, path: list[Point], thread, gap: float = 1.2) -> None:
    """A seam with a row of stitches beside it."""
    pts = smooth(path)
    seam(c, pts, curve=False)
    stitches(c, offset(pts, gap), thread, curve=False)


def raised(c: Canvas, outline: list[Point], height: float = 0.6, blur: float = 0.3) -> None:
    """A piece lying on top of the garment — a collar, a cuff, a waistband — raised as a whole."""
    c.raise_(c.region(outline), height, blur)


def hem(c: Canvas, path: list[Point], thread, depth: float, twin: bool = False) -> None:
    """A turned-up hem: the band between the edge and the stitch line `path` stands a little proud."""
    pts = smooth(path)
    near, draw = c.ink()
    draw.line(c.px(pts), fill=255, width=max(1, round(2 * (depth + 1) * S)), joint="curve")
    band = (np.asarray(near) > 0) & (c.depth < depth)
    c.raise_(Image.fromarray((band * 255).astype(np.uint8)), 0.6, blur=0.3)
    for row in ([offset(pts, 0.6), offset(pts, -0.6)] if twin else [pts]):
        stitches(c, row, thread, curve=False)


def piping(c: Canvas, path: list[Point], colour, width: float = 1.5, height: float = 1.3, curve: bool = True) -> None:
    """A rolled cord of contrast fabric along an edge or a seam."""
    emboss(c, line(c, smooth(path, curve), width), colour, height=height, blur=width * 0.3)


def trim(c: Canvas, path: list[Point], colour, width: float = 2.4, height: float = 0.4) -> None:
    """A flat woven band sewn on: a border or a ribbon."""
    emboss(c, line(c, smooth(path), width), colour, height=height, blur=0.15)


def figure(c: Canvas, ink: Image.Image, colour, height: float = 0.7) -> None:
    """Colour and raise the cloth where `ink` is white: a motif woven or embroidered in."""
    c.paint(Image.new("RGBA", c.size, colour), clip=ink)
    c.raise_(ink, height, blur=0.1)


def frog_closure(c: Canvas, x: float, y: float, angle: float, colour, scale: float = 1.0) -> None:
    """Pankou: a knot on one side, a loop on the other, both of rolled cord, with coiled ends."""
    ca, sa = math.cos(angle), math.sin(angle)

    def at(u: float, v: float) -> Point:
        return ((x + (u * ca - v * sa) * scale) * S, (y + (u * sa + v * ca) * scale) * S)

    cord = max(1, round(1.3 * scale * S))

    def shapes(draw, fill):
        for side in (-1, 1):
            arm = [at(side * u, 2.4 * math.sin(math.pi * u / 8)) for u in np.linspace(0, 8, 14)]
            back = [at(side * u, -2.4 * math.sin(math.pi * u / 8)) for u in np.linspace(8, 0, 14)]
            draw.line(arm + back, fill=fill, width=cord, joint="curve")
            ex, ey = at(side * 8.6, 0)
            r = 1.4 * scale * S
            draw.ellipse([ex - r, ey - r, ex + r, ey + r], outline=fill, width=cord)
        kx, ky = at(-1.2, 0)
        r = 2.1 * scale * S
        draw.ellipse([kx - r, ky - r, kx + r, ky + r], fill=fill)

    emboss(c, shapes, colour, height=1.8, blur=0.3)


def knot_button(c: Canvas, x: float, y: float, r: float, colour) -> None:
    """A Chinese knot button: a small ball of braided cord."""
    box = [(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S]
    emboss(c, lambda draw, fill: draw.ellipse(box, fill=fill), colour, height=1.8, blur=r * 0.45)
    braid = [((x - r * 0.6), y - r * 0.2), (x, y + r * 0.3), (x + r * 0.6, y - r * 0.2)]
    emboss(c, line(c, braid, 0.3), None, height=-0.6, blur=0.05)


def cord_loop(c: Canvas, x: float, y: float, length: float, colour, width: float = 0.9) -> None:
    """A loop of rolled cord, lying from (x, y) to the right, that holds a knot button."""
    loop = [(x, y - 0.9), (x + length * 0.6, y - 1.6), (x + length, y), (x + length * 0.6, y + 1.6), (x, y + 0.9)]
    piping(c, loop, colour, width=width, height=1.0)


def button(c: Canvas, x: float, y: float, r: float, colour, thread) -> None:
    """A flat sew-through button with four holes, sewn on with crossed thread."""
    box = [(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S]
    emboss(c, lambda draw, fill: draw.ellipse(box, fill=fill), colour, height=1.0, blur=0.15)
    h = r * 0.32
    for a, b in ((((x - h), (y - h)), ((x + h), (y + h))), (((x + h), (y - h)), ((x - h), (y + h)))):
        emboss(c, line(c, [a, b], 0.3), thread, height=-0.3, blur=0.05)


def rib_band(c: Canvas, path: list[Point], width: float, pitch: float = 0.9, sewn: int = 1, colour=None) -> None:
    """A knitted band along `path` (a neckband, a sleeve band): ribs run across it, sewn on along one edge."""
    pts = smooth(path)
    if colour is not None:
        emboss(c, line(c, pts, width), colour, height=0.0)
    half = width / 2
    ink, draw = c.ink()
    for (px, py), (dx, dy) in along(pts, pitch):
        draw.line(c.px([(px + dy * half, py - dx * half), (px - dy * half, py + dx * half)]), fill=255,
                  width=max(1, round(0.35 * S)))
    c.raise_(ink, 0.5, blur=0.1)
    seam(c, offset(pts, sewn * half), depth=0.8, curve=False)


def pleat(c: Canvas, path: list[Point], height: float = 1.2) -> None:
    """The fold edge of a knife pleat: the folded layer stands up, the crease beside it sinks."""
    pts = smooth(path)
    emboss(c, line(c, offset(pts, 0.8), 1.8), None, height=height, blur=0.6)
    emboss(c, line(c, offset(pts, -0.4), 0.5), None, height=-height, blur=0.15)


def gathers(c: Canvas, paths: list[list[Point]], height: float = 0.8) -> None:
    """Soft ridges of fabric gathered in: ruching, shirring, a puffed sleeve cap."""
    for path in paths:
        emboss(c, line(c, smooth(path), 0.9), None, height=height, blur=0.45)


def picot(c: Canvas, path: list[Point], colour, spacing: float = 1.3, r: float = 0.55) -> None:
    """A picot trim: a row of tiny loops along an edge."""
    points = [p for p, _ in along(smooth(path), spacing)]

    def shapes(draw, fill):
        for x, y in points:
            draw.ellipse([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], fill=fill)

    emboss(c, shapes, colour, height=0.7, blur=0.1)


def lace(c: Canvas, outline: list[Point], colour, hole: float = 0.55, pitch: float = 2.2) -> None:
    """Lace over the band `outline`: its own colour, a net of small holes, little raised flowers."""
    region = c.region(outline)
    c.paint(Image.new("RGBA", c.size, colour), clip=region)
    holes, hdraw = c.ink()
    blooms, bdraw = c.ink()
    xs, ys = [x for x, _ in outline], [y for _, y in outline]
    for row, y in enumerate(np.arange(min(ys) + pitch / 2, max(ys), pitch)):
        for col, x in enumerate(np.arange(min(xs) + (pitch / 2 if row % 2 else 0), max(xs), pitch)):
            draw, r = (bdraw, 0.8) if (row + col) % 5 == 0 else (hdraw, hole)
            draw.ellipse([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], fill=255)
    c.raise_(region, 0.2, blur=0.2)
    c.raise_(ImageChops.multiply(blooms, region), 0.8, blur=0.15)
    c.punch(ImageChops.multiply(holes, region))


def zip_line(c: Canvas, path: list[Point], thread, metal=(150, 150, 158, 255)) -> None:
    """An invisible zip in a seam: only its stitching and the pull at the top show."""
    topstitched_seam(c, path, thread, gap=0.9)
    (x, y) = path[0]
    box = [(x - 0.9) * S, (y - 0.2) * S, (x + 0.9) * S, (y + 3.4) * S]
    emboss(c, lambda draw, fill: draw.rounded_rectangle(box, radius=0.6 * S, fill=fill), metal, height=1.2, blur=0.1)
