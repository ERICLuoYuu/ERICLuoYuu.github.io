"""Garments for the clothes pile: colour, relief and cloth data.

    python tools/generate_clothes.py [--only id,id]      (npm run clothes also settles the pile)

Draws each garment flat, as laid on a table, into assets/clothes/<id>.webp
(colour, transparent around it) and <id>-relief.webp (the height of seams,
hems, trims and weave, lit at run time), and updates its record in
assets/clothes/garments.json: size in parcel units (fitted to the figure in the
owner's pack, clothes/fit.py), the cloth grid, its
signature feature and how the fabric behaves. Records of garments not drawn
this time are kept; the owner's pack is appended last, as a film body (pack_body.py). Then run `node tools/build-pile.mjs` to settle the pile.

The traditional pieces are a qipao, a mandarin-collar blouse and a horse-face
(mamianqun) skirt; the contemporary ones are high-street basics. No brand
names, logos or text appear anywhere.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))  # run as a script: make `clothes` importable

from clothes.canvas import PX, Canvas  # noqa: E402
from clothes.fit import CELL, fit, grid_shape  # noqa: E402
from clothes.traditional import blouse, mamianqun, qipao  # noqa: E402
from pack_body import pack_record  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "clothes"
ORDER = ["qipao", "blouse", "mamianqun", "tee-white", "tee-breton", "slip-skirt", "ruched-top", "floral-skirt"]
BUDGET = 3 * 2**20  # bytes of garment pictures, all together


@dataclass(frozen=True)
class Garment:
    id: str
    label: str
    size: tuple[int, int]
    material: dict
    signature: tuple[float, float]  # (u, v) of its most recognizable feature
    draw: Callable[[Canvas], None]


def material(bend: float, friction: float, sheen: float, bump: float) -> dict:
    return {"stretchCompliance": 0, "bendCompliance": bend, "friction": friction, "sheen": sheen, "bump": bump}


GARMENTS = [
    Garment("qipao", "qipao", (190, 400), material(1e-4, 0.35, 0.6, 1.6), (0.5, 0.02), qipao),
    Garment("blouse", "mandarin-collar blouse", (300, 230), material(1.5e-4, 0.4, 0.25, 1.3), (0.5, 0.03), blouse),
    Garment("mamianqun", "horse-face skirt", (280, 262), material(6e-5, 0.5, 0.3, 1.8), (0.5, 0.55), mamianqun),
]


def draw(g: Garment) -> dict:
    scale = fit(g.id, g.size[1])  # pattern units → parcel units: the garment's length on the figure
    size = [round(g.size[0] * scale, 2), round(g.size[1] * scale, 2)]
    canvas = Canvas(*g.size, seed=f"garment:{g.id}")
    g.draw(canvas)
    colour_path, relief_path = OUT / f"{g.id}.webp", OUT / f"{g.id}-relief.webp"
    colour, _, grid = canvas.finish(colour_path, relief_path, grid_shape(*size))
    share = grid["cells"].count("1") / len(grid["cells"])
    print(f"{g.id:13s} {colour.width}x{colour.height}px  {colour_path.stat().st_size // 1024:3d} + "
          f"{relief_path.stat().st_size // 1024:3d} KB  cloth cells {share:.0%}")
    rel = lambda p: p.relative_to(ROOT).as_posix()  # noqa: E731
    return {"id": g.id, "label": g.label, "texture": rel(colour_path), "relief": rel(relief_path),
            "pxPerUnit": round(PX / scale, 4), "size": size, "signature": list(g.signature), "grid": grid, "material": g.material}


def merge(existing: list[dict], fresh: list[dict], old_px: float) -> list[dict]:
    """Fresh records replace earlier ones with the same id; earlier ones keep the resolution they were drawn at."""
    by_id = {r["id"]: {"pxPerUnit": old_px, **r} for r in existing}
    by_id.update({r["id"]: r for r in fresh})
    missing = [i for i in ORDER if i not in by_id]
    if missing:
        raise SystemExit(f"No drawing and no earlier record for: {', '.join(missing)}")
    return [by_id[i] for i in ORDER]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", default="", help="comma-separated garment ids to draw (default: all)")
    args = parser.parse_args(argv)
    only = [i for i in args.only.split(",") if i]
    unknown = sorted(set(only) - {g.id for g in GARMENTS})
    if unknown:
        parser.error(f"no drawing for: {', '.join(unknown)}")
    OUT.mkdir(parents=True, exist_ok=True)
    data_path = OUT / "garments.json"
    old = json.loads(data_path.read_text(encoding="utf-8")) if data_path.exists() else {"garments": []}
    fresh = [draw(g) for g in GARMENTS if not only or g.id in only]
    garments = merge(old["garments"], fresh, old.get("pxPerUnit", PX)) + [pack_record(ROOT)]  # the pack, always last
    data = {"spacing": CELL, "pxPerUnit": PX, "garments": garments}
    data_path.write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8", newline="\n")
    pictures = [r for r in data["garments"] if r.get("kind") != "film"]  # the pack's pictures are the owner's artwork
    total = sum((ROOT / r[k]).stat().st_size for r in pictures for k in ("texture", "relief") if r.get(k))
    print(f"garment pictures: {total / 2**20:.2f} MB of {BUDGET / 2**20:.0f} MB")
    return 0 if total <= BUDGET else 1


if __name__ == "__main__":
    sys.exit(main())
