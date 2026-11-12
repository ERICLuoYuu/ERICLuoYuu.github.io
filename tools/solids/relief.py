"""A height map for a body's heightfield. Returns new arrays."""

from __future__ import annotations

import numpy as np
from scipy import ndimage


def relief(
    alpha: np.ndarray, rgb: np.ndarray, radius_px: float, detail: float = 0.15, smooth_px: float = 0.0, detail_px: float | None = None
) -> np.ndarray:
    """uint8 height: 0 outside the object, 255 at its highest point.

    The silhouette is inflated into a soft dome (the square root of the
    distance from its edge, full height `radius_px` in; beyond the picture's
    edge is outside it, so a shape fitted to its picture's width rises from
    its sides as from its ends), plus the picture's fine detail (luminance
    minus its blur, of sigma `detail_px`, by default `radius_px` / 6) times
    `detail`. A small `radius_px` makes a box: a level top with a rounded
    rim, whose detail keeps its scale when `detail_px` is given. Across a part
    narrower than the dome, its distance from the edge peaks in a ridge down
    the middle, which shades as a hard seam; `smooth_px` (a Gaussian's sigma)
    rounds the dome so such a part is round like an arm.
    """
    a = np.asarray(alpha, float)
    rgb = np.asarray(rgb, float)[..., :3]
    solid = a > 0.5
    inside = ndimage.distance_transform_edt(np.pad(solid, 1))[1:-1, 1:-1]  # padded: the picture's edge counts as outside
    dome = np.sqrt(np.clip(inside / radius_px, 0, 1))
    if smooth_px > 0:
        dome = ndimage.gaussian_filter(dome, smooth_px)
    lum = (rgb @ np.array([0.299, 0.587, 0.114])) / 255
    fine = lum - ndimage.gaussian_filter(lum, sigma=max(1.0, radius_px / 6 if detail_px is None else detail_px))
    height = np.clip(dome + detail * fine, 0, None) * a * solid
    peak = height.max()
    if peak <= 0:
        return np.zeros(a.shape, np.uint8)
    return np.round(height / peak * 255).astype(np.uint8)
