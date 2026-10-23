"""The food in the box: cut out of the owner's photos, without brands.

    python tools/prepare_food.py <folder with the photos> assets/food

For each photo in ITEMS: paint the brand marks over (the fries' "M" in the
packet's own red, the strawberry label blank paper, the print on the
chopsticks' wrapper), cut the food out of its plain background (a colour key,
the alpha it already has, or the tray's rounded outline where the sushi tray
fills its photo edge to edge), match it
to the box's light, add the scene's grain and fit it to its footprint at PX
pixels a unit. Writes <id>.webp, <id>-relief.webp (a gentle dome of its shape
for the WebGL heightfield) and food.json (id, label, size in units, peak
height, the pictures, and the cleaned boxes in output pixels).

The photos stay outside the repo; only the finished pictures enter it.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import NamedTuple

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))  # run as a script: make `solids` importable

from solids.cutout import border_colour, key_matte, rounded_matte, unmix  # noqa: E402
from solids.finish import add_grain, fit_canvas, match_light, remove_marks  # noqa: E402
from solids.relief import relief  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
GRAIN = ROOT / "assets" / "textures" / "grain.png"
PX = 4  # pixels a parcel unit
DOME = 0.3  # the dome reaches full height this share of the smaller side in
EDGE = 0.02  # alpha below this is empty when cropping
MARK_RING = 3  # px of the surround a mark is painted over from: the label's paper border is only 4-5 px
TRAY = {"radius": 0.08, "inset": 0.004, "feather": 2.0}  # the sushi tray's outline, as shares of its photo's width


class Item(NamedTuple):
    file: str  # the photo's name in the source folder
    key: str  # 'auto' (plain background), 'alpha' (already cut out) or 'tray' (a tray filling the photo)
    size: tuple[int, int]  # footprint in units, as FOOD in js/scene/geometry.js
    height: int  # peak height in units
    label: str
    marks: tuple[tuple[int, int, int, int], ...]  # (x0, y0, x1, y1) boxes in source pixels, painted over


ITEMS: dict[str, Item] = {
    # the chopsticks' paper wrapper is printed with two characters
    "sushi": Item("food-sushi.jpg", "tray", (52, 68), 12, "sushi", ((448, 843, 508, 897), (476, 896, 532, 970))),
    # the "M" and its registered mark on the packet's red panel
    "fries": Item("food-fries.jpg", "auto", (32, 40), 22, "fries", ((429, 552, 589, 699),)),
    # the shop's label (x 182-400, y 188-423), its text and its drawing: blank paper, filled from its border
    "strawberries": Item("food-straberry.jpg", "auto", (44, 44), 16, "strawberries", ((185, 191, 400, 421),)),
    "bowl": Item("food-bowl.jpg", "auto", (42, 42), 18, "fruit bowl", ()),
    "dumplings": Item("food-dumplings.png", "alpha", (40, 40), 10, "dumplings", ()),
}


def matte(item: Item, rgba: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Alpha in [0, 1] and the colour unmixed from its background."""
    rgb = rgba[..., :3]
    if item.key == "alpha":
        return rgba[..., 3] / 255, rgb
    if item.key == "tray":
        return rounded_matte(rgb.shape[:2], **TRAY), rgb
    alpha = key_matte(rgb)
    return alpha, unmix(rgb, alpha, border_colour(rgb))


def crop_box(alpha: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(alpha > EDGE)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def cleaned_boxes(marks, crop, source_size, size_px) -> list[list[int]]:
    """The mark boxes in output pixels: cropped, scaled to fit and centred as fit_canvas does."""
    x0, y0, x1, y1 = crop
    w, h = x1 - x0, y1 - y0
    scale = min(size_px[0] / w, size_px[1] / h)
    ox, oy = (size_px[0] - round(w * scale)) // 2, (size_px[1] - round(h * scale)) // 2
    out = []
    for mx0, my0, mx1, my1 in marks:
        box = [ox + (mx0 - x0) * scale, oy + (my0 - y0) * scale, ox + (mx1 - x0) * scale, oy + (my1 - y0) * scale]
        out.append([max(0, int(np.ceil(box[0]))), max(0, int(np.ceil(box[1]))),
                    min(size_px[0], int(box[2])), min(size_px[1], int(box[3]))])
    return out


def prepare(item_id: str, item: Item, source: Path, out: Path, grain: np.ndarray) -> dict:
    rgba = np.asarray(Image.open(source / item.file).convert("RGBA"), float)
    rgb = remove_marks(rgba[..., :3], item.marks, ring=MARK_RING) if item.marks else rgba[..., :3]
    alpha, colour = matte(item, np.concatenate([rgb, rgba[..., 3:]], axis=-1))
    crop = crop_box(alpha)
    x0, y0, x1, y1 = crop
    cut = np.concatenate([colour, alpha[..., None] * 255], axis=-1)[y0:y1, x0:x1]
    size_px = (item.size[0] * PX, item.size[1] * PX)
    fitted = fit_canvas(np.round(np.clip(cut, 0, 255)).astype(np.uint8), size_px)
    a = fitted[..., 3] / 255
    finished = add_grain(match_light(fitted[..., :3], a), a, grain)
    level = relief(a, finished, radius_px=DOME * min(size_px))
    texture, height_map = out / f"{item_id}.webp", out / f"{item_id}-relief.webp"
    picture = np.concatenate([finished, fitted[..., 3:4]], axis=-1)
    Image.fromarray(np.round(picture).astype(np.uint8), "RGBA").save(texture, "WEBP", quality=88, alpha_quality=100, method=6)
    Image.fromarray(level, "L").save(height_map, "WEBP", quality=85, method=6)
    print(f"{item_id} {size_px[0]}x{size_px[1]} px, {texture.stat().st_size // 1024} + {height_map.stat().st_size // 1024} KB")
    rel = lambda p: p.resolve().relative_to(ROOT).as_posix()  # noqa: E731
    return {"id": item_id, "label": item.label, "size": list(item.size), "height": item.height,
            "texture": rel(texture), "relief": rel(height_map),
            "cleaned": cleaned_boxes(item.marks, crop, rgba.shape[1::-1], size_px)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", type=Path, help="folder with the food photos")
    parser.add_argument("out", type=Path, help="where the pictures and food.json go (assets/food)")
    args = parser.parse_args(argv)
    missing = [i.file for i in ITEMS.values() if not (args.source / i.file).exists()]
    if missing:
        parser.error(f"not in {args.source}: {', '.join(missing)}")
    args.out.mkdir(parents=True, exist_ok=True)
    grain = np.asarray(Image.open(GRAIN).convert("RGBA"), float)
    items = [prepare(i, item, args.source, args.out, grain) for i, item in ITEMS.items()]
    data = {"pxPerUnit": PX, "items": items}
    (args.out / "food.json").write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {(args.out / 'food.json').as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
