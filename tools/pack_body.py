"""The owner's vacuum pack as a cloth body for assets/clothes/garments.json.

Written by tools/generate_clothes.py after the garments. A stiff, heavy sheet
(kind "film") textured with the pack tools/prepare_pack.py cut out, lying flat
where CONTENTS.pack in js/scene/geometry.js puts it.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from clothes.fit import cell_grid

SIZE = (181, 290)  # parcel units: CONTENTS.pack's width and height
GRID = (29, 47)  # cells of about 6.2 units: no point of a cell lies 4.5 (the pile's thickness) from every particle
CLOTH, CORE = 0.02, 0.3  # as for garments: wherever there is film it is pack, and it hides what lies under it
TEXTURE = "assets/photo/vacuum-pack.webp"
RELIEF = "assets/photo/vacuum-pack-relief.webp"
MATERIAL = {
    "stretchCompliance": 0,
    "bendCompliance": 1e-7,  # very stiff: it flexes a little, never folds
    "friction": 0.25,  # plastic slides more easily than fabric
    "sheen": 0.9,  # glossy film
    "bump": 2.0,  # the bulges over its contents catch the light
    "mass": 4,  # dense contents: each particle four times a garment's
}
HOLD = {"radius": 30, "lift": 6}  # a wide grip lifted only a little, so it flexes instead of hanging from a point


def pack_record(root: Path) -> dict:
    """The pack's record, its cloth grid cut from the picture's opacity."""
    if not (root / RELIEF).exists():
        raise FileNotFoundError(f"{RELIEF} is missing; run tools/prepare_pack.py")
    image = Image.open(root / TEXTURE)
    alpha = np.asarray(image.getchannel("A"), np.float32) / 255
    return {
        "id": "pack",
        "kind": "film",
        "label": "vacuum pack",
        "texture": TEXTURE,
        "relief": RELIEF,
        "pxPerUnit": round(image.height / SIZE[1], 4),
        "size": list(SIZE),
        "grid": cell_grid(alpha, *GRID, cloth=CLOTH, core=CORE),
        "material": dict(MATERIAL),
        "hold": dict(HOLD),
    }
