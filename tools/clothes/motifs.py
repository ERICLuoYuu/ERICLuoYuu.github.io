"""Small drawings woven or printed into fabric: peonies, auspicious clouds, tiny flowers."""

from __future__ import annotations

import math
import random

from PIL import ImageDraw

from .canvas import S


def peony(draw: ImageDraw.ImageDraw, x: float, y: float, r: float, fill, rng: random.Random) -> None:
    """A round medallion: two rings of petals around a centre."""
    turn = rng.uniform(0, math.tau)
    for ring, (radius, petals) in enumerate(((r, 8), (r * 0.62, 6))):
        for k in range(petals):
            a = turn + ring * 0.3 + k * math.tau / petals
            px, py = x + math.cos(a) * radius * 0.55, y + math.sin(a) * radius * 0.55
            pr = radius * 0.38
            draw.ellipse([(px - pr) * S, (py - pr) * S, (px + pr) * S, (py + pr) * S], outline=fill, width=max(1, round(0.9 * S)))
    cr = r * 0.18
    draw.ellipse([(x - cr) * S, (y - cr) * S, (x + cr) * S, (y + cr) * S], fill=fill)


def cloud(draw: ImageDraw.ImageDraw, x: float, y: float, r: float, fill) -> None:
    """Xiangyun: a small auspicious cloud of three curls."""
    for dx, dy, rr in ((0, 0, r), (r * 1.1, r * 0.35, r * 0.75), (-r * 1.05, r * 0.4, r * 0.7)):
        box = [(x + dx - rr) * S, (y + dy - rr) * S, (x + dx + rr) * S, (y + dy + rr) * S]
        draw.arc(box, 180, 470, fill=fill, width=max(1, round(1.0 * S)))


def flower(draw: ImageDraw.ImageDraw, x: float, y: float, r: float, petal, centre) -> None:
    """A tiny five-petalled print flower."""
    for k in range(5):
        a = k * math.tau / 5
        px, py = x + math.cos(a) * r * 0.55, y + math.sin(a) * r * 0.55
        pr = r * 0.48
        draw.ellipse([(px - pr) * S, (py - pr) * S, (px + pr) * S, (py + pr) * S], fill=petal)
    cr = r * 0.25
    draw.ellipse([(x - cr) * S, (y - cr) * S, (x + cr) * S, (y + cr) * S], fill=centre)
