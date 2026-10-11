"""Woven and knitted grounds: colour plus relief, never light or shade."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import ImageColor
from scipy import ndimage as ndi

from .canvas import S

Colour = str | tuple[int, ...]


@dataclass(frozen=True)
class Fabric:
    rgb: np.ndarray  # rows × columns × 3, uint8
    relief: np.ndarray  # rows × columns, float32: height above the plain surface


def rgb_of(colour: Colour) -> np.ndarray:
    values = ImageColor.getrgb(colour) if isinstance(colour, str) else colour
    return np.array(values[:3], np.float32)


def fibres(rng: np.random.Generator, shape: tuple[int, int], along: float, across: float) -> np.ndarray:
    """Unit-variance noise smeared into fibres `along` units tall and `across` units wide."""
    noise = ndi.gaussian_filter(rng.standard_normal(shape).astype(np.float32), (along * S, across * S))
    return (noise - noise.mean()) / max(float(noise.std()), 1e-6)


def coords(shape: tuple[int, int]) -> tuple[np.ndarray, np.ndarray]:
    """x and y of every drawing pixel, in units."""
    yy, xx = np.mgrid[0 : shape[0], 0 : shape[1]].astype(np.float32) / S
    return xx, yy


def tinted(colour: Colour, variation: np.ndarray) -> np.ndarray:
    """The colour, lightened or darkened per pixel by `variation` (a fraction)."""
    return np.clip(rgb_of(colour)[None, None, :] * (1 + variation[..., None]), 0, 255).astype(np.uint8)


def jersey(shape, rng, colour) -> Fabric:
    """Knitted cotton: fine vertical wales."""
    wales, tone = fibres(rng, shape, 1.6, 0.18), fibres(rng, shape, 0.8, 0.8)
    return Fabric(tinted(colour, 0.012 * tone + 0.008 * wales), (0.25 * wales).astype(np.float32))


def rib(shape, rng, colour, pitch: float = 1.5) -> Fabric:
    """Rib knit: raised vertical ribs every `pitch` units."""
    xx, _ = coords(shape)
    ribs = np.cos(2 * np.pi * xx / pitch)
    wales = fibres(rng, shape, 1.6, 0.2)
    return Fabric(tinted(colour, 0.025 * ribs + 0.01 * wales), (0.8 * ribs + 0.12 * wales).astype(np.float32))


def linen(shape, rng, colour) -> Fabric:
    """Plain-woven linen: uneven threads both ways and the odd thick slub."""
    weave = fibres(rng, shape, 0.12, 2.5) + fibres(rng, shape, 2.5, 0.12)
    slubs = np.clip(fibres(rng, shape, 0.25, 6.0) - 1.6, 0, None)
    return Fabric(tinted(colour, 0.018 * weave + 0.05 * slubs), (0.16 * weave + 0.25 * slubs).astype(np.float32))


def cotton(shape, rng, colour) -> Fabric:
    """Fine cotton lawn: an even, faint weave."""
    weave, tone = fibres(rng, shape, 0.15, 0.15), fibres(rng, shape, 1.0, 1.0)
    return Fabric(tinted(colour, 0.01 * tone + 0.01 * weave), (0.1 * weave).astype(np.float32))


def twill(shape, rng, colour, pitch: float = 1.3) -> Fabric:
    """Twill: fine diagonal ribs."""
    xx, yy = coords(shape)
    ribs = np.sin(2 * np.pi * (xx + yy) / pitch)
    tone = fibres(rng, shape, 0.6, 0.6)
    return Fabric(tinted(colour, 0.012 * ribs + 0.012 * tone), (0.3 * ribs + 0.08 * tone).astype(np.float32))


def satin(shape, rng, colour) -> Fabric:
    """Satin: smooth, with long soft streaks along the warp."""
    streaks = fibres(rng, shape, 5.0, 0.35)
    return Fabric(tinted(colour, 0.022 * streaks), (0.04 * streaks).astype(np.float32))


def woven(ground: Fabric, figure: np.ndarray, colour: Colour, height: float = 0.7) -> Fabric:
    """A figure woven into the ground (brocade): its colour where `figure` (0…1) is set, its floats raised."""
    f = figure[..., None]
    rgb = ground.rgb.astype(np.float32) * (1 - f) + rgb_of(colour)[None, None, :] * f
    relief = ground.relief * (1 - figure) + height * figure
    return Fabric(np.clip(rgb, 0, 255).astype(np.uint8), relief.astype(np.float32))


def stripes(ground: Fabric, colour: Colour, pitch: float, band: float, start: float = 0.0,
            angle: float = 0.0, origin: tuple[float, float] = (0.0, 0.0)) -> Fabric:
    """Knitted-in stripes `band` wide every `pitch` units, counted from `start` along the
    direction `angle` degrees from straight down (turned toward +x), measured from `origin`."""
    xx, yy = coords(ground.rgb.shape[:2])
    a = np.radians(angle)
    t = (xx - origin[0]) * np.sin(a) + (yy - origin[1]) * np.cos(a) - start
    phase = np.mod(t, pitch)
    soft = 1.0 / S  # one drawing pixel, in units: the stripe's antialiased edge
    inside = np.clip((band - phase) / soft + 0.5, 0, 1) * np.clip(phase / soft + 0.5, 0, 1) * (t >= 0)
    knit = ground.rgb.astype(np.float32) / np.maximum(ground.rgb.astype(np.float32).mean(axis=(0, 1)), 1)
    stripe = knit * rgb_of(colour)[None, None, :]  # the stripe keeps the knit's texture
    rgb = ground.rgb * (1 - inside[..., None]) + stripe * inside[..., None]
    return Fabric(np.clip(rgb, 0, 255).astype(np.uint8), ground.relief)


def blend(a: Fabric, b: Fabric, mask: np.ndarray) -> Fabric:
    """`b` where `mask` (0…1) is set, `a` elsewhere."""
    m = mask[..., None]
    rgb = a.rgb.astype(np.float32) * (1 - m) + b.rgb.astype(np.float32) * m
    return Fabric(np.clip(rgb, 0, 255).astype(np.uint8), (a.relief * (1 - mask) + b.relief * mask).astype(np.float32))
