"""The traditional pieces: a qipao, a mandarin-collar blouse and a horse-face skirt (mamianqun)."""

from __future__ import annotations

import numpy as np

from .canvas import Canvas, S
from .curves import catmull, mirror_x, sym
from .details import (cord_loop, emboss, figure, frog_closure, hem, knot_button, piping, pleat, raised, seam,
                      stitches, topstitched_seam, trim)
from .fabrics import Fabric, linen, twill, woven
from .motifs import cloud, peony

QIPAO_RED = "#9d1430"
QIPAO_FIGURE = "#b3233f"  # the woven flowers, a shade lighter than the ground
GOLD = (214, 176, 98, 255)
PIPING_CREAM = (238, 216, 170, 255)


def _brocade(c: Canvas) -> Fabric:
    """Red twill with peonies and clouds woven in, tone on tone."""
    ink, draw = c.ink()
    for _ in range(34):
        x, y = c.rng.uniform(8, c.w - 8), c.rng.uniform(26, c.h - 6)
        if c.rng.random() < 0.6:
            peony(draw, x, y, c.rng.uniform(8, 12), 255, c.rng)
        else:
            cloud(draw, x, y, c.rng.uniform(4, 5.5), 255)
    ground = twill(c.grid_shape, c.np_rng, QIPAO_RED, pitch=1.3)
    return woven(ground, np.asarray(ink, np.float32) / 255, QIPAO_FIGURE, height=0.7)


def _gold_clouds(c: Canvas) -> None:
    spots = [(c.rng.uniform(10, c.w - 10), c.rng.uniform(40, c.h - 10), c.rng.uniform(2.4, 3.4)) for _ in range(16)]

    def shapes(draw, fill):
        for x, y, r in spots:
            cloud(draw, x, y, r, fill)

    emboss(c, shapes, GOLD, height=0.6, blur=0.1)


def _collar(c: Canvas) -> None:
    """A rounded mandarin collar, piped, closed with a frog at the front."""
    raised(c, catmull([(76, 2), (95, 0.5), (114, 2), (115.5, 11), (95, 13.5), (74.5, 11)], steps=8), 0.7)
    seam(c, [(74.5, 11.5), (95, 14), (115.5, 11.5)])
    piping(c, [(76.5, 2.8), (95, 1.3), (113.5, 2.8)], PIPING_CREAM, width=1.3)
    piping(c, [(94.4, 1.5), (94.6, 13)], PIPING_CREAM, width=1.2)
    frog_closure(c, 95, 7, 0.0, GOLD, scale=0.8)


def _opening(c: Canvas) -> None:
    """The dajin: from the collar across the wearer's right chest (the viewer's left) to the underarm, then down the side."""
    piping(c, [(95, 13.5), (86, 18), (74, 25), (61, 35), (50, 47), (43.5, 61)], PIPING_CREAM, width=1.6)
    piping(c, [(41, 62), (43.8, 96), (52.6, 138)], PIPING_CREAM, width=1.2)
    for x, y, angle in ((80, 22.5, 0.55), (60, 37, 0.8), (46, 56, 1.2), (44, 90, 1.57)):
        frog_closure(c, x, y, angle, GOLD, scale=0.85)


def qipao(c: Canvas) -> None:
    """Fitted sheath to mid-calf, rounded mandarin collar, curved opening with frog closures, piping, side slits."""
    half = [(95, 3), (106, 2), (113, 4), (115, 11), (128, 15), (149, 22), (162, 29), (167, 43), (153, 50),
            (150, 62), (147, 96), (138, 138), (140, 162), (151, 204), (152, 232), (147, 300), (142, 398), (95, 400)]
    c.shape(sym(half, c.w))
    c.fill(_brocade(c))
    _gold_clouds(c)
    _collar(c)
    _opening(c)
    for side in (1, -1):
        x = mirror_x(side, c.w)
        seam(c, [(x(115), 11), (x(149), 22)])  # shoulder
        seam(c, [(x(118), 112), (x(117.3), 146), (x(118), 182)], depth=0.7)  # waist dart
        piping(c, [(x(165.4), 42.6), (x(153.4), 48.6)], PIPING_CREAM, width=1.4)  # cap-sleeve edge
        piping(c, [(x(147), 299), (x(141.5), 400)], PIPING_CREAM, width=3.2)  # both edges of the slit
    piping(c, [(48.6, 398.4), (95, 399.2), (141.4, 398.4)], PIPING_CREAM, width=1.5)  # hem
    for side in (1, -1):
        x = mirror_x(side, c.w)
        c.cut([(x(147), 300), (x(142.6), 401), (x(139.8), 401)])  # the side slit, opening a little at the hem


LINEN_CREAM = "#efe5cf"
BLOUSE_THREAD = (190, 172, 134, 255)
KNOT = (222, 206, 172, 255)


