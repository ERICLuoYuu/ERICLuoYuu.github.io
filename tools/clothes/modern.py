"""The contemporary pieces: two T-shirts, a ruched top, a floral midi skirt and a satin slip skirt."""

from __future__ import annotations

import math

import numpy as np

from .canvas import Canvas, S
from .curves import along, catmull, flip, mirror_x, offset, sym
from .details import (button, gathers, hem, knot_button, lace, picot, piping, raised, rib_band, seam, stitches,
                      zip_line)
from .fabrics import blend, cotton, jersey, rib, satin, stripes
from .motifs import flower

JERSEY_WHITE = "#f3f1ea"
JERSEY_INSIDE = "#e7e3d8"  # the knit's reverse, seen through the neck opening
WHITE_THREAD = (222, 218, 206, 255)


def tee_white(c: Canvas) -> None:
    """Boxy crew-neck tee: rib neckband, short set-in sleeves, twin-needle hems."""
    half = [(145, 5), (160, 4.5), (172, 2.5), (200, 9), (222, 15), (252, 40), (284, 74), (262, 96), (227, 80),
            (222, 150), (224, 246), (145, 250)]
    c.shape(sym(half, c.w))
    c.fill(jersey(c.grid_shape, c.np_rng, JERSEY_WHITE))
    front_neck = catmull([(118, 2.5), (126, 11), (145, 17.5), (164, 11), (172, 2.5)], closed=False, steps=10)
    inside = c.region(front_neck + [(160, 4.5), (145, 5), (130, 4.5)])
    c.fill(jersey(c.grid_shape, c.np_rng, JERSEY_INSIDE), region=inside)
    c.raise_(inside, -1.0, blur=0.2)  # the back lies a layer below the front
    rib_band(c, offset([(121, 3.6), (145, 6.2), (169, 3.6)], -1.3), 2.6, sewn=-1)  # back neckband
    rib_band(c, offset(front_neck, -1.6), 3.2, sewn=-1)  # front neckband
    for side in (1, -1):
        x = mirror_x(side, c.w)
        seam(c, [(x(172), 2.5), (x(222), 15)])
        seam(c, [(x(222), 15), (x(228), 38), (x(229), 60), (x(227), 80)])
        hem(c, [(x(281.9), 71.9), (x(259.9), 93.9)], WHITE_THREAD, depth=3.2, twin=True)
    hem(c, [(66.5, 243.5), (145, 245.5), (223.5, 243.5)], WHITE_THREAD, depth=4.5, twin=True)


ECRU = "#f1ebdc"
BRETON_NAVY = "#1f2a52"
ECRU_THREAD = (222, 214, 196, 255)


def tee_breton(c: Canvas) -> None:
    """Boat neck, three-quarter sleeves, navy stripes that meet across the side seams; stripes run round the sleeves."""
    half = [(150, 9), (186, 6), (206, 7), (222, 13), (250, 58), (285, 127), (271, 138), (240, 84), (225, 72),
            (225, 150), (227, 256), (150, 260)]
    c.shape(sym(half, c.w))
    ground = jersey(c.grid_shape, c.np_rng, ECRU)
    fabric = stripes(ground, BRETON_NAVY, pitch=15, band=5, start=40)  # a plain yoke above the first stripe
    right = [(222, 13), (250, 58), (285, 127), (271, 138), (240, 84), (225, 72), (228, 40)]
    for sleeve, angle, shoulder in ((right, 25.0, (222, 13)), (flip(right, c.w), -25.0, (c.w - 222, 13))):
        striped = stripes(ground, BRETON_NAVY, pitch=15, band=5, start=14, angle=angle, origin=shoulder)
        fabric = blend(fabric, striped, np.asarray(c.region(catmull(sleeve, steps=6)), np.float32) / 255)
    c.fill(fabric)
    hem(c, [(96, 9.2), (150, 11.6), (204, 9.2)], ECRU_THREAD, depth=2.6)  # the boat neck's facing
    for side in (1, -1):
        x = mirror_x(side, c.w)
        seam(c, [(x(206), 7), (x(222), 13)])
        seam(c, [(x(222), 13), (x(229), 36), (x(231), 56), (x(225), 72)])
        hem(c, [(x(283.1), 124.6), (x(269.1), 135.6)], ECRU_THREAD, depth=3)
    hem(c, [(73.5, 252.5), (150, 255), (226.5, 252.5)], ECRU_THREAD, depth=4)


RIB_RED = "#cc1b36"
TRIM_PINK = (238, 120, 140, 255)
CORD = (178, 18, 42, 255)
RED_THREAD = (196, 30, 54, 255)


def _puff(c: Canvas, side: int) -> None:
    """Gathers at a puffed sleeve's cap, and its elastic band at the hem."""
    x = mirror_x(side, c.w)
    cap = [(x(176), 7), (x(181), 26), (x(182), 46)]
    ridges = [[(px + side * dy, py - side * dx), (px + side * 8 * dy, py - side * 8 * dx)]
              for (px, py), (dx, dy) in along(catmull(cap, closed=False), 3.5)]
    gathers(c, ridges, height=0.9)
    rib_band(c, [(x(209), 56), (x(189), 60.5)], 3.0, sewn=-side)


