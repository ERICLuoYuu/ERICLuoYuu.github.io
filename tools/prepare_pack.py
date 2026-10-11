"""Cut the owner's vacuum pack out of its white canvas, keeping the plastic see-through.

    python tools/prepare_pack.py <artwork.png> <output folder> [--film 0.45] [--solid x,y,rx,ry ...]

The artwork shows the pack on a pure-white canvas. Over white, clear film and
pale film look the same, so how see-through the film is becomes a choice:
the things inside (anything coloured or dark, plus --solid ellipses for pale
ones such as a white sandal) stay opaque and the film gets --film opacity.
Whatever is chosen, the cut-out laid back over white reproduces the original;
the tool checks that before it writes anything.

An input that already has transparency (exported without its white
background) is used as it is.

Writes into the output folder:
  vacuum-pack.webp        the pack: transparent around it, see-through film
  vacuum-pack-shade.webp  soft light and shade where the contents bulge the film
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

WHITE = 254  # canvas pixels are at least this bright in every channel
COLOURED = 10  # a pixel belongs to a solid when its channels differ by more than this...
DARK = 170  # ...or its darkest channel is below this
SPECK = 1500  # solid areas smaller than this many pixels are wrinkles in the film, not things
FILM = 0.45  # default opacity of the clear film
EDGE_SOFTNESS = 1.2  # px: blur where film meets a solid
PAD = 4  # px of transparent margin kept around the pack
HEIGHT = 1200  # px: height of the saved images
LIGHT = np.array([-0.35, -0.45, 1.0]) / np.linalg.norm([-0.35, -0.45, 1.0])  # js/cloth/shading.js LIGHT_DIR
SHADE_MAX = 0.18  # strongest opacity of the shade overlay
SHADE_GAIN = 2.2  # overlay opacity per unit of lighting change


class PackError(Exception):
    """A problem with the input that the owner can fix."""


@dataclass(frozen=True)
class Ellipse:
    """A pale solid the colour test misses, in source pixels."""

    x: float
    y: float
    rx: float
    ry: float

    @staticmethod
    def parse(text: str) -> "Ellipse":
        try:
            x, y, rx, ry = (float(v) for v in text.split(","))
        except ValueError as err:
            raise argparse.ArgumentTypeError(f"--solid wants x,y,rx,ry in pixels, not {text!r}") from err
        if rx <= 0 or ry <= 0:
            raise argparse.ArgumentTypeError("--solid radii must be positive")
        return Ellipse(x, y, rx, ry)

    def mask(self, shape: tuple[int, int]) -> np.ndarray:
        yy, xx = np.mgrid[0 : shape[0], 0 : shape[1]]
        return ((xx - self.x) / self.rx) ** 2 + ((yy - self.y) / self.ry) ** 2 <= 1


def canvas_mask(rgb: np.ndarray) -> np.ndarray:
    """Pure-white pixels connected to the image border; holes inside the pack are never canvas."""
    white = rgb.min(axis=2) >= WHITE
    labels, _ = ndi.label(white)
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    canvas = np.isin(labels, border[border > 0])
    if not canvas.any():
        raise PackError("No white canvas touches the image border: is this the artwork on its white background?")
    return ~ndi.binary_fill_holes(~canvas)


def solid_mask(rgb: np.ndarray, hints: list[Ellipse], speck: int) -> np.ndarray:
    """The things inside the pack: coloured or dark areas, cleaned up, plus the hinted ellipses."""
    lo, hi = rgb.min(axis=2), rgb.max(axis=2)
    solid = ((hi - lo) > COLOURED) | (lo < DARK)
    solid = ndi.binary_opening(solid, iterations=1)
    solid = ndi.binary_closing(solid, iterations=4)
    solid = ndi.binary_fill_holes(solid)
    labels, count = ndi.label(solid)
    if count:
        sizes = ndi.sum(solid, labels, range(1, count + 1))
        solid = np.isin(labels, 1 + np.flatnonzero(sizes >= speck))
    for hint in hints:
        solid = solid | hint.mask(solid.shape)
    return solid


def film_alpha(rgb: np.ndarray, canvas: np.ndarray, solid: np.ndarray, film: float) -> np.ndarray:
    """Solids 1, film `film`, softened at the canvas edge, never below what a pixel needs over white."""
    needed = (255 - rgb.min(axis=2)) / 255
    softened = ndi.gaussian_filter(solid.astype(np.float64), EDGE_SOFTNESS)
    edge = ndi.gaussian_filter((~canvas).astype(np.float64), 0.8)
    alpha = (film + (1 - film) * softened) * edge
    return np.where(canvas, 0.0, np.clip(alpha, needed, 1.0))


def unpremultiply(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """The colour that, laid over white at `alpha`, gives `rgb`."""
    a = np.maximum(alpha, 1e-6)[..., None]
    return np.clip((rgb - (1 - a) * 255) / a, 0, 255)


def recomposite_error(rgb: np.ndarray, alpha: np.ndarray, colour: np.ndarray) -> float:
    """Largest difference, in levels, between the original and the cut-out laid over white."""
    a = alpha[..., None]
    over_white = colour * a + 255 * (1 - a)
    inside = alpha > 0
    return float(np.abs(over_white - rgb)[inside].max(initial=0.0))


def cut_out(rgb: np.ndarray, given: np.ndarray | None, film: float, hints: list[Ellipse],
            speck: int = SPECK) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Colour, alpha and solid mask of the pack."""
    if given is not None:
        return np.round(rgb).astype(np.uint8), given, np.zeros(given.shape, bool)
    canvas = canvas_mask(rgb)
    solid = solid_mask(rgb, hints, speck) & ~canvas
    alpha = film_alpha(rgb, canvas, solid, film)
    colour = np.round(unpremultiply(rgb, alpha)).astype(np.uint8)
    error = recomposite_error(rgb, alpha, colour.astype(np.float64))
    if error > 1:
        raise PackError(f"The cut-out does not match the artwork over white (off by {error:.1f} levels).")
    return colour, alpha, solid


