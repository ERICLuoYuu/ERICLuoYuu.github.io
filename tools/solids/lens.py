"""The far lens of a pair of glasses, drawn back into a cut-out.

A face turned away shows its far lens beyond its profile, with the background seen through the glass, so a
cutting model takes the lens for background and leaves it out. With it goes the frame round the nose that
tells the eye the nose stands out in front. Given where the lens is, it is drawn back behind the figure: a
thin ring the colour of the glasses' wire, and the photo's own glare in the glass; whatever lies under the
figure (the box) shows through the rest of the glass, as it would through clear glass.
"""
from __future__ import annotations

import argparse
import math
from dataclasses import dataclass

import numpy as np

WIRE = (120.0, 108.0, 95.0)  # the glasses' wire, as the near lens shows it in the owner's photo
WIRE_WIDTH = 2.5  # px in the cut (about WORK_LENGTH long): some 1.6 px in the picture, a screen pixel on a 1x screen
GLARE = 40.0  # levels brighter than the background round the lens: there, the glass's own glare
GLARE_RAMP = 40.0  # levels over which the glare fades in
GREY = 30.0  # chroma (max − min channel) below which a pixel is the glass's grey, not the background's colour
ROUND = 1.5  # the background is sampled out to this many times the lens's size


@dataclass(frozen=True)
class Lens:
    """A lens as an ellipse in a picture's pixels (y down): its centre, its semi-axes (the first along its
    tilt), and the tilt of that first axis from the picture's x axis, in degrees (towards y)."""

    centre: tuple[float, float]
    axes: tuple[float, float]
    tilt: float

    def moved(self, origin: tuple[float, float], scale: float) -> Lens:
        """The same lens in a picture cropped at `origin` and then resized by `scale`."""
        return Lens(
            centre=((self.centre[0] - origin[0]) * scale, (self.centre[1] - origin[1]) * scale),
            axes=(self.axes[0] * scale, self.axes[1] * scale),
            tilt=self.tilt,
        )


def parse_lens(text: str) -> Lens:
    """`X,Y,A,B,DEG` (centre, semi-axes, tilt) as a Lens; for argparse, so a bad value is a usage error."""
    try:
        x, y, a, b, deg = (float(part) for part in text.split(","))
    except ValueError:
        raise argparse.ArgumentTypeError(f"a lens is X,Y,A,B,DEG (centre, semi-axes, tilt), not {text!r}") from None
    if not all(math.isfinite(v) for v in (x, y, a, b, deg)):
        raise argparse.ArgumentTypeError(f"a lens is five plain numbers, not {text!r}")
    if a <= 0 or b <= 0:
        raise argparse.ArgumentTypeError(f"a lens's semi-axes are more than 0, not {a:g} and {b:g}")
    return Lens(centre=(x, y), axes=(a, b), tilt=deg)


def _ellipse(shape: tuple[int, int], lens: Lens) -> tuple[np.ndarray, np.ndarray]:
    """Per pixel: the ellipse's level ((u/a)² + (v/b)², 1 on the rim) and the distance to its rim in px (near it)."""
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]].astype(float)
    t = np.radians(lens.tilt)
    dx, dy = xx - lens.centre[0], yy - lens.centre[1]
    u, v = dx * np.cos(t) + dy * np.sin(t), -dx * np.sin(t) + dy * np.cos(t)
    a, b = lens.axes
    level = (u / a) ** 2 + (v / b) ** 2
    slope = 2 * np.hypot(u / a**2, v / b**2)
    return level, np.abs(level - 1) / np.maximum(slope, 1e-9)


def drawn_lens(colour: np.ndarray, alpha: np.ndarray, photo: np.ndarray, lens: Lens) -> tuple[np.ndarray, np.ndarray]:
    """The cut-out (colour, alpha in [0, 1]) with `lens` drawn behind it, from `photo` (the same pixels, uncut)."""
    colour, alpha, photo = (np.asarray(v, float) for v in (colour, alpha, photo[..., :3]))
    level, rim = _ellipse(alpha.shape, lens)
    ring = np.clip(WIRE_WIDTH / 2 + 0.5 - rim, 0.0, 1.0)

    lum = photo @ np.array([0.2126, 0.7152, 0.0722])
    chroma = photo.max(axis=-1) - photo.min(axis=-1)
    around = (level > 1) & (level < ROUND**2) & (alpha < 0.5)
    background = np.median(lum[around]) if around.any() else np.inf
    grey = np.clip(1 - (chroma - GREY) / GREY, 0.0, 1.0)
    glare = np.clip((lum - background - GLARE) / GLARE_RAMP, 0.0, 1.0) * grey * (level < 1)

    lens_a = np.maximum(ring, glare)
    lens_rgb = np.where((ring >= glare)[..., None], np.array(WIRE), photo)
    behind = (lens_a * (1 - alpha))[..., None]
    out_a = alpha[..., None] + behind
    out_rgb = (colour * alpha[..., None] + lens_rgb * behind) / np.maximum(out_a, 1e-9)
    return np.where(out_a > 0, out_rgb, colour), out_a[..., 0]
