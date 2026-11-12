"""The owner's figurine in its clear bag, from the picture they chose.

    python tools/prepare_figurine.py <chosen.png> assets/figurine [--turn auto|0|90|-90|180] [--u2net PATH]
        [--lens X,Y,A,B,DEG] [--grass SHARE]

Cut the figure out of its background: a colour key on a plain backdrop (held to the
u2net model's outline when it is given); on a busy one, such as a photo of the owner on
grass, the model's outline pulled onto the photo's own edges, which take the subject's
own colour. Phone photos are turned the right way up first. Stand its long side upright, size it to
the figure the clothes were fitted to (FIGURE_LENGTH from head to sole) or
smaller if the bag's margins need it and centre it on the figurine's footprint
at PX pixels a unit, in the photo's own colours: its sunlight and shadows are
what make it look solid, its fine light and dark sharpened for its small size
on screen. Raise it into a slab with a level top and a rounded
edge, then wrap it: a crinkled clear bag with crimped seals lying over it, its
creases kept off the head so that no glint crosses the face.

Writes figurine.webp, figurine-relief.webp (the WebGL heightfield's height,
255 = HEIGHT), wrap.webp and wrap-relief.webp (255 = HEIGHT + CLEARANCE),
each SIZE × PX pixels. The chosen picture stays outside the repo.
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import NamedTuple

import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))  # run as a script: make `solids` importable

from solids.cutout import (  # noqa: E402
    background_beside,
    foreground_beside,
    guided_filter,
    held_by_shape,
    key_matte,
    u2net_matte,
    unmix,
    without_specks,
)
from solids.finish import fit_canvas, sharpen  # noqa: E402
from solids.grass import parse_share, without_grass  # noqa: E402
from solids.lens import Lens, drawn_lens, parse_lens  # noqa: E402
from solids.relief import relief  # noqa: E402
from solids.wrap import bag  # noqa: E402

SIZE = (125, 290)  # units: FIGURINE.footprint in js/scene/geometry.js
PX = 4  # pixels a parcel unit
HEIGHT = 15  # units: FIGURINE.height (thicker, the slab's side shows, stretched, and its shadow is heavy)
CLEARANCE = 2  # units the bag lies over the figure
FIGURE_LENGTH = 248  # units from head to sole, as clothes/fit.py measures the figure
MARGIN = (8, 16)  # units between the figure and the bag's sides, and its ends (with the seals)
SHARPEN = (3.0, 0.6)  # px and amount: the face is small on screen (some 0.44 of the picture's size on a 1x screen), so
# its fine light and dark, the shadows that model the features, is steepened at about a screen pixel's scale
HEAD = 0.2  # share of the upright figure's length, from its top, that is its head
HEAD_ROOM = 4  # units: the bag's creases keep this far off the head, and fade back in over as far again
RELIEF_RADIUS = 4  # units: the edge rounds up to the level top this far in (a deeper dome sinks a face near the outline)
RELIEF_DETAIL = 0.0  # a smooth top: a photo's own texture (skin, grass blades) would shade as grooves
RELIEF_SMOOTH = 1.5  # units: the edge's rounding softened, so it is no ridge or crease
PLAIN = 12.0  # a border whose colour varies more than this (std) is not plain: use u2net
SHADES = (0.3, 1.1)  # the backdrop's grey from its contact shadows (this share of it) to where its light is brightest
TOLERANCE = 14.0  # colour distance from those shades still counted as backdrop (a generated backdrop keeps within ~7)
SPECK = 0.002  # parts of the matte smaller than this share of the figure are noise in the backdrop
INSET = 4  # px: within this of u2net's soft outline, the key draws the edge
EDGE = 0.02  # alpha below this is empty when cropping
LOOK_LENGTH = 1024  # px: the long side of the copy the model first finds the subject in
CROP_MARGIN = 0.05  # of the subject's long side, kept around it when cropping a busy photo to them
WORK_LENGTH = 1500  # px: a busy photo is cut with its subject at most this long (the canvas wants FIGURE_LENGTH × PX)
GUIDE_RADIUS = 10  # px: the window in which the model's outline is fitted to the photo's colours
GUIDE_EPS = 1e-3  # how far the fit may stray from the outline: larger is smoother
GUIDE_SUBSAMPLE = 2  # the fit is made on every second pixel: a quarter of the memory, the same edge
STRETCH = (0.25, 0.75)  # the fitted alpha: empty below the first, whole above the second, a ramp between (a crisp edge that still fades, without a rim)
TURNS = {"0": 0, "90": 1, "-90": -1, "180": 2}  # quarter turns counter-clockwise (np.rot90)


def load(source: Path) -> Image.Image:
    """The picture in RGB, the right way up: phones store a photo turned, with a flag saying how to view it."""
    return ImageOps.exif_transpose(Image.open(source)).convert("RGB")


def is_plain(rgb: np.ndarray) -> bool:
    """Whether the picture's border is a plain backdrop: its colour varies by at most PLAIN (std)."""
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]).astype(float)
    return bool(border.std(axis=0).max() <= PLAIN)


