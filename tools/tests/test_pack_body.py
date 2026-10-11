import math

import numpy as np
import pytest
from PIL import Image

import pack_body


def make_pack(root, relief=True):
    photo = root / "assets" / "photo"
    photo.mkdir(parents=True)
    rgba = np.zeros((120, 75, 4), np.uint8)
    rgba[..., :3] = 230
    rgba[..., 3] = round(0.45 * 255)  # clear film everywhere...
    rgba[40:80, 20:55, 3] = 255  # ...around something solid
    Image.fromarray(rgba).save(photo / "vacuum-pack.webp", lossless=True)
    if relief:
        Image.fromarray(np.zeros((120, 75), np.uint8)).save(photo / "vacuum-pack-relief.webp")


def test_the_pack_is_a_heavy_stiff_film_the_size_of_the_pack_in_the_box(tmp_path):
    make_pack(tmp_path)
    record = pack_body.pack_record(tmp_path)
    assert (record["id"], record["kind"]) == ("pack", "film")
    assert record["size"] == [181, 290]  # CONTENTS.pack in js/scene/geometry.js
    assert (record["grid"]["cols"], record["grid"]["rows"]) == pack_body.GRID
    assert set(record["grid"]["cells"]) == {"1"} and set(record["grid"]["core"]) == {"1"}
    assert record["material"]["mass"] == 4 and record["hold"] == {"radius": 30, "lift": 6}
    assert record["pxPerUnit"] == pytest.approx(120 / 290, abs=1e-4)


def test_no_garment_particle_can_slip_between_the_packs_particles():
    (w, h), (cols, rows) = pack_body.SIZE, pack_body.GRID
    assert math.hypot(w / cols, h / rows) / 2 < 4.5  # the pile's thickness, tools/build-pile.mjs


def test_a_missing_relief_is_reported(tmp_path):
    make_pack(tmp_path, relief=False)
    with pytest.raises(FileNotFoundError, match="prepare_pack"):
        pack_body.pack_record(tmp_path)