def ruched_top(c: Canvas) -> None:
    """Sweetheart neckline with picot trim, centre ruching on a tie, short puff sleeves; red rib knit."""
    half = [(110, 42), (120, 32), (132, 26), (142, 23), (148, 13), (150, 4), (176, 6), (196, 15), (212, 35),
            (210, 58), (188, 63), (178, 72), (172, 120), (176, 186), (110, 190)]
    c.shape(sym(half, c.w))
    c.fill(rib(c.grid_shape, c.np_rng, RIB_RED, pitch=1.4))
    neckline = [(71, 5), (72.5, 14), (79, 24), (88, 27), (98, 33), (110, 43), (122, 33), (132, 27), (141, 24),
                (147.5, 14), (149, 5)]
    picot(c, offset(neckline, -0.8), TRIM_PINK)
    hem(c, offset(neckline, -2.4), RED_THREAD, depth=2)
    seam(c, [(110, 44), (110, 122)])
    gathers(c, [[(110 + side * 1.5, y), (110 + side * 13, y - 2.2 + k * 0.12), (110 + side * 30, y + 2.5)]
                for k, y in enumerate(range(47, 122, 5)) for side in (-1, 1)])
    piping(c, [(110, 44), (106, 55), (104.5, 67)], CORD, width=1.3)
    piping(c, [(110, 44), (114.5, 56), (116.5, 69)], CORD, width=1.3)
    for x, y, r in ((110, 45, 2.0), (104.5, 68, 1.0), (116.5, 70, 1.0)):
        knot_button(c, x, y, r, CORD)
    for side in (1, -1):
        x = mirror_x(side, c.w)
        seam(c, [(x(150), 4.5), (x(176), 6.5)])
        seam(c, [(x(176), 6.5), (x(180.5), 26), (x(181.5), 48), (x(178), 72)])
        _puff(c, side)
    hem(c, [(46, 184), (110, 186), (174, 184)], RED_THREAD, depth=3.5)


SKIRT_BLUE = "#2a92d2"
BLUE_THREAD = (120, 186, 230, 255)
LEAF = (46, 132, 92, 230)
PETALS = [(235, 92, 138, 255), (214, 56, 74, 255), (246, 160, 186, 255)]


def _ditsy_print(c: Canvas) -> None:
    img, draw = c.layer()
    for _ in range(330):
        x, y = c.rng.uniform(0, c.w), c.rng.uniform(14, c.h)
        draw.ellipse([(x + 2) * S, (y - 1) * S, (x + 5) * S, (y + 1) * S], fill=LEAF)
        flower(draw, x, y, c.rng.uniform(2.2, 3.2), c.rng.choice(PETALS), (255, 236, 200, 255))
    c.paint(img)


def floral_skirt(c: Canvas) -> None:
    """A-line midi: waistband with a side zip and button, two panel seams, a lettuce-edge hem; ditsy floral print."""
    wave = lambda t, y: (4 + 222 * t, y + 2.6 * math.sin(t * math.pi * 46))  # noqa: E731
    c.shape([(48, 0), (182, 0), (184, 12), (208, 150), (226, 292),
             *[wave(t, 292) for t in np.linspace(1, 0, 460)][1:-1], (4, 292), (22, 150), (46, 12)])
    c.fill(cotton(c.grid_shape, c.np_rng, SKIRT_BLUE))
    _ditsy_print(c)
    raised(c, [(46, 0), (184, 0), (184, 12), (46, 12)], 0.5)
    seam(c, [(46, 12.2), (184, 12.2)])
    for y in (1.6, 10.6):
        stitches(c, [(48, y), (182, y)], BLUE_THREAD)
    zip_line(c, [(50, 13), (45.5, 72)], BLUE_THREAD)
    button(c, 54, 6, 1.6, (176, 178, 186, 255), BLUE_THREAD)
    seam(c, [(92, 12.5), (76, 291)])
    seam(c, [(138, 12.5), (154, 291)])
    stitches(c, [wave(t, 289.6) for t in np.linspace(0, 1, 460)], BLUE_THREAD, dash=0.7, gap=0.25, curve=False)


CHAMPAGNE = "#e2c9a2"
LACE_IVORY = (240, 226, 200, 255)
SATIN_THREAD = (206, 182, 140, 255)


def _shirred_waistband(c: Canvas) -> None:
    raised(c, [(34, 0), (166, 0), (167, 14), (33, 14)], 0.6)
    seam(c, [(33, 14.3), (167, 14.3)])
    ridges, x = [], 36.0
    while x < 164:
        ridges.append([(x, 1.0), (x + c.rng.uniform(-0.6, 0.6), 7.0), (x + c.rng.uniform(-0.5, 0.5), 13.0)])
        x += c.rng.uniform(1.3, 2.1)
    gathers(c, ridges, height=0.9)
    for y in (4.5, 9.5):
        stitches(c, [(35, y), (165, y)], SATIN_THREAD, dash=1.2, gap=0.6)


def slip_skirt(c: Canvas) -> None:
    """Bias-cut satin midi: a shirred elastic waistband and a scalloped lace hem."""
    scallops = [(196 - k * 12 - 12 * t, 262 + 7 * math.sin(math.pi * t))
                for k in range(16) for t in np.linspace(0, 1, 10, endpoint=False)]
    c.shape([(40, 0), (160, 0), (166, 14), (181, 140), (196, 250), (196, 262), *scallops,
             (4, 262), (4, 250), (19, 140), (34, 14)])
    c.fill(satin(c.grid_shape, c.np_rng, CHAMPAGNE))
    _shirred_waistband(c)
    lace(c, [(0, 241), (200, 241), (200, 272), (0, 272)], LACE_IVORY)
    seam(c, [(6, 241), (194, 241)])
    stitches(c, [(6, 242.5), (194, 242.5)], SATIN_THREAD)
