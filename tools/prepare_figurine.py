"""The owner's figurine in its clear bag, from the picture they chose.

    python tools/prepare_figurine.py <chosen.png> assets/figurine [--turn auto|0|90|-90|180] [--u2net PATH]

Cut the figure out of its plain background (a colour key; the u2net model
when the background is not plain), stand its long side upright, size it to
the figure the clothes were fitted to (FIGURE_LENGTH from head to sole) or
smaller if the bag's margins need it, match it to the box's light, add the
scene's grain and centre it on the figurine's footprint at PX pixels a unit.
Then wrap it: a crinkled clear bag with crimped seals lying over it.

Writes figurine.webp, figurine-relief.webp (the WebGL heightfield's height,
255 = HEIGHT), wrap.webp and wrap-relief.webp (255 = HEIGHT + CLEARANCE),
each SIZE × PX pixels. The chosen picture stays outside the repo.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))  # run as a script: make `solids` importable

from solids.cutout import border_colour, key_matte, u2net_matte, unmix  # noqa: E402
from solids.finish import add_grain, fit_canvas, match_light  # noqa: E402
from solids.relief import relief  # noqa: E402
from solids.wrap import bag  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
GRAIN = ROOT / "assets" / "textures" / "grain.png"
SIZE = (125, 290)  # units: FIGURINE.footprint in js/scene/geometry.js
PX = 4  # pixels a parcel unit
HEIGHT = 30  # units: FIGURINE.height
CLEARANCE = 2  # units the bag lies over the figure
FIGURE_LENGTH = 248  # units from head to sole, as clothes/fit.py measures the figure
MARGIN = (8, 16)  # units between the figure and the bag's sides, and its ends (with the seals)
RELIEF_RADIUS = 12  # units: the figure's dome reaches full height this far in
RELIEF_DETAIL = 0.15
PLAIN = 12.0  # a border whose colour varies more than this (std) is not plain: use u2net
EDGE = 0.02  # alpha below this is empty when cropping
TURNS = {"0": 0, "90": 1, "-90": -1, "180": 2}  # quarter turns counter-clockwise (np.rot90)


def matte(rgb: np.ndarray, u2net: Path | None) -> np.ndarray:
    """Alpha in [0, 1]: a colour key on a plain border, else the u2net model."""
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    if border.std(axis=0).max() <= PLAIN:
        return key_matte(rgb)
    if u2net is None:
        raise SystemExit("the picture's background is not plain: pass --u2net PATH to the u2net model")
    return u2net_matte(rgb, u2net)


def turned(rgba: np.ndarray, turn: str) -> np.ndarray:
    """Stood upright: `auto` turns a wide figure a quarter turn; otherwise the given turn."""
    quarters = (1 if rgba.shape[1] > rgba.shape[0] else 0) if turn == "auto" else TURNS[turn]
    return np.rot90(rgba, quarters)


def cut_out(source: Path, u2net: Path | None, turn: str) -> np.ndarray:
    """The figure, cut out, unmixed, cropped and stood upright: RGBA float."""
    rgb = np.asarray(Image.open(source).convert("RGB"), float)
    alpha = matte(rgb, u2net)
    colour = unmix(rgb, alpha, border_colour(rgb))
    ys, xs = np.nonzero(alpha > EDGE)
    cut = np.concatenate([colour, alpha[..., None] * 255], axis=-1)[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return turned(cut, turn)


def place(cut: np.ndarray) -> np.ndarray:
    """The figure sized (FIGURE_LENGTH long, or less to keep its margins) and centred on the footprint."""
    w, h = SIZE[0] * PX, SIZE[1] * PX
    room = (w - 2 * MARGIN[0] * PX, min(FIGURE_LENGTH * PX, h - 2 * MARGIN[1] * PX))
    fitted = fit_canvas(np.round(np.clip(cut, 0, 255)).astype(np.uint8), room)
    canvas = np.zeros((h, w, 4), np.uint8)
    x0, y0 = (w - room[0]) // 2, (h - room[1]) // 2
    canvas[y0:y0 + room[1], x0:x0 + room[0]] = fitted
    return canvas


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("chosen", type=Path, help="the figurine picture the owner chose")
    parser.add_argument("out", type=Path, help="where the four pictures go (assets/figurine)")
    parser.add_argument("--turn", choices=["auto", *TURNS], default="auto", help="stand the figure upright (default: auto)")
    parser.add_argument("--u2net", type=Path, help="the u2net .onnx model, for a picture without a plain background")
    args = parser.parse_args(argv)
    if not args.chosen.exists():
        parser.error(f"no such picture: {args.chosen}")
    args.out.mkdir(parents=True, exist_ok=True)

    figure = place(cut_out(args.chosen, args.u2net, args.turn))
    a = figure[..., 3] / 255
    grain = np.asarray(Image.open(GRAIN).convert("RGBA"), float)
    finished = add_grain(match_light(figure[..., :3], a), a, grain)
    level = relief(a, finished, radius_px=RELIEF_RADIUS * PX, detail=RELIEF_DETAIL)
    film, film_level = bag(figure.shape[1::-1], figure[..., 3], level, px=PX, figure_height=HEIGHT, clearance=CLEARANCE)

    picture = np.concatenate([finished, figure[..., 3:4]], axis=-1)
    Image.fromarray(np.round(picture).astype(np.uint8), "RGBA").save(args.out / "figurine.webp", "WEBP", quality=88, alpha_quality=100, method=6)
    Image.fromarray(level, "L").save(args.out / "figurine-relief.webp", "WEBP", quality=90, method=6)
    Image.fromarray(film, "RGBA").save(args.out / "wrap.webp", "WEBP", quality=88, alpha_quality=100, method=6)
    Image.fromarray(np.round(film_level * 255).astype(np.uint8), "L").save(args.out / "wrap-relief.webp", "WEBP", quality=90, method=6)
    for name in ("figurine", "figurine-relief", "wrap", "wrap-relief"):
        print(f"{name}.webp {(args.out / f'{name}.webp').stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
