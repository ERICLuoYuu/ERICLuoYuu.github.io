"""Finishing touches for a cut-out picture. Every function returns new arrays."""

from __future__ import annotations

import numpy as np
from PIL import Image
from scipy import ndimage

LIGHT = (1.0, 0.975, 0.93)  # the box's warm interior light
CONTRAST = 0.94
RING = 6  # px around a mark, sampled for the colour that paints it over


def match_light(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Tint towards the box's light and soften the contrast a little about the object's mean."""
    rgb = np.asarray(rgb, float)[..., :3] * np.array(LIGHT)
    solid = np.asarray(alpha) > 0.5
    mean = rgb[solid].mean(axis=0) if solid.any() else rgb.reshape(-1, 3).mean(axis=0)
    return np.clip(mean + (rgb - mean) * CONTRAST, 0, 255)


def add_grain(rgb: np.ndarray, alpha: np.ndarray, grain: np.ndarray, strength: float = 6.0) -> np.ndarray:
    """The scene's grain (an RGBA texture, tiled) laid over the opaque part.

    scene.css lays the same texture over the box at half opacity; `strength`
    6 matches that, and the cover scales with it.
    """
    rgb = np.asarray(rgb, float)[..., :3]
    g = np.asarray(grain, float)
    h, w = rgb.shape[:2]
    tiled = np.tile(g, (h // g.shape[0] + 1, w // g.shape[1] + 1, 1))[:h, :w]
    cover = (tiled[..., 3] / 255 * 0.5 * strength / 6 * np.asarray(alpha, float))[..., None]
    return np.clip(rgb * (1 - cover) + tiled[..., :3] * cover, 0, 255)


def _resize(channel: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    return np.asarray(Image.fromarray(channel.astype(np.float32), mode="F").resize(size, Image.LANCZOS))


def fit_canvas(rgba: np.ndarray, size_px: tuple[int, int]) -> np.ndarray:
    """Scaled to fit `size_px` (width, height) without distortion, centred on a transparent canvas of that size."""
    rgba = np.asarray(rgba, np.uint8)
    h, w = rgba.shape[:2]
    scale = min(size_px[0] / w, size_px[1] / h)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    a = rgba[..., 3].astype(float) / 255
    # filter premultiplied colour, so transparent pixels leave no dark fringe
    channels = [_resize(rgba[..., c] * a, (nw, nh)) for c in range(3)] + [_resize(a * 255, (nw, nh))]
    scaled = np.clip(np.stack(channels, axis=-1), 0, 255)
    alpha = scaled[..., 3:4] / 255
    rgb = np.where(alpha > 0, scaled[..., :3] / np.maximum(alpha, 1e-6), 0)
    out = np.zeros((size_px[1], size_px[0], 4), np.uint8)
    x0, y0 = (size_px[0] - nw) // 2, (size_px[1] - nh) // 2
    out[y0:y0 + nh, x0:x0 + nw] = np.round(np.clip(np.concatenate([rgb, scaled[..., 3:4]], axis=-1), 0, 255))
    return out


def _ring_fill(out: np.ndarray, box: np.ndarray, ring: int) -> tuple[np.ndarray, np.ndarray]:
    """A smooth fill for `box` from the `ring`-px band around it, and that band's typical spread.

    Band pixels far from the band's median colour (a drawing reaching the
    edge, a fold's dark line) are left out. The rest are spread inwards by
    normalised convolution, so shading that runs across the box carries on
    through it instead of stopping at a flat patch.
    """
    band = ndimage.binary_dilation(box, iterations=ring) & ~box
    median = np.median(out[band], axis=0)
    deviation = np.abs(out - median).max(axis=-1)
    spread = 1.4826 * np.median(np.abs(out[band] - median), axis=0)  # robust: outliers do not inflate it
    known = band & (deviation <= max(3 * float(spread.max()), 12.0))
    ys, xs = np.nonzero(box)
    sigma = max(np.ptp(ys) + 1, np.ptp(xs) + 1) / 3
    weight = ndimage.gaussian_filter(known.astype(float), sigma)
    smooth = np.stack([ndimage.gaussian_filter(out[..., c] * known, sigma) for c in range(3)], axis=-1)
    fill = np.where(weight[..., None] > 1e-4, smooth / np.maximum(weight, 1e-4)[..., None], median)
    return fill, spread


def remove_marks(rgb: np.ndarray, boxes, feather: int = 3, seed: int = 7, ring: int = RING) -> np.ndarray:
    """Paint each (x0, y0, x1, y1) box over with the colour around it.

    The fill comes from a `ring`-px band around the box (see _ring_fill), with
    noise matched to that band's spread so it does not look flat, blended in
    over `feather` px outside the box.
    """
    out = np.asarray(rgb, float)[..., :3].copy()
    h, w = out.shape[:2]
    rng = np.random.default_rng(seed)
    for x0, y0, x1, y1 in boxes:
        box = np.zeros((h, w), bool)
        box[y0:y1, x0:x1] = True
        fill, spread = _ring_fill(out, box, ring)
        fill = fill + rng.normal(0, 1, (h, w, 3)) * spread
        weight = np.clip(1 - ndimage.distance_transform_edt(~box) / max(feather, 1), 0, 1)[..., None]
        out = out * (1 - weight) + np.clip(fill, 0, 255) * weight
    return out
