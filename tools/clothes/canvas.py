"""A garment drawn flat, in pattern units: its colour and its relief."""

from __future__ import annotations

import random
import zlib
from functools import cached_property
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np
from PIL import Image, ImageChops, ImageDraw
from scipy import ndimage as ndi

from .curves import Point
from .fit import cell_grid, grid_shape

if TYPE_CHECKING:
    from .fabrics import Fabric

SPACING = 10  # parcel units between cloth particles
PX = 4  # texture pixels per parcel unit in the saved images
SS = 2  # supersampling while drawing
S = PX * SS  # drawing pixels per unit
CLOTH = 0.02  # a grid cell is cloth when more than this share of it is opaque...
CORE = 0.3  # ...and core (it hides what lies under it) from this share on
FLAT = 128  # relief level of plain fabric
RELIEF_GAIN = 40  # relief levels per unit of height


class Canvas:
    """Colour (RGBA) and relief (height above plain fabric) of one garment, supersampled.

    Nothing here paints light or shade: the cloth layer lights the relief at
    run time, so every seam and crease is lit by the same lamp as the box.
    """

    def __init__(self, width: int, height: int, seed: str) -> None:
        self.w, self.h = width, height
        self.size = (round(width * S), round(height * S))
        self.rng = random.Random(seed)
        self.np_rng = np.random.default_rng(zlib.crc32(seed.encode()))  # hash() would change per process
        self.mask = Image.new("L", self.size, 0)
        self.colour = Image.new("RGBA", self.size, (0, 0, 0, 0))
        self.relief = np.zeros((self.size[1], self.size[0]), np.float32)

    @property
    def grid_shape(self) -> tuple[int, int]:
        """(rows, columns) of drawing pixels, for numpy."""
        return self.size[1], self.size[0]

    def px(self, points: list[Point]) -> list[Point]:
        return [(x * S, y * S) for x, y in points]

    def region(self, outline: list[Point]) -> Image.Image:
        """A white-on-black mask of the polygon."""
        ink, draw = self.ink()
        draw.polygon(self.px(outline), fill=255)
        return ink

    def shape(self, outline: list[Point]) -> None:
        """Add the polygon to the garment's silhouette."""
        self.mask = ImageChops.lighter(self.mask, self.region(outline))
        self.__dict__.pop("depth", None)

    def punch(self, ink: Image.Image) -> None:
        """Remove cloth (and its colour) wherever `ink` is white."""
        keep = ImageChops.invert(ink)
        self.mask = ImageChops.multiply(self.mask, keep)
        colour = self.colour.copy()
        colour.putalpha(ImageChops.multiply(self.colour.getchannel("A"), keep))
        self.colour = colour
        self.__dict__.pop("depth", None)

    def cut(self, outline: list[Point]) -> None:
        """Remove the polygon from the garment."""
        self.punch(self.region(outline))

    def layer(self) -> tuple[Image.Image, ImageDraw.ImageDraw]:
        """A transparent colour layer to draw on."""
        img = Image.new("RGBA", self.size, (0, 0, 0, 0))
        return img, ImageDraw.Draw(img)

    def ink(self) -> tuple[Image.Image, ImageDraw.ImageDraw]:
        """A black greyscale layer to draw masks or relief on."""
        img = Image.new("L", self.size, 0)
        return img, ImageDraw.Draw(img)

    def paint(self, img: Image.Image, clip: Image.Image | None = None) -> None:
        """Composite a colour layer onto the garment, inside the silhouette (and `clip`)."""
        alpha = ImageChops.multiply(img.getchannel("A"), self.mask)
        if clip is not None:
            alpha = ImageChops.multiply(alpha, clip)
        clipped = img.copy()
        clipped.putalpha(alpha)
        self.colour = Image.alpha_composite(self.colour, clipped)

    def raise_(self, ink: Image.Image, height: float, blur: float = 0.0) -> None:
        """Lift the relief by `height` where `ink` is white, softened by `blur` units."""
        amount = np.asarray(ink, np.float32) / 255
        if blur > 0:
            amount = ndi.gaussian_filter(amount, blur * S)
        self.relief = self.relief + height * amount

    def fill(self, fabric: "Fabric", region: Image.Image | None = None) -> None:
        """Lay a fabric over the garment (or over `region` of it): its colour, and its weave in place of the relief."""
        self.paint(Image.fromarray(fabric.rgb).convert("RGBA"), clip=region)
        weight = np.ones(self.grid_shape, np.float32) if region is None else np.asarray(region, np.float32) / 255
        self.relief = self.relief * (1 - weight) + fabric.relief * weight

    @cached_property
    def depth(self) -> np.ndarray:
        """How far each pixel lies inside the outline, in units (0 outside)."""
        return ndi.distance_transform_edt(np.asarray(self.mask) > 127) / S

    def finish(self, colour_path: Path, relief_path: Path,
               shape: tuple[int, int] | None = None) -> tuple[Image.Image, Image.Image, dict]:
        """Save colour and relief at PX pixels per pattern unit; returns them and the cloth grid of
        `shape` (cols, rows) equal cells — by default cells of SPACING pattern units."""
        final = (round(self.w * PX), round(self.h * PX))
        colour = self.colour.convert("RGBa").resize(final, Image.LANCZOS).convert("RGBA")
        level = np.where(np.asarray(self.mask) > 0, np.clip(FLAT + self.relief * RELIEF_GAIN, 0, 255), FLAT)
        relief = Image.fromarray(level.astype(np.uint8)).resize(final, Image.LANCZOS)
        colour.save(colour_path, "WEBP", quality=88, alpha_quality=100, method=6)
        relief.save(relief_path, "WEBP", quality=85, method=6)
        return colour, relief, coverage_grid(colour, *(shape or grid_shape(self.w, self.h, SPACING)))


def coverage_grid(image: Image.Image, cols: int, rows: int) -> dict:
    """Which of cols × rows equal cells are cloth (any opacity) and which are core (mostly opaque)."""
    alpha = np.asarray(image.getchannel("A"), np.float32) / 255
    return cell_grid(alpha, cols, rows, cloth=CLOTH, core=CORE)
