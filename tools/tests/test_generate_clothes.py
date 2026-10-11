import os
import subprocess
import sys
from pathlib import Path

import pytest

import generate_clothes as gen

TOOLS = Path(__file__).resolve().parent.parent
DRAW = "\n".join([
    "import hashlib",
    "from clothes.canvas import Canvas",
    "from clothes.fabrics import jersey",
    "c = Canvas(40, 40, seed='t')",
    "c.shape([(0, 0), (40, 0), (40, 40), (0, 40)])",
    "c.fill(jersey(c.grid_shape, c.np_rng, '#c8102e'))",
    "print(hashlib.sha1(c.colour.tobytes() + c.relief.tobytes()).hexdigest())",
])


def record(garment_id, **extra):
    return {"id": garment_id, "label": garment_id, **extra}


def test_merge_replaces_redrawn_garments_and_keeps_the_rest_in_order():
    old = [record(i, texture="old") for i in gen.ORDER]
    merged = gen.merge(old, [record("qipao", texture="new", pxPerUnit=4)], old_px=2.4)
    assert [r["id"] for r in merged] == gen.ORDER
    assert merged[0]["texture"] == "new" and merged[0]["pxPerUnit"] == 4
    assert merged[1]["texture"] == "old" and merged[1]["pxPerUnit"] == 2.4


def test_merge_refuses_a_garment_with_neither_drawing_nor_record():
    with pytest.raises(SystemExit, match="blouse"):
        gen.merge([record("qipao")], [], old_px=2.4)


def test_fabric_grain_is_the_same_in_every_run():
    # Python salts str hashes per process: a grain seeded from hash() would differ on each rebuild
    digests = {
        subprocess.run([sys.executable, "-c", DRAW], cwd=TOOLS, env={**os.environ, "PYTHONHASHSEED": seed},
                       capture_output=True, text=True, check=True).stdout
        for seed in ("1", "2")
    }
    assert len(digests) == 1