def plain_matte(rgb: np.ndarray, u2net: Path | None) -> np.ndarray:
    """Alpha in [0, 1] on a plain backdrop: a colour key that takes the backdrop's shadows with it, held
    to u2net's outline of the figure when the model is given (so grey sandals and clear glasses stay)."""
    key = without_specks(key_matte(rgb, tolerance=TOLERANCE, shades=SHADES), SPECK)
    return key if u2net is None else held_by_shape(key, u2net_matte(rgb, u2net), INSET)


class Crop(NamedTuple):
    """A photo cropped at `origin` (px) and then resized by `scale`."""

    picture: Image.Image
    origin: tuple[float, float]
    scale: float


def subject_crop(picture: Image.Image, u2net: Path) -> Crop:
    """The busy photo cropped to its subject, as the model finds them, with their long side at most WORK_LENGTH."""
    small = picture.copy()
    small.thumbnail((LOOK_LENGTH, LOOK_LENGTH))
    ys, xs = np.nonzero(u2net_matte(np.asarray(small, float), u2net) > 0.5)
    if ys.size == 0:
        raise SystemExit("the model found no one in the picture")
    k = picture.width / small.width
    length = (max(ys.max() - ys.min(), xs.max() - xs.min()) + 1) * k
    m = CROP_MARGIN * length
    box = (max(0, xs.min() * k - m), max(0, ys.min() * k - m), min(picture.width, (xs.max() + 1) * k + m), min(picture.height, (ys.max() + 1) * k + m))
    origin = (round(box[0]), round(box[1]))
    crop = picture.crop(tuple(round(v) for v in box))
    scale = WORK_LENGTH / length
    if scale >= 1:
        return Crop(crop, origin, 1.0)
    return Crop(crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.LANCZOS), origin, scale)


def busy_matte(rgb: np.ndarray, u2net: Path) -> np.ndarray:
    """Alpha in [0, 1] on a busy background: the model's outline, cut hard at its middle, then softened
    where the photo's own colours change (a guided filter), so its edge follows the photo's, and
    stretched so the edge is crisp and its faint tail (the background's texture) fades to nothing. The
    subject's solid parts are kept with all of the edge joined to them (cut short at a fixed distance, it
    would end in a faint rim); anything else the model outlined goes."""
    outline = (u2net_matte(rgb, u2net) >= 0.5).astype(float)
    fitted = guided_filter(rgb / 255, outline, GUIDE_RADIUS, GUIDE_EPS, GUIDE_SUBSAMPLE)
    alpha = np.clip((fitted - STRETCH[0]) / (STRETCH[1] - STRETCH[0]), 0.0, 1.0)
    solid = without_specks((alpha > 0.5).astype(float), SPECK) > 0
    parts, _ = ndimage.label(alpha > 0, structure=np.ones((3, 3)))
    own = np.unique(parts[solid])
    return np.where(np.isin(parts, own[own > 0]), alpha, 0.0)


def turned(rgba: np.ndarray, turn: str) -> np.ndarray:
    """Stood upright: `auto` turns a wide figure a quarter turn; otherwise the given turn."""
    quarters = (1 if rgba.shape[1] > rgba.shape[0] else 0) if turn == "auto" else TURNS[turn]
    return np.rot90(rgba, quarters)