def blouse(c: Canvas) -> None:
    """Stand collar, a placket of knotted cloth buttons, long set-in sleeves with cuffs; linen."""
    half = [(150, 1), (162, 1), (172, 3), (174, 11), (196, 16), (214, 22), (240, 52), (268, 96), (292, 140),
            (297, 151), (282, 162), (260, 128), (232, 92), (217, 80), (218, 140), (220, 226), (150, 230)]
    c.shape(sym(half, c.w))
    c.fill(linen(c.grid_shape, c.np_rng, LINEN_CREAM))
    raised(c, catmull([(127, 2), (150, 0.5), (173, 2), (174.5, 11), (150, 14), (125.5, 11)], steps=8), 0.6)
    seam(c, [(125.5, 11.5), (150, 14.5), (174.5, 11.5)])
    stitches(c, [(128, 3.6), (150, 2.1), (172, 3.6)], BLOUSE_THREAD)
    for x in (144, 156):  # the placket down the centre front
        topstitched_seam(c, [(x, 15), (x, 227)], BLOUSE_THREAD)
    for y in (24, 58, 92, 126, 160, 194):
        knot_button(c, 147.5, y, 1.9, KNOT)
        cord_loop(c, 149, y, 6.5, KNOT)
    for side in (1, -1):
        x = mirror_x(side, c.w)
        seam(c, [(x(174.5), 11), (x(214), 22)])  # shoulder
        seam(c, [(x(214), 22), (x(220.5), 42), (x(221.5), 62), (x(217), 80)])  # set-in sleeve
        raised(c, [(x(287), 131), (x(292), 140), (x(297), 151), (x(282), 162), (x(276.5), 153.5)], 0.4)  # cuff
        topstitched_seam(c, [(x(287), 131), (x(276.5), 153.5)], BLOUSE_THREAD)
        knot_button(c, x(289.5), 147, 1.4, KNOT)
    hem(c, [(81, 224.5), (150, 226.5), (219, 224.5)], BLOUSE_THREAD, depth=4.5)


NAVY = "#1b2a4e"
SKIRT_GOLD = (208, 168, 84, 255)
BAND_CREAM = "#f0e5cc"
SKIRT_THREAD = (40, 56, 96, 255)


def _hem_border(c: Canvas) -> None:
    """The woven border (lan) along the hem: clouds over a wave line, between two gold bands."""
    ink, draw = c.ink()
    for x in range(8, int(c.w), 22):
        cloud(draw, x, 238, 5.2, 255)
    draw.line(c.px([(x, 249 + 2 * np.sin(x / 6)) for x in np.arange(0, c.w + 1, 1.0)]), fill=255, width=round(1.2 * S))
    figure(c, ink, SKIRT_GOLD, height=0.7)
    trim(c, [(4, 223), (276, 223)], SKIRT_GOLD, width=1.6)
    trim(c, [(2, 255.5), (278, 255.5)], SKIRT_GOLD, width=1.2)


def mamianqun(c: Canvas) -> None:
    """Horse-face skirt: flat front panels framed by knife pleats, a waistband with ties, a woven hem border."""
    c.shape(catmull([(70, 19), (210, 19), (262, 130), (280, 258), (140, 262), (0, 258), (18, 130)], steps=12))
    band = [(64, 0), (216, 0), (216, 21), (64, 21)]
    ties = [[(208, 8), (215, 8), (240, 98), (233, 100)], [(72, 8), (65, 8), (40, 98), (47, 100)]]
    for piece in (band, *ties):
        c.shape(piece)
    c.fill(twill(c.grid_shape, c.np_rng, NAVY, pitch=1.2))
    cream = linen(c.grid_shape, c.np_rng, BAND_CREAM)
    for piece in (band, *ties):
        c.fill(cream, region=c.region(piece))
    seam(c, [(66, 21), (214, 21)])
    for y in (2, 19):
        stitches(c, [(66, y), (214, y)], SKIRT_THREAD)
    for k in range(1, 12):  # knife pleats fanning out either side of the flat front panels
        top, bottom = 106 - k * 3.3, 98 - k * 8.6
        pleat(c, [(top, 22), (bottom, 257)])
        pleat(c, [(c.w - bottom, 257), (c.w - top, 22)])  # walked the other way, so it folds toward the centre too
    trim(c, [(106, 22), (98, 222)], SKIRT_GOLD, width=2.6)  # the panel's edges
    trim(c, [(174, 22), (182, 222)], SKIRT_GOLD, width=2.6)
    medallion, draw = c.ink()
    peony(draw, 140, 150, 14, 255, c.rng)
    figure(c, medallion, SKIRT_GOLD, height=0.6)
    _hem_border(c)
    for tie in ties:
        raised(c, tie, 0.5)
