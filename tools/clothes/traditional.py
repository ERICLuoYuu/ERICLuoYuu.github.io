"""The traditional pieces: a qipao, a mandarin-collar blouse and a horse-face skirt (mamianqun)."""

from __future__ import annotations

import numpy as np

from .canvas import Canvas
from .curves import catmull, mirror_x, sym
from .details import emboss, frog_closure, piping, raised, seam
from .fabrics import Fabric, twill, woven
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
