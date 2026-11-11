"""A height map for a body's heightfield. Returns new arrays."""

from __future__ import annotations

import numpy as np
from scipy import ndimage


def relief(alpha: np.ndarray, rgb: np.ndarray, radius_px: float, detail: float = 0.15, smooth_px: float = 0.0) -> np.ndarray:
    """uint8 height: 0 outside the object, 255 at its highest point.

    The silhouette is inflated into a soft dome (the square root of the
    distance from its edge, full height `radius_px` in), plus the picture's
    fine detail (luminance minus its blur) times `detail`. Across a part
    narrower than the dome, its distance from the edge peaks in a ridge down
    the middle, which shades as a hard seam; `smooth_px` (a Gaussian's sigma)
    rounds the dome so such a part is round like an arm.
    """
    a = np.asarray(alpha, float)
    rgb = np.asarray(rgb, float)[..., :3]
    solid = a > 0.5
    dome = np.sqrt(np.clip(ndimage.distance_transform_edt(solid) / radius_px, 0, 1))
    if smooth_px > 0:
        dome = ndimage.gaussian_filter(dome, smooth_px)
    lum = (rgb @ np.array([0.299, 0.587, 0.114])) / 255
    fine = lum - ndimage.gaussian_filter(lum, sigma=max(1.0, radius_px / 6))
    height = np.clip(dome + detail * fine, 0, None) * a * solid
    peak = height.max()
    if peak <= 0:
        return np.zeros(a.shape, np.uint8)
    return np.round(height / peak * 255).astype(np.uint8)
