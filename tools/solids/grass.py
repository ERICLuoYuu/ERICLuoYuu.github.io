"""Grass taken off a cut-out's feet.

A photo of someone standing in grass has blades across their feet and tufts round them that the cut keeps as
part of them: thin lines much darker than the skin and sandals behind them, or green, and a ragged, hairy
outline where the tufts were. In the figure's bottom part the blades are painted over in the colour round them
and its outline is rounded off. Not taken for grass: a pink shadow (between toes, round a nail), which is the
skin's own, and a faint bluish line on a white sandal (its seam, its folds). Where grass hid part of a foot,
that part is filled in from what is next to it.

Pixel sizes are in the cut, about WORK_LENGTH (1500 px) long.
"""
from __future__ import annotations

import argparse
import math

import numpy as np
from scipy import ndimage

FINE = 3  # px: lines narrower than about twice this, darker than round them, may be blades
DARKER = 30.0  # levels darker than round it that a blade is at least
PINK = 28.0  # a shadow whose red exceeds its green by this much more than its green exceeds its blue is skin's
BLUISH = 10.0  # levels of blue over red: a white sandal's shade, its seam or a fold ...
SANDAL_LINE = 80.0  # ... unless it is darker than round it by this much: then it is a blade on the sandal
GREEN_HUE = (38.0, 170.0)  # degrees: hues from yellow-green to blue-green (skin keeps below some 30) ...
GREEN_CHROMA = 12.0  # ... at least this colourful (a grey has no hue)
SPREAD = 1  # px: a blade's mask grows this much, to take its soft edge too
STRAND = 5  # px: strands narrower than about twice this, sticking out of the outline, go
ROUND = 4.0  # px: the outline's blur, before it is cut again at its middle (rounds off what tufts left ragged)
EDGE_RAMP = 0.25  # of the blurred alpha: the width of the recut's antialiased edge
FADE = 30  # px: above the cleaned share, the clean-up fades out over this many rows
FILL_SCALES = (1.5, 3.0, 6.0, 12.0, 24.0, 48.0)  # px: paint over from the nearest colours first, then further off
FILL_COVER = 0.05  # share of known pixels in reach at a scale for that scale to give a pixel its colour


def parse_share(text: str) -> float:
    """A share of the figure's length, above 0 and at most 1; for argparse, so a bad value is a usage error."""
    try:
        share = float(text)
    except ValueError:
        share = math.nan
    if not (math.isfinite(share) and 0 < share <= 1):
        raise argparse.ArgumentTypeError(f"the share of the figure to take the grass off is above 0 and at most 1, not {text!r}")
    return share


def _disk(radius: int) -> np.ndarray:
    yy, xx = np.mgrid[-radius:radius + 1, -radius:radius + 1]
    return xx**2 + yy**2 <= radius**2


def _hue(rgb: np.ndarray) -> np.ndarray:
    """Each pixel's hue in degrees (0 for a grey)."""
    r, g, b = (rgb[..., i] for i in range(3))
    top, chroma = rgb.max(axis=-1), np.ptp(rgb, axis=-1)
    with np.errstate(divide="ignore", invalid="ignore"):
        hue = np.where(top == r, (60 * (g - b) / chroma) % 360, np.where(top == g, 60 * (b - r) / chroma + 120, 60 * (r - g) / chroma + 240))
    return np.nan_to_num(hue)


def blades(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Where grass lies over the figure (bool): thin dark lines that are neither skin's pink shadow nor a sandal's
    faint seam, and anything green; grown by SPREAD. Past the figure's middle (alpha 0.5) a pixel's darkness is its
    nearest inside pixel's."""
    r, g, b = (rgb[..., i] for i in range(3))
    light = rgb @ np.array([0.2126, 0.7152, 0.0722])
    _, (iy, ix) = ndimage.distance_transform_edt(alpha <= 0.5, return_indices=True)
    light = light[iy, ix]  # outside, the light of the figure beside it: its own outline is no dark line
    darker = ndimage.grey_closing(light, footprint=_disk(FINE)) - light
    pink = (r - g) > (g - b) + PINK
    seam = (b > r + BLUISH) & (darker < SANDAL_LINE)
    hue = _hue(rgb)
    green = (hue > GREEN_HUE[0]) & (hue < GREEN_HUE[1]) & (np.ptp(rgb, axis=-1) > GREEN_CHROMA)
    return ndimage.binary_dilation(((darker > DARKER) & ~pink & ~seam) | green, _disk(SPREAD))


def painted_over(rgb: np.ndarray, where: np.ndarray, known: np.ndarray) -> np.ndarray:
    """`rgb` with the pixels `where` painted in the colours of the `known` pixels nearest them."""
    out, todo = rgb.copy(), where.copy()
    for sigma in FILL_SCALES:
        weight = ndimage.gaussian_filter(known.astype(float), sigma)
        reach = todo & (weight > FILL_COVER)
        colour = np.stack([ndimage.gaussian_filter(rgb[..., i] * known, sigma) for i in range(3)], axis=-1)
        out[reach] = colour[reach] / weight[reach, None]
        todo &= ~reach
    return out


def rounded(alpha: np.ndarray) -> np.ndarray:
    """The outline with its thin strands cut off and its ragged stretches rounded (a notch fills in a little)."""
    opened = ndimage.grey_opening(alpha, footprint=_disk(STRAND))
    return np.clip((ndimage.gaussian_filter(opened, ROUND) - 0.5) / EDGE_RAMP + 0.5, 0.0, 1.0)


def without_grass(rgba: np.ndarray, share: float) -> np.ndarray:
    """The upright cut (RGBA, alpha 0–255) with the grass taken off the bottom `share` of the figure's length."""
    rgb, alpha = np.asarray(rgba, float)[..., :3], np.asarray(rgba, float)[..., 3] / 255
    rows, _ = np.nonzero(alpha > 0.5)
    start = rows.max() - share * (rows.max() - rows.min())
    weight = np.clip((np.arange(alpha.shape[0]) - start) / FADE, 0.0, 1.0)[:, None]
    out_alpha = alpha + weight * (rounded(alpha) - alpha)
    grass = blades(rgb, alpha) & (weight > 0) & ((alpha > 0) | (out_alpha > 0))
    painted = painted_over(rgb, grass, (alpha > 0.95) & ~grass)
    out_rgb = rgb + weight[..., None] * (painted - rgb)
    return np.concatenate([out_rgb, out_alpha[..., None] * 255], axis=-1)