def relief_shade(alpha: np.ndarray, solid: np.ndarray) -> np.ndarray:
    """RGBA overlay: white where the bulging film faces the light, black where it faces away."""
    height = alpha.shape[0]
    inside = alpha > 0.01
    bulge = ndi.gaussian_filter(solid.astype(np.float64), 0.015 * height)
    rim = np.sqrt(np.clip(ndi.distance_transform_edt(inside) / (0.08 * height), 0, 1)) * 0.35
    surface = (bulge + rim) * 0.02 * height  # px: the fullest bulge rises about 2 % of the pack's height
    gy, gx = np.gradient(surface)
    normal = np.dstack([-gx, -gy, np.ones_like(surface)])
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    change = normal @ LIGHT - LIGHT[2]  # brighter (+) or darker (−) than flat film
    strength = np.clip(np.abs(change) * SHADE_GAIN, 0, SHADE_MAX) * inside
    shade = np.zeros((*alpha.shape, 4), np.uint8)
    shade[..., :3] = np.where(change[..., None] > 0, 255, 0)
    shade[..., 3] = np.round(strength * 255)
    return shade


def crop_box(alpha: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(alpha > 0.01)
    if xs.size == 0:
        raise PackError("Nothing is left once the canvas is removed.")
    return (max(0, xs.min() - PAD), max(0, ys.min() - PAD),
            min(alpha.shape[1], xs.max() + 1 + PAD), min(alpha.shape[0], ys.max() + 1 + PAD))


def save(rgba: np.ndarray, path: Path, height: int) -> Image.Image:
    """Resize in premultiplied space (no dark fringes) and save as WebP with full-quality alpha."""
    image = Image.fromarray(rgba)  # H × W × 4 uint8: RGBA
    width = max(1, round(image.width * height / image.height))
    resized = image.convert("RGBa").resize((width, height), Image.LANCZOS).convert("RGBA")
    resized.save(path, "WEBP", quality=90, alpha_quality=100, method=6)
    return resized


def load(path: str) -> tuple[np.ndarray, np.ndarray | None]:
    """RGB as floats, plus the alpha if the image already has transparency."""
    rgba = np.asarray(Image.open(path).convert("RGBA"), dtype=np.float64)
    alpha = rgba[..., 3] / 255
    return rgba[..., :3], (alpha if alpha.min() < 1 else None)


def parse(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("artwork")
    parser.add_argument("out")
    parser.add_argument("--film", type=float, default=FILM, help="opacity of the clear film, 0…1")
    parser.add_argument("--solid", type=Ellipse.parse, action="append", default=[], help="x,y,rx,ry of a pale solid")
    parser.add_argument("--speck", type=int, default=SPECK, help="smallest solid, in pixels")
    parser.add_argument("--height", type=int, default=HEIGHT, help="height of the saved images, in pixels")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse(argv)
    try:
        rgb, given = load(args.artwork)
        colour, alpha, solid = cut_out(rgb, given, args.film, args.solid, args.speck)
        x0, y0, x1, y1 = crop_box(alpha)
    except (PackError, OSError) as err:
        print(f"prepare_pack: {err}", file=sys.stderr)
        return 2
    pack = np.dstack([colour, np.round(alpha * 255).astype(np.uint8)])[y0:y1, x0:x1]
    shade = relief_shade(alpha[y0:y1, x0:x1], solid[y0:y1, x0:x1])
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    saved = save(pack, out / "vacuum-pack.webp", args.height)
    save(shade, out / "vacuum-pack-shade.webp", args.height)
    print(f"{out / 'vacuum-pack.webp'}: {saved.width} x {saved.height}, aspect {saved.width / saved.height:.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
