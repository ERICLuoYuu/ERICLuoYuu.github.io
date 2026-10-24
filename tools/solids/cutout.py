"""Cut an object out of its photo. Every function returns new arrays."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

BAND = 2  # px: the edge band next to the background, where pixels mix object and background


def border_colour(rgb: np.ndarray) -> np.ndarray:
    """The median colour of the picture's 1-px border: its background."""
    rgb = np.asarray(rgb, float)[..., :3]
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    return np.median(border, axis=0)


def shade_distance(rgb: np.ndarray, background, shades: tuple[float, float] = (1.0, 1.0)) -> np.ndarray:
    """Each pixel's colour distance to the nearest shade `s × background`, s within `shades` (darkest, lightest)."""
    rgb = np.asarray(rgb, float)[..., :3]
    bg = np.asarray(background, float)
    s = np.clip(rgb @ bg / max(bg @ bg, 1e-9), *shades)  # a black background has no shades but itself
    return np.linalg.norm(rgb - s[..., None] * bg, axis=-1)


def key_matte(
    rgb: np.ndarray, background=None, tolerance: float = 28.0, softness: float = 10.0, shades: tuple[float, float] = (1.0, 1.0)
) -> np.ndarray:
    """Alpha in [0, 1]: background-coloured pixels connected to the border are cut away.

    Pixels within `tolerance` of the background colour and connected to the
    picture's edge are background. Within BAND px of them a pixel mixes object
    and background: its alpha ramps with its colour distance, from `tolerance`
    up to the distance of the object's own colour beside it (at least
    `softness` levels), so that unmixing leaves no fringe. Background-coloured
    holes inside the object stay.

    `shades` widens the background colour to its shades from darkest to
    lightest, so that a shadow cast on a grey backdrop, or light falling off
    across it, is cut away with it. The default is the colour alone.
    """
    rgb = np.asarray(rgb, float)[..., :3]
    bg = border_colour(rgb) if background is None else np.asarray(background, float)
    dist = shade_distance(rgb, bg, shades)
    labels, _ = ndimage.label(dist < tolerance)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    outside = np.isin(labels, edge[edge > 0])
    band = ndimage.binary_dilation(outside, iterations=BAND) & ~outside
    inside = ~(outside | band)
    if not inside.any():
        return np.zeros(dist.shape)
    _, (iy, ix) = ndimage.distance_transform_edt(~inside, return_indices=True)
    full = dist[iy, ix]  # the object's own colour beside each pixel
    ramp = np.clip((dist - tolerance) / np.maximum(full - tolerance, softness), 0.0, 1.0)
    return np.where(outside, 0.0, np.where(band, ramp, 1.0))


def without_specks(alpha: np.ndarray, share: float) -> np.ndarray:
    """The matte without its specks: parts smaller than `share` of the largest part are cleared."""
    alpha = np.asarray(alpha, float)
    labels, count = ndimage.label(alpha > 0, structure=np.ones((3, 3)))
    if count <= 1:
        return alpha
    sizes = np.bincount(labels.ravel())[1:]
    keep = np.concatenate([[False], sizes >= share * sizes.max()])
    return np.where(keep[labels], alpha, 0.0)


def rounded_matte(shape: tuple[int, int], radius: float, inset: float, feather: float = 1.0) -> np.ndarray:
    """Alpha in [0, 1] for a rounded rectangle filling a (height, width) picture: a tray photographed edge to edge.

    `radius` and `inset` are shares of the picture's smaller side; the edge is
    antialiased over `feather` px.
    """
    h, w = shape
    side = min(h, w)
    r, margin = radius * side, inset * side
    ys, xs = np.mgrid[0:h, 0:w] + 0.5
    qx = np.abs(xs - w / 2) - (w / 2 - margin - r)
    qy = np.abs(ys - h / 2) - (h / 2 - margin - r)
    outside = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r
    return np.clip(0.5 - outside / feather, 0.0, 1.0)


def u2net_matte(rgb: np.ndarray, model: Path) -> np.ndarray:
    """Alpha in [0, 1] from the u2net salient-object model (onnxruntime), for backgrounds too busy to key."""
    import onnxruntime  # only needed when a picture has no plain background

    rgb = np.asarray(rgb, float)[..., :3]
    h, w = rgb.shape[:2]
    picture = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    small = np.asarray(picture.resize((320, 320), Image.BILINEAR), float) / 255
    mean, std = np.array([0.485, 0.456, 0.406]), np.array([0.229, 0.224, 0.225])
    tensor = ((small - mean) / std).transpose(2, 0, 1)[None].astype(np.float32)
    session = onnxruntime.InferenceSession(str(model), providers=["CPUExecutionProvider"])
    out = session.run(None, {session.get_inputs()[0].name: tensor})[0][0, 0]
    out = (out - out.min()) / max(float(out.max() - out.min()), 1e-6)
    resized = Image.fromarray((out * 255).astype(np.uint8)).resize((w, h), Image.BILINEAR)
    return np.asarray(resized, float) / 255


def held_by_shape(alpha: np.ndarray, shape: np.ndarray, inset: int, whole: float = 0.5, faint: float = 0.1) -> np.ndarray:
    """A key's matte held to the object's shape, as a salient-object model outlines it.

    The model knows what the object is but draws its edge soft; the key draws
    a crisp edge but cannot tell a grey part of the object from a grey
    backdrop, nor a dark shadow from a dark part. So: whole wherever the shape
    is at least `whole` and more than `inset` px from its edge, empty wherever
    it is fainter than `faint`, and the key's own edge in between.
    """
    core = ndimage.binary_erosion(np.asarray(shape) >= whole, iterations=inset)
    return np.where(core, 1.0, np.where(np.asarray(shape) < faint, 0.0, np.asarray(alpha, float)))


def background_beside(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Each pixel's own background: the colour of the nearest pixel cut away entirely (alpha 0).

    An edge against a cast shadow then unmixes against the shadow, not the
    clear backdrop. With nothing cut away, the border's colour.
    """
    rgb = np.asarray(rgb, float)[..., :3]
    away = np.asarray(alpha) <= 0
    if not away.any():
        return np.broadcast_to(border_colour(rgb), rgb.shape)
    _, (iy, ix) = ndimage.distance_transform_edt(~away, return_indices=True)
    return rgb[iy, ix]


def unmix(rgb: np.ndarray, alpha: np.ndarray, background) -> np.ndarray:
    """The object's own colour where it was mixed with the background: (rgb - (1 - a) bg) / a, clipped."""
    rgb = np.asarray(rgb, float)[..., :3]
    a = np.asarray(alpha, float)[..., None]
    bg = np.asarray(background, float)
    own = (rgb - (1 - a) * bg) / np.maximum(a, 1e-3)
    return np.where(a > 0, np.clip(own, 0, 255), rgb)