def cut_out(source: Path, u2net: Path | None, turn: str, lenses: Sequence[Lens] = (), grass: float = 0.0) -> np.ndarray:
    """The figure, cut out, its edge cleaned, cropped and stood upright: RGBA float. `lenses` (in the photo's
    pixels, the right way up) are the far lenses of glasses the cut left out, drawn back behind the figure; with
    `grass` (a share of its length), the grass is taken off that much of the figure from its soles up."""
    picture = load(source)
    pixels = np.asarray(picture)
    if is_plain(pixels):
        rgb = pixels.astype(float)
        alpha = plain_matte(rgb, u2net)
        colour = unmix(rgb, alpha, background_beside(rgb, alpha))
        origin, scale = (0.0, 0.0), 1.0
    elif u2net is None:
        raise SystemExit("the picture's background is not plain: pass --u2net PATH to the u2net model")
    else:
        crop = subject_crop(picture, u2net)
        rgb, origin, scale = np.asarray(crop.picture, float), crop.origin, crop.scale
        alpha = busy_matte(rgb, u2net)
        colour = foreground_beside(rgb, alpha)
    for lens in lenses:
        colour, alpha = drawn_lens(colour, alpha, rgb, lens.moved(origin, scale))
    ys, xs = np.nonzero(alpha > EDGE)
    cut = np.concatenate([colour, alpha[..., None] * 255], axis=-1)[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    upright = turned(cut, turn)
    return without_grass(upright, grass) if grass else upright


def place(cut: np.ndarray) -> np.ndarray:
    """The figure sized (FIGURE_LENGTH long, or less to keep its margins) and centred on the footprint."""
    w, h = SIZE[0] * PX, SIZE[1] * PX
    room = (w - 2 * MARGIN[0] * PX, min(FIGURE_LENGTH * PX, h - 2 * MARGIN[1] * PX))
    fitted = fit_canvas(np.round(np.clip(cut, 0, 255)).astype(np.uint8), room)
    canvas = np.zeros((h, w, 4), np.uint8)
    x0, y0 = (w - room[0]) // 2, (h - room[1]) // 2
    canvas[y0:y0 + room[1], x0:x0 + room[0]] = fitted
    return canvas


def figure_level(alpha: np.ndarray, rgb: np.ndarray) -> np.ndarray:
    """The figure's height map (uint8, 255 = HEIGHT): a slab with a level top, its edge rounded over RELIEF_RADIUS."""
    return relief(alpha, rgb, radius_px=RELIEF_RADIUS * PX, detail=RELIEF_DETAIL, smooth_px=RELIEF_SMOOTH * PX)


def sharpened(figure: np.ndarray) -> np.ndarray:
    """The figure's picture as saved (RGBA uint8): its fine light and dark steepened by SHARPEN, its outline as it was."""
    rgb = sharpen(figure[..., :3], figure[..., 3] / 255, radius_px=SHARPEN[0], amount=SHARPEN[1])
    return np.concatenate([np.round(rgb).astype(np.uint8), figure[..., 3:4]], axis=-1)


def head_room(alpha: np.ndarray) -> np.ndarray:
    """Where the bag's creases keep off (0-1): the figure's head, the top HEAD of its length, and HEAD_ROOM
    around it, fading out over HEAD_ROOM more."""
    solid = np.asarray(alpha) > 0.5
    ys, _ = np.nonzero(solid)
    head = solid & (np.arange(solid.shape[0])[:, None] <= ys.min() + HEAD * (ys.max() - ys.min()))
    room = HEAD_ROOM * PX
    return np.clip(2 - ndimage.distance_transform_edt(~head) / room, 0, 1)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("chosen", type=Path, help="the owner's photo, or the figurine picture they chose")
    parser.add_argument("out", type=Path, help="where the four pictures go (assets/figurine)")
    parser.add_argument("--turn", choices=["auto", *TURNS], default="auto", help="stand the figure upright (default: auto)")
    parser.add_argument("--u2net", type=Path, help="the u2net .onnx model: needed for a photo without a plain background")
    parser.add_argument("--lens", type=parse_lens, action="append", default=[], metavar="X,Y,A,B,DEG",
                        help="a far lens of glasses the cut leaves out (it shows the background through it), to draw back: "
                             "its centre and semi-axes in the photo's pixels, the right way up, and its long axis's tilt in degrees")
    parser.add_argument("--grass", type=parse_share, default=0.0, metavar="SHARE",
                        help="take the grass off the figure's feet (blades across them, tufts round them) over this share of "
                             "its length from the soles up, above 0 and at most 1 (default: none)")
    args = parser.parse_args(argv)
    if not args.chosen.exists():
        parser.error(f"no such picture: {args.chosen}")
    args.out.mkdir(parents=True, exist_ok=True)

    figure = place(cut_out(args.chosen, args.u2net, args.turn, args.lens, args.grass))
    level = figure_level(figure[..., 3] / 255, figure[..., :3])
    film, film_level = bag(figure.shape[1::-1], figure[..., 3], level, px=PX, figure_height=HEIGHT, clearance=CLEARANCE,
                           keep_off=head_room(figure[..., 3] / 255))

    Image.fromarray(sharpened(figure), "RGBA").save(args.out / "figurine.webp", "WEBP", quality=88, alpha_quality=100, method=6)
    Image.fromarray(level, "L").save(args.out / "figurine-relief.webp", "WEBP", quality=90, method=6)
    Image.fromarray(film, "RGBA").save(args.out / "wrap.webp", "WEBP", quality=88, alpha_quality=100, method=6)
    Image.fromarray(np.round(film_level * 255).astype(np.uint8), "L").save(args.out / "wrap-relief.webp", "WEBP", quality=90, method=6)
    for name in ("figurine", "figurine-relief", "wrap", "wrap-relief"):
        print(f"{name}.webp {(args.out / f'{name}.webp').stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
