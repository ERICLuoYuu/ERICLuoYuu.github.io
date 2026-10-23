"""The figurine's clear plastic bag: a picture and a height map. Returns new arrays.

A pillow-shaped bag of thin film: its long sides bow out at the middle, its
ends are crimped heat seals, the film is nearly clear inside but denser along
its edges and wherever it creases. It is draped over the figure it holds, so
its height lies a little over the figure's everywhere, with ridges along the
creases.
"""

from __future__ import annotations

import hashlib

import numpy as np
from scipy import ndimage

COLOUR = (240, 244, 246)  # the film's colour, a cool clear white
BOW = 3  # units: the long sides bow out this far at the middle
SIDE = 1  # units between the canvas edge and a side at its middle
SEAL = 10  # units: how deep each crimped seal is
SEAL_ALPHA = 0.5
TOOTH = 2  # units: the depth of the saw-tooth at a seal's cut edge
CRIMP = 2  # units between the seal's crimp ridges
FILM = (0.08, 0.14)  # the clear film's alpha, varying gently
EDGE_ALPHA = 0.35  # along the bag's edge
EDGE_FADE = 3  # units over which the edge's density fades into the film
CREASES = 14
CREASE_ALPHA = (0.18, 0.4)
CREASE_WIDTH = 0.35  # units: the sigma of a crease's line
RIDGE = (0.4, 0.8)  # units a crease stands up
PILLOW = 3  # units: how high the empty film puffs up in the middle


def _rng(seed: str) -> np.random.Generator:
    return np.random.default_rng(int.from_bytes(hashlib.sha256(seed.encode()).digest()[:8], "little"))


def _outline(size_px: tuple[int, int], px: int) -> tuple[np.ndarray, np.ndarray]:
    """The bag's coverage (antialiased) and each pixel's distance in from its nearest edge, in px."""
    w, h = size_px
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    across = (2 * ys / (h - 1) - 1) ** 2  # 0 at the middle, 1 at the ends
    inset = (SIDE + BOW * across) * px
    side = np.minimum(xs - inset, (w - 1 - xs) - inset)
    tooth = TOOTH * px * np.abs(2 * ((xs / (2 * TOOTH * px)) % 1) - 1)  # the cut edge's zigzag
    end = np.minimum(ys - tooth, (h - 1 - ys) - tooth)
    distance = np.minimum(side, end)
    return np.clip(distance + 0.5, 0, 1), np.maximum(distance, 0)


def _creases(size_px: tuple[int, int], px: int, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """Alpha and height (units) of seeded creases: gently curved lines across the film."""
    w, h = size_px
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    alpha, ridge = np.zeros((h, w)), np.zeros((h, w))
    for _ in range(CREASES):
        cx, cy = rng.uniform(0.1, 0.9) * w, rng.uniform(SEAL * px, h - SEAL * px)
        angle = rng.uniform(-0.6, 0.6) + (np.pi / 2 if rng.random() < 0.25 else 0)
        length = rng.uniform(0.3, 0.8) * w
        bend = rng.uniform(-0.002, 0.002)
        u = (xs - cx) * np.cos(angle) + (ys - cy) * np.sin(angle)
        v = -(xs - cx) * np.sin(angle) + (ys - cy) * np.cos(angle) - bend * u ** 2
        along = np.clip(1 - (2 * np.abs(u) / length) ** 4, 0, 1)
        line = np.exp(-0.5 * (v / (CREASE_WIDTH * px)) ** 2) * along
        alpha = np.maximum(alpha, rng.uniform(*CREASE_ALPHA) * line)
        ridge = np.maximum(ridge, rng.uniform(*RIDGE) * np.exp(-0.5 * (v / (2 * CREASE_WIDTH * px)) ** 2) * along)
    return alpha, ridge


def bag(size_px: tuple[int, int], figure_alpha: np.ndarray, figure_level: np.ndarray, seed: str = "wrap",
        *, px: int = 4, figure_height: float = 30, clearance: float = 2) -> tuple[np.ndarray, np.ndarray]:
    """The bag over a figure: (RGBA uint8 picture, height in [0, 1] of figure_height + clearance).

    `figure_alpha` (0-255 or 0-1) and `figure_level` (uint8 relief, 255 = figure_height)
    are the figure's pictures on the same canvas.
    """
    w, h = size_px
    rng = _rng(seed)
    cover, inward = _outline(size_px, px)
    a = np.asarray(figure_alpha, float)
    a = a / 255 if a.max() > 1 else a
    figure = np.asarray(figure_level, float) / 255 * figure_height * (a > 0.5)

    noise = ndimage.gaussian_filter(rng.standard_normal((h, w)), sigma=12 * px)
    noise = (noise - noise.min()) / max(float(np.ptp(noise)), 1e-9)
    film = FILM[0] + (FILM[1] - FILM[0]) * noise
    edge = EDGE_ALPHA * np.exp(-inward / (EDGE_FADE * px))
    crease_alpha, ridge = _creases(size_px, px, rng)
    alpha = np.maximum.reduce([film, edge, crease_alpha])

    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    in_seal = (ys < SEAL * px) | (ys > h - 1 - SEAL * px)
    crimp = 0.5 + 0.5 * np.cos(2 * np.pi * xs / (CRIMP * px))
    alpha = np.where(in_seal, SEAL_ALPHA * (0.85 + 0.15 * crimp), alpha) * cover

    pillow = PILLOW * np.sqrt(np.clip(inward / (20 * px), 0, 1))
    drape = ndimage.gaussian_filter(ndimage.grey_dilation(figure, size=(5 * px, 5 * px)), sigma=2 * px)
    height = np.maximum.reduce([pillow, drape + clearance, figure + clearance]) + ridge
    height = np.where(in_seal, 0.3 + 0.3 * crimp, height)
    level = np.clip(height / (figure_height + clearance), 0, 1) * (cover > 0)

    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., :3] = COLOUR
    rgba[..., 3] = np.round(np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    return rgba, level
