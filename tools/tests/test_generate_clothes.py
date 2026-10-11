import os
import subprocess
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent.parent
DRAW = "\n".join([
    "import hashlib, generate_clothes as gc",
    "c = gc.Canvas(40, 40, seed='t')",
    "c.shape([(0, 0), (40, 0), (40, 40), (0, 40)])",
    "c.fabric('#c8102e')",
    "print(hashlib.sha1(c.image.tobytes()).hexdigest())",
])


def test_fabric_grain_is_the_same_in_every_run():
    # Python salts str hashes per process: a grain seeded from hash() would differ on each rebuild
    digests = {
        subprocess.run([sys.executable, "-c", DRAW], cwd=TOOLS, env={**os.environ, "PYTHONHASHSEED": seed},
                       capture_output=True, text=True, check=True).stdout
        for seed in ("1", "2")
    }
    assert len(digests) == 1
