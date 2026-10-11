# Vacuum Pack and Detailed Garments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the owner's artwork into a translucent vacuum pack the visitor can pick up and move, replace the generic fabric shapes with detailed, recognizable garments sized to the figure in it that keep their shape while dragged and settle with weight, and lay four of the owner's books in the box.

**Architecture:** A Python tool cuts the pack out of its white canvas with an exact over-white matte; in the WebGL clothes layer it is a ninth cloth body (kind `film`: heavy, very stiff, drawn translucent after the garments), with a flat CSS-3D copy as the no-WebGL fallback. Every garment is sized by a fit to the figure in the pack and simulated with XPBD on cells of at most 6 units, but drawn finer: every touched grid cell is meshed with the outline cut from texture alpha, each cell is drawn as a smooth 2 × 2 patch (four-point interpolation), and a per-garment relief map is lit at run time. A rewritten generator draws colour + relief per garment; the hand holds low; air drag is lighter; the pile is restaged in the upper right so signature features face up; four CSS-3D book blocks with generated covers fill the lower right.

**Tech Stack:** Vanilla ES modules + WebGL2 (no build step, no new libraries), Node `node --test`, Playwright (installed Chrome), Python 3.14 with numpy, scipy, Pillow and pytest (all installed).

**Spec:** `docs/superpowers/specs/2026-10-11-pack-and-garments-design.md` (builds on `2026-10-11-clothes-pile-design.md`).

**Revision B** (the spec's section "Revision B", approved after checkpoint A) reshaped this plan: Tasks 1–2 are done; Tasks 3, 4, 8 and 9 are new; the others are renumbered and rescaled. The task scripts need whole task numbers, so the spec's B6 steps map as follows:

| Spec B6 step | Plan task |
|---|---|
| 1, 2 (done) | 1, 2 |
| 2b Layout and scale | 3 |
| 2c Books — checkpoint A′ | 4 |
| 3–5 Core cells, smooth surface, renderer | 5–7 |
| 5c The pack as a body | 8 |
| 5b Film drawing | 9 |
| 6–8 Garments — checkpoint B | 10–12 |
| 9 Holding and weight | 13 |
| 10 The pile | 14 |
| 11 Release | 15 |

Decisions taken while planning Revision B (the executor ledgers each as a ruling when its task runs):
- **5b and 5c swap.** The pack must exist as a body before its film pass can be seen or tested.
- **Cost (B3).** The spec's "about 5,000 particles today" is 4,365 measured (43,650 particle-substeps). Revision B has 1,925 garment particles and 1,440 for the pack: 53,840 with everything awake — within 10 % of the spec's 50,000 baseline, which the test pins (≤ 55,000), but 23 % above today's measured work. Sleeping bodies cost nothing and the pack sleeps unless moved; `layer.js` already trims substeps on a slow device.
- **Grip radius and lift** (B3) change in Task 13, beside the tests that pin them; Task 3 changes only the scale (cells, thickness, substeps).
- **Gravity stays −2400.** At the garments' new size it already gives §4's weight (§4's −5000 × 0.4 ≈ −2000); air drag drops to 1.2/s as §4 says.
- **Pack grid 29 × 47** (cells ≈ 6.2 units): a cell's middle lies 4.4 from its particles, inside the 4.5 thickness; 1,440 particles (B3's "about 1,450").
- **Cells are equal divisions** of a garment, none wider than 6 units: `js/cloth/mesh.js` spaces particles size ÷ cols apart, so the grid is cut the same way (the old generator's short last cell goes).
- **Figure lengths are constants** (`tools/clothes/fit.py` `LENGTH`, B2's table) rather than re-measured from the cut-out, whose solid mask also holds the food and the sandals. The data test pins each garment's length to them within 10 %.
- **Relief strength is per file texel**, so a texture uploaded smaller on a phone keeps the same bump (Task 7).
- **Signature visibility radius 7**: spec §5's 12 units at a 10-unit cell, scaled to the 6-unit cell (Task 14).
- **Titles exactly as written**, including the lower-case "dictionary" in "German-Chinese dictionary".

## Global Constraints

- Static GitHub Pages site: vanilla ES modules, relative paths, no build step, no new runtime libraries.
- Python tools use numpy, scipy and Pillow only; Python tests use pytest (`npm run test:py`).
- No brand names, logos or text on any garment; no IKEA name, logo or fonts.
- Nothing about the owner is invented; the pack composited back over white reproduces `F:\CXY.png` within 1 level.
- Units are parcel units; `LIGHT_DIR = normalise([-0.35, -0.45, 1])` (js/cloth/shading.js) is the one light for cloth, pack relief and shadows.
- Garment assets ≤ 3 MB to download in total; textures 4 px per unit (`PX = 4`), drawn 2× supersampled (`SS = 2`).
- Immutability everywhere except the solver's and renderer's documented typed arrays.
- Files ≤ 800 lines, functions ≤ 50 lines.
- Commits: conventional types, body ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never `git add .omc/`.
- Run `/verify` before every code commit (not for docs or tests-only commits).
- Playwright: always `--workers=2` (memory); run subsets while iterating.
- Seeds and noise are deterministic: never use Python's `hash()` for seeds (it changes per process); use `zlib.crc32`.
- Revision B scale: each garment's length is its figure length (`tools/clothes/fit.py` `LENGTH`); cloth cells at most 6 units; cloth thickness 4.5; 16 substeps.
- The pack is the body `pack` (`kind: "film"`), last in `garments.json`; the keyboard never moves it; without WebGL2 the CSS pack is the fallback.
- Books: titles exactly as the owner wrote them; no publisher names, logos or cover art; fonts only from `assets/fonts` (SIL OFL).

## Review Focus

1. **The owner later sends a PNG that already has transparency** (exported without the white layer) → `prepare_pack.py` keeps that alpha instead of matting or refusing it, and still writes the shade overlay. *(Task 1, `test_existing_transparency_is_kept`)*
2. **A garment's relief image fails to load** → that garment is drawn without relief, the clothes stay enabled, a warning names the file. *(Task 10, e2e "a garment whose relief is missing")*
3. **The pack's shade overlay is missing** → the pack still shows, with no broken-image icon; an error names the file. *(Task 2, e2e "without its shade overlay")*
4. **A garment is dropped onto the pack** → it rests on top of the pack and does not sink into it. *(Task 8, solver test "cloth dropped on the vacuum pack")*
5. **Very high or very low screen resolution** → textures are uploaded at most at file size and never below 1.5 px per unit. *(Task 7, `textureScale` tests)*
6. **A book cover fails to load** → the block still lies there in its board colour, no broken-image icon; an error names the file. *(Task 4, e2e "a book whose cover is missing")*
7. **The visitor drags the pack onto the books, the booklet or the pile** → it rests on top and flexes, never sinks in or folds, and hides the booklet like cloth. *(Task 8, solver "the pack laid over the booklet and the books…", hand "dragged by its middle…")*
8. **No WebGL2** → the CSS pack shows, flat, with no edge strip; books and booklet as usual. *(Task 8, e2e "the CSS pack stays, flat, as the fallback")*
9. **Restart after moving the pack** → the pack is back in its place, and the CSS pack takes over again while the layer is hidden. *(Task 8, e2e "…restart puts it back")*

---

## File Structure

| Path | Status | Responsibility |
|------|--------|----------------|
| `tools/prepare_pack.py` | create | Cut the pack out of its white canvas (exact matte), write pack + shade overlay |
| `tools/tests/conftest.py` | create | Put `tools/` on `sys.path` for pytest |
| `tools/tests/test_prepare_pack.py` | create | Matte, hints, refusal, transparency, overlay, CLI |
| `tools/shots.mjs` | create | Overhead screenshots (desktop + phone) for checkpoints |
| `tools/prepare_photo.py`, `assets/photo/vacuum-collage.webp` | delete | Replaced by the pack |
| `js/scene/geometry.js` | modify | `CONTENTS.pack` replaces `CONTENTS.photo` |
| `js/scene/solids.js` | modify | `pack` floor collider |
| `js/scene/parcel.js` | modify | `buildPack()` replaces `buildPhoto()` |
| `css/scene.css` | modify | `.pack*` styles replace `.photo-card*`, `.washi`, `.photo-caption` |
| `js/main.js`, `content/site.js`, `js/flow.js` | modify | Wire the pack images; drop `photoCaption`; announcement text |
| `js/cloth/mesh.js` | modify | `core` flags, `lattice`, `particleNear()` |
| `js/cloth/solver.js` | modify | `world.core`; 16 substeps; per-body mass; less air drag |
| `js/cloth/coverage.js` | modify | Count only core particles; `isExposed()` |
| `js/cloth/smooth.js` | create | Four-point interpolation stencils for the drawn mesh |
| `js/cloth/budget.js` | create | Device px per unit at the overhead view; texture upload scale |
| `js/cloth/shading.js` | modify | `cavity()` takes a crease strength |
| `js/cloth/render.js` | modify | Draw the smooth mesh; relief texture and bump lighting |
| `js/cloth/layer.js` | modify | Load reliefs; upload at the size the screen needs |
| `js/cloth/hand.js` | modify | Per-body holds; `LIFT` 12, `GRIP_RADIUS` 8, no 60-unit floor |
| `tools/clothes/__init__.py` | create | Package marker |
| `tools/clothes/curves.py` | create | `catmull`, `mirror`, `sym`, `offset`, `dash_segments` |
| `tools/clothes/canvas.py` | create | `Canvas` (colour + relief), `coverage_grid` |
| `tools/clothes/fabrics.py` | create | `Fabric`; jersey, rib, linen, cotton, twill, satin, woven figures, stripes, blend |
| `tools/clothes/details.py` | create | Seams, stitches, hems, piping, closures, buttons, ribs, pleats, gathers, lace, zip |
| `tools/clothes/motifs.py` | create | Peony, cloud, flower drawings |
| `tools/clothes/traditional.py` | create | Qipao, blouse, horse-face skirt |
| `tools/clothes/modern.py` | create | White tee, Breton top, ruched top, floral skirt, slip skirt |
| `tools/generate_clothes.py` | rewrite | Garment list, `--only`, merge records into `garments.json` |
| `tools/tests/test_clothes_canvas.py` | create | Grid/core, relief alignment, no painted shade, cuts, determinism |
| `tools/tests/test_generate_clothes.py` | create | Record merging |
| `tools/build-pile.mjs` | modify | Pack target, `under` folds, new PLAN, signature visibility |
| `tests/unit/cloth-smooth.test.js`, `tests/unit/cloth-budget.test.js` | create | Pure-module tests |
| `tests/unit/*.test.js`, `tests/e2e/*.spec.js` | modify | As each task says |
| `package.json`, `.gitignore` | modify | `test:py` script; ignore `shots/` |
| `README.md`, `docs/design.md` | modify | Task 15 |
| `tools/clothes/fit.py`, `tools/tests/test_fit.py` | create | Figure lengths, fit, equal-division cell grids (Task 3) |
| `tools/generate_books.py`, `tools/tests/test_generate_books.py`, `assets/books/*.webp` | create | The owner's book covers (Task 4) |
| `tools/pack_body.py`, `tools/tests/test_pack_body.py`, `assets/photo/vacuum-pack-relief.webp` | create | The pack's cloth record and relief (Task 8) |
| `js/scene/geometry.js`, `js/scene/solids.js`, `js/scene/parcel.js`, `css/scene.css` | modify | Revision B layout; `BOOKS`, `baseOf`, book blocks and colliders; the pack collider goes (Tasks 3, 4, 8) |
| `js/cloth/layer.js`, `js/cloth/render.js`, `js/main.js`, `content/site.js`, `js/flow.js` | modify | `bodies`, the film pass, `pixelAt`; books, hand-over, announcements (Tasks 4, 8, 9) |

---

### Task 1: Cut the vacuum pack out of its canvas

**Files:**
- Create: `tools/prepare_pack.py`, `tools/tests/conftest.py`, `tools/tests/test_prepare_pack.py`
- Modify: `package.json` (add `test:py`)
- Output: `assets/photo/vacuum-pack.webp`, `assets/photo/vacuum-pack-shade.webp`

**Interfaces:**
- Produces (Python): `PackError`, `Ellipse(x, y, rx, ry)` with `.parse(text)` and `.mask(shape)`, `cut_out(rgb, given, film, hints, speck=SPECK) -> (colour uint8 H×W×3, alpha float H×W, solid bool H×W)`, `recomposite_error(rgb, alpha, colour) -> float`, `relief_shade(alpha, solid) -> uint8 H×W×4`, `main(argv) -> int`, constants `SHADE_MAX`, `HEIGHT`.
- Produces (files): the two images above; the printed `aspect` (width ÷ height) is used in Task 2.

- [ ] **Step 1: Write the failing tests**

`tools/tests/conftest.py`:
```python
"""Let the tests import the tools as modules (tools/ is not a package)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
```

`tools/tests/test_prepare_pack.py`:
```python
import numpy as np
import pytest
from PIL import Image

import prepare_pack as pp


def artwork() -> np.ndarray:
    """120 × 100 px: a white canvas, a pale film sheet with a highlight, a red disc and a near-white 'sandal'."""
    rgb = np.full((100, 120, 3), 255.0)
    rgb[10:90, 20:100] = 240  # film
    rgb[30:34, 30:90] = 252  # a pale highlight on the film
    yy, xx = np.mgrid[0:100, 0:120]
    rgb[(xx - 50) ** 2 + (yy - 50) ** 2 <= 15**2] = (200, 30, 40)
    rgb[70:80, 75:90] = 250  # the pale sandal
    return rgb


def cut(hints=()):
    return pp.cut_out(artwork(), None, 0.45, list(hints), speck=50)


def test_canvas_is_transparent_and_solids_opaque():
    _, alpha, solid = cut()
    assert alpha[0, 0] == 0 and alpha[5, 60] == 0
    assert alpha[50, 50] == pytest.approx(1.0)
    assert solid[50, 50] and not solid[20, 25]


def test_film_is_see_through_but_never_less_than_a_pixel_needs():
    rgb = artwork()
    _, alpha, _ = cut()
    assert alpha[20, 25] == pytest.approx(0.45, abs=0.02)
    needed = (255 - rgb.min(axis=2)) / 255
    assert (alpha >= needed - 1e-9).all()


def test_highlights_survive_as_whiter_film():
    colour, alpha, _ = cut()
    assert alpha[32, 60] > 0.4
    assert colour[32, 60].min() > colour[20, 25].min() + 20


def test_over_white_the_cut_out_is_the_artwork():
    colour, alpha, _ = cut()
    assert pp.recomposite_error(artwork(), alpha, colour.astype(float)) <= 1


def test_a_hint_keeps_a_pale_solid_opaque():
    _, plain, _ = cut()
    _, hinted, _ = cut([pp.Ellipse(82, 75, 9, 6)])
    assert plain[75, 82] < 0.6
    assert hinted[75, 82] == pytest.approx(1.0)


def test_artwork_without_a_white_border_is_refused():
    with pytest.raises(pp.PackError, match="white canvas"):
        pp.cut_out(np.full((40, 40, 3), 200.0), None, 0.45, [], speck=50)


def test_existing_transparency_is_kept():
    rgb = artwork()
    given = np.where(rgb.min(axis=2) >= 254, 0.0, 0.8)
    _, alpha, solid = pp.cut_out(rgb, given, 0.45, [], speck=50)
    assert np.array_equal(alpha, given)
    assert not solid.any()


def test_relief_shade_is_faint_and_only_on_the_pack():
    _, alpha, solid = cut()
    shade = pp.relief_shade(alpha, solid)
    assert shade.shape == (*alpha.shape, 4)
    assert 0 < shade[..., 3].max() <= round(pp.SHADE_MAX * 255)
    assert (shade[alpha <= 0.01, 3] == 0).all()


def test_cli_writes_the_pack_and_its_shade(tmp_path, capsys):
    source = tmp_path / "art.png"
    Image.fromarray(artwork().astype(np.uint8)).save(source)
    assert pp.main([str(source), str(tmp_path / "out"), "--speck", "50", "--height", "60"]) == 0
    pack = Image.open(tmp_path / "out" / "vacuum-pack.webp")
    shade = Image.open(tmp_path / "out" / "vacuum-pack-shade.webp")
    assert pack.mode == "RGBA" and pack.height == 60 and shade.size == pack.size
    assert "aspect" in capsys.readouterr().out


def test_cli_reports_a_bad_input(tmp_path, capsys):
    source = tmp_path / "grey.png"
    Image.new("RGB", (30, 30), (200, 200, 200)).save(source)
    assert pp.main([str(source), str(tmp_path / "out")]) == 2
    assert "white canvas" in capsys.readouterr().err
```

In `package.json` `scripts`, add after `"test:coverage"`:
```json
    "test:py": "python -m pytest tools/tests -q",
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm run test:py`
Expected: FAIL — `ModuleNotFoundError: No module named 'prepare_pack'`.

- [ ] **Step 3: Write `tools/prepare_pack.py`**

```python
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
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run test:py`
Expected: `10 passed`.

- [ ] **Step 5: Make the real pack**

Run: `python tools/prepare_pack.py F:/CXY.png assets/photo --solid 950,1200,44,40`
Expected: `assets/photo/vacuum-pack.webp: 7xx x 1200, aspect 0.6xxx` (note the aspect for Task 2). The `--solid` ellipse is the white sandal on the left foot (found by viewing the solid mask; the other sandal is already caught by colour).

Look at it over cardboard (scratch file, not committed):
```bash
python -c "from PIL import Image; p=Image.open('assets/photo/vacuum-pack.webp'); s=Image.open('assets/photo/vacuum-pack-shade.webp'); b=Image.new('RGBA',p.size,(214,186,142,255)); b.alpha_composite(p); b.alpha_composite(s); b.convert('RGB').save('$TMPDIR/pack-preview.png')"
```
Check: cardboard shows through the clear film; wrinkles and highlights visible; the owner, food, containers and both sandals solid; the outline follows the plastic's edge with no white halo.

- [ ] **Step 6: Commit**

```bash
git add tools/prepare_pack.py tools/tests/conftest.py tools/tests/test_prepare_pack.py package.json assets/photo/vacuum-pack.webp assets/photo/vacuum-pack-shade.webp
git commit -m "feat: cut the owner's vacuum pack out of its white canvas

The plastic stays see-through over the cardboard; laid back over white the
cut-out matches the artwork, which the tool checks before writing.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The pack in the box

**Files:**
- Create: `tools/shots.mjs`
- Modify: `js/scene/geometry.js:19-23`, `js/scene/solids.js:76-85`, `js/scene/parcel.js:62-73,127-161`, `css/scene.css:181-229`, `js/main.js:100-110,300-303`, `content/site.js` (text.photoCaption, photo), `js/flow.js:109-112`, `js/cloth/hand.js:50-53`, `tools/build-pile.mjs` (TARGETS, main), `.gitignore`
- Delete: `tools/prepare_photo.py`, `assets/photo/vacuum-collage.webp`
- Test: `tests/unit/geometry.test.js`, `tests/unit/solids.test.js`, `tests/unit/cloth-solver.test.js`, `tests/unit/cloth-hand.test.js` (title only), `tests/unit/clothes-data.test.js`, `tests/e2e/assets.spec.js`, `tests/e2e/journey.spec.js`

**Interfaces:**
- Consumes: Task 1's images and printed aspect.
- Produces: `CONTENTS.pack = { x, y, width, height, thickness, rotate, edge, tilt }` (x/width = the flat part); collider named `'pack'`; `scene.pack = { el, img, shade }` (replaces `scene.photo`); config `photo.shade`; `tools/shots.mjs [base] [out]`.

- [ ] **Step 1: Write the failing unit tests**

In `tests/unit/geometry.test.js`, replace the test `'photo, booklet and desiccant lie inside the walls without overlapping'` with:
```js
test('pack, booklet and desiccant lie inside the walls without overlapping', () => {
  const inner = { left: 2, right: BOX.width - 2, top: 2, bottom: BOX.depth - 2 };
  const [pack, book, desiccant] = ['pack', 'book', 'desiccant'].map((k) => footprint(CONTENTS[k]));
  [pack, book, desiccant].forEach((b) => {
    assert.ok(b.left >= inner.left && b.right <= inner.right, 'inside the side walls');
    assert.ok(b.top >= inner.top && b.bottom <= inner.bottom, 'inside the front and back walls');
  });
  assert.ok(pack.right < book.left, 'the pack stays clear of the booklet');
  assert.ok(CONTENTS.pack.x + CONTENTS.pack.width / 2 < BOX.width / 2, 'the pack is on the left');
  assert.ok(desiccant.left > BOX.width * 0.75 && desiccant.top > BOX.depth * 0.6, 'the desiccant sits in the front-right corner');
});

test("the pack's seal edge curls up to rest on the left wall", () => {
  const { x, edge, tilt, rotate } = CONTENTS.pack;
  assert.equal(rotate, 0, 'square to the wall, so the whole edge touches it');
  const reach = x - edge * Math.cos((tilt * Math.PI) / 180);
  assert.ok(Math.abs(reach - 2) < 0.5, `the edge's top lies at x = ${reach}; the wall's inner face is at 2`);
});
```

In `tests/unit/solids.test.js`, change the collider-count test's title and count:
```js
test('colliders: 4 walls, 4 open flaps, the booklet, the desiccant and the pack, each a proper box', () => {
  const colliders = boxColliders();
  assert.equal(colliders.length, 11);
```
and add:
```js
test('the pack collider lies on the floor under its flat part, as thick as the pack', () => {
  const pack = boxColliders().find((c) => c.name === 'pack');
  const { x, y, width, height, thickness } = CONTENTS.pack;
  near(pack.center[0], x + width / 2);
  near(pack.center[1], y + height / 2);
  near(pack.center[2] - pack.half[2], 0);
  near(pack.half[2] * 2, thickness);
});
```

In `tests/unit/cloth-solver.test.js`, add to the imports `import { boxColliders } from '../../js/scene/solids.js';` and `import { CONTENTS } from '../../js/scene/geometry.js';`, then add:
```js
test('cloth dropped on the vacuum pack rests on top of it', () => {
  const mesh = sheet(4, 4);
  const w = world({ meshes: [mesh], colliders: boxColliders() });
  const { x, y, width, height, thickness } = CONTENTS.pack;
  const at = [x + width / 2 - 20, y + height / 2 - 20, 30];
  setPositions(w, 0, Float32Array.from(mesh.rest, (v, i) => v + at[i % 3]));
  run(w, 2);
  zs(w).forEach((z) => assert.ok(z >= thickness + THICKNESS / 2 - 0.5, `z = ${z}`));
});
```

In `tests/unit/cloth-hand.test.js`, rename the test `'aside means over the gentle right or front flap onto the table — never left over the photo, nor up the steep back flap'` to `'aside means over the gentle right or front flap onto the table — never left over the pack, nor up the steep back flap'`.

In `tests/unit/clothes-data.test.js`, rename the second test to `'pile.json is a settled pile that hides the booklet and leaves the pack in view'` and replace its last line with:
```js
  assert.ok(bookCoverage(world, CONTENTS.pack) <= 0.25, 'the pack stays mostly visible');
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test`
Expected: FAIL — `CONTENTS.pack` is undefined (geometry, solids, solver and data tests).

- [ ] **Step 3: Geometry and collider**

`js/scene/geometry.js` — replace the `photo` line of `CONTENTS` (set `width` to `round(aspect × 230) − 8` with Task 1's aspect; 134 for aspect 0.6174):
```js
/** Things lying on the floor of the box, in floor coordinates. */
export const CONTENTS = Object.freeze({
  // The owner's vacuum pack. x and width are its flat part; its seal edge,
  // `edge` wide, curls up at `tilt` degrees to rest on the left wall.
  pack: Object.freeze({ x: 6, y: 35, width: 134, height: 230, thickness: 4, rotate: 0, edge: 8, tilt: 60 }),
  book: Object.freeze({ x: 198, y: 28, width: 164, height: 228, thickness: 8, rotate: 4 }),
  desiccant: Object.freeze({ x: 368, y: 232, width: 42, height: 60, thickness: 3, rotate: -12 }),
});
```

`js/scene/solids.js` — in `boxColliders()`:
```js
/** Oriented boxes for the walls, the open flaps, the booklet, the desiccant and the pack. */
export function boxColliders() {
  const sides = Object.keys(SIDES);
  return [
    ...sides.map(wallCollider),
    ...sides.map(flapCollider),
    floorItemCollider('book', CONTENTS.book, 0.6), // .book3d: translateZ(.6px)
    floorItemCollider('desiccant', CONTENTS.desiccant, 0),
    floorItemCollider('pack', CONTENTS.pack, 0),
  ];
}
```

`tools/build-pile.mjs` — `const TARGETS = { book: 0.88, pack: 0.2 };` and in `main()`:
```js
    const pack = bookCoverage(world, CONTENTS.pack);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`seed ${seed}: booklet ${(book * 100).toFixed(0)} % hidden, pack ${(pack * 100).toFixed(0)} % covered (${seconds} s)`);
    if (book >= TARGETS.book && pack <= TARGETS.pack) {
```
Also change the file comment "covers too much of the photo" → "covers too much of the pack".

`js/cloth/hand.js` — the `asideTarget` comment: "Never left, where the owner's pack lies, nor over the steep back flap."

- [ ] **Step 4: Rebuild the pile against the new collider and run the unit tests**

Run: `node tools/build-pile.mjs && npm test`
Expected: a seed is accepted (`wrote assets/clothes/pile.json`); all unit tests pass.

- [ ] **Step 5: Build the pack in the scene**

`js/scene/parcel.js` — replace `buildPhoto` with:
```js
/** The owner's vacuum pack: a flat body on the floor, its seal edge curling up the left wall. */
function buildPack() {
  const { x, y, width, height, thickness, rotate, edge, tilt } = CONTENTS.pack;
  const reach = edge * Math.cos((tilt * Math.PI) / 180);
  const pack = h('div', 'pack');
  pack.style.cssText = `left:${x}px;top:${y}px;width:${width}px;height:${height}px;--rot:${rotate}deg;`
    + `--edge:${edge}px;--full:${width + edge}px;--tilt:${tilt}deg;--thick:${thickness}px;--reach:${reach.toFixed(2)}px`;
  const img = h('img', 'pack-img', { alt: '', draggable: 'false' });
  const shade = h('img', 'pack-shade', { alt: '', draggable: 'false', 'aria-hidden': 'true' });
  const body = h('div', 'pack-body');
  body.append(img, shade);
  pack.append(h('div', 'pack-joint', { 'aria-hidden': 'true' }), body, h('div', 'pack-edge', { 'aria-hidden': 'true' }));
  return { el: pack, img, shade };
}
```
In `buildParcel`: `const pack = buildPack();`, `contents.append(pack.el, desiccant, book.el);`, and return `pack` instead of `photo`. `buildParcel` no longer uses `text` for the photo; keep its signature.

`css/scene.css` — replace everything from `.photo-card {` to the end of `.photo-card.print .photo-frame::before { … }`, and the `.photo-caption` and `.washi` rules, with:
```css
/* The owner's vacuum pack: a flat body, its seal edge curling up the left wall. */
.pack {
  position: absolute;
  transform-style: preserve-3d;
  transform: rotate(var(--rot));
  pointer-events: none;
}
.pack-body {
  position: absolute; inset: 0;
  transform: translateZ(var(--thick));
  /* Falls away from the light (+x, +y) like the cloth's shadows. The image's own
     alpha shapes it: the clear film casts a faint shadow, the contents a firm one. */
  filter: drop-shadow(2px 3px 2.5px rgba(30, 18, 8, .42)) brightness(calc(1 - (1 - var(--light, 1)) * .95));
}
.pack-img, .pack-shade {
  position: absolute; top: 0; left: calc(-1 * var(--edge));
  width: var(--full); height: 100%;
  clip-path: inset(0 0 0 var(--edge)); /* the first `edge` pixels are the curled-up strip */
}
.pack-edge {
  position: absolute; top: 0; left: calc(-1 * var(--edge));
  width: var(--edge); height: 100%;
  background: var(--pack-src, none) 0 0 / var(--full) 100% no-repeat;
  transform-origin: 100% 50%;
  transform: translateZ(var(--thick)) rotateY(var(--tilt));
  /* turned toward the wall, the strip catches a little less light */
  filter: brightness(calc(.9 * (1 - (1 - var(--light, 1)) * .95)));
}
.pack-joint {
  /* soft contact shadow along the floor where the pack meets the wall */
  position: absolute; top: 3px; bottom: 3px;
  left: calc(-1 * var(--reach)); width: calc(var(--reach) + 12px);
  transform: translateZ(.3px);
  background: linear-gradient(90deg, rgba(30, 18, 8, .5), rgba(30, 18, 8, .18) 45%, rgba(30, 18, 8, 0));
  filter: blur(1.5px);
  opacity: var(--light, 1);
}
```

`content/site.js` — delete the `photoCaption` line from `text`, and replace the `photo` block with:
```js
  /** Your picture, as a vacuum-sealed pack on the left of the box floor (tools/prepare_pack.py makes both files). */
  photo: {
    src: 'assets/photo/vacuum-pack.webp', // the pack cut out of its white canvas, about 0.62 : 1
    shade: 'assets/photo/vacuum-pack-shade.webp', // soft light and shade laid over it; '' for none
    // A plain description of what is visible. Reword it in your own voice, then remove "[Draft — check this]".
    alt: '[Draft — check this] A collage: a person in a red top and blue floral skirt lies under crinkled clear plastic, as if vacuum-packed, surrounded by sushi, fries, strawberries, a fruit-and-yogurt bowl and dumplings.',
  },
```

`js/main.js` — in `imagePlan`, after the `photo` extra:
```js
  if (config.photo.shade) extras.push({ key: 'photoShade', src: config.photo.shade });
```
and replace the two `scene.photo` lines in `start()` with:
```js
  scene.pack.img.src = resolved.photo;
  scene.pack.img.alt = config.photo.alt;
  scene.pack.el.style.setProperty('--pack-src', cssUrl(resolved.photo));
  if (resolved.photoShade) scene.pack.shade.src = resolved.photoShade;
  else scene.pack.shade.hidden = true;
```

`js/flow.js` — the two overhead announcements:
```js
      announce('Looking down into the box: a vacuum-sealed pack, a pile of clothes, and something underneath.');
```
```js
      announce('Looking down into the box: a vacuum-sealed pack and a little book.');
```
(No test checks these texts.)

Delete the old files: `git rm tools/prepare_photo.py assets/photo/vacuum-collage.webp`.

- [ ] **Step 6: Update the e2e tests**

`tests/e2e/assets.spec.js` — in the first test change `'.photo-img'` to `'.pack-img'`; replace the second test with:
```js
test('the vacuum pack and the desiccant packet lie on the box floor', async ({ page }) => {
  const problems = await openSite(page, '?jump=overhead');
  await waitForState(page, 'overhead');
  const loaded = (selector) => page.$eval(selector, (img) => ({ src: img.currentSrc, ok: img.complete && img.naturalWidth > 0 }));
  const pack = await loaded('.pack-img');
  expect(pack.src).toContain('assets/photo/vacuum-pack.webp');
  expect(pack.ok).toBe(true);
  expect((await loaded('.pack-shade')).ok).toBe(true);
  expect(await page.$eval('.pack-edge', (el) => getComputedStyle(el).backgroundImage)).toContain('vacuum-pack.webp');
  await expect(page.locator('.photo-card')).toHaveCount(0);
  const packet = await loaded('.desiccant');
  expect(packet.src).toContain('assets/art/desiccant.webp');
  expect(packet.ok).toBe(true);
  const [packBox, bookBox] = await Promise.all([page.locator('.pack-body').boundingBox(), page.locator('.book3d').boundingBox()]);
  expect(packBox.x + packBox.width).toBeLessThan(bookBox.x + 4); // the pack lies to the left of the booklet
  expect(problems).toEqual([]);
});

test('without its shade overlay the pack still shows, with no broken image', async ({ page }) => {
  await page.route('**/content/site.js', async (route) => {
    const original = await (await route.fetch()).text();
    const body = original.replace("'assets/photo/vacuum-pack-shade.webp'", "'assets/photo/not-made-yet.webp'");
    await route.fulfill({ contentType: 'text/javascript', body });
  });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?jump=overhead');
  await waitForState(page, 'overhead');
  await expect(page.locator('.pack-shade')).toBeHidden();
  expect(await page.$eval('.pack-img', (img) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(errors.join('\n')).toContain('not-made-yet.webp');
});
```
`tests/e2e/journey.spec.js:20` — `.photo-card` → `.pack`.

- [ ] **Step 7: Run unit and affected e2e tests**

Run: `npm test && npx playwright test tests/e2e/assets.spec.js tests/e2e/journey.spec.js --workers=2`
Expected: all pass.

- [ ] **Step 8: Screenshot tool and checkpoint A**

`tools/shots.mjs`:
```js
/**
 * Overhead screenshots, desktop and phone, for checking artwork by eye.
 *
 *   node tools/shots.mjs [base url] [output folder]
 *
 * Defaults: the local server (npm run serve) and ./shots (git-ignored). Also
 * saves a close-up of the vacuum pack.
 */
import { mkdir } from 'node:fs/promises';
import { chromium, devices } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:4173/';
const out = process.argv[3] ?? 'shots';
const VIEWS = [
  ['desktop', { viewport: { width: 1280, height: 800 } }],
  ['phone', devices['Pixel 7']],
];
const padded = ({ x, y, width, height }, by = 30) => ({ x: Math.max(0, x - by), y: Math.max(0, y - by), width: width + 2 * by, height: height + 2 * by });

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [name, options] of VIEWS) {
    const page = await browser.newPage(options);
    await page.goto(new URL('?jump=overhead', base).href);
    await page.waitForFunction(() => window.__parcel?.state === 'overhead', null, { timeout: 20_000 });
    await page.waitForTimeout(1500); // the light comes on
    await page.screenshot({ path: `${out}/${name}-overhead.png` });
    await page.screenshot({ path: `${out}/${name}-pack.png`, clip: padded(await page.locator('.pack-body').boundingBox()) });
    console.log(`${out}/${name}-*.png`, JSON.stringify(await page.evaluate(() => window.__parcel.clothes())));
    await page.close();
  }
} finally {
  await browser.close();
}
```
Append `shots/` to `.gitignore`.

Start the local server if nothing listens on 4173 (`node tools/serve.mjs`, in the background; do not restart a server the owner is running), then run `node tools/shots.mjs`. Check: no white border or tape; film see-through; edge strip leaning on the wall; contact shadow along the joint; drop shadow falls right/down like the cloth's; the pack dims in the dark state (`?jump=dark` if available, otherwise skip).

**Checkpoint A:** show the owner `shots/desktop-overhead.png` and `shots/desktop-pack.png` (paths), ask for changes (film opacity `--film`, edge tilt, shadow strength). Apply any requested change, re-run Steps 7–8.

- [ ] **Step 9: Verify and commit**

Run `/verify`, then:
```bash
git add -A js/scene css/scene.css js/main.js js/flow.js js/cloth/hand.js content/site.js tools/build-pile.mjs tools/shots.mjs .gitignore assets/clothes/pile.json tests tools/prepare_photo.py assets/photo/vacuum-collage.webp
git commit -m "feat: the owner's artwork lies in the box as a vacuum pack

A flat body against the left wall with its seal edge curling up, contact
shadows shaped by the film's own transparency, and a collider the clothes
rest on. The photo card, tape and caption go.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Layout and scale — the pack fills the left, the pile moves upper right, garments fit the figure

*(Spec Revision B: B1, B2 for today's garments, B3's cell, thickness and substeps.)*

**Files:**
- Create: `tools/clothes/__init__.py`, `tools/clothes/fit.py`, `tools/tests/test_fit.py`
- Modify: `js/scene/geometry.js` (`CONTENTS`), `js/scene/parcel.js` (`buildPack`), `css/scene.css` (`.pack*`), `js/main.js` (drop `--pack-src`), `js/cloth/solver.js` (`DEFAULTS.substeps`), `tools/generate_clothes.py` (fit, grid), `tools/build-pile.mjs` (`THICKNESS`, `PLAN`, `fold`, `lay`)
- Output: `assets/clothes/garments.json`, `assets/clothes/*.webp` (same drawings), `assets/clothes/pile.json`
- Test: `tests/unit/geometry.test.js`, `tests/unit/clothes-data.test.js`, `tests/unit/cloth-grip.test.js`, `tests/unit/cloth-solver.test.js`, `tests/e2e/assets.spec.js`

**Interfaces:**
- Consumes: Task 2's `CONTENTS.pack`, `buildPack()`, the static pack collider (stays until Task 8).
- Produces:
  - `CONTENTS.pack = {x: 6, y: 5, width: 181, height: 290, thickness: 4, rotate: 0}` (no `edge`, no `tilt`); `CONTENTS.book = {x: 252, y: 11, width: 96, height: 134, thickness: 8, rotate: 4}`; `CONTENTS.desiccant = {x: 357, y: 205, width: 42, height: 60, thickness: 3, rotate: -12}`.
  - Python `clothes.fit`: `CELL = 6`; `LENGTH: dict[str, float]`; `fit(garment_id, pattern_length) -> float`; `grid_shape(width, height, cell=CELL) -> (cols, rows)`; `cell_grid(alpha, cols, rows, cloth, core=None) -> {cols, rows, cells[, core]}`. Tasks 8 and 10 reuse `cell_grid`.
  - `garments.json`: `spacing: 6`; every record has `size` = pattern size × fit (parcel units) and `pxPerUnit` = PX ÷ fit.
  - `pile.json`: `thickness: 4.5`; `DEFAULTS.substeps = 16`.

- [ ] **Step 1: Write the failing tests**

`tools/clothes/__init__.py`:
```python
"""Drawing and sizing code for the garments (tools/generate_clothes.py)."""
```

`tools/tests/test_fit.py`:
```python
import numpy as np
import pytest

from clothes.fit import CELL, cell_grid, fit, grid_shape


def test_each_garment_is_scaled_to_its_length_on_the_figure():
    assert fit("qipao", 400) * 400 == pytest.approx(158)
    assert fit("ruched-top", 190) == pytest.approx(55 / 190)


def test_a_garment_without_a_figure_length_is_refused():
    with pytest.raises(KeyError, match="LENGTH"):
        fit("ballgown", 100)


def test_no_cell_is_wider_than_CELL():
    assert grid_shape(96, 83) == (16, 14)
    assert grid_shape(75.05, 158) == (13, 27)
    assert 75.05 / 13 <= CELL and 158 / 27 <= CELL


def test_cells_are_equal_divisions_of_the_picture():
    alpha = np.zeros((20, 30))
    alpha[:, :10] = 1  # the left third is opaque
    assert cell_grid(alpha, 3, 2, cloth=0.3)["cells"] == "100100"


def test_core_marks_mostly_opaque_cells_only_when_asked():
    alpha = np.zeros((10, 20))
    alpha[:, :12] = 1  # the right cell is 20 % opaque
    grid = cell_grid(alpha, 2, 1, cloth=0.02, core=0.3)
    assert (grid["cells"], grid["core"]) == ("11", "10")
    assert "core" not in cell_grid(alpha, 2, 1, cloth=0.3)
```

`tests/unit/geometry.test.js` — replace the tests `'pack, booklet and desiccant lie inside the walls without overlapping'` and `"the pack's seal edge curls up to rest on the left wall"` with:
```js
test('pack, booklet and desiccant lie inside the walls without overlapping', () => {
  const inner = { left: 2, right: BOX.width - 2, top: 2, bottom: BOX.depth - 2 };
  const [pack, book, desiccant] = ['pack', 'book', 'desiccant'].map((k) => footprint(CONTENTS[k]));
  [pack, book, desiccant].forEach((b) => {
    assert.ok(b.left >= inner.left && b.right <= inner.right, 'inside the side walls');
    assert.ok(b.top >= inner.top && b.bottom <= inner.bottom, 'inside the front and back walls');
  });
  assert.ok(pack.right < book.left && pack.right < desiccant.left, 'the pack stays clear of the rest');
});

test('the pack lies square along the left wall, the full depth of the box', () => {
  const { x, y, width, height, rotate } = CONTENTS.pack;
  assert.equal(rotate, 0);
  assert.ok(x - 2 <= 6, `${x - 2} units from the left wall`);
  assert.ok(y >= 2 && y + height <= BOX.depth - 2, 'between the back and front walls');
  assert.ok(height >= 0.95 * (BOX.depth - 4), `${height} of ${BOX.depth - 4} units deep`);
  assert.ok(Math.abs(width / height - 747 / 1200) < 0.01, 'the picture keeps its proportions (747 × 1200)');
});

test('the booklet lies in the upper right, where the pile goes', () => {
  const book = footprint(CONTENTS.book);
  assert.ok(book.left >= 195 && book.bottom <= 165, `booklet from x ${book.left.toFixed(0)}, down to y ${book.bottom.toFixed(0)}`);
  assert.deepEqual([CONTENTS.book.width, CONTENTS.book.height], [96, 134], 'the old booklet, smaller, same proportions');
});
```

`tests/unit/clothes-data.test.js` — in the first test change `assert.equal(data.spacing, 10);` to `assert.equal(data.spacing, 6);`; after `EXPECTED` add:
```js
// How long each garment is on the figure in the pack (spec Revision B, B2), in parcel units.
const LENGTH = {
  qipao: 158, blouse: 83, mamianqun: 127, 'tee-white': 83, 'tee-breton': 83, 'slip-skirt': 103, 'ruched-top': 55, 'floral-skirt': 103,
};
```
and append:
```js
test('every garment fits the figure in the pack', async () => {
  const data = await readJson('assets/clothes/garments.json');
  data.garments.filter((g) => g.kind !== 'film').forEach((g) => {
    const target = LENGTH[g.id];
    assert.ok(Math.abs(g.size[1] - target) <= 0.1 * target, `${g.id}: ${g.size[1]} long, the figure wants ${target}`);
    assert.ok(Number.isFinite(g.pxPerUnit) && g.pxPerUnit > 0, `${g.id}.pxPerUnit`);
  });
});

test('simulating everything at once costs no more than the spec allows', async () => {
  const { DEFAULTS } = await import('../../js/cloth/solver.js');
  const data = await readJson('assets/clothes/garments.json');
  const particles = data.garments.map(buildMesh).reduce((sum, m) => sum + m.count, 0);
  // spec B3: within 10 % of 5,000 particles × 10 substeps
  assert.ok(particles * DEFAULTS.substeps <= 55000, `${particles} particles × ${DEFAULTS.substeps} substeps`);
});
```

`tests/unit/cloth-grip.test.js` — the open-floor probes move between the new pack and booklet. In `'nothing to clear over the open floor or the table'`:
```js
  // between the pack and the booklet, more than the hand's reach from either
  assert.equal(supportHeight(noCloth, colliders, 220, 60), 0);
```
and replace the whole `'other cloth underneath counts; the held garment itself does not'` test with:
```js
test('other cloth underneath counts; the held garment itself does not', () => {
  const world = { count: 2, pos: new Float32Array([220, 60, 40, 223, 60, 90]), garmentOf: new Uint16Array([0, 1]), thickness: 7.5 };
  assert.ok(near(supportHeight(world, colliders, 220, 60), 90 + 7.5));
  assert.ok(near(supportHeight(world, colliders, 220, 60, { skip: 1 }), 40 + 7.5));
  assert.equal(supportHeight(world, colliders, 220, 120), 0, 'too far away to matter');
});
```

`tests/unit/cloth-solver.test.js` — append:
```js
test("at the pile's thickness, a held garment keeps up with a pointer moving 430 units a second", () => {
  const mesh = sheet(4, 4);
  const w = createWorld({ garments: [{ mesh, material }], bounds, thickness: 4.5 });
  grab(w, 0, [0], [0, 0, 20]);
  for (let f = 1; f <= 30; f += 1) {
    moveGrip(w, [(430 * f) / 60, 0, 20]);
    step(w, 1 / 60);
  }
  assert.ok(Math.abs(w.grip.from[0] - 215) < 1, `the hand is at x = ${w.grip.from[0].toFixed(1)}, the pointer at 215`);
});
```

`tests/e2e/assets.spec.js` — in `'the vacuum pack and the desiccant packet lie on the box floor'` delete the line that reads `.pack-edge`'s `backgroundImage` (the strip goes).

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:py 2>&1 | tail -3; npm test 2>&1 | grep -E '^not ok|^# (pass|fail)'`
Expected: Python FAIL — `No module named 'clothes.fit'`. Node FAIL — the pack is 135 wide; the booklet 164 × 228; `spacing` is 10; garments are 2.5–3.5 × too long; supportHeight at (220, 60) is the booklet's top; the hand reaches x ≈ 135, not 215. The cost test already passes (today: 4,365 × 10); it guards Tasks 8–14.

- [ ] **Step 3: The new places (`js/scene/geometry.js`)**

```js
/** Things lying on the floor of the box, in floor coordinates. */
export const CONTENTS = Object.freeze({
  // The owner's vacuum pack, flat along the left wall, the full depth of the box.
  pack: Object.freeze({ x: 6, y: 5, width: 181, height: 290, thickness: 4, rotate: 0 }),
  // The booklet, upper right, where the clothes pile hides it.
  book: Object.freeze({ x: 252, y: 11, width: 96, height: 134, thickness: 8, rotate: 4 }),
  desiccant: Object.freeze({ x: 357, y: 205, width: 42, height: 60, thickness: 3, rotate: -12 }),
});
```

- [ ] **Step 4: The pack lies flat (`js/scene/parcel.js`, `css/scene.css`, `js/main.js`)**

`js/scene/parcel.js` — replace `buildPack`:
```js
/** The owner's vacuum pack, lying flat along the left wall. */
function buildPack() {
  const { x, y, width, height, thickness, rotate } = CONTENTS.pack;
  const pack = h('div', 'pack');
  pack.style.cssText = `left:${x}px;top:${y}px;width:${width}px;height:${height}px;--rot:${rotate}deg;--thick:${thickness}px`;
  const img = h('img', 'pack-img', { alt: '', draggable: 'false' });
  const shade = h('img', 'pack-shade', { alt: '', draggable: 'false', 'aria-hidden': 'true' });
  const body = h('div', 'pack-body');
  body.append(img, shade);
  pack.append(body);
  return { el: pack, img, shade };
}
```

`css/scene.css` — replace everything from the comment `/* The owner's vacuum pack: a flat body, its seal edge curling up the left wall. */` through the end of the `.pack-joint { … }` rule with:
```css
/* The owner's vacuum pack, lying flat along the left wall. */
.pack {
  position: absolute;
  transform-style: preserve-3d;
  transform: rotate(var(--rot));
  pointer-events: none;
}
.pack-body {
  position: absolute; inset: 0;
  transform: translateZ(var(--thick));
  /* Falls away from the light (+x, +y) like the cloth's shadows. The image's own
     alpha shapes it: the clear film casts a faint shadow, the contents a firm one. */
  filter: drop-shadow(2px 3px 2.5px rgba(30, 18, 8, .42)) brightness(calc(1 - (1 - var(--light, 1)) * .95));
}
.pack-img, .pack-shade { position: absolute; inset: 0; width: 100%; height: 100%; }
```

`js/main.js` — delete the line `scene.pack.el.style.setProperty('--pack-src', cssUrl(resolved.photo));` (only the edge strip read it).

- [ ] **Step 5: Garments the figure's size (`tools/clothes/fit.py`, `tools/generate_clothes.py`)**

`tools/clothes/fit.py`:
```python
"""Garment scale: every garment is sized to fit the figure in the owner's pack.

Garments are drawn in pattern units; `fit` scales a pattern to the figure
(spec Revision B, B2). Whatever the fit, the cloth grid is cut at no more
than CELL parcel units, in equal divisions of the garment, because
js/cloth/mesh.js spaces particles size / cols apart.
"""

from __future__ import annotations

import math

import numpy as np

CELL = 6  # parcel units per cloth cell, at most

# How long each garment is, in parcel units, measured on the figure in the pack
# (head to sole ≈ 248 units in the 290-unit pack).
LENGTH = {
    "qipao": 158,  # shoulder → mid-calf
    "blouse": 83,  # shoulder → hip
    "mamianqun": 127,  # waist → ankle
    "tee-white": 83,  # shoulder → hip
    "tee-breton": 83,  # shoulder → hip
    "slip-skirt": 103,  # waist → mid-calf
    "ruched-top": 55,  # shoulder → waist: cropped, like the one in the photo
    "floral-skirt": 103,  # waist → mid-calf
}


def fit(garment_id: str, pattern_length: float) -> float:
    """Scale from pattern units to parcel units for a garment drawn `pattern_length` long."""
    if garment_id not in LENGTH:
        raise KeyError(f"no figure length for {garment_id!r}; add one to LENGTH")
    return LENGTH[garment_id] / pattern_length


def grid_shape(width: float, height: float, cell: float = CELL) -> tuple[int, int]:
    """Cells across and down for a body `width` × `height` parcel units, none wider than `cell`."""
    return math.ceil(width / cell), math.ceil(height / cell)


def cell_grid(alpha: np.ndarray, cols: int, rows: int, cloth: float, core: float | None = None) -> dict:
    """Cut an opacity image (0…1) into cols × rows equal cells: cloth where the mean
    opacity reaches `cloth`; core (it hides what lies under it) where it reaches `core`."""
    height, width = alpha.shape
    cells, cores = [], []
    for j in range(rows):
        y0, y1 = round(j * height / rows), round((j + 1) * height / rows)
        for i in range(cols):
            x0, x1 = round(i * width / cols), round((i + 1) * width / cols)
            share = float(alpha[y0:y1, x0:x1].mean()) if y1 > y0 and x1 > x0 else 0.0
            cells.append("1" if share >= cloth else "0")
            cores.append("1" if core is not None and share >= core else "0")
    grid = {"cols": cols, "rows": rows, "cells": "".join(cells)}
    if core is not None:
        grid["core"] = "".join(cores)
    return grid
```

`tools/generate_clothes.py` (today's generator; Task 10 rewrites it):
- In the module docstring, "its size in parcel units" → "its size in parcel units (fitted to the figure in the owner's pack)".
- After the imports add:
```python
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))  # run as a script: make `clothes` importable
from clothes.fit import CELL, cell_grid, fit, grid_shape  # noqa: E402
```
- Delete `SPACING = 10 …`; change the `PX` comment to `# texture pixels per pattern unit`.
- Replace `Canvas.finish` and delete `coverage_grid`:
```python
    def finish(self, path: Path, cols: int, rows: int) -> tuple[Image.Image, dict]:
        final = self.image.resize((round(self.w * PX), round(self.h * PX)), Image.LANCZOS)
        final.save(path, "WEBP", quality=82, method=6)
        alpha = np.asarray(final.getchannel("A"), dtype=np.float32) / 255
        return final, cell_grid(alpha, cols, rows, cloth=COVER)
```
- In `main()`, replace the loop body's sizing and the record, and the data line:
```python
    for g in GARMENTS:
        scale = fit(g.id, g.size[1])
        size = [round(g.size[0] * scale, 2), round(g.size[1] * scale, 2)]
        canvas = Canvas(*g.size, seed=f"garment:{g.id}")
        g.draw(canvas)
        path = OUT / f"{g.id}.webp"
        image, grid = canvas.finish(path, *grid_shape(*size))
        records.append({
            "id": g.id,
            "label": g.label,
            "texture": path.relative_to(ROOT).as_posix(),
            "pxPerUnit": round(PX / scale, 4),
            "size": size,
            "grid": grid,
            "material": g.material,
        })
```
```python
    data = {"spacing": CELL, "pxPerUnit": PX, "garments": records}
```
(the `print` line stays).

- [ ] **Step 6: Finer steps (`js/cloth/solver.js`)**

In `DEFAULTS`:
```js
  substeps: 16, // with travel 0.1 and the pile's 4.5 thickness, held cloth follows the pointer at up to 430 units/s
```

- [ ] **Step 7: The pile in the upper right (`tools/build-pile.mjs`)**

Constants:
```js
const THICKNESS = 4.5; // cells of at most 6: covers the 4.2-unit gap in the middle of a cell
```
```js
const JITTER = { turn: 16, shift: 6 }; // degrees and units of random variation per seed
const DROP_GAP = 12; // each garment is dropped this far above the pile so far
```
Replace the `PLAN` comment and value:
```js
/**
 * Bottom to top, over the booklet in the upper right. fold: [axis, at, keep]
 * folds everything beyond the line axis = at — a share of the garment's
 * width for 'x', of its length for 'y' — back over the near side; keep
 * 'low' keeps the side below `at`. turn in degrees, centre in parcel units.
 */
const PLAN = [
  { id: 'mamianqun', folds: [['x', 0.5, 'low']], turn: 84, centre: [306, 101] },
  { id: 'tee-breton', folds: [['x', 0.24, 'high'], ['x', 0.76, 'low']], turn: -8, centre: [300, 59] },
  { id: 'slip-skirt', folds: [['y', 0.55, 'low']], turn: 100, centre: [319, 105] },
  { id: 'qipao', folds: [['y', 0.5, 'low']], turn: 70, centre: [294, 78] },
  { id: 'tee-white', folds: [['x', 0.24, 'high'], ['x', 0.76, 'low']], turn: 18, centre: [309, 66] },
  { id: 'blouse', folds: [['x', 0.27, 'high'], ['x', 0.73, 'low']], turn: -24, centre: [291, 105] },
  { id: 'floral-skirt', folds: [['y', 0.5, 'low']], turn: -66, centre: [329, 80] },
  { id: 'ruched-top', folds: [], turn: 28, centre: [284, 66] },
];
```
`fold` takes the garment's size and reads `at` as a share of it:
```js
/** Fold flat positions over a line (see PLAN); the folded part lies one layer higher. */
function fold(positions, [axis, at, keep], size) {
  const k = axis === 'x' ? 0 : 1;
  const line = at * size[k];
  const out = Float32Array.from(positions);
  for (let i = 0; i < out.length; i += 3) {
    const v = out[i + k];
    const far = keep === 'low' ? v > line : v < line;
    if (far) {
      out[i + k] = 2 * line - v;
      out[i + 2] += THICKNESS;
    }
  }
  return out;
}
```
In `lay`, take `size` as a fifth parameter, fold with `folds.reduce((p, f) => fold(p, f, size), mesh.rest)`, and use `JITTER.turn` and `JITTER.shift` in place of the literal `16` and `20`. In `buildPile`, drop with `lay(meshes[g], placement, highestPoint(world) + DROP_GAP, rand, garments[g].size)`. Update the file comment: "dropped onto the booklet in the upper right".

- [ ] **Step 8: Redraw the records and settle the pile**

Run: `npm run clothes`
Expected: eight garment lines (same pixel sizes as before), then `seed N: booklet ≥88 % hidden, pack ≤20 % covered` and `wrote assets/clothes/pile.json`. If no seed passes, read the per-seed log: low booklet cover → move centres toward (300, 78); pack covered → move the leftmost centres right by 6.

- [ ] **Step 9: Run every test**

Run: `npm run test:py 2>&1 | tail -2 && npm test 2>&1 | tail -8`
Expected: all pass. A `cloth-hand` test that fails only because its 60-unit sheet now starts inside the booklet or the pack (check the failing test's `scene(x, y)` against `CONTENTS`) gets the clear spot `scene(217, 76)`; ledger that as a ruling.

Run: `npx playwright test --workers=2`
Expected: all pass. The clearing journeys move smaller garments now; `clearWithMouse` allows 16 drags — if a journey runs out, ledger the count it needed and raise the limit to 24.

- [ ] **Step 10: Look at it**

Run `node tools/shots.mjs`. Check `shots/desktop-overhead.png` and `shots/phone-overhead.png`: the pack runs the full depth along the left wall, flat, no strip on the wall; the pile sits in the upper right and hides the booklet; garments are about the figure's size; the lower right is bare floor (the books come next).

- [ ] **Step 11: Verify and commit**

Run `/verify`, then:
```bash
git add js/scene/geometry.js js/scene/parcel.js css/scene.css js/main.js js/cloth/solver.js tools/clothes tools/generate_clothes.py tools/build-pile.mjs tools/tests/test_fit.py assets/clothes tests/unit tests/e2e/assets.spec.js
git commit -m "feat: the pack fills the left, the pile moves upper right, garments fit the figure

The pack lies flat along the left wall, the full depth of the box. Every
garment is scaled to its length on the figure in the pack and simulated on
a 6-unit grid with 16 substeps; the pile settles over a smaller booklet.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The owner's books in the lower right

*(Spec Revision B: B5; checkpoint A′.)*

**Files:**
- Create: `tools/generate_books.py`, `tools/tests/test_generate_books.py`, `assets/books/hunter-x-hunter.webp`, `assets/books/dictionary.webp`, `assets/books/solitude.webp`, `assets/books/siddhartha.webp`
- Modify: `js/scene/geometry.js` (`BOOKS`, `baseOf`, the desiccant's `on`), `js/scene/solids.js` (book colliders; the desiccant's base), `js/scene/parcel.js` (`buildTome`; the desiccant's base; `books` in the result), `css/scene.css` (`.tome*`; `.desiccant`), `content/site.js` (`books`), `js/main.js` (`imagePlan`; covers), `js/flow.js` (announcements), `package.json` (`books` script)
- Test: `tests/unit/geometry.test.js`, `tests/unit/solids.test.js`, `tests/e2e/assets.spec.js`

**Interfaces:**
- Consumes: `CONTENTS` (Task 3); the booklet's block CSS (`.book-edge`, `.book-shadow`), which reads `--bw`, `--bh`, `--bt`.
- Produces: `BOOKS: {id, x, y, width, height, thickness, rotate, on?}[]` with ids `dictionary`, `hunter-x-hunter`, `solitude`, `siddhartha`; `CONTENTS.desiccant.on = 'siddhartha'`; `baseOf(item) -> number`; one collider per book, named by its id (15 colliders until Task 8); `buildParcel()` returns `books: Record<id, {el, cover}>`; `config.books: {id, cover, alt}[]`; preload keys `book:<id>`.

- [ ] **Step 1: Write the failing tests**

`tools/tests/test_generate_books.py`:
```python
import numpy as np
from PIL import Image

import generate_books as gb

OWNER = {  # as the owner wrote them
    "hunter-x-hunter": ("Hunter × Hunter", ""),
    "dictionary": ("German-Chinese dictionary", ""),
    "solitude": ("One Hundred Years of Solitude", "Gabriel García Márquez"),
    "siddhartha": ("Siddhartha", "Hermann Hesse"),
}


def test_titles_and_authors_are_as_the_owner_wrote_them():
    assert {b.id: (b.title, b.author) for b in gb.BOOKS} == OWNER


def test_the_cover_lines_spell_the_title_and_nothing_else():
    for b in gb.BOOKS:
        assert " ".join(b.lines) == b.title


def test_sizes_match_the_books_in_the_box():
    # BOOKS in js/scene/geometry.js, width × height in parcel units
    assert {b.id: b.size for b in gb.BOOKS} == {
        "hunter-x-hunter": (50, 78), "dictionary": (70, 96), "solitude": (58, 88), "siddhartha": (56, 86)}


def test_a_cover_is_drawn_at_PX_per_unit_and_is_not_a_blank():
    for b in gb.BOOKS:
        img = gb.cover(b)
        assert img.size == (b.size[0] * gb.PX, b.size[1] * gb.PX)
        assert np.asarray(img.convert("L"), np.float32).std() > 12, f"{b.id}: no lettering"


def test_text_shrinks_until_it_fits():
    font = gb.fit_font("One Hundred Years of Solitude", gb.BOLD, 120, 60)
    assert font.getlength("One Hundred Years of Solitude") <= 120


def test_the_same_book_draws_the_same_cover():
    b = gb.BOOKS[0]
    assert np.array_equal(np.asarray(gb.cover(b)), np.asarray(gb.cover(b)))


def test_cli_writes_one_cover_per_book(tmp_path):
    assert gb.main([str(tmp_path)]) == 0
    for b in gb.BOOKS:
        assert Image.open(tmp_path / f"{b.id}.webp").size == (b.size[0] * gb.PX, b.size[1] * gb.PX)
```

`tests/unit/geometry.test.js` — import `BOOKS` and `baseOf` alongside `BOX` and `CONTENTS`; after `footprint` add:
```js
/** Corners of a rotated rectangle lying on the floor, as [x, y]. */
const corners = ({ x, y, width, height, rotate }) => {
  const a = (rotate * Math.PI) / 180;
  const [cx, cy] = [x + width / 2, y + height / 2];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => {
    const [u, v] = [(s * width) / 2, (t * height) / 2];
    return [cx + u * Math.cos(a) - v * Math.sin(a), cy + u * Math.sin(a) + v * Math.cos(a)];
  });
};
/** A floor point in a rectangle's own frame: (0, 0) at its top-left corner. */
const local = ([px, py], { x, y, width, height, rotate }) => {
  const a = (-rotate * Math.PI) / 180;
  const [dx, dy] = [px - x - width / 2, py - y - height / 2];
  return [dx * Math.cos(a) - dy * Math.sin(a) + width / 2, dx * Math.sin(a) + dy * Math.cos(a) + height / 2];
};
/** Do two rotated rectangles overlap (separating axis test)? */
const overlaps = (p, q) => {
  const [a, b] = [corners(p), corners(q)];
  return [a, b].every((shape) => shape.every((c, i) => {
    const next = shape[(i + 1) % 4];
    const axis = [c[1] - next[1], next[0] - c[0]];
    const span = (pts) => pts.map(([x, y]) => x * axis[0] + y * axis[1]);
    const [sa, sb] = [span(a), span(b)];
    return Math.max(...sa) >= Math.min(...sb) && Math.max(...sb) >= Math.min(...sa);
  }));
};
```
and append:
```js
test('the books lie in the lower-right quarter, on the floor or on another book', () => {
  BOOKS.forEach((b) => {
    const f = footprint(b);
    assert.ok(f.left >= 195 && f.right <= BOX.width - 2 && f.top >= 158 && f.bottom <= BOX.depth - 2, `${b.id} in the lower right`);
  });
  const onFloor = [{ ...CONTENTS.book, id: 'booklet' }, { ...CONTENTS.pack, id: 'pack' }, ...BOOKS.filter((b) => !b.on)];
  onFloor.forEach((a, i) => onFloor.slice(i + 1).forEach((b) => assert.ok(!overlaps(a, b), `${a.id} and ${b.id} overlap`)));
});

test('what lies on a book lies within its cover, at its height', () => {
  [...BOOKS.filter((b) => b.on), { ...CONTENTS.desiccant, id: 'desiccant' }].forEach((item) => {
    const below = BOOKS.find((b) => b.id === item.on);
    corners(item).forEach((p) => {
      const [u, v] = local(p, below);
      assert.ok(u >= 0 && u <= below.width && v >= 0 && v <= below.height, `${item.id} lies on ${below.id}`);
    });
    assert.equal(baseOf(item), baseOf(below) + below.thickness);
  });
  assert.equal(baseOf(CONTENTS.book), 0);
  assert.throws(() => baseOf({ on: 'nowhere' }), /nowhere/);
});
```

`tests/unit/solids.test.js` — import `BOOKS`, `baseOf` and `CONTENTS` from geometry; in the collider-count test change the title to `'colliders: 4 walls, 4 open flaps, the booklet, the desiccant, the pack and four books, each a proper box'` and the count to `15`; in the occluder test use `1 + 15 * 6`; append:
```js
test('each book is a collider resting on the floor or on the book beneath it', () => {
  const colliders = boxColliders();
  BOOKS.forEach((b) => {
    const c = colliders.find((k) => k.name === b.id);
    near(c.center[0], b.x + b.width / 2);
    near(c.center[1], b.y + b.height / 2);
    near(c.center[2] - c.half[2], baseOf(b));
    near(c.half[2] * 2, b.thickness);
  });
  const desiccant = colliders.find((k) => k.name === 'desiccant');
  near(desiccant.center[2] - desiccant.half[2], baseOf(CONTENTS.desiccant));
});
```

`tests/e2e/assets.spec.js` — append:
```js
test("the owner's books lie in the box with their covers", async ({ page }) => {
  const problems = await openSite(page, '?jump=overhead');
  await waitForState(page, 'overhead');
  const covers = await page.$$eval('.tome-cover', (imgs) => imgs.map((img) => ({
    book: img.closest('.tome').dataset.book, alt: img.alt, ok: img.complete && img.naturalWidth > 0,
  })));
  expect(covers.map((c) => c.book).sort()).toEqual(['dictionary', 'hunter-x-hunter', 'siddhartha', 'solitude']);
  covers.forEach((c) => expect(c.ok, c.book).toBe(true));
  const alts = covers.map((c) => c.alt).join(' | ');
  ['Hunter × Hunter', 'German-Chinese dictionary', 'One Hundred Years of Solitude', 'Gabriel García Márquez', 'Siddhartha', 'Hermann Hesse']
    .forEach((title) => expect(alts).toContain(title));
  expect(problems).toEqual([]);
});

test('a book whose cover is missing still lies there, plain, without a broken image', async ({ page }) => {
  await page.route('**/assets/books/solitude.webp', (route) => route.fulfill({ status: 404, body: '' }));
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?jump=overhead');
  await waitForState(page, 'overhead');
  await expect(page.locator('.tome[data-book="solitude"]')).toBeVisible();
  await expect(page.locator('.tome[data-book="solitude"] .tome-cover')).toBeHidden();
  expect(errors.join('\n')).toContain('solitude.webp');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:py 2>&1 | tail -3; npm test 2>&1 | grep -E '^not ok|^# (pass|fail)'`
Expected: Python FAIL — `No module named 'generate_books'`. Node FAIL — `BOOKS` and `baseOf` are not exported; 11 colliders, not 15.

- [ ] **Step 3: The cover generator (`tools/generate_books.py`)**

```python
"""Covers for the owner's books, lying in the lower right of the box.

    python tools/generate_books.py [out]        (default: assets/books; or npm run books)

Plain typographic covers drawn in code: the titles exactly as the owner wrote
them, in the site's open-licensed fonts (assets/fonts, SIL OFL). No publisher
names, logos or cover art. Sizes match BOOKS in js/scene/geometry.js.
"""

from __future__ import annotations

import argparse
import sys
import zlib
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "assets" / "fonts"
BOLD = FONTS / "noto-sans-latin-700-normal.woff2"
REGULAR = FONTS / "noto-sans-latin-400-normal.woff2"
PX = 8  # cover pixels per parcel unit: the titles stay sharp on a dense screen
MARGIN = 0.12  # share of the cover's width kept clear on each side of the lettering
LEADING = 1.12  # line height, as a multiple of the type size


@dataclass(frozen=True)
class Book:
    id: str
    title: str
    author: str  # '' when the owner named none
    size: tuple[int, int]  # parcel units, as BOOKS in js/scene/geometry.js
    lines: tuple[str, ...]  # how the title breaks on the cover; joined with spaces they are the title
    ground: str  # the cover's colour
    ink: str  # the lettering's colour
    panel: str | None = None  # a band or label behind the title...
    panel_box: tuple[float, float, float, float] = (0, 0, 1, 1)  # ...its left, top, right, bottom as shares of the cover
    title_top: float = 0.14  # where the title starts, as a share of the height
    largest: float = 0.2  # the biggest the title may be set, as a share of the cover's width
    rules: tuple[float, ...] = ()  # heights of thin rules in the panel's colour, as shares of the height
    grain: float = 5.0  # strength of the paper or cloth texture, in levels


BOOKS = (
    Book("hunter-x-hunter", "Hunter × Hunter", "", (50, 78), ("Hunter", "×", "Hunter"),
         ground="#f3efe6", ink="#ffffff", panel="#2e8b57", panel_box=(0, 0.08, 1, 0.6),
         title_top=0.12, largest=0.18, rules=(0.9,)),
    Book("dictionary", "German-Chinese dictionary", "", (70, 96), ("German-Chinese", "dictionary"),
         ground="#1f2c47", ink="#1f2c47", panel="#efe5cc", panel_box=(0.14, 0.2, 0.86, 0.46),
         title_top=0.28, largest=0.11, rules=(0.12, 0.88), grain=9.0),
    Book("solitude", "One Hundred Years of Solitude", "Gabriel García Márquez", (58, 88),
         ("One Hundred", "Years of", "Solitude"), ground="#d9a23a", ink="#3b2414",
         title_top=0.12, largest=0.16, rules=(0.7,)),
    Book("siddhartha", "Siddhartha", "Hermann Hesse", (56, 86), ("Siddhartha",),
         ground="#2f5d62", ink="#f1e8d6", title_top=0.3, largest=0.2, rules=(0.24, 0.42)),
)


def fit_font(text: str, path: Path, width: float, largest: int) -> ImageFont.FreeTypeFont:
    """The font at the largest size, up to `largest` px, at which `text` fits `width` px."""
    for size in range(largest, 5, -1):
        font = ImageFont.truetype(str(path), size)
        if font.getlength(text) <= width:
            return font
    return ImageFont.truetype(str(path), 6)


def textured(img: Image.Image, seed: str, strength: float) -> Image.Image:
    """Fine, even paper or cloth grain, the same for the same book every time."""
    rng = np.random.default_rng(zlib.crc32(seed.encode()))
    noise = rng.normal(0, strength, (img.height, img.width, 1))
    return Image.fromarray(np.clip(np.asarray(img, np.float32) + noise, 0, 255).astype(np.uint8))


def cover(book: Book) -> Image.Image:
    """The book's front cover at PX pixels per unit: ground, panel, title, author."""
    w, h = book.size[0] * PX, book.size[1] * PX
    img = Image.new("RGB", (w, h), book.ground)
    draw = ImageDraw.Draw(img)
    left, top, right, bottom = book.panel_box
    if book.panel:
        draw.rectangle([left * w, top * h, right * w, bottom * h], fill=book.panel)
    rule = book.panel or book.ink
    for y in book.rules:
        draw.rectangle([MARGIN * w, y * h - 0.6 * PX, (1 - MARGIN) * w, y * h + 0.6 * PX], fill=rule)
    room = ((right - left) - 2 * MARGIN) * w if book.panel else (1 - 2 * MARGIN) * w
    size = min(fit_font(line, BOLD, room, round(book.largest * w)).size for line in book.lines)
    font = ImageFont.truetype(str(BOLD), size)
    y = book.title_top * h
    for line in book.lines:
        draw.text((w / 2, y), line, font=font, fill=book.ink, anchor="ma")
        y += size * LEADING
    if book.author:
        byline = fit_font(book.author, REGULAR, (1 - 2 * MARGIN) * w, round(size * 0.5))
        draw.text((w / 2, 0.86 * h), book.author, font=byline, fill=book.ink, anchor="ma")
    return textured(img, f"book:{book.id}", book.grain)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("out", nargs="?", default=str(ROOT / "assets" / "books"))
    out = Path(parser.parse_args(argv).out)
    out.mkdir(parents=True, exist_ok=True)
    for book in BOOKS:
        path = out / f"{book.id}.webp"
        cover(book).save(path, "WEBP", quality=88, method=6)
        print(f"{path}: {book.size[0] * PX} x {book.size[1] * PX}, {path.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

`package.json` scripts — add `"books": "python tools/generate_books.py",` after `"clothes"`.

Run: `npm run books`
Expected: four lines, e.g. `assets/books/dictionary.webp: 560 x 768, NN KB`.

- [ ] **Step 4: Run the Python tests**

Run: `npm run test:py 2>&1 | tail -2`
Expected: all pass.

- [ ] **Step 5: The books in the scene (`js/scene/geometry.js`, `js/scene/solids.js`)**

`js/scene/geometry.js` — in `CONTENTS`, the desiccant now lies on a book:
```js
  desiccant: Object.freeze({ x: 357, y: 205, width: 42, height: 60, thickness: 3, rotate: -12, on: 'siddhartha' }),
```
and after `CONTENTS`:
```js
/**
 * The owner's books, lying in the lower right (tools/generate_books.py draws
 * their covers). `on` names the book an item lies on; otherwise it lies on
 * the floor.
 */
export const BOOKS = Object.freeze([
  Object.freeze({ id: 'dictionary', x: 202, y: 184, width: 70, height: 96, thickness: 20, rotate: -6 }),
  Object.freeze({ id: 'hunter-x-hunter', x: 212, y: 192, width: 50, height: 78, thickness: 7, rotate: 7, on: 'dictionary' }),
  Object.freeze({ id: 'solitude', x: 282, y: 174, width: 58, height: 88, thickness: 10, rotate: 4 }),
  Object.freeze({ id: 'siddhartha', x: 352, y: 190, width: 56, height: 86, thickness: 8, rotate: -5 }),
]);

/** Height of the surface an item lies on: the top of the book its `on` names, or the floor. */
export function baseOf({ on }) {
  if (!on) return 0;
  const below = BOOKS.find((b) => b.id === on);
  if (!below) throw new Error(`nothing called "${on}" to lie on`);
  return baseOf(below) + below.thickness;
}
```

`js/scene/solids.js` — import `BOOKS` and `baseOf`; in `boxColliders()`:
```js
    floorItemCollider('desiccant', CONTENTS.desiccant, baseOf(CONTENTS.desiccant)),
    floorItemCollider('pack', CONTENTS.pack, 0),
    ...BOOKS.map((b) => floorItemCollider(b.id, b, baseOf(b))),
```
and its comment: "Oriented boxes for the walls, the open flaps, the booklet, the desiccant, the pack and the books."

Run: `npm test 2>&1 | tail -8`
Expected: all pass.

- [ ] **Step 6: Blocks and covers (`js/scene/parcel.js`, `css/scene.css`)**

`js/scene/parcel.js` — import `BOOKS` and `baseOf`. In `buildDesiccant`, add `;--base:${baseOf(CONTENTS.desiccant)}px` to its `cssText`. Add after it:
```js
/** One of the owner's books: a block like the booklet, its cover on top. */
function buildTome({ id, x, y, width, height, thickness, rotate, ...item }) {
  const tome = h('div', 'tome', { 'data-book': id });
  tome.style.cssText = `left:${x}px;top:${y}px;--bw:${width};--bh:${height};--bt:${thickness};`
    + `--rot:${rotate}deg;--base:${baseOf(item)}px`;
  const cover = h('img', 'tome-cover', { alt: '', draggable: 'false' });
  tome.append(
    h('div', 'book-shadow'),
    ...['front', 'back', 'right'].map((s) => h('div', `book-edge pages ${s} inside`)),
    h('div', 'book-edge spine left inside'),
    cover,
  );
  return { el: tome, cover };
}
```
In `buildParcel`:
```js
  const books = Object.fromEntries(BOOKS.map((b) => [b.id, buildTome(b)]));
  const contents = h('div', 'contents');
  contents.append(pack.el, ...Object.values(books).map((t) => t.el), desiccant, book.el);
```
and add `books` to the returned object.

`css/scene.css` — the desiccant rides on its book:
```css
  transform: translateZ(calc(var(--base, 0px) + 1.2px)) rotate(var(--rot));
```
(replacing its `translateZ(1.2px) rotate(var(--rot))`), and after the `.book-title` rule:
```css
/* The owner's books, lower right: blocks like the booklet, covers from tools/generate_books.py. */
.tome {
  position: absolute;
  width: calc(var(--bw) * 1px); height: calc(var(--bh) * 1px);
  transform-style: preserve-3d;
  transform: translateZ(var(--base)) rotate(var(--rot));
  pointer-events: none;
}
.tome .book-shadow { transform: translate3d(4px, 6px, .2px); filter: blur(4px); }
.tome .book-edge.spine { background: var(--board); }
.tome-cover {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  transform: translateZ(calc(var(--bt) * 1px));
  border-radius: 1px 2px 2px 1px;
  background: var(--board); /* shows when the cover image is missing */
  filter: brightness(calc(1 - (1 - var(--light, 1)) * .95));
}
/* board colours match the covers' grounds in tools/generate_books.py */
.tome[data-book="hunter-x-hunter"] { --board: #f3efe6; }
.tome[data-book="dictionary"] { --board: #1f2c47; }
.tome[data-book="solitude"] { --board: #d9a23a; }
.tome[data-book="siddhartha"] { --board: #2f5d62; }
```

- [ ] **Step 7: Covers and words (`content/site.js`, `js/main.js`, `js/flow.js`)**

`content/site.js` — after `photo`:
```js
  /** Books you like, lying in the lower right of the box (tools/generate_books.py draws the covers). */
  books: [
    { id: 'hunter-x-hunter', cover: 'assets/books/hunter-x-hunter.webp', alt: 'Hunter × Hunter, a manga volume' },
    { id: 'dictionary', cover: 'assets/books/dictionary.webp', alt: 'A German-Chinese dictionary' },
    { id: 'solitude', cover: 'assets/books/solitude.webp', alt: 'One Hundred Years of Solitude, by Gabriel García Márquez' },
    { id: 'siddhartha', cover: 'assets/books/siddhartha.webp', alt: 'Siddhartha, by Hermann Hesse' },
  ],
```

`js/main.js` — in `imagePlan`, after the `extras` array is built:
```js
  extras.push(...(config.books ?? []).map(({ id, cover }) => ({ key: `book:${id}`, src: cover })));
```
After `scene.desiccant.src = resolved.desiccant;`:
```js
  (config.books ?? []).forEach(({ id, alt }) => {
    const tome = scene.books[id];
    if (!tome) {
      console.warn(`[parcel] content/site.js lists a book "${id}" that the box has no place for.`);
      return;
    }
    tome.cover.alt = alt;
    if (resolved[`book:${id}`]) tome.cover.src = resolved[`book:${id}`];
    else tome.cover.hidden = true; // the block keeps its board colour
  });
```

`js/flow.js` — the two overhead announcements:
```js
      announce('Looking down into the box: a vacuum-sealed pack, a pile of clothes, some books, and something underneath.');
```
```js
      announce('Looking down into the box: a vacuum-sealed pack, a few books and a little booklet.');
```

- [ ] **Step 8: Run every test**

Run: `npm test 2>&1 | tail -8 && npx playwright test --workers=2`
Expected: all pass, including the two book tests.

- [ ] **Step 9: Verify and commit**

Run `/verify`, then:
```bash
git add tools/generate_books.py tools/tests/test_generate_books.py assets/books package.json js/scene css/scene.css content/site.js js/main.js js/flow.js tests/unit/geometry.test.js tests/unit/solids.test.js tests/e2e/assets.spec.js
git commit -m "feat: the owner's books lie in the lower right of the box

Four blocks with typographic covers drawn in code — Hunter × Hunter, a
German-Chinese dictionary, One Hundred Years of Solitude and Siddhartha —
the manga on the dictionary, the desiccant on Siddhartha. Clothes rest on
them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 10: Checkpoint A′ — show the owner**

Run `node tools/shots.mjs`; also save each cover flat (not committed):
```bash
python -c "from PIL import Image; ims=[Image.open(f'assets/books/{n}.webp') for n in ('hunter-x-hunter','dictionary','solitude','siddhartha')]; H=600; row=[im.resize((round(im.width*H/im.height),H)) for im in ims]; out=Image.new('RGB',(sum(i.width for i in row)+30*(len(row)-1),H),(214,186,142)); x=0
for i in row: out.paste(i,(x,0)); x+=i.width+30
out.save('shots/books.png')"
```
Show the owner `shots/desktop-overhead.png`, `shots/phone-overhead.png` and `shots/books.png`. Ask about the layout (pack, pile, books), the garments' size and the covers (colours, lettering). Apply changes, re-run Steps 8–9 (new commits), and continue only once the owner approves.

---

### Task 5: Core cells — a transparent margin never hides the booklet

**Files:**
- Modify: `js/cloth/mesh.js` (`validate`, `buildMesh`), `js/cloth/solver.js` (`createWorld`), `js/cloth/coverage.js` (`bookCoverage`)
- Test: `tests/unit/cloth-mesh.test.js`, `tests/unit/cloth-solver.test.js`, `tests/unit/cloth-coverage.test.js`

**Interfaces:**
- Consumes: `garments.json` grids may carry `grid.core` (same length as `cells`, only where `cells` is `1`); absent → every cell is core.
- Produces: `mesh.core: Uint8Array(count)` (1 = touches a core cell); `world.core: Uint8Array(world.count)`; `bookCoverage` skips particles with `world.core[i] === 0`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/cloth-mesh.test.js`, append:
```js
test('core marks the corners of core cells; without a core every particle counts', () => {
  const plain = buildMesh(garment('11', 2, 1));
  assert.deepEqual([...plain.core], [1, 1, 1, 1, 1, 1]);
  const m = buildMesh({ id: 'half', size: [20, 10], grid: { cols: 2, rows: 1, cells: '11', core: '10' } });
  for (let v = 0; v < m.count; v += 1) {
    assert.equal(m.core[v], m.rest[3 * v] < 15 ? 1 : 0, `corner at x = ${m.rest[3 * v]}`);
  }
});

test('a core cell outside the covered cells is refused', () => {
  assert.throws(
    () => buildMesh({ id: 'bad', size: [20, 10], grid: { cols: 2, rows: 1, cells: '10', core: '01' } }),
    /grid\.core/,
  );
});
```

`tests/unit/cloth-solver.test.js`, append:
```js
test("the world keeps each particle's core flag", () => {
  const half = buildMesh({ id: 'half', size: [20, 10], grid: { cols: 2, rows: 1, cells: '11', core: '10' } });
  const w = world({ meshes: [sheet(1, 1), half] });
  assert.deepEqual([...w.core], [1, 1, 1, 1, ...half.core]);
});
```

`tests/unit/cloth-coverage.test.js`, append (add any of these imports the file lacks):
```js
import { buildMesh } from '../../js/cloth/mesh.js';
import { createWorld, setPositions } from '../../js/cloth/solver.js';

test('cloth that touches no core cell does not cover the booklet', () => {
  const book = { x: 0, y: 0, width: 40, height: 40, thickness: 1, rotate: 0 };
  const lying = (core) => {
    const mesh = buildMesh({ id: 'm', size: [40, 40], grid: { cols: 4, rows: 4, cells: '1'.repeat(16), core } });
    const w = createWorld({
      garments: [{ mesh, material: { stretchCompliance: 0, bendCompliance: 1e-4, friction: 0.5 } }],
      bounds: { min: [-100, -100, 0], max: [200, 200, 200] },
      thickness: 7.5,
    });
    setPositions(w, 0, Float32Array.from(mesh.rest, (v, i) => (i % 3 === 2 ? v + 10 : v)));
    return w;
  };
  assert.equal(bookCoverage(lying('1'.repeat(16)), book), 1);
  assert.equal(bookCoverage(lying('0'.repeat(16)), book), 0);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/unit/cloth-mesh.test.js tests/unit/cloth-solver.test.js tests/unit/cloth-coverage.test.js`
Expected: FAIL — `m.core` undefined, no throw for the bad core, `w.core` undefined, coverage 1 instead of 0.

- [ ] **Step 3: Implement**

`js/cloth/mesh.js` — in the file comment add a paragraph:
```js
 * A grid may also mark `core` cells (mostly opaque in the picture). Particles
 * touching one are flagged in `core`: cloth there really hides what lies
 * under it, while the rest is a transparent margin around the outline.
```
Replace `validate`:
```js
function validate({ id, grid }) {
  const { cols, rows, cells, core } = grid ?? {};
  const ok = Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0
    && typeof cells === 'string' && cells.length === cols * rows && /^[01]+$/.test(cells);
  if (!ok) throw new Error(`${id}: grid must have ${cols} × ${rows} cells written as 0 and 1`);
  if (!cells.includes('1')) throw new Error(`${id}: the grid has no covered cells`);
  const coreOk = core === undefined || (typeof core === 'string' && core.length === cells.length
    && /^[01]+$/.test(core) && [...core].every((c, k) => c === '0' || cells[k] === '1'));
  if (!coreOk) throw new Error(`${id}: grid.core must mark only covered cells, one 0 or 1 per cell`);
}
```
In `buildMesh`, destructure `core: coreCells = cells` from `grid` alongside `cols, rows, cells`, and after the triangle loop (all corners exist by then) add:
```js
  const core = new Uint8Array(corners.length);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      if (coreCells[j * cols + i] === '1') [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)].forEach((v) => { core[v] = 1; });
    }
  }
```
Add `core` to the returned frozen object and to the `@returns` JSDoc (`core:Uint8Array`).

`js/cloth/solver.js` — in `createWorld`, after `garmentOf` is filled:
```js
  const core = new Uint8Array(count);
  garments.forEach(({ mesh }, g) => core.set(mesh.core ?? new Uint8Array(counts[g]).fill(1), offsets[g]));
```
and add `core,` to the returned world (next to `garmentOf`).

`js/cloth/coverage.js` — in `bookCoverage`, first line inside the particle loop:
```js
    if (world.core && !world.core[i]) continue; // a transparent margin hides nothing
```
and extend the JSDoc sentence: "…when some core cloth particle above the cover lies within `radius` of it".

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test`
Expected: all pass (today's garments have no `core`, so nothing else changes).

- [ ] **Step 5: Verify and commit**

Run `/verify`, then:
```bash
git add js/cloth/mesh.js js/cloth/solver.js js/cloth/coverage.js tests/unit/cloth-mesh.test.js tests/unit/cloth-solver.test.js tests/unit/cloth-coverage.test.js
git commit -m "feat: core cells, so a garment's transparent margin never hides the booklet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Smooth folds — the four-point surface

**Files:**
- Create: `js/cloth/smooth.js`, `tests/unit/cloth-smooth.test.js`
- Modify: `js/cloth/mesh.js` (`lattice`), `tests/unit/cloth-mesh.test.js`

**Interfaces:**
- Consumes: `buildMesh` (Task 5).
- Produces: `mesh.lattice = { cols, rows, at: Int32Array((cols+1)·(rows+1)), cells }` (`at[j·(cols+1)+i]` = particle at grid corner (i, j) or −1); `halfway(hasA, hasD) -> [wa, wb, wc, wd]`; `createSmoother(mesh) -> { count, uv: Float32Array, tris: Uint32Array, edges: {a,b}[], start: Uint32Array, ids: Uint32Array, weights: Float32Array, evaluate(pos, offset, out) -> out }`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/cloth-mesh.test.js`, append:
```js
test('the lattice maps every grid corner to its particle, or −1', () => {
  const m = buildMesh(garment('10' + '01', 2, 2));
  const { cols, rows, at } = m.lattice;
  assert.equal(at.length, (cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= cols; i += 1) {
      const v = at[j * (cols + 1) + i];
      if (v < 0) continue;
      assert.deepEqual([m.rest[3 * v], m.rest[3 * v + 1]], [i * 10, j * 10]);
    }
  }
  assert.equal(at[2], -1, 'corner (2, 0) touches no covered cell');
});
```

`tests/unit/cloth-smooth.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMesh } from '../../js/cloth/mesh.js';
import { createSmoother, halfway } from '../../js/cloth/smooth.js';

const mesh = (cells, cols, rows) => buildMesh({ id: 't', size: [cols * 10, rows * 10], grid: { cols, rows, cells } });
const drawn = (m, s, pos = m.rest) => s.evaluate(pos, 0, new Float32Array(3 * s.count));
const point = (a, v) => [a[3 * v], a[3 * v + 1], a[3 * v + 2]];
const close = (a, b, eps = 1e-4) => a.forEach((x, k) => assert.ok(Math.abs(x - b[k]) < eps, `${a} ≉ ${b}`));

test('halfway weights: four points, three, or two, always summing to 1', () => {
  [[true, true], [false, true], [true, false], [false, false]].forEach(([a, d]) => {
    const w = halfway(a, d);
    assert.ok(Math.abs(w.reduce((s, x) => s + x, 0) - 1) < 1e-12);
    if (!a) assert.equal(w[0], 0);
    if (!d) assert.equal(w[3], 0);
  });
  assert.deepEqual(halfway(true, true), [-1 / 16, 9 / 16, 9 / 16, -1 / 16]);
});

test('one cell: 3 × 3 points, 8 triangles, the centre is the average of the corners', () => {
  const m = mesh('1', 1, 1);
  const s = createSmoother(m);
  assert.equal(s.count, 9);
  assert.equal(s.tris.length, 24);
  const pos = Float32Array.from([0, 0, 0, 10, 0, 4, 10, 10, 8, 0, 10, 0]);
  const out = s.evaluate(pos, 0, new Float32Array(27));
  const centre = [...Array(9).keys()].find((v) => s.uv[2 * v] === 0.5 && s.uv[2 * v + 1] === 0.5);
  close(point(out, centre), [5, 5, 3]);
});

test('the surface passes through every particle', () => {
  const m = mesh('111' + '110' + '100', 3, 3);
  const s = createSmoother(m);
  const pos = Float32Array.from(m.rest, (v, i) => v + Math.sin(i * 1.7) * 6);
  const out = drawn(m, s, pos);
  let corners = 0;
  for (let v = 0; v < s.count; v += 1) {
    if (s.start[v + 1] - s.start[v] !== 1) continue;
    corners += 1;
    assert.equal(s.weights[s.start[v]], 1);
    close(point(out, v), point(pos, s.ids[s.start[v]]));
  }
  assert.equal(corners, m.count);
});

test('any flat, stretched or turned layout is drawn exactly, even at ragged edges', () => {
  const m = mesh('111' + '110' + '100', 3, 3);
  const s = createSmoother(m);
  const map = ([x, y]) => [3 + 0.8 * x - 0.6 * y, -2 + 0.6 * x + 0.8 * y, 5 + 0.1 * x];
  const pos = new Float32Array(m.rest.length);
  for (let v = 0; v < m.count; v += 1) pos.set(map(point(m.rest, v)), 3 * v);
  const out = drawn(m, s, pos);
  for (let v = 0; v < s.count; v += 1) close(point(out, v), map([s.uv[2 * v] * 30, s.uv[2 * v + 1] * 30]));
});

test('the weights of every drawn point add up to 1', () => {
  const s = createSmoother(mesh('1101' + '1111' + '0110', 4, 3));
  for (let v = 0; v < s.count; v += 1) {
    let sum = 0;
    for (let k = s.start[v]; k < s.start[v + 1]; k += 1) sum += s.weights[k];
    assert.ok(Math.abs(sum - 1) < 1e-6, `point ${v}: ${sum}`);
  }
});

test('a row bent into a circle stays on the circle, far closer than straight lines', () => {
  const cols = 8;
  const m = mesh('1'.repeat(cols), cols, 1);
  const s = createSmoother(m);
  const R = 100;
  const step = Math.PI / 8;
  const pos = new Float32Array(m.rest.length);
  for (let v = 0; v < m.count; v += 1) {
    const a = (m.rest[3 * v] / 10) * step;
    pos.set([R * Math.cos(a), R * Math.sin(a), m.rest[3 * v + 1]], 3 * v);
  }
  const out = drawn(m, s, pos);
  const straight = R * (1 - Math.cos(step / 2));
  for (let v = 0; v < s.count; v += 1) {
    const u = s.uv[2 * v] * cols;
    if (u < 1 || u > cols - 1 || Math.abs(u % 1 - 0.5) > 1e-6) continue; // interior midpoints only
    const r = Math.hypot(out[3 * v], out[3 * v + 1]);
    assert.ok(Math.abs(r - R) < 0.2 * straight, `radius ${r.toFixed(3)} at u = ${u}`);
  }
});

test('a sleeve across a gap does not tug on the body', () => {
  const m = mesh('101', 3, 1);
  const s = createSmoother(m);
  const moved = Float32Array.from(m.rest, (v, i) => (m.rest[i - (i % 3)] > 15 && i % 3 === 2 ? v + 25 : v));
  const before = drawn(m, s);
  const after = drawn(m, s, moved);
  for (let v = 0; v < s.count; v += 1) {
    if (s.uv[2 * v] * 3 <= 1) close(point(after, v), point(before, v));
  }
});

test('UVs are bilinear over the lattice and edges come from the triangles', () => {
  const s = createSmoother(mesh('11', 2, 1));
  assert.equal(s.count, 5 * 3);
  const us = new Set([...Array(s.count).keys()].map((v) => s.uv[2 * v]));
  assert.deepEqual([...us].sort(), [0, 0.25, 0.5, 0.75, 1]);
  const key = ({ a, b }) => `${Math.min(a, b)},${Math.max(a, b)}`;
  assert.equal(new Set(s.edges.map(key)).size, s.edges.length);
  assert.ok(s.edges.length >= s.count - 1);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/unit/cloth-smooth.test.js tests/unit/cloth-mesh.test.js`
Expected: FAIL — `Cannot find module '…/smooth.js'` and `m.lattice` undefined.

- [ ] **Step 3: Add the lattice to `buildMesh`**

In `js/cloth/mesh.js`, before the `return`:
```js
  const lattice = new Int32Array((cols + 1) * (rows + 1)).fill(-1);
  index.forEach((v, key) => { lattice[key] = v; });
```
and add to the returned object `lattice: Object.freeze({ cols, rows, at: lattice, cells })`, plus `lattice:{cols:number, rows:number, at:Int32Array, cells:string}` in the `@returns` JSDoc.

- [ ] **Step 4: Write `js/cloth/smooth.js`**

```js
/**
 * A smoother surface to draw than the one the cloth simulates. Pure — no DOM.
 *
 * Every simulated cell is drawn as 2 × 2 quads. The new points — edge
 * midpoints and cell centres — come from the four-point interpolating
 * scheme, (−p₀ + 9p₁ + 9p₂ − p₃) / 16, along rows and then columns. Where a
 * neighbour is missing at the cloth's edge, it is extrapolated in a straight
 * line; a neighbour across a gap (a sleeve beside the body) is treated as
 * missing. The surface passes through every particle, so what is drawn
 * still matches what collides and what is picked.
 *
 * Each new point is a fixed weighted sum of particles: the weights are
 * worked out once, and each frame is a sparse sum (evaluate).
 */

/** Weights of a, b, c, d for the point halfway between b and c; a or d may be missing. */
export function halfway(hasA, hasD) {
  if (hasA && hasD) return [-1 / 16, 9 / 16, 9 / 16, -1 / 16];
  if (hasD) return [0, 7 / 16, 10 / 16, -1 / 16]; // a extrapolated as 2b − c
  if (hasA) return [-1 / 16, 10 / 16, 7 / 16, 0]; // d extrapolated as 2c − b
  return [0, 1 / 2, 1 / 2, 0];
}

const covered = ({ cols, rows, cells }, i, j) => i >= 0 && j >= 0 && i < cols && j < rows && cells[j * cols + i] === '1';
const corner = ({ cols, rows, at }, i, j) => (i < 0 || j < 0 || i > cols || j > rows ? -1 : at[j * (cols + 1) + i]);
/** Is the lattice line from corner (i, j) to (i + 1, j) part of the cloth? */
const rowEdge = (L, i, j) => covered(L, i, j - 1) || covered(L, i, j);
/** Is the lattice line from corner (i, j) to (i, j + 1) part of the cloth? */
const colEdge = (L, i, j) => covered(L, i - 1, j) || covered(L, i, j);

/** Stencil (particle → weight) of the point halfway from p to q, with neighbours a before p and d after q. */
function lineMid(a, p, q, d) {
  const [wa, wb, wc, wd] = halfway(a >= 0, d >= 0);
  const stencil = new Map();
  [[a, wa], [p, wb], [q, wc], [d, wd]].forEach(([id, w]) => {
    if (id >= 0 && w !== 0) stencil.set(id, (stencil.get(id) ?? 0) + w);
  });
  return stencil;
}

const rowMid = (L, i, j) => lineMid(
  rowEdge(L, i - 1, j) ? corner(L, i - 1, j) : -1, corner(L, i, j), corner(L, i + 1, j),
  rowEdge(L, i + 1, j) ? corner(L, i + 2, j) : -1,
);
const colMid = (L, i, j) => lineMid(
  colEdge(L, i, j - 1) ? corner(L, i, j - 1) : -1, corner(L, i, j), corner(L, i, j + 1),
  colEdge(L, i, j + 1) ? corner(L, i, j + 2) : -1,
);

/** Centre of cell (i, j): the column scheme over the row midpoints of the cells above, of this one, and below. */
function centre(L, i, j) {
  const [wa, wb, wc, wd] = halfway(covered(L, i, j - 1), covered(L, i, j + 1));
  const stencil = new Map();
  [[j - 1, wa], [j, wb], [j + 1, wc], [j + 2, wd]].forEach(([r, w]) => {
    if (w === 0) return;
    rowMid(L, i, r).forEach((x, id) => stencil.set(id, (stencil.get(id) ?? 0) + x * w));
  });
  return stencil;
}

/** Stencil of fine lattice point (I, J): a corner, an edge midpoint or a cell centre. */
function stencilAt(L, I, J) {
  const i = I >> 1;
  const j = J >> 1;
  if (I % 2 === 0 && J % 2 === 0) return new Map([[corner(L, i, j), 1]]);
  if (J % 2 === 0) return rowMid(L, i, j);
  if (I % 2 === 0) return colMid(L, i, j);
  return centre(L, i, j);
}

function uniqueEdges(tris) {
  const seen = new Map();
  for (let k = 0; k < tris.length; k += 3) {
    [[tris[k], tris[k + 1]], [tris[k + 1], tris[k + 2]], [tris[k + 2], tris[k]]].forEach(([p, q]) => {
      const a = Math.min(p, q);
      const b = Math.max(p, q);
      seen.set(`${a},${b}`, { a, b });
    });
  }
  return [...seen.values()];
}

/** Fine points and triangles: every covered cell as 2 × 2 quads, diagonals alternating. */
function fineLattice(L) {
  const width = 2 * L.cols + 1;
  const index = new Map();
  const points = [];
  const at = (I, J) => {
    const key = J * width + I;
    if (!index.has(key)) {
      index.set(key, points.length);
      points.push([I, J]);
    }
    return index.get(key);
  };
  const tris = [];
  for (let j = 0; j < L.rows; j += 1) {
    for (let i = 0; i < L.cols; i += 1) {
      if (!covered(L, i, j)) continue;
      for (let dj = 0; dj < 2; dj += 1) {
        for (let di = 0; di < 2; di += 1) {
          const I = 2 * i + di;
          const J = 2 * j + dj;
          const [a, b, c, d] = [at(I, J), at(I + 1, J), at(I + 1, J + 1), at(I, J + 1)];
          tris.push(...((I + J) % 2 === 0 ? [a, b, c, a, c, d] : [a, b, d, b, c, d]));
        }
      }
    }
  }
  return { points, tris };
}

/**
 * @param {{lattice:{cols:number, rows:number, at:Int32Array, cells:string}}} mesh  from buildMesh
 */
export function createSmoother(mesh) {
  const L = mesh.lattice;
  const { points, tris } = fineLattice(L);
  const stencils = points.map(([I, J]) => stencilAt(L, I, J));
  const count = points.length;
  const start = new Uint32Array(count + 1);
  stencils.forEach((s, v) => { start[v + 1] = start[v] + s.size; });
  const ids = new Uint32Array(start[count]);
  const weights = new Float32Array(start[count]);
  stencils.forEach((s, v) => {
    let k = start[v];
    s.forEach((w, id) => {
      ids[k] = id;
      weights[k] = w;
      k += 1;
    });
  });
  const uv = new Float32Array(points.flatMap(([I, J]) => [I / (2 * L.cols), J / (2 * L.rows)]));

  /** Drawn positions from particle positions; the garment's particles start at `offset` in `pos`. */
  function evaluate(pos, offset, out) {
    for (let v = 0; v < count; v += 1) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (let k = start[v]; k < start[v + 1]; k += 1) {
        const p = 3 * (offset + ids[k]);
        const w = weights[k];
        x += w * pos[p];
        y += w * pos[p + 1];
        z += w * pos[p + 2];
      }
      out[3 * v] = x;
      out[3 * v + 1] = y;
      out[3 * v + 2] = z;
    }
    return out;
  }

  return Object.freeze({ count, uv, tris: Uint32Array.from(tris), edges: uniqueEdges(tris), start, ids, weights, evaluate });
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 6: Verify and commit**

Run `/verify`, then:
```bash
git add js/cloth/smooth.js js/cloth/mesh.js tests/unit/cloth-smooth.test.js tests/unit/cloth-mesh.test.js
git commit -m "feat: a smooth four-point surface to draw cloth folds round

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Draw the smooth surface with relief, at the resolution the screen needs

**Files:**
- Create: `js/cloth/budget.js`, `tests/unit/cloth-budget.test.js`
- Modify: `js/cloth/shading.js` (`CREASE` export, `cavity` option), `js/cloth/render.js`, `js/cloth/layer.js`
- Test: `tests/unit/cloth-shading.test.js`, `tests/e2e/clothes.spec.js`

**Interfaces:**
- Consumes: `createSmoother` (Task 6); per garment in `garments.json`: optional `relief` (path), `pxPerUnit`, `material.bump`; top-level `pxPerUnit`.
- Produces: `floorPixelsPerUnit(vw, vh, ratio) -> number`; `textureScale(pxPerUnit, need, {headroom = 1.25, floor = 1.5}) -> number (0, 1]`; `cavity(pos, offset, lists, out, { crease = CREASE } = {})`; `createRenderer(gl, { meshes, looks, occluders })` with `looks[g] = { image, relief, reliefTexel, sheen, bump }` (`relief` may be null; `reliefTexel` is one texel of the relief *file*, `[0, 0]` without one).

- [ ] **Step 1: Write the failing tests**

`tests/unit/cloth-budget.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floorPixelsPerUnit, textureScale } from '../../js/cloth/budget.js';

test('the overhead view shows the floor at a sensible size, sharper on a denser screen', () => {
  const desktop = floorPixelsPerUnit(1280, 800, 1);
  assert.ok(desktop > 1 && desktop < 3, `desktop: ${desktop}`);
  assert.ok(Math.abs(floorPixelsPerUnit(1280, 800, 2) - 2 * desktop) < 1e-9);
  assert.ok(floorPixelsPerUnit(412, 839, 2.625) < floorPixelsPerUnit(1280, 800, 2.625));
});

test('textures are uploaded at what the screen needs, with headroom', () => {
  assert.equal(textureScale(4, 2), (2 * 1.25) / 4);
});

test('never more than the file holds, however dense the screen', () => {
  assert.equal(textureScale(4, 9), 1);
  assert.equal(textureScale(2.4, 3), 1);
});

test('never below 1.5 pixels per unit, however small the screen', () => {
  assert.equal(textureScale(4, 0.3), 1.5 / 4);
  assert.equal(textureScale(4, 0.3, { floor: 2 }), 0.5);
});
```

`tests/unit/cloth-shading.test.js`, append (import `cavity`, `neighbourLists`, `CREASE` from `shading.js` if not yet imported):
```js
test('a finer mesh can ask for a stronger crease', () => {
  const pos = new Float32Array([0, 0, -1, 1, 0, 0, -1, 0, 0]); // vertex 0 lies 1 below its two neighbours
  const lists = neighbourLists({ count: 3, stretch: [{ a: 0, b: 1 }, { a: 0, b: 2 }] });
  const out = new Float32Array(3);
  cavity(pos, 0, lists, out);
  const normal = 1 - out[0];
  cavity(pos, 0, lists, out, { crease: CREASE * 4 });
  assert.ok(Math.abs((1 - out[0]) - 4 * normal) < 1e-6);
});
```

`tests/e2e/clothes.spec.js`, inside `test.describe('clothes in the box (desktop)', …)` (import `openSite`, `waitForState` from `./helpers.js` if not already):
```js
  test('the open hand shows exactly where cloth is visible, never over a transparent margin', async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    const box = await page.evaluate(() => window.__parcel.garmentBox('qipao'));
    for (const row of [0.08, 0.3, 0.7]) {
      for (let k = 0; k <= 24; k += 1) {
        const x = box.left + (box.width * k) / 24;
        const y = box.top + box.height * row;
        await page.mouse.move(x, y);
        const [picked, hover] = await page.evaluate(([px, py]) => [
          window.__parcel.pick(px, py) !== null,
          document.querySelector('.stage').classList.contains('over-garment'),
        ], [x, y]);
        expect(hover, `hand at (${x.toFixed(0)}, ${y.toFixed(0)})`).toBe(picked);
      }
    }
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/unit/cloth-budget.test.js tests/unit/cloth-shading.test.js`
Expected: FAIL — `Cannot find module '…/budget.js'`; `CREASE` is not exported.

- [ ] **Step 3: `js/cloth/budget.js` and the crease option**

```js
/**
 * How much texture a screen can use. Pure — no DOM.
 *
 * Garment pictures hold 4 pixels per parcel unit — enough for a sharp
 * desktop screen. A phone shows the box far smaller, so its textures are
 * uploaded scaled down: the GPU holds a fraction of the memory and the
 * picture looks the same.
 */

import { BOX, frameFor } from '../scene/geometry.js';
import { projectPoint } from '../scene/projection.js';

/** Device pixels one parcel unit of floor spans in the overhead view of a vw × vh screen. */
export function floorPixelsPerUnit(vw, vh, ratio) {
  const frame = frameFor('overhead', vw, vh);
  const viewport = { width: vw, height: vh };
  const a = projectPoint(frame, viewport, [BOX.width / 2 - 50, BOX.depth / 2, 0]);
  const b = projectPoint(frame, viewport, [BOX.width / 2 + 50, BOX.depth / 2, 0]);
  return (Math.hypot(b.x - a.x, b.y - a.y) / 100) * ratio;
}

/**
 * Share of a texture's resolution worth uploading: what the screen needs,
 * with headroom for cloth lifted toward the eye, never above the file's own
 * resolution and never below `floor` pixels per unit.
 */
export function textureScale(pxPerUnit, need, { headroom = 1.25, floor = 1.5 } = {}) {
  return Math.min(1, Math.max(floor, need * headroom) / pxPerUnit);
}
```

`js/cloth/shading.js` — export the constant and accept a strength:
```js
export const CREASE = 0.035; // darkening per unit a vertex sits below its neighbours
```
```js
export function cavity(pos, offset, { start, ids }, out, { crease = CREASE } = {}) {
```
and inside use `1 + depth * crease` instead of `1 + depth * CREASE`. Add to its JSDoc: "`crease` scales the darkening — a finer mesh needs more, since a crease's depth below its neighbours shrinks with the square of their spacing."

- [ ] **Step 4: Run the unit tests to see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Draw the smooth mesh with relief (`js/cloth/render.js`)**

Imports: add `import { createSmoother } from './smooth.js';` and add `CREASE` to the import from `./shading.js`. Below the other constants:
```js
const FINE_CREASE = CREASE * 4; // the drawn mesh is twice as fine: creases sit a quarter as deep below neighbours
const FLAT_RELIEF = new Uint8Array([128]); // a garment without a relief map is lit as plain fabric
```

Replace `CLOTH_FS` with:
```js
const CLOTH_FS = `#version 300 es
precision highp float;
${PCF}
uniform sampler2D uTex;
uniform sampler2D uRelief;
uniform vec2 uReliefTexel;
uniform float uBump;
uniform vec3 uEye;
uniform vec3 uLightDir;
uniform float uSheen;
uniform float uLightLevel;
in vec3 vPos;
in vec3 vNormal;
in vec3 vShadow;
in vec2 vUv;
in float vCavity;
out vec4 outColor;

// Tilt the normal by the relief map's slope along the cloth's own u and v
// directions. The tangent frame comes from screen-space derivatives
// (Schüler's cotangent frame), so no tangents need storing per vertex.
vec3 relief(vec3 n) {
  float l = texture(uRelief, vUv - vec2(uReliefTexel.x, 0.0)).r;
  float r = texture(uRelief, vUv + vec2(uReliefTexel.x, 0.0)).r;
  float d = texture(uRelief, vUv - vec2(0.0, uReliefTexel.y)).r;
  float u = texture(uRelief, vUv + vec2(0.0, uReliefTexel.y)).r;
  vec3 dpx = dFdx(vPos);
  vec3 dpy = dFdy(vPos);
  vec2 dtx = dFdx(vUv);
  vec2 dty = dFdy(vUv);
  vec3 px = cross(dpy, n);
  vec3 py = cross(n, dpx);
  vec3 tu = px * dtx.x + py * dty.x;
  vec3 tv = px * dtx.y + py * dty.y;
  float scale = inversesqrt(max(max(dot(tu, tu), dot(tv, tv)), 1e-12));
  return normalize(n - uBump * scale * ((r - l) * tu + (u - d) * tv));
}

void main() {
  vec4 tex = texture(uTex, vUv); // premultiplied on upload
  // a crisp cut-out edge, about one pixel wide, whatever the zoom
  float alpha = clamp((tex.a - 0.5) / max(fwidth(tex.a), 1e-4) + 0.5, 0.0, 1.0);
  if (alpha < 0.01) discard;
  vec3 base = tex.rgb / max(tex.a, 1e-3);

  vec3 n = normalize(vNormal);
  vec3 toEye = normalize(uEye - vPos);
  bool back = dot(n, toEye) < 0.0;
  if (back) n = -n;
  n = relief(n);
  float shade = max(0.0, dot(n, uLightDir)) * 0.6 + 0.4; // wrapped: soft fabric, no harsh terminator
  float sun = sunlit(vShadow);
  vec3 h = normalize(uLightDir + toEye);
  float sheen = pow(max(0.0, dot(n, h)), 20.0) * uSheen * 0.3 * sun;

  vec3 color = base * shade * mix(0.62, 1.0, sun) * vCavity * (back ? 0.78 : 1.0) + sheen;
  color = mix(color, vec3(${DARK.map((c) => c.toFixed(4)).join(', ')}), (1.0 - uLightLevel) * 0.95);
  outColor = vec4(color * alpha, alpha);
}`;
```

After `createTexture`, add:
```js
/** Single-channel relief texture; a 1 × 1 plain one when the garment has none. */
function createReliefTexture(gl, image) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  if (image) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, image);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, FLAT_RELIEF);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}
```

Replace `createGarment` with:
```js
/** Buffers, textures and scratch arrays for one garment, drawn as its smooth surface. */
function createGarment(gl, mesh, { image, relief, reliefTexel, sheen, bump }, anisotropy) {
  const smooth = createSmoother(mesh);
  if (smooth.count > 65535) throw new Error('a garment has too many points to draw with 16-bit indices');
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const positions = smooth.evaluate(mesh.rest, 0, new Float32Array(3 * smooth.count));
  const normals = new Float32Array(3 * smooth.count);
  const shading = new Float32Array(smooth.count).fill(1);
  const garment = {
    smooth,
    sheen,
    bump,
    vao,
    positions,
    normals,
    shading,
    neighbours: neighbourLists({ count: smooth.count, stretch: smooth.edges }),
    position: vertexBuffer(gl, ATTRIBUTES.indexOf('aPos'), 3, positions, gl.DYNAMIC_DRAW),
    normal: vertexBuffer(gl, ATTRIBUTES.indexOf('aNormal'), 3, normals, gl.DYNAMIC_DRAW),
    uv: vertexBuffer(gl, ATTRIBUTES.indexOf('aUv'), 2, smooth.uv, gl.STATIC_DRAW),
    cavity: vertexBuffer(gl, ATTRIBUTES.indexOf('aCavity'), 1, shading, gl.DYNAMIC_DRAW),
    count: smooth.tris.length,
    texture: createTexture(gl, image, anisotropy),
    relief: createReliefTexture(gl, relief),
    reliefTexel, // one texel of the relief file: the bump keeps its strength at any upload size
  };
  const indices = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint16Array.from(smooth.tris), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return garment;
}
```

In `createRenderer`: change the JSDoc and signature to
```js
/**
 * @param gl         a WebGL2 context (antialias on, premultiplied alpha)
 * @param meshes     each garment's mesh (mesh.js), in world order
 * @param looks      each garment's {image, relief (or null), reliefTexel, sheen 0…1, bump}
 * @param occluders  quads of the box's solid surfaces (solids.occluderQuads)
 * @returns {{update(world, garments:number[]): void, draw(view): void}}
 */
export function createRenderer(gl, { meshes, looks, occluders }) {
```
with `const garments = meshes.map((mesh, g) => createGarment(gl, mesh, looks[g], anisotropy));`. Replace `update` with:
```js
  /** Recompute the drawn surface of `changed` garments and copy it to the GPU. */
  function update(world, changed) {
    changed.forEach((g) => {
      const garment = garments[g];
      garment.smooth.evaluate(world.pos, world.offsets[g], garment.positions);
      vertexNormals(garment.positions, 0, garment.smooth.tris, garment.normals);
      cavity(garment.positions, 0, garment.neighbours, garment.shading, { crease: FINE_CREASE });
      gl.bindBuffer(gl.ARRAY_BUFFER, garment.position);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, garment.positions);
      gl.bindBuffer(gl.ARRAY_BUFFER, garment.normal);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, garment.normals);
      gl.bindBuffer(gl.ARRAY_BUFFER, garment.cavity);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, garment.shading);
    });
    if (changed.length > 0) shadowStale = true;
  }
```
In `draw`, after `gl.uniform1i(cloth.uniforms.uTex, 0);` add `gl.uniform1i(cloth.uniforms.uRelief, 2);`, and replace the per-garment loop with:
```js
    garments.forEach((garment) => {
      gl.uniform1f(cloth.uniforms.uSheen, garment.sheen);
      gl.uniform1f(cloth.uniforms.uBump, garment.bump);
      gl.uniform2fv(cloth.uniforms.uReliefTexel, garment.reliefTexel);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, garment.relief);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, garment.texture);
      gl.bindVertexArray(garment.vao);
      gl.drawElements(gl.TRIANGLES, garment.count, gl.UNSIGNED_SHORT, 0);
    });
```

- [ ] **Step 6: Load reliefs and upload at the needed size (`js/cloth/layer.js`)**

Add `import { floorPixelsPerUnit, textureScale } from './budget.js';`. After `loadImage`, add:
```js
/** A garment's relief map, or null (it is then drawn as plain fabric) when it has none or it fails to load. */
async function loadRelief({ id, relief }) {
  if (!relief) return null;
  try {
    return await loadImage(relief);
  } catch (err) {
    console.warn(`[parcel] The ${id}'s relief (${relief}) could not be loaded; it is drawn without it.`, err);
    return null;
  }
}

/** The image redrawn at `scale` of its size, or the image itself when that would hardly differ. */
function resized(image, scale) {
  if (!image || scale > 0.95) return image;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}
```
In `loadAssets` replace the `images` line and the return with:
```js
  const [images, reliefs] = await Promise.all([
    Promise.all(data.garments.map((g) => loadImage(g.texture))),
    Promise.all(data.garments.map(loadRelief)),
  ]);
  return { data, pile, meshes, images, reliefs };
```
In `createLayer`, destructure `reliefs` from `assets`, and replace the `sheens` and `makeRenderer` lines with:
```js
  // Upload only the resolution this screen can show (picking keeps the full-size alpha).
  const need = floorPixelsPerUnit(innerWidth, innerHeight, Math.min(devicePixelRatio || 1, 2));
  const looks = data.garments.map((g, i) => {
    const scale = textureScale(g.pxPerUnit ?? data.pxPerUnit, need);
    return {
      image: resized(images[i], scale),
      relief: resized(reliefs[i], scale),
      reliefTexel: reliefs[i] ? [1 / reliefs[i].naturalWidth, 1 / reliefs[i].naturalHeight] : [0, 0],
      sheen: g.material.sheen ?? 0.3,
      bump: g.material.bump ?? 0,
    };
  });
  const makeRenderer = () => createRenderer(gl, { meshes, looks, occluders: occluderQuads() });
```

- [ ] **Step 7: Run unit and clothes e2e tests**

Run: `npm test && npx playwright test tests/e2e/clothes.spec.js tests/e2e/journey.spec.js --workers=2`
Expected: all pass, including the new cursor test.

- [ ] **Step 8: Look at it**

Run `node tools/shots.mjs` (server on 4173). Check: today's garments look the same or rounder (no faceted creases, no seams between cells), no garment is missing, no black or white fringes, creases still visibly darker. If creases look too strong or too weak, adjust `FINE_CREASE` (between `CREASE * 3` and `CREASE * 5`).

- [ ] **Step 9: Verify and commit**

Run `/verify`, then:
```bash
git add js/cloth/budget.js js/cloth/shading.js js/cloth/render.js js/cloth/layer.js tests/unit/cloth-budget.test.js tests/unit/cloth-shading.test.js tests/e2e/clothes.spec.js
git commit -m "feat: draw cloth as a smooth surface lit through relief maps

Textures are uploaded at the resolution the screen needs; a garment
without a relief map is lit as plain fabric.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The pack as a body — heavy, stiff, picked up anywhere

*(Spec Revision B: B4 data, material, relief map, holding, picking, cover, fallback, access; spec step 5c.)*

**Files:**
- Create: `tools/pack_body.py`, `tools/tests/test_pack_body.py`, `assets/photo/vacuum-pack-relief.webp`
- Modify: `tools/prepare_pack.py` (`bulge_height`, `relief_map`, `save_relief`, `main`), `tools/tests/test_prepare_pack.py`, `tools/generate_clothes.py` (appends the pack), `js/cloth/solver.js` (`material.mass`, `restInvMass`), `js/cloth/hand.js` (`holds`), `js/cloth/layer.js` (`bodies`, holds, film picking, `clearAside`), `js/scene/solids.js` (the pack collider goes), `tools/build-pile.mjs` (the pack lies flat first), `js/main.js` (hand-over, test hooks), `css/scene.css` (`.pack.is-handed-over`), `tools/shots.mjs` (pack close-up)
- Output: `assets/clothes/garments.json`, `assets/clothes/pile.json`
- Test: `tests/unit/cloth-solver.test.js`, `tests/unit/cloth-hand.test.js`, `tests/unit/solids.test.js`, `tests/unit/cloth-grip.test.js`, `tests/unit/clothes-data.test.js`, `tests/e2e/clothes-helpers.js`, `tests/e2e/clothes.spec.js`, `tests/e2e/assets.spec.js`, `tests/e2e/journey.spec.js`

**Interfaces:**
- Consumes: `cell_grid` (Task 3); `grid.core` (Task 5); `relief`, `pxPerUnit`, `material.bump` and the layer's `looks` (Task 7).
- Produces:
  - Record `{id: 'pack', kind: 'film', label: 'vacuum pack', texture, relief, pxPerUnit, size: [181, 290], grid (29 × 47, with core), material {stretchCompliance, bendCompliance, friction, sheen, bump, mass: 4}, hold: {radius: 30, lift: 6}}`, last in `garments.json`; Python `pack_body.pack_record(root) -> dict`, `pack_body.SIZE`, `pack_body.GRID`.
  - `createWorld` reads `material.mass` (default 1): `world.restInvMass`; `release()` restores it.
  - `createHand({ world, colliders, ray, holds })`: `holds[g] = {radius, lift}` or undefined (the default hold).
  - Layer: `bodies: {id, label, kind}[]` (every body); `garments` (the bodies that are not film — a prefix of `bodies`); `pickAt()` hits carry `opacity`; `clearAside()` leaves the pack.
  - `__parcel.pick(x, y)` and `__parcel.garmentBox(id)` know the pack; new `__parcel.hit(x, y) -> {id, uv, opacity} | null`.

- [ ] **Step 1: Write the failing Python tests**

`tools/tests/test_prepare_pack.py` — append:
```python
def test_relief_map_rises_over_solids_and_is_flat_off_the_pack():
    _, alpha, solid = cut()
    level = pp.relief_map(alpha, solid)
    assert level.dtype == np.uint8 and level.shape == alpha.shape
    assert level.max() == 255
    assert (level[alpha <= 0.01] == 0).all()
    assert level[solid].mean() > level[(alpha > 0.01) & ~solid].mean() + 20
```
and in `test_cli_writes_the_pack_and_its_shade` (rename it `test_cli_writes_the_pack_its_shade_and_its_relief`) add:
```python
    relief = Image.open(tmp_path / "out" / "vacuum-pack-relief.webp")
    assert relief.size == pack.size
```

`tools/tests/test_pack_body.py`:
```python
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
```

Run: `npm run test:py 2>&1 | tail -4`
Expected: FAIL — `relief_map` missing; `No module named 'pack_body'`.

- [ ] **Step 2: The relief map and the pack record**

`tools/prepare_pack.py` — add after `SHADE_GAIN`:
```python
RISE = 0.02  # the fullest bulge rises about 2 % of the pack's height
```
Split the height field out of `relief_shade` (its output stays the same):
```python
def bulge_height(alpha: np.ndarray, solid: np.ndarray) -> np.ndarray:
    """Height of the film in pixels: domed over the solids, rounding off toward the rim."""
    height = alpha.shape[0]
    inside = alpha > 0.01
    bulge = ndi.gaussian_filter(solid.astype(np.float64), 0.015 * height)
    rim = np.sqrt(np.clip(ndi.distance_transform_edt(inside) / (0.08 * height), 0, 1)) * 0.35
    return (bulge + rim) * RISE * height


def relief_shade(alpha: np.ndarray, solid: np.ndarray) -> np.ndarray:
    """RGBA overlay: white where the bulging film faces the light, black where it faces away."""
    inside = alpha > 0.01
    gy, gx = np.gradient(bulge_height(alpha, solid))
    normal = np.dstack([-gx, -gy, np.ones_like(gx)])
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    change = normal @ LIGHT - LIGHT[2]  # brighter (+) or darker (−) than flat film
    strength = np.clip(np.abs(change) * SHADE_GAIN, 0, SHADE_MAX) * inside
    shade = np.zeros((*alpha.shape, 4), np.uint8)
    shade[..., :3] = np.where(change[..., None] > 0, 255, 0)
    shade[..., 3] = np.round(strength * 255)
    return shade


def relief_map(alpha: np.ndarray, solid: np.ndarray) -> np.ndarray:
    """The bulge in the garments' relief format: 8-bit height, 0 off the pack, 255 at the fullest bulge."""
    surface = bulge_height(alpha, solid) * (alpha > 0.01)
    top = surface.max()
    return np.round(surface / top * 255).astype(np.uint8) if top > 0 else np.zeros(alpha.shape, np.uint8)


def save_relief(level: np.ndarray, path: Path, size: tuple[int, int]) -> None:
    """One channel, at the pack picture's size, so the two line up texel for texel."""
    Image.fromarray(level).resize(size, Image.LANCZOS).save(path, "WEBP", quality=90, method=6)
```
In `main()`, after the shade is saved:
```python
    save_relief(relief_map(alpha[y0:y1, x0:x1], solid[y0:y1, x0:x1]), out / "vacuum-pack-relief.webp", saved.size)
```
and in the module docstring add `vacuum-pack-relief.webp` (the bulge as a height map, lit by the cloth layer) to the outputs.

`tools/pack_body.py`:
```python
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
```

`tools/generate_clothes.py` — import it with the other `clothes` import (`from pack_body import pack_record  # noqa: E402`), and after the garment loop in `main()`:
```python
    records.append(pack_record(ROOT))  # the pack: one more, stiff and heavy, body (kind "film")
```

Run: `python tools/prepare_pack.py F:/CXY.png assets/photo --solid 950,1200,44,40 && npm run test:py 2>&1 | tail -2`
Expected: the pack line `747 x 1200, aspect 0.6225`; `git status` shows `vacuum-pack.webp` and `vacuum-pack-shade.webp` unchanged and a new `vacuum-pack-relief.webp`; all Python tests pass.

- [ ] **Step 3: Write the failing JS tests**

`tests/unit/cloth-solver.test.js` — add `import { readFileSync } from 'node:fs';`, `import { bookCoverage } from '../../js/cloth/coverage.js';`, `sleep` to the solver import, `BOOKS, baseOf` to the geometry import, and below the helpers:
```js
const FINE = 4.5; // the pile's thickness (tools/build-pile.mjs)
const fine = (cols, rows) => buildMesh({ id: 'fine', size: [cols * 6, rows * 6], grid: { cols, rows, cells: '1'.repeat(cols * rows) } });

/** The vacuum pack's record in garments.json. */
function packRecord() {
  const data = JSON.parse(readFileSync(new URL('../../assets/clothes/garments.json', import.meta.url), 'utf8'));
  const pack = data.garments.find((g) => g.kind === 'film');
  if (!pack) throw new Error('garments.json has no pack body yet (npm run clothes)');
  return pack;
}

/** The pack asleep in its place, plus sheets of `meshes` to drop on it. */
function packWorld(meshes = []) {
  const pack = packRecord();
  const mesh = buildMesh(pack);
  const w = createWorld({
    garments: [{ mesh, material: pack.material }, ...meshes.map((m) => ({ mesh: m, material }))],
    colliders: boxColliders(),
    bounds,
    thickness: FINE,
  });
  setPositions(w, 0, Float32Array.from(mesh.rest, (v, i) => v + [CONTENTS.pack.x, CONTENTS.pack.y, FINE / 2][i % 3]));
  sleep(w, 0);
  return w;
}

/** A floor point in a rotated rectangle's own frame: (0, 0) at its top-left corner. */
const local = ([px, py], { x, y, width, height, rotate }) => {
  const a = (-rotate * Math.PI) / 180;
  const [dx, dy] = [px - x - width / 2, py - y - height / 2];
  return [dx * Math.cos(a) - dy * Math.sin(a) + width / 2, dx * Math.sin(a) + dy * Math.cos(a) + height / 2];
};
```
Replace the test `'cloth dropped on the vacuum pack rests on top of it'` with:
```js
test('cloth dropped on the vacuum pack rests on top of it', () => {
  const cloth = fine(8, 8);
  const w = packWorld([cloth]);
  setPositions(w, 1, Float32Array.from(cloth.rest, (v, i) => v + [70, 120, 30][i % 3]));
  run(w, 2);
  zs(w).slice(w.offsets[1]).forEach((z) => assert.ok(z >= 1.5 * FINE - 0.5, `z = ${z}`));
});
```
and append:
```js
test("a heavy body keeps its weight: four times a garment's, back again after it is held", () => {
  const w = createWorld({
    garments: [{ mesh: sheet(1, 1), material: { ...material, mass: 4 } }, { mesh: sheet(1, 1), material }],
    bounds,
    thickness: THICKNESS,
  });
  assert.deepEqual([...w.invMass], [0.25, 0.25, 0.25, 0.25, 1, 1, 1, 1]);
  grab(w, 0, [0, 1], [0, 0, 20]);
  assert.equal(w.invMass[0], 0);
  release(w);
  assert.deepEqual([...w.invMass.slice(0, 2)], [0.25, 0.25]);
});

test('the pack laid over the booklet and the books rests on them and hides the booklet', () => {
  const w = packWorld();
  setPositions(w, 0, shifted(w, 0, [200, 0, 40]));
  run(w, 3);
  assert.ok(bookCoverage(w, CONTENTS.book) >= 0.85, 'over the booklet, the pack hides it like cloth does');
  const dictionary = BOOKS.find((b) => b.id === 'dictionary');
  const top = baseOf(dictionary) + dictionary.thickness;
  const over = [...Array(w.count).keys()].filter((i) => {
    const [u, v] = local([w.pos[3 * i], w.pos[3 * i + 1]], dictionary);
    return u > 4 && u < dictionary.width - 4 && v > 4 && v < dictionary.height - 4;
  });
  assert.ok(over.length > 20, `${over.length} of the pack's particles lie over the dictionary`);
  over.forEach((i) => assert.ok(w.pos[3 * i + 2] >= top + FINE / 2 - 0.5, `z = ${w.pos[3 * i + 2]}`));
});
```

`tests/unit/cloth-hand.test.js` — add `import { readFileSync } from 'node:fs';` and `CONTENTS` to the geometry import; append:
```js
/** The vacuum pack as garments.json describes it, in its place, with a hand that knows its hold. */
function packScene() {
  const data = JSON.parse(readFileSync(new URL('../../assets/clothes/garments.json', import.meta.url), 'utf8'));
  const pack = data.garments.find((g) => g.kind === 'film');
  if (!pack) throw new Error('garments.json has no pack body yet (npm run clothes)');
  const mesh = buildMesh(pack);
  const world = createWorld({
    garments: [{ mesh, material: pack.material }],
    colliders: boxColliders(),
    bounds: { min: [-700, -600, 0], max: [1200, 1000, 700] },
    thickness: 4.5,
  });
  setPositions(world, 0, Float32Array.from(mesh.rest, (v, i) => v + [CONTENTS.pack.x, CONTENTS.pack.y, 2.25][i % 3]));
  sleepAll(world);
  return { world, hand: createHand({ world, colliders: boxColliders(), ray, holds: [pack.hold] }) };
}

/** The particle nearest floor point (x, y). */
const nearest = (world, x, y) => [...Array(world.count).keys()].reduce((best, i) => (
  Math.hypot(world.pos[3 * i] - x, world.pos[3 * i + 1] - y) < Math.hypot(world.pos[3 * best] - x, world.pos[3 * best + 1] - y) ? i : best), 0);

test('the pack is held by a wide patch, lifted only a little', () => {
  const { world, hand } = packScene();
  const i = nearest(world, 96, 150);
  const point = [...world.pos.slice(3 * i, 3 * i + 3)];
  hand.grab(hitAt(world, i), point[0], point[1]);
  const within = [...Array(world.count).keys()]
    .filter((j) => Math.hypot(world.pos[3 * j] - point[0], world.pos[3 * j + 1] - point[1]) <= 30);
  assert.equal(world.grip.ids.length, within.length);
  assert.ok(Math.abs(world.grip.to[2] - (point[2] + 6)) < 0.01, `held at ${world.grip.to[2]}`);
});

test('dragged by its middle, the pack flexes but keeps its shape', () => {
  const { world, hand } = packScene();
  const i = nearest(world, 96, 150);
  const [x, y] = [world.pos[3 * i], world.pos[3 * i + 1]];
  hand.grab(hitAt(world, i), x, y);
  for (let f = 1; f <= 40; f += 1) {
    hand.dragTo(x + f, y);
    frames(world, hand, 1);
  }
  frames(world, hand, 20);
  const span = (k) => {
    const v = [...Array(world.count).keys()].map((j) => world.pos[3 * j + k]);
    return Math.max(...v) - Math.min(...v);
  };
  assert.ok(span(0) >= 0.9 * 181 && span(1) >= 0.9 * 290, `the pack spans ${span(0).toFixed(0)} × ${span(1).toFixed(0)}`);
  assert.ok(span(2) <= 12, `it rises ${span(2).toFixed(1)} at most: flexing, not folding`);
});
```

`tests/unit/solids.test.js` — the pack is cloth now: in the collider-count test change the title to `'colliders: 4 walls, 4 open flaps, the booklet, the desiccant and four books, each a proper box'` and the count to `14`; the occluder test to `1 + 14 * 6`; delete `'the pack collider lies on the floor under its flat part, as thick as the pack'`.

`tests/unit/cloth-grip.test.js` — delete `'over the vacuum pack, its top'` (the pack is cloth: `'other cloth underneath counts…'` covers it).

`tests/unit/clothes-data.test.js` — in the first test, after reading `data`, add `const garments = data.garments.filter((g) => g.kind !== 'film');` and use `garments` in place of `data.garments` for the id list and the per-garment checks; append:
```js
test('the pack is the last body: a heavy, stiff film the size of the pack in the box', async () => {
  const { CONTENTS } = await import('../../js/scene/geometry.js');
  const data = await readJson('assets/clothes/garments.json');
  const pile = await readJson('assets/clothes/pile.json');
  const pack = data.garments.at(-1);
  assert.deepEqual([pack.id, pack.kind], ['pack', 'film']);
  assert.equal(data.garments.filter((g) => g.kind === 'film').length, 1, 'one film body');
  assert.deepEqual(pack.size, [CONTENTS.pack.width, CONTENTS.pack.height]);
  assert.ok(pack.material.mass >= 4, 'heavy');
  assert.ok(pack.material.bendCompliance <= 1e-6, 'stiff');
  assert.deepEqual(pack.hold, { radius: 30, lift: 6 });
  const gap = Math.hypot(pack.size[0] / pack.grid.cols, pack.size[1] / pack.grid.rows) / 2;
  assert.ok(gap < pile.thickness, `a cell's middle lies ${gap.toFixed(2)} from its particles`);
  for (const path of [pack.texture, pack.relief]) assert.ok((await stat(new URL(path, ROOT))).size > 1000, `${path} exists`);
});
```

Run: `npm test 2>&1 | grep -E '^not ok|^# (pass|fail)'`
Expected: FAIL — no pack body in `garments.json` (the pack tests throw), 15 colliders, `invMass` all 1.

- [ ] **Step 4: Heavy bodies (`js/cloth/solver.js`)**

In `createWorld`, after `garmentOf` is filled:
```js
  // Each particle's inverse mass: a body's material may make it heavier (`mass`, default 1).
  const restInvMass = new Float32Array(count);
  garments.forEach(({ material }, g) => restInvMass.fill(1 / (material.mass ?? 1), offsets[g], offsets[g] + counts[g]));
```
and in the returned world `invMass: Float32Array.from(restInvMass),` plus `restInvMass,`. Update the `createWorld` JSDoc material type with `mass?:number`. In `release`:
```js
  world.grip.ids.forEach((i) => { world.invMass[i] = world.restInvMass[i]; });
```

- [ ] **Step 5: A hold per body (`js/cloth/hand.js`)**

Change the `createHand` JSDoc and signature:
```js
/**
 * @param {{world: object, colliders: object[], ray: (sx: number, sy: number) => {origin: number[], dir: number[]},
 *          holds?: ({radius: number, lift: number}|undefined)[]}} options
 *   holds[g]: how the hand holds body g — the pack: a wide patch lifted a little. Garments use the default.
 */
export function createHand({ world, colliders, ray, holds = [] }) {
  let held = null; // { garment, lift, base, height, want, xy, sx, sy, script }

  const wantAt = (x, y) => Math.max(held.base, supportHeight(world, colliders, x, y, { skip: held.garment }) + held.lift);
```
and replace `take`:
```js
  function take(garment, ids, point) {
    drop();
    // A body with a hold of its own (the pack) rides only its own lift above what lies beneath.
    const { radius, lift, floor } = holds[garment]
      ? { floor: 0, ...holds[garment] }
      : { radius: GRIP_RADIUS, lift: LIFT, floor: MIN_HEIGHT };
    hold(world, garment, gripCluster(world, { garment, ids, point }, radius), point);
    held = {
      garment, lift, base: Math.max(point[2] + lift, floor), height: point[2], want: 0, xy: [point[0], point[1]], sx: 0, sy: 0, script: null,
    };
  }
```

- [ ] **Step 6: The pack in the layer (`js/cloth/layer.js`, `js/scene/solids.js`, `tools/build-pile.mjs`)**

`js/scene/solids.js` — delete `floorItemCollider('pack', CONTENTS.pack, 0),`; the comment: "Oriented boxes for the walls, the open flaps, the booklet, the desiccant and the books (the pack is cloth: js/cloth)."

`js/cloth/layer.js`:
- constants: `const FILM_PICK = 0.02; // the pack is picked up wherever there is any film`
- `DISABLED`: add `bodies: Object.freeze([]),`
- in `loadAssets`, after the pile checks:
```js
  const kinds = data.garments.map((g) => g.kind ?? 'garment');
  if (kinds.indexOf('film') >= 0 && kinds.slice(kinds.indexOf('film')).some((k) => k !== 'film')) {
    throw new Error('garments.json: the film body (the pack) must come after the garments');
  }
```
- in `createLayer`, after `alphaAt`:
```js
  const isFilm = data.garments.map((g) => g.kind === 'film');
  // Garments are picked where their picture is mostly opaque; the pack's clear film wherever there is any.
  const pickable = (g, u, v) => (isFilm[g] ? Number(alphaAt[g](u, v) > FILM_PICK) : alphaAt[g](u, v));
```
  and give the hand the holds: `createHand({ world, colliders, ray: …, holds: data.garments.map((g) => g.hold) })`.
- `place(shift)`: shift only garments — `(i % 3 === 0 && !isFilm[g] ? v + shift : v)` (the callback gets `g` from `forEach(({ positions }, g) => …)`); `clearAside`'s comment: "Every garment off to the side of the box (previews and tests); the pack stays."
- the returned object:
```js
    garments: Object.freeze(data.garments.filter((_, g) => !isFilm[g]).map(({ id, label }) => Object.freeze({ id, label }))),
    /** Every body: the garments, then the pack. */
    bodies: Object.freeze(data.garments.map(({ id, label, kind = 'garment' }) => Object.freeze({ id, label, kind }))),
```
  and `pickAt`:
```js
    pickAt(sx, sy) {
      if (!visible) return null;
      const hit = pick(world, meshes, screenRay(camera.frame(), viewport(), sx, sy), pickable);
      return hit && { ...hit, opacity: alphaAt[hit.garment](hit.uv[0], hit.uv[1]) };
    },
```

`tools/build-pile.mjs` — after `parked`:
```js
/** A film body (the pack) lies flat where CONTENTS.pack puts it, never folded. */
const laidFlat = (mesh) => Float32Array.from(mesh.rest, (v, i) => v + [CONTENTS.pack.x, CONTENTS.pack.y, THICKNESS / 2][i % 3]);
```
in `buildPile`:
```js
  garments.forEach((garment, g) => {
    setPositions(world, g, garment.kind === 'film' ? laidFlat(meshes[g]) : parked(meshes[g].rest));
    sleep(world, g);
  });
```
in `main()`: `const order = data.garments.filter((g) => g.kind !== 'film').map((g) => g.id);`. File comment: "The pack (a film body) lies flat in its place first; each garment is then…".

- [ ] **Step 7: Rebuild the data and run the unit tests**

Run: `npm run clothes && npm test 2>&1 | tail -8`
Expected: nine records (the pack last), a pile accepted; all unit tests pass. If `'dragged by its middle…'` fails on its shape check, the pack is too soft: lower `MATERIAL["bendCompliance"]` in `tools/pack_body.py` (1e-7 → 1e-8, then 0), re-run — never loosen the test. If the pile test now finds the pack more than 25 % covered, move the leftmost `PLAN` centres right by 6.

- [ ] **Step 8: Hand-over, hooks and shots (`css/scene.css`, `js/main.js`, `tools/shots.mjs`)**

`css/scene.css`, after `.pack-img, .pack-shade`:
```css
/* With the clothes layer showing, the pack is drawn there, a body visitors can move; the CSS pack is the fallback.
   Out of sight, not out of the accessibility tree: screen readers still hear photo.alt. */
.pack.is-handed-over { opacity: 0; }
```

`js/main.js` — in `wireClothes`, before `machine.subscribe`:
```js
  /** Show or hide the clothes; while they show, the layer draws the pack and the CSS one steps aside. */
  const showClothes = (on) => {
    clothes.show(on);
    app.scene.pack.el.classList.toggle('is-handed-over', clothes.enabled && on);
  };
```
and use `showClothes(…)` for both `clothes.show(…)` calls in the subscriber. In `globalThis.__parcel`:
```js
    /** The id of the body (a garment or the pack) on top at screen point (x, y), or null. */
    pick: (x, y) => {
      const hit = app.clothes.pickAt(x, y);
      return hit ? app.clothes.bodies[hit.garment].id : null;
    },
    /** What lies on top at (x, y): its id, the texture point and the picture's opacity there. */
    hit: (x, y) => {
      const hit = app.clothes.pickAt(x, y);
      return hit ? { id: app.clothes.bodies[hit.garment].id, uv: hit.uv, opacity: hit.opacity } : null;
    },
    garmentBox: (id) => app.clothes.screenBox(app.clothes.bodies.findIndex((g) => g.id === id)),
```

`tools/shots.mjs` — the CSS pack may be handed over (transparent); clip the close-up to the drawn pack when there is one:
```js
    const packBox = await page.evaluate(() => {
      const drawn = window.__parcel.garmentBox('pack');
      return drawn ?? document.querySelector('.pack-body').getBoundingClientRect().toJSON();
    });
    await page.screenshot({ path: `${out}/${name}-pack.png`, clip: padded({ x: packBox.left, y: packBox.top, width: packBox.width, height: packBox.height }) });
```

- [ ] **Step 9: Write the e2e tests**

`tests/e2e/clothes-helpers.js` — append:
```js
/** Screen points spread over a body's outline on screen, n − 1 to a side. */
export async function gridOver(page, id, n = 16) {
  const box = await page.evaluate((gid) => window.__parcel.garmentBox(gid), id);
  const points = [];
  for (let j = 1; j < n; j += 1) {
    for (let i = 1; i < n; i += 1) points.push({ x: box.left + (box.width * i) / n, y: box.top + (box.height * j) / n });
  }
  return points;
}

/** Those of `points` where the pack's clear film is on top all around (its picture 0.3–0.6 opaque within 5 px). */
export async function filmPoints(page, points) {
  return page.evaluate((all) => all.filter(({ x, y }) => [[0, 0], [-5, -5], [5, -5], [-5, 5], [5, 5]].every(([dx, dy]) => {
    const hit = window.__parcel.hit(x + dx, y + dy);
    return hit?.id === 'pack' && hit.opacity > 0.3 && hit.opacity < 0.6;
  })), points);
}
```

`tests/e2e/clothes.spec.js` — import `gridOver`, `filmPoints` (and `dragMouse`, `waitForSettled`, `pointOn` if not yet imported); in the desktop describe:
```js
  test('the pack can be picked up anywhere, clear film included, and moved', async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    const [film] = await filmPoints(page, await gridOver(page, 'pack'));
    expect(film, 'a point over clear film').toBeDefined();
    expect(await page.evaluate(([x, y]) => window.__parcel.pick(x, y), [film.x, film.y])).toBe('pack');
    const before = await centreOf(page, 'pack');
    await dragMouse(page, film, { x: film.x + 40, y: film.y });
    await waitForSettled(page);
    expect((await centreOf(page, 'pack'))[0] - before[0]).toBeGreaterThan(10);
  });

  test('while the clothes show, the drawn pack stands in for the CSS one; restart puts it back', async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    const opacity = () => page.$eval('.pack', (el) => getComputedStyle(el).opacity);
    expect(await opacity()).toBe('0');
    expect(await page.$eval('.pack-img', (img) => img.alt), 'screen readers still hear it').not.toBe('');
    const home = await centreOf(page, 'pack');
    const grip = await pointOn(page, 'pack');
    await dragMouse(page, grip, { x: grip.x + 40, y: grip.y });
    await waitForSettled(page);
    await page.click('#restart');
    await waitForState(page, 'sealed');
    expect(await opacity()).toBe('1');
    expect(await centreOf(page, 'pack')).toEqual(home);
  });

  test('the keyboard offers to move the garments, never the pack', async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    const labels = await page.$$eval('#clothes-controls button', (buttons) => buttons.map((b) => b.getAttribute('aria-label')));
    expect(labels).toHaveLength(8);
    labels.forEach((label) => expect(label).not.toMatch(/pack/i));
  });
```
inside `test.describe('without WebGL', …)`:
```js
  test('the CSS pack stays, flat, as the fallback', async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    await expect(page.locator('.pack')).toBeVisible();
    await expect(page.locator('.pack-edge')).toHaveCount(0);
  });
```
(follow that describe's existing set-up for removing WebGL2).

`tests/e2e/assets.spec.js` — in `'the vacuum pack and the desiccant packet lie on the box floor'` the CSS pack is handed over (transparent), so measure layout boxes:
```js
  const rect = (selector) => page.$eval(selector, (el) => el.getBoundingClientRect().toJSON());
  const [packBox, bookBox] = await Promise.all([rect('.pack-body'), rect('.book3d')]);
```

`tests/e2e/journey.spec.js` — replace `await expect(page.locator('.pack')).toBeVisible();` with
```js
    expect(await pointOn(page, 'pack'), 'the pack lies in the box').not.toBeNull();
```
(import `pointOn` from `./clothes-helpers.js`).

- [ ] **Step 10: Run the e2e tests**

Run: `npx playwright test --workers=2`
Expected: all pass. (The pack's clear film is not drawn yet — Task 9 — so the pack shows only its contents in the WebGL layer; the tests above do not look at its pixels.)

- [ ] **Step 11: Verify and commit**

Run `/verify`, then:
```bash
git add tools/prepare_pack.py tools/pack_body.py tools/generate_clothes.py tools/tests assets/photo/vacuum-pack-relief.webp assets/clothes js/cloth/solver.js js/cloth/hand.js js/cloth/layer.js js/scene/solids.js tools/build-pile.mjs js/main.js css/scene.css tools/shots.mjs tests/unit tests/e2e
git commit -m "feat: the vacuum pack is a body visitors can pick up and move

It joins the clothes as a ninth, film body: heavy, very stiff, held by a
wide patch and lifted only a little, so it flexes and settles flat. The CSS
pack stays as the fallback without WebGL2.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Drawing the clear film

*(Spec Revision B: B4 drawing and relief; spec step 5b.)*

**Files:**
- Modify: `js/cloth/render.js` (`CLOTH_FS`, `createGarment`, `draw`), `js/cloth/layer.js` (`looks[g].film`, `pixelAt`), `js/main.js` (`__parcel.pixel`), `tools/pack_body.py` (sheen and bump, if the look needs it)
- Test: `tests/e2e/clothes-helpers.js`, `tests/e2e/clothes.spec.js`

**Interfaces:**
- Consumes: the film body and `bodies` (Task 8); Task 7's renderer (`looks`, relief, `drawElements` per garment).
- Produces: `looks[g].film: boolean`; the renderer draws film bodies last, blended (premultiplied) and depth-tested without writing depth; layer `pixelAt(sx, sy) -> [r, g, b, a] | null`; `__parcel.pixel(x, y)`.

- [ ] **Step 1: Write the failing e2e tests**

`tests/e2e/clothes-helpers.js` — append:
```js
/** The colour the clothes layer draws at (x, y): [r, g, b, a], premultiplied, 0–255. */
export const pixelAt = (page, x, y) => page.evaluate(([px, py]) => window.__parcel.pixel(px, py), [x, y]);
```

`tests/e2e/clothes.spec.js` — import `pixelAt`; in the desktop describe:
```js
  test("the pack's clear film is drawn see-through and pale, not cut away", async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    const [film] = await filmPoints(page, await gridOver(page, 'pack'));
    expect(film, 'a point over clear film').toBeDefined();
    const [r, g, b, a] = await pixelAt(page, film.x, film.y);
    expect(a, 'partly see-through').toBeGreaterThan(0.25 * 255);
    expect(a, 'partly see-through').toBeLessThan(0.85 * 255);
    expect((r + g + b) / 3 / a, 'pale film, not a shadow').toBeGreaterThan(0.5);
  });

  test('cloth beneath the pack shows through its clear film', async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    const box = await page.$eval('.book-top', (el) => el.getBoundingClientRect().toJSON());
    const over = [];
    for (let j = 1; j < 14; j += 1) {
      for (let i = 1; i < 14; i += 1) over.push({ x: box.left + (box.width * i) / 14, y: box.top + (box.height * j) / 14 });
    }
    const pile = await page.evaluate((points) => points
      .filter(({ x, y }) => window.__parcel.pick(x, y))
      .map((p) => ({ ...p, colour: window.__parcel.pixel(p.x, p.y) })), over);

    // The same pile with the pack lifted over it; everything lies asleep, so nothing moves.
    await page.route('**/assets/clothes/pile.json', async (route) => {
      const json = await (await route.fetch()).json();
      const pack = json.garments.find((g) => g.id === 'pack');
      pack.positions = pack.positions.map((v, i) => v + [200, 0, 70][i % 3]);
      await route.fulfill({ json });
    });
    await page.goto('/?jump=overhead');
    await waitForState(page, 'overhead');
    const under = await filmPoints(page, pile);
    const shown = await page.evaluate((points) => points.map((p) => ({ ...p, after: window.__parcel.pixel(p.x, p.y) })), under);
    expect(shown.length, 'points where clear film lies over the pile').toBeGreaterThanOrEqual(2);
    shown.forEach((p) => expect(p.after, `the film is drawn at (${p.x}, ${p.y})`).not.toEqual(p.colour));
    const luma = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;
    const sorted = [...shown].sort((p, q) => luma(q.colour) - luma(p.colour));
    const [light, dark] = [sorted[0], sorted.at(-1)];
    const contrast = luma(light.colour) - luma(dark.colour);
    expect(contrast, 'the film lies over garments of different shades').toBeGreaterThan(40);
    expect(luma(light.after) - luma(dark.after), 'they still differ through the film').toBeGreaterThan(0.3 * contrast);
  });
```

- [ ] **Step 2: A pixel probe for the tests (`js/cloth/layer.js`, `js/main.js`)**

`js/cloth/layer.js` — `DISABLED` gets `pixelAt: () => null,`; the returned object:
```js
    /** The colour drawn at screen point (sx, sy) in CSS pixels: [r, g, b, a], premultiplied, 0–255 (tests). */
    pixelAt(sx, sy) {
      if (!visible || lost) return null;
      draw(); // read back in the same task, before the browser presents and clears the buffer
      const ratio = canvas.width / (canvas.clientWidth || innerWidth);
      const out = new Uint8Array(4);
      gl.readPixels(Math.round(sx * ratio), canvas.height - 1 - Math.round(sy * ratio), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return [...out];
    },
```
`js/main.js` — in `globalThis.__parcel`: `pixel: (x, y) => app.clothes.pixelAt(x, y),`.

- [ ] **Step 3: Run them to see them fail**

Run: `npx playwright test tests/e2e/clothes.spec.js -g "film" --workers=2`
Expected: FAIL — over clear film the pixel is only the box's shadow tint (black, or nothing): the film is cut away; and through-the-film pixels equal the pile's own.

- [ ] **Step 4: The film pass (`js/cloth/render.js`)**

File comment — after the `3. cloth` pass add:
```js
 *   4. film     — the pack's clear film, last, blended over whatever lies
 *                 beneath; it writes no depth, so cloth beneath shows through
 *                 it and cloth above (drawn already) hides it.
```
`CLOTH_FS` — add `uniform float uFilm;` after `uniform float uLightLevel;`; replace the alpha lines:
```glsl
  vec4 tex = texture(uTex, vUv); // premultiplied on upload
  // garments: a crisp cut-out edge, about one pixel wide, whatever the zoom;
  // the pack's clear film: its own opacity, blended over what lies beneath
  float alpha = uFilm > 0.5 ? tex.a : clamp((tex.a - 0.5) / max(fwidth(tex.a), 1e-4) + 0.5, 0.0, 1.0);
```
and the last line of `main()`:
```glsl
  // the film's gloss lies on top of whatever shows through it, so it adds opacity too
  float gloss = uFilm * pow(max(0.0, dot(n, h)), 80.0) * uSheen * sun * uLightLevel;
  outColor = vec4(color * alpha + gloss, min(1.0, alpha + gloss));
```
`createGarment` — take `film` from the look (`{ image, relief, reliefTexel, sheen, bump, film }`) and keep it: `film: Boolean(film),` in the garment object.

`draw` — replace the garments loop (and the `SAMPLE_ALPHA_TO_COVERAGE` lines around it) with:
```js
    const drawBody = (garment) => {
      gl.uniform1f(cloth.uniforms.uSheen, garment.sheen);
      gl.uniform1f(cloth.uniforms.uBump, garment.bump);
      gl.uniform2fv(cloth.uniforms.uReliefTexel, garment.reliefTexel);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, garment.relief);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, garment.texture);
      gl.bindVertexArray(garment.vao);
      gl.drawElements(gl.TRIANGLES, garment.count, gl.UNSIGNED_SHORT, 0);
    };
    gl.uniform1f(cloth.uniforms.uFilm, 0);
    gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    garments.filter((garment) => !garment.film).forEach(drawBody);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    const films = garments.filter((garment) => garment.film);
    if (films.length > 0) {
      // One translucent body only, so no sorting among films is needed (a second would need it).
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.uniform1f(cloth.uniforms.uFilm, 1);
      films.forEach(drawBody);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
```
The shadow pass is unchanged: it keeps texels at least half opaque, so the pack's contents cast a shadow and its clear film (0.45) casts none.

`js/cloth/layer.js` — in the `looks` map add `film: g.kind === 'film',`.

- [ ] **Step 5: Run the tests**

Run: `npm test 2>&1 | tail -3 && npx playwright test --workers=2`
Expected: all pass, including the two film tests.

- [ ] **Step 6: Look at it**

Run `node tools/shots.mjs`; view `shots/desktop-pack.png`, `shots/desktop-overhead.png` and `shots/phone-overhead.png`. The pack should look as it did as CSS (checkpoint A): see-through film over the cardboard, a soft gloss, the bulges over the contents catching the light, its contents' shadow on the floor, no fringes. Compare against `git show 5e56d45:assets/photo/vacuum-pack.webp` laid over cardboard if unsure. Tune in `tools/pack_body.py` — `sheen` (gloss strength), `bump` (relief strength) — then `npm run clothes`; never touch the film's opacity here (that is `--film` in `prepare_pack.py`, approved at checkpoint A).

- [ ] **Step 7: Verify and commit**

Run `/verify`, then:
```bash
git add js/cloth/render.js js/cloth/layer.js js/main.js tools/pack_body.py assets/clothes tests/e2e/clothes-helpers.js tests/e2e/clothes.spec.js
git commit -m "feat: draw the pack's clear film see-through, over the cloth beneath

The film is drawn last, blended and without writing depth: cloth beneath
shows through it, cloth on top hides it, and only its contents cast a shadow.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The garment generator, and the qipao

**Files:**
- Create: `tools/clothes/__init__.py`, `tools/clothes/curves.py`, `tools/clothes/canvas.py`, `tools/clothes/fabrics.py`, `tools/clothes/details.py`, `tools/clothes/motifs.py`, `tools/clothes/traditional.py`, `tools/tests/test_clothes_canvas.py`, `tools/tests/test_generate_clothes.py`
- Rewrite: `tools/generate_clothes.py`
- Output: `assets/clothes/qipao.webp`, `assets/clothes/qipao-relief.webp`, `assets/clothes/garments.json`, `assets/clothes/pile.json`
- Test: `tests/unit/clothes-data.test.js`, `tests/e2e/clothes.spec.js`

**Interfaces:**
- Consumes: Task 5 (`grid.core`), Task 7 (`relief`, `pxPerUnit`, `material.bump`), Task 3 (`clothes.fit`: `CELL`, `fit`, `grid_shape`, `cell_grid`; `tools/clothes/__init__.py` exists), Task 8 (`pack_body.pack_record`).
- Produces (Python, used by Tasks 11–12):
  - `canvas`: `S` (8 drawing px per unit), `PX` (4), `FLAT` (128), `Canvas(width, height, seed)` with `.w .h .size .rng .np_rng .grid_shape .mask .colour .relief .depth`, `.px(points)`, `.shape(outline)`, `.cut(outline)`, `.region(outline) -> L image`, `.punch(ink)`, `.layer() -> (RGBA, draw)`, `.ink() -> (L, draw)`, `.paint(img, clip=None)`, `.raise_(ink, height, blur=0.0)`, `.fill(fabric, region=None)`, `.finish(colour_path, relief_path, shape=None) -> (colour, relief, grid)` (`shape` = (cols, rows); default cells of `SPACING` pattern units).
  - `curves`: `Point`, `catmull(points, closed=True, steps=10)`, `mirror(half, width)`, `sym(half, width, steps=10)`, `flip(points, width)`, `mirror_x(side, width) -> callable`, `offset(points, d)`, `along(points, step) -> [(point, (dx, dy))]`, `dash_segments(points, dash, gap)`.
  - `fabrics`: `Fabric(rgb, relief)`, `rgb_of`, `fibres`, `jersey`, `rib`, `linen`, `cotton`, `twill`, `satin`, `woven(ground, figure, colour, height)`, `stripes(ground, colour, pitch, band, start=0, angle=0, origin=(0, 0))`, `blend(a, b, mask)`.
  - `details`: `emboss`, `stitches`, `seam`, `topstitched_seam`, `raised`, `hem`, `piping`, `trim`, `figure`, `frog_closure`, `knot_button`, `cord_loop`, `button`, `rib_band`, `pleat`, `gathers`, `picot`, `lace`, `zip_line`.
  - `motifs`: `peony(draw, x, y, r, fill, rng)`, `cloud(draw, x, y, r, fill)`, `flower(draw, x, y, r, petal, centre)`.
  - `generate_clothes`: `ORDER`, `Garment`, `GARMENTS`, `merge(existing, fresh, old_px)`, `main(argv) -> int`.
- Produces (data): each redrawn record has `texture`, `relief`, `pxPerUnit` (PX ÷ fit), `size` (pattern size × fit, parcel units), `signature: [u, v]`, `grid {cols, rows, cells, core}`, `material {stretchCompliance, bendCompliance, friction, sheen, bump}`; records not redrawn keep their old fields (Task 3 gave them `pxPerUnit`); the pack's record (Task 8) is written fresh, last, every time.

- [ ] **Step 1: Write the failing Python tests**

`tools/tests/test_clothes_canvas.py`:
```python
import numpy as np
from PIL import Image

from clothes.canvas import FLAT, S, Canvas
from clothes.details import piping, seam
from clothes.fabrics import jersey


def plain(w=30, h=20, outline=None, colour="#ffffff", seed="t", fill=True):
    c = Canvas(w, h, seed)
    c.shape(outline or [(0, 0), (w, 0), (w, h), (0, h)])
    if fill:
        c.fill(jersey(c.grid_shape, c.np_rng, colour))
    return c


def test_slivers_are_cloth_but_not_core(tmp_path):
    c = plain(outline=[(0, 0), (20.5, 0), (20.5, 20), (0, 20)])
    _, _, grid = c.finish(tmp_path / "c.webp", tmp_path / "r.webp")
    assert (grid["cols"], grid["rows"]) == (3, 2)
    assert grid["cells"] == "111111"
    assert grid["core"] == "110110"


def test_relief_lines_up_with_colour_and_is_flat_off_the_garment(tmp_path):
    c = plain(outline=[(5, 5), (25, 5), (25, 15), (5, 15)])
    colour, relief, _ = c.finish(tmp_path / "c.webp", tmp_path / "r.webp")
    assert colour.size == relief.size == (120, 80)
    assert Image.open(tmp_path / "r.webp").size == (120, 80)
    assert relief.getpixel((2, 2)) == FLAT


def test_no_light_or_shade_is_painted(tmp_path):
    c = plain(60, 60, outline=[(5, 5), (55, 5), (55, 55), (5, 55)], colour="#c03040")
    colour, _, _ = c.finish(tmp_path / "c.webp", tmp_path / "r.webp")
    rgb = np.asarray(colour.convert("RGB"), np.float32)
    near_edge = rgb[4 * 7 : 4 * 9, 4 * 10 : 4 * 50].mean()  # 2–4 units inside the top edge
    middle = rgb[4 * 25 : 4 * 35, 4 * 25 : 4 * 35].mean()
    assert abs(near_edge - middle) / middle < 0.02


def test_a_cut_removes_cloth_and_its_colour(tmp_path):
    c = plain()
    c.cut([(10, -1), (20, -1), (15, 10)])
    colour, _, _ = c.finish(tmp_path / "c.webp", tmp_path / "r.webp")
    assert colour.getpixel((60, 8))[3] == 0  # (15, 2) units
    assert colour.getpixel((8, 60))[3] == 255


def test_seams_sink_and_piping_stands_proud():
    c = plain(40, 20, fill=False)
    seam(c, [(5, 5), (35, 5)])
    piping(c, [(5, 14), (35, 14)], (240, 220, 180, 255))
    assert c.relief[round(5 * S), 20 * S] < -0.1
    assert c.relief[round(14 * S), 20 * S] > 0.5


def test_the_same_seed_draws_the_same_garment():
    a, b = plain(seed="same"), plain(seed="same")
    assert np.array_equal(np.asarray(a.colour), np.asarray(b.colour))
    assert np.array_equal(a.relief, b.relief)
```

`tools/tests/test_generate_clothes.py`:
```python
import pytest

import generate_clothes as gen


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
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm run test:py`
Expected: FAIL — `ModuleNotFoundError: No module named 'clothes.canvas'` / no `merge` in `generate_clothes`.

- [ ] **Step 3: `tools/clothes/__init__.py` and `curves.py`**

`tools/clothes/__init__.py`:
```python
"""Drawing the garments for the clothes pile: colour, relief and cloth data (see tools/generate_clothes.py)."""
```

`tools/clothes/curves.py`:
```python
"""Curves for drawing garments, in parcel units (x right, y down)."""

from __future__ import annotations

import math
from typing import Callable

Point = tuple[float, float]


def catmull(points: list[Point], closed: bool = True, steps: int = 10) -> list[Point]:
    """A smooth curve through the given points."""
    pts = points + points[:3] if closed else [points[0], *points, points[-1]]
    out: list[Point] = []
    count = len(points) if closed else len(points) - 1
    for i in range(count):
        p0, p1, p2, p3 = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                       + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
                for k in (0, 1)
            ))
    if not closed:
        out.append(points[-1])
    return out


def mirror(half: list[Point], width: float) -> list[Point]:
    """Right half of a symmetric outline (top centre → bottom centre) → the whole outline."""
    return half + [(width - x, y) for x, y in reversed(half)]


def sym(half: list[Point], width: float, steps: int = 10) -> list[Point]:
    """A smooth symmetric outline from its right half."""
    return catmull(mirror(half, width), steps=steps)


def flip(points: list[Point], width: float) -> list[Point]:
    """The points mirrored left ↔ right."""
    return [(width - x, y) for x, y in points]


def mirror_x(side: int, width: float) -> Callable[[float], float]:
    """x as drawn on the right half (side 1) or mirrored onto the left (side −1)."""
    return (lambda x: x) if side == 1 else (lambda x: width - x)


def offset(points: list[Point], d: float) -> list[Point]:
    """The polyline moved sideways by d: to the left of its direction of travel as seen on screen."""
    out: list[Point] = []
    last = len(points) - 1
    for k, (x, y) in enumerate(points):
        (x0, y0), (x1, y1) = points[max(0, k - 1)], points[min(last, k + 1)]
        dx, dy = x1 - x0, y1 - y0
        length = math.hypot(dx, dy) or 1.0
        out.append((x + d * dy / length, y - d * dx / length))
    return out


def along(points: list[Point], step: float) -> list[tuple[Point, Point]]:
    """Points every `step` units along a polyline, each with the unit direction there."""
    out: list[tuple[Point, Point]] = []
    carry = 0.0
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        length = math.hypot(x1 - x0, y1 - y0)
        if length == 0:
            continue
        dx, dy = (x1 - x0) / length, (y1 - y0) / length
        t = carry
        while t <= length:
            out.append(((x0 + dx * t, y0 + dy * t), (dx, dy)))
            t += step
        carry = t - length
    return out


def dash_segments(points: list[Point], dash: float, gap: float) -> list[tuple[Point, Point]]:
    """The 'on' pieces of a dashed line along a polyline."""
    segments: list[tuple[Point, Point]] = []
    run, on = 0.0, True
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        length = math.hypot(x1 - x0, y1 - y0)
        t = 0.0
        while t < length:
            step = min(length - t, (dash if on else gap) - run)
            if on:
                a = (x0 + (x1 - x0) * t / length, y0 + (y1 - y0) * t / length)
                b = (x0 + (x1 - x0) * (t + step) / length, y0 + (y1 - y0) * (t + step) / length)
                segments.append((a, b))
            t += step
            run += step
            if run >= (dash if on else gap) - 1e-6:
                run, on = 0.0, not on
    return segments
```

- [ ] **Step 4: `tools/clothes/canvas.py`**

```python
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
```

- [ ] **Step 5: `tools/clothes/fabrics.py`**

```python
"""Woven and knitted grounds: colour plus relief, never light or shade."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import ImageColor
from scipy import ndimage as ndi

from .canvas import S

Colour = str | tuple[int, ...]


@dataclass(frozen=True)
class Fabric:
    rgb: np.ndarray  # rows × columns × 3, uint8
    relief: np.ndarray  # rows × columns, float32: height above the plain surface


def rgb_of(colour: Colour) -> np.ndarray:
    values = ImageColor.getrgb(colour) if isinstance(colour, str) else colour
    return np.array(values[:3], np.float32)


def fibres(rng: np.random.Generator, shape: tuple[int, int], along: float, across: float) -> np.ndarray:
    """Unit-variance noise smeared into fibres `along` units tall and `across` units wide."""
    noise = ndi.gaussian_filter(rng.standard_normal(shape).astype(np.float32), (along * S, across * S))
    return (noise - noise.mean()) / max(float(noise.std()), 1e-6)


def coords(shape: tuple[int, int]) -> tuple[np.ndarray, np.ndarray]:
    """x and y of every drawing pixel, in units."""
    yy, xx = np.mgrid[0 : shape[0], 0 : shape[1]].astype(np.float32) / S
    return xx, yy


def tinted(colour: Colour, variation: np.ndarray) -> np.ndarray:
    """The colour, lightened or darkened per pixel by `variation` (a fraction)."""
    return np.clip(rgb_of(colour)[None, None, :] * (1 + variation[..., None]), 0, 255).astype(np.uint8)


def jersey(shape, rng, colour) -> Fabric:
    """Knitted cotton: fine vertical wales."""
    wales, tone = fibres(rng, shape, 1.6, 0.18), fibres(rng, shape, 0.8, 0.8)
    return Fabric(tinted(colour, 0.012 * tone + 0.008 * wales), (0.25 * wales).astype(np.float32))


def rib(shape, rng, colour, pitch: float = 1.5) -> Fabric:
    """Rib knit: raised vertical ribs every `pitch` units."""
    xx, _ = coords(shape)
    ribs = np.cos(2 * np.pi * xx / pitch)
    wales = fibres(rng, shape, 1.6, 0.2)
    return Fabric(tinted(colour, 0.025 * ribs + 0.01 * wales), (0.8 * ribs + 0.12 * wales).astype(np.float32))


def linen(shape, rng, colour) -> Fabric:
    """Plain-woven linen: uneven threads both ways and the odd thick slub."""
    weave = fibres(rng, shape, 0.12, 2.5) + fibres(rng, shape, 2.5, 0.12)
    slubs = np.clip(fibres(rng, shape, 0.25, 6.0) - 1.6, 0, None)
    return Fabric(tinted(colour, 0.018 * weave + 0.05 * slubs), (0.16 * weave + 0.25 * slubs).astype(np.float32))


def cotton(shape, rng, colour) -> Fabric:
    """Fine cotton lawn: an even, faint weave."""
    weave, tone = fibres(rng, shape, 0.15, 0.15), fibres(rng, shape, 1.0, 1.0)
    return Fabric(tinted(colour, 0.01 * tone + 0.01 * weave), (0.1 * weave).astype(np.float32))


def twill(shape, rng, colour, pitch: float = 1.3) -> Fabric:
    """Twill: fine diagonal ribs."""
    xx, yy = coords(shape)
    ribs = np.sin(2 * np.pi * (xx + yy) / pitch)
    tone = fibres(rng, shape, 0.6, 0.6)
    return Fabric(tinted(colour, 0.012 * ribs + 0.012 * tone), (0.3 * ribs + 0.08 * tone).astype(np.float32))


def satin(shape, rng, colour) -> Fabric:
    """Satin: smooth, with long soft streaks along the warp."""
    streaks = fibres(rng, shape, 5.0, 0.35)
    return Fabric(tinted(colour, 0.022 * streaks), (0.04 * streaks).astype(np.float32))


def woven(ground: Fabric, figure: np.ndarray, colour: Colour, height: float = 0.7) -> Fabric:
    """A figure woven into the ground (brocade): its colour where `figure` (0…1) is set, its floats raised."""
    f = figure[..., None]
    rgb = ground.rgb.astype(np.float32) * (1 - f) + rgb_of(colour)[None, None, :] * f
    relief = ground.relief * (1 - figure) + height * figure
    return Fabric(np.clip(rgb, 0, 255).astype(np.uint8), relief.astype(np.float32))


def stripes(ground: Fabric, colour: Colour, pitch: float, band: float, start: float = 0.0,
            angle: float = 0.0, origin: tuple[float, float] = (0.0, 0.0)) -> Fabric:
    """Knitted-in stripes `band` wide every `pitch` units, counted from `start` along the
    direction `angle` degrees from straight down (turned toward +x), measured from `origin`."""
    xx, yy = coords(ground.rgb.shape[:2])
    a = np.radians(angle)
    t = (xx - origin[0]) * np.sin(a) + (yy - origin[1]) * np.cos(a) - start
    phase = np.mod(t, pitch)
    soft = 1.0 / S  # one drawing pixel, in units: the stripe's antialiased edge
    inside = np.clip((band - phase) / soft + 0.5, 0, 1) * np.clip(phase / soft + 0.5, 0, 1) * (t >= 0)
    knit = ground.rgb.astype(np.float32) / np.maximum(ground.rgb.astype(np.float32).mean(axis=(0, 1)), 1)
    stripe = knit * rgb_of(colour)[None, None, :]  # the stripe keeps the knit's texture
    rgb = ground.rgb * (1 - inside[..., None]) + stripe * inside[..., None]
    return Fabric(np.clip(rgb, 0, 255).astype(np.uint8), ground.relief)


def blend(a: Fabric, b: Fabric, mask: np.ndarray) -> Fabric:
    """`b` where `mask` (0…1) is set, `a` elsewhere."""
    m = mask[..., None]
    rgb = a.rgb.astype(np.float32) * (1 - m) + b.rgb.astype(np.float32) * m
    return Fabric(np.clip(rgb, 0, 255).astype(np.uint8), (a.relief * (1 - mask) + b.relief * mask).astype(np.float32))
```

- [ ] **Step 6: `tools/clothes/motifs.py` and `tools/clothes/details.py`**

`tools/clothes/motifs.py`:
```python
"""Small drawings woven or printed into fabric: peonies, auspicious clouds, tiny flowers."""

from __future__ import annotations

import math
import random

from PIL import ImageDraw

from .canvas import S


def peony(draw: ImageDraw.ImageDraw, x: float, y: float, r: float, fill, rng: random.Random) -> None:
    """A round medallion: two rings of petals around a centre."""
    turn = rng.uniform(0, math.tau)
    for ring, (radius, petals) in enumerate(((r, 8), (r * 0.62, 6))):
        for k in range(petals):
            a = turn + ring * 0.3 + k * math.tau / petals
            px, py = x + math.cos(a) * radius * 0.55, y + math.sin(a) * radius * 0.55
            pr = radius * 0.38
            draw.ellipse([(px - pr) * S, (py - pr) * S, (px + pr) * S, (py + pr) * S], outline=fill, width=max(1, round(0.9 * S)))
    cr = r * 0.18
    draw.ellipse([(x - cr) * S, (y - cr) * S, (x + cr) * S, (y + cr) * S], fill=fill)


def cloud(draw: ImageDraw.ImageDraw, x: float, y: float, r: float, fill) -> None:
    """Xiangyun: a small auspicious cloud of three curls."""
    for dx, dy, rr in ((0, 0, r), (r * 1.1, r * 0.35, r * 0.75), (-r * 1.05, r * 0.4, r * 0.7)):
        box = [(x + dx - rr) * S, (y + dy - rr) * S, (x + dx + rr) * S, (y + dy + rr) * S]
        draw.arc(box, 180, 470, fill=fill, width=max(1, round(1.0 * S)))


def flower(draw: ImageDraw.ImageDraw, x: float, y: float, r: float, petal, centre) -> None:
    """A tiny five-petalled print flower."""
    for k in range(5):
        a = k * math.tau / 5
        px, py = x + math.cos(a) * r * 0.55, y + math.sin(a) * r * 0.55
        pr = r * 0.48
        draw.ellipse([(px - pr) * S, (py - pr) * S, (px + pr) * S, (py + pr) * S], fill=petal)
    cr = r * 0.25
    draw.ellipse([(x - cr) * S, (y - cr) * S, (x + cr) * S, (y + cr) * S], fill=centre)
```

`tools/clothes/details.py`:
```python
"""Construction details — seams, stitching, hems, trims and fastenings — as colour and relief."""

from __future__ import annotations

import math
from typing import Callable

import numpy as np
from PIL import Image, ImageChops, ImageDraw

from .canvas import Canvas, S
from .curves import Point, along, catmull, dash_segments, offset

Shapes = Callable[[ImageDraw.ImageDraw, object], None]
THREAD_WIDTH = 0.35


def emboss(c: Canvas, shapes: Shapes, colour=None, height: float = 1.0, blur: float = 0.25) -> None:
    """Draw `shapes(draw, fill)` in `colour` (if any) and raise them by `height` in the relief."""
    if colour is not None:
        img, draw = c.layer()
        shapes(draw, colour)
        c.paint(img)
    ink, draw = c.ink()
    shapes(draw, 255)
    c.raise_(ink, height, blur)


def smooth(path: list[Point], on: bool = True) -> list[Point]:
    return catmull(path, closed=False, steps=12) if on and len(path) > 2 else path


def line(c: Canvas, path: list[Point], width: float) -> Shapes:
    pts, w = c.px(path), max(1, round(width * S))
    return lambda draw, fill: draw.line(pts, fill=fill, width=w, joint="curve")


def stitches(c: Canvas, path: list[Point], thread, dash: float = 1.6, gap: float = 0.8,
             width: float = THREAD_WIDTH, curve: bool = True) -> None:
    """A row of running stitches."""
    segments = dash_segments(smooth(path, curve), dash, gap)
    w = max(1, round(width * S))

    def shapes(draw, fill):
        for a, b in segments:
            draw.line(c.px([a, b]), fill=fill, width=w)

    emboss(c, shapes, thread, height=0.5, blur=0.08)


def seam(c: Canvas, path: list[Point], depth: float = 1.0, curve: bool = True) -> None:
    """Two pieces sewn together: a groove, with the seam allowance pressed up on either side."""
    pts = smooth(path, curve)
    emboss(c, line(c, pts, 2.4), None, height=0.35, blur=0.5)
    emboss(c, line(c, pts, 0.5), None, height=-depth, blur=0.2)


def topstitched_seam(c: Canvas, path: list[Point], thread, gap: float = 1.2) -> None:
    """A seam with a row of stitches beside it."""
    pts = smooth(path)
    seam(c, pts, curve=False)
    stitches(c, offset(pts, gap), thread, curve=False)


def raised(c: Canvas, outline: list[Point], height: float = 0.6, blur: float = 0.3) -> None:
    """A piece lying on top of the garment — a collar, a cuff, a waistband — raised as a whole."""
    c.raise_(c.region(outline), height, blur)


def hem(c: Canvas, path: list[Point], thread, depth: float, twin: bool = False) -> None:
    """A turned-up hem: the band between the edge and the stitch line `path` stands a little proud."""
    pts = smooth(path)
    near, draw = c.ink()
    draw.line(c.px(pts), fill=255, width=max(1, round(2 * (depth + 1) * S)), joint="curve")
    band = (np.asarray(near) > 0) & (c.depth < depth)
    c.raise_(Image.fromarray((band * 255).astype(np.uint8)), 0.6, blur=0.3)
    for row in ([offset(pts, 0.6), offset(pts, -0.6)] if twin else [pts]):
        stitches(c, row, thread, curve=False)


def piping(c: Canvas, path: list[Point], colour, width: float = 1.5, height: float = 1.3, curve: bool = True) -> None:
    """A rolled cord of contrast fabric along an edge or a seam."""
    emboss(c, line(c, smooth(path, curve), width), colour, height=height, blur=width * 0.3)


def trim(c: Canvas, path: list[Point], colour, width: float = 2.4, height: float = 0.4) -> None:
    """A flat woven band sewn on: a border or a ribbon."""
    emboss(c, line(c, smooth(path), width), colour, height=height, blur=0.15)


def figure(c: Canvas, ink: Image.Image, colour, height: float = 0.7) -> None:
    """Colour and raise the cloth where `ink` is white: a motif woven or embroidered in."""
    c.paint(Image.new("RGBA", c.size, colour), clip=ink)
    c.raise_(ink, height, blur=0.1)


def frog_closure(c: Canvas, x: float, y: float, angle: float, colour, scale: float = 1.0) -> None:
    """Pankou: a knot on one side, a loop on the other, both of rolled cord, with coiled ends."""
    ca, sa = math.cos(angle), math.sin(angle)

    def at(u: float, v: float) -> Point:
        return ((x + (u * ca - v * sa) * scale) * S, (y + (u * sa + v * ca) * scale) * S)

    cord = max(1, round(1.3 * scale * S))

    def shapes(draw, fill):
        for side in (-1, 1):
            arm = [at(side * u, 2.4 * math.sin(math.pi * u / 8)) for u in np.linspace(0, 8, 14)]
            back = [at(side * u, -2.4 * math.sin(math.pi * u / 8)) for u in np.linspace(8, 0, 14)]
            draw.line(arm + back, fill=fill, width=cord, joint="curve")
            ex, ey = at(side * 8.6, 0)
            r = 1.4 * scale * S
            draw.ellipse([ex - r, ey - r, ex + r, ey + r], outline=fill, width=cord)
        kx, ky = at(-1.2, 0)
        r = 2.1 * scale * S
        draw.ellipse([kx - r, ky - r, kx + r, ky + r], fill=fill)

    emboss(c, shapes, colour, height=1.8, blur=0.3)


def knot_button(c: Canvas, x: float, y: float, r: float, colour) -> None:
    """A Chinese knot button: a small ball of braided cord."""
    box = [(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S]
    emboss(c, lambda draw, fill: draw.ellipse(box, fill=fill), colour, height=1.8, blur=r * 0.45)
    braid = [((x - r * 0.6), y - r * 0.2), (x, y + r * 0.3), (x + r * 0.6, y - r * 0.2)]
    emboss(c, line(c, braid, 0.3), None, height=-0.6, blur=0.05)


def cord_loop(c: Canvas, x: float, y: float, length: float, colour, width: float = 0.9) -> None:
    """A loop of rolled cord, lying from (x, y) to the right, that holds a knot button."""
    loop = [(x, y - 0.9), (x + length * 0.6, y - 1.6), (x + length, y), (x + length * 0.6, y + 1.6), (x, y + 0.9)]
    piping(c, loop, colour, width=width, height=1.0)


def button(c: Canvas, x: float, y: float, r: float, colour, thread) -> None:
    """A flat sew-through button with four holes, sewn on with crossed thread."""
    box = [(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S]
    emboss(c, lambda draw, fill: draw.ellipse(box, fill=fill), colour, height=1.0, blur=0.15)
    h = r * 0.32
    for a, b in ((((x - h), (y - h)), ((x + h), (y + h))), (((x + h), (y - h)), ((x - h), (y + h)))):
        emboss(c, line(c, [a, b], 0.3), thread, height=-0.3, blur=0.05)


def rib_band(c: Canvas, path: list[Point], width: float, pitch: float = 0.9, sewn: int = 1, colour=None) -> None:
    """A knitted band along `path` (a neckband, a sleeve band): ribs run across it, sewn on along one edge."""
    pts = smooth(path)
    if colour is not None:
        emboss(c, line(c, pts, width), colour, height=0.0)
    half = width / 2
    ink, draw = c.ink()
    for (px, py), (dx, dy) in along(pts, pitch):
        draw.line(c.px([(px + dy * half, py - dx * half), (px - dy * half, py + dx * half)]), fill=255,
                  width=max(1, round(0.35 * S)))
    c.raise_(ink, 0.5, blur=0.1)
    seam(c, offset(pts, sewn * half), depth=0.8, curve=False)


def pleat(c: Canvas, path: list[Point], height: float = 1.2) -> None:
    """The fold edge of a knife pleat: the folded layer stands up, the crease beside it sinks."""
    pts = smooth(path)
    emboss(c, line(c, offset(pts, 0.8), 1.8), None, height=height, blur=0.6)
    emboss(c, line(c, offset(pts, -0.4), 0.5), None, height=-height, blur=0.15)


def gathers(c: Canvas, paths: list[list[Point]], height: float = 0.8) -> None:
    """Soft ridges of fabric gathered in: ruching, shirring, a puffed sleeve cap."""
    for path in paths:
        emboss(c, line(c, smooth(path), 0.9), None, height=height, blur=0.45)


def picot(c: Canvas, path: list[Point], colour, spacing: float = 1.3, r: float = 0.55) -> None:
    """A picot trim: a row of tiny loops along an edge."""
    points = [p for p, _ in along(smooth(path), spacing)]

    def shapes(draw, fill):
        for x, y in points:
            draw.ellipse([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], fill=fill)

    emboss(c, shapes, colour, height=0.7, blur=0.1)


def lace(c: Canvas, outline: list[Point], colour, hole: float = 0.55, pitch: float = 2.2) -> None:
    """Lace over the band `outline`: its own colour, a net of small holes, little raised flowers."""
    region = c.region(outline)
    c.paint(Image.new("RGBA", c.size, colour), clip=region)
    holes, hdraw = c.ink()
    blooms, bdraw = c.ink()
    xs, ys = [x for x, _ in outline], [y for _, y in outline]
    for row, y in enumerate(np.arange(min(ys) + pitch / 2, max(ys), pitch)):
        for col, x in enumerate(np.arange(min(xs) + (pitch / 2 if row % 2 else 0), max(xs), pitch)):
            draw, r = (bdraw, 0.8) if (row + col) % 5 == 0 else (hdraw, hole)
            draw.ellipse([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], fill=255)
    c.raise_(region, 0.2, blur=0.2)
    c.raise_(ImageChops.multiply(blooms, region), 0.8, blur=0.15)
    c.punch(ImageChops.multiply(holes, region))


def zip_line(c: Canvas, path: list[Point], thread, metal=(150, 150, 158, 255)) -> None:
    """An invisible zip in a seam: only its stitching and the pull at the top show."""
    topstitched_seam(c, path, thread, gap=0.9)
    (x, y) = path[0]
    box = [(x - 0.9) * S, (y - 0.2) * S, (x + 0.9) * S, (y + 3.4) * S]
    emboss(c, lambda draw, fill: draw.rounded_rectangle(box, radius=0.6 * S, fill=fill), metal, height=1.2, blur=0.1)
```

- [ ] **Step 7: The qipao — `tools/clothes/traditional.py`**

```python
"""The traditional pieces: a qipao, a mandarin-collar blouse and a horse-face skirt (mamianqun)."""

from __future__ import annotations

import numpy as np

from .canvas import Canvas
from .curves import catmull, mirror_x, sym
from .details import emboss, frog_closure, piping, raised, seam
from .fabrics import Fabric, twill, woven
from .motifs import cloud, peony

QIPAO_RED = "#9d1430"
QIPAO_FIGURE = "#b3233f"  # the woven flowers, a shade lighter than the ground
GOLD = (214, 176, 98, 255)
PIPING_CREAM = (238, 216, 170, 255)


def _brocade(c: Canvas) -> Fabric:
    """Red twill with peonies and clouds woven in, tone on tone."""
    ink, draw = c.ink()
    for _ in range(34):
        x, y = c.rng.uniform(8, c.w - 8), c.rng.uniform(26, c.h - 6)
        if c.rng.random() < 0.6:
            peony(draw, x, y, c.rng.uniform(8, 12), 255, c.rng)
        else:
            cloud(draw, x, y, c.rng.uniform(4, 5.5), 255)
    ground = twill(c.grid_shape, c.np_rng, QIPAO_RED, pitch=1.3)
    return woven(ground, np.asarray(ink, np.float32) / 255, QIPAO_FIGURE, height=0.7)


def _gold_clouds(c: Canvas) -> None:
    spots = [(c.rng.uniform(10, c.w - 10), c.rng.uniform(40, c.h - 10), c.rng.uniform(2.4, 3.4)) for _ in range(16)]

    def shapes(draw, fill):
        for x, y, r in spots:
            cloud(draw, x, y, r, fill)

    emboss(c, shapes, GOLD, height=0.6, blur=0.1)


def _collar(c: Canvas) -> None:
    """A rounded mandarin collar, piped, closed with a frog at the front."""
    raised(c, catmull([(76, 2), (95, 0.5), (114, 2), (115.5, 11), (95, 13.5), (74.5, 11)], steps=8), 0.7)
    seam(c, [(74.5, 11.5), (95, 14), (115.5, 11.5)])
    piping(c, [(76.5, 2.8), (95, 1.3), (113.5, 2.8)], PIPING_CREAM, width=1.3)
    piping(c, [(94.4, 1.5), (94.6, 13)], PIPING_CREAM, width=1.2)
    frog_closure(c, 95, 7, 0.0, GOLD, scale=0.8)


def _opening(c: Canvas) -> None:
    """The dajin: from the collar across the wearer's right chest (the viewer's left) to the underarm, then down the side."""
    piping(c, [(95, 13.5), (86, 18), (74, 25), (61, 35), (50, 47), (43.5, 61)], PIPING_CREAM, width=1.6)
    piping(c, [(41, 62), (43.8, 96), (52.6, 138)], PIPING_CREAM, width=1.2)
    for x, y, angle in ((80, 22.5, 0.55), (60, 37, 0.8), (46, 56, 1.2), (44, 90, 1.57)):
        frog_closure(c, x, y, angle, GOLD, scale=0.85)


def qipao(c: Canvas) -> None:
    """Fitted sheath to mid-calf, rounded mandarin collar, curved opening with frog closures, piping, side slits."""
    half = [(95, 3), (106, 2), (113, 4), (115, 11), (128, 15), (149, 22), (162, 29), (167, 43), (153, 50),
            (150, 62), (147, 96), (138, 138), (140, 162), (151, 204), (152, 232), (147, 300), (142, 398), (95, 400)]
    c.shape(sym(half, c.w))
    c.fill(_brocade(c))
    _gold_clouds(c)
    _collar(c)
    _opening(c)
    for side in (1, -1):
        x = mirror_x(side, c.w)
        seam(c, [(x(115), 11), (x(149), 22)])  # shoulder
        seam(c, [(x(118), 112), (x(117.3), 146), (x(118), 182)], depth=0.7)  # waist dart
        piping(c, [(x(165.4), 42.6), (x(153.4), 48.6)], PIPING_CREAM, width=1.4)  # cap-sleeve edge
        piping(c, [(x(147), 299), (x(141.5), 400)], PIPING_CREAM, width=3.2)  # both edges of the slit
    piping(c, [(48.6, 398.4), (95, 399.2), (141.4, 398.4)], PIPING_CREAM, width=1.5)  # hem
    for side in (1, -1):
        x = mirror_x(side, c.w)
        c.cut([(x(147), 300), (x(142.6), 401), (x(139.8), 401)])  # the side slit, opening a little at the hem
```

- [ ] **Step 8: Rewrite `tools/generate_clothes.py`**

```python
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
from clothes.traditional import qipao  # noqa: E402
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
```

- [ ] **Step 9: Run the Python tests to see them pass**

Run: `npm run test:py`
Expected: all pass (prepare_pack + canvas + generate).

- [ ] **Step 10: Write the failing data and e2e tests**

`tests/unit/clothes-data.test.js` — add after the imports:
```js
/** Width and height of a WebP file, read from its header. */
function webpSize(buffer) {
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + buffer.readUIntLE(24, 3), 1 + buffer.readUIntLE(27, 3)];
  if (chunk === 'VP8 ') return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  throw new Error(`not a WebP file (${chunk})`);
}
```
and the tests:
```js
test('redrawn garments have an aligned relief map, a signature and core cells inside their cloth', async () => {
  const data = await readJson('assets/clothes/garments.json');
  const redrawn = data.garments.filter((g) => g.relief && g.kind !== 'film');
  assert.ok(redrawn.length >= 1, 'at least the qipao is redrawn');
  await Promise.all(redrawn.map(async (g) => {
    const [colour, relief] = await Promise.all([g.texture, g.relief].map((p) => readFile(new URL(p, ROOT))));
    assert.deepEqual(webpSize(relief), webpSize(colour), `${g.id}: relief and colour line up`);
    webpSize(colour).forEach((px, k) => assert.ok(Math.abs(px - g.size[k] * g.pxPerUnit) <= 1, `${g.id}: ${g.pxPerUnit} px per unit`));
    g.signature.forEach((v) => assert.ok(v >= 0 && v <= 1, `${g.id}: signature inside the picture`));
    assert.equal(g.grid.core.length, g.grid.cells.length);
    [...g.grid.core].forEach((c, k) => assert.ok(c === '0' || g.grid.cells[k] === '1', `${g.id}: core cell ${k} is cloth`));
    assert.ok(Number.isFinite(g.material.bump), `${g.id}.bump`);
  }));
});

test('all garment pictures together stay within 3 MB', async () => {
  const data = await readJson('assets/clothes/garments.json');
  const paths = data.garments.filter((g) => g.kind !== 'film').flatMap((g) => [g.texture, g.relief].filter(Boolean));
  const sizes = await Promise.all(paths.map(async (p) => (await stat(new URL(p, ROOT))).size));
  const total = sizes.reduce((a, b) => a + b, 0);
  assert.ok(total <= 3 * 2 ** 20, `${(total / 2 ** 20).toFixed(2)} MB`);
});
```

`tests/e2e/clothes.spec.js`, in the desktop describe:
```js
  test('a garment whose relief is missing is still drawn, and the clothes still work', async ({ page }) => {
    await page.route('**/assets/clothes/qipao-relief.webp', (route) => route.fulfill({ status: 404, body: '' }));
    const warnings = [];
    page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
    await page.goto('/?jump=overhead');
    await waitForState(page, 'overhead');
    expect((await clothesOf(page)).enabled).toBe(true);
    expect(warnings.join('\n')).toContain('qipao-relief.webp');
    expect(await page.evaluate(() => window.__parcel.garmentBox('qipao'))).not.toBeNull();
  });
```

Run: `npm test`
Expected: FAIL — no garment has `relief` yet.

- [ ] **Step 11: Draw the qipao and settle the pile**

Run: `npm run clothes`
Expected: `qipao  760x1600px  …` then `garment pictures: …MB of 3 MB`, then build-pile accepts a seed.

Run: `npm test && npx playwright test tests/e2e/clothes.spec.js tests/e2e/journey.spec.js --workers=2`
Expected: all pass.

- [ ] **Step 12: Look at it — checkpoint B**

Flat view over cardboard (not committed):
```bash
python -c "from PIL import Image; q=Image.open('assets/clothes/qipao.webp'); b=Image.new('RGBA',q.size,(214,186,142,255)); b.alpha_composite(q); b.convert('RGB').save('shots/qipao-flat.png')"
```
and `node tools/shots.mjs`. Check against the spec row: fitted sheath with defined waist, rounded mandarin collar with piping and a frog, curved opening to the viewer's left underarm with frogs down to the side seam, piped cap sleeves and hem, side slits open at the hem, tone-on-tone flowers and a few gold clouds, no painted shading, crisp outline in the box (no stair-steps), seams/piping catching the light.

**Checkpoint B:** show the owner `shots/qipao-flat.png` and `shots/desktop-overhead.png`; ask what to change (proportions, colours, closures, collar). Apply changes in `traditional.py`, re-run Step 11–12 until approved.

- [ ] **Step 13: Verify and commit**

Run `/verify`, then:
```bash
git add tools/clothes tools/generate_clothes.py tools/tests assets/clothes tests/unit/clothes-data.test.js tests/e2e/clothes.spec.js
git commit -m "feat: a detailed qipao, drawn as colour and relief

A new generator draws garments as flat colour (no painted shading) plus a
relief map of seams, piping, closures and weave, lit at run time.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The blouse and the horse-face skirt

**Files:**
- Modify: `tools/clothes/traditional.py`, `tools/generate_clothes.py` (`GARMENTS`, import)
- Output: `assets/clothes/blouse*.webp`, `assets/clothes/mamianqun*.webp`, `garments.json`, `pile.json`

**Interfaces:**
- Consumes: Task 10's `Canvas`, fabrics, details, motifs, curves.
- Produces: `blouse(c)`, `mamianqun(c)`.

- [ ] **Step 1: Make the data test expect them (failing)**

In `tests/unit/clothes-data.test.js`, in the "redrawn garments" test, replace the `redrawn.length` assertion with:
```js
  ['qipao', 'blouse', 'mamianqun'].forEach((id) => assert.ok(redrawn.some((g) => g.id === id), `${id} is redrawn`));
```
Run: `npm test` → Expected: FAIL — `blouse is redrawn`.

- [ ] **Step 2: Draw them — append to `tools/clothes/traditional.py`**

Extend the imports:
```python
from .canvas import Canvas, S
from .curves import catmull, mirror_x, sym
from .details import (cord_loop, emboss, figure, frog_closure, hem, knot_button, piping, pleat, raised, seam,
                      stitches, topstitched_seam, trim)
from .fabrics import Fabric, linen, twill, woven
from .motifs import cloud, peony
```
and append:
```python
LINEN_CREAM = "#efe5cf"
BLOUSE_THREAD = (190, 172, 134, 255)
KNOT = (222, 206, 172, 255)


def blouse(c: Canvas) -> None:
    """Stand collar, a placket of knotted cloth buttons, long set-in sleeves with cuffs; linen."""
    half = [(150, 1), (162, 1), (172, 3), (174, 11), (196, 16), (214, 22), (240, 52), (268, 96), (292, 140),
            (297, 151), (282, 162), (260, 128), (232, 92), (217, 80), (218, 140), (220, 226), (150, 230)]
    c.shape(sym(half, c.w))
    c.fill(linen(c.grid_shape, c.np_rng, LINEN_CREAM))
    raised(c, catmull([(127, 2), (150, 0.5), (173, 2), (174.5, 11), (150, 14), (125.5, 11)], steps=8), 0.6)
    seam(c, [(125.5, 11.5), (150, 14.5), (174.5, 11.5)])
    stitches(c, [(128, 3.6), (150, 2.1), (172, 3.6)], BLOUSE_THREAD)
    for x in (144, 156):  # the placket down the centre front
        topstitched_seam(c, [(x, 15), (x, 227)], BLOUSE_THREAD)
    for y in (24, 58, 92, 126, 160, 194):
        knot_button(c, 147.5, y, 1.9, KNOT)
        cord_loop(c, 149, y, 6.5, KNOT)
    for side in (1, -1):
        x = mirror_x(side, c.w)
        seam(c, [(x(174.5), 11), (x(214), 22)])  # shoulder
        seam(c, [(x(214), 22), (x(220.5), 42), (x(221.5), 62), (x(217), 80)])  # set-in sleeve
        raised(c, [(x(287), 131), (x(292), 140), (x(297), 151), (x(282), 162), (x(276.5), 153.5)], 0.4)  # cuff
        topstitched_seam(c, [(x(287), 131), (x(276.5), 153.5)], BLOUSE_THREAD)
        knot_button(c, x(289.5), 147, 1.4, KNOT)
    hem(c, [(81, 224.5), (150, 226.5), (219, 224.5)], BLOUSE_THREAD, depth=4.5)


NAVY = "#1b2a4e"
SKIRT_GOLD = (208, 168, 84, 255)
BAND_CREAM = "#f0e5cc"
SKIRT_THREAD = (40, 56, 96, 255)


def _hem_border(c: Canvas) -> None:
    """The woven border (lan) along the hem: clouds over a wave line, between two gold bands."""
    ink, draw = c.ink()
    for x in range(8, int(c.w), 22):
        cloud(draw, x, 238, 5.2, 255)
    draw.line(c.px([(x, 249 + 2 * np.sin(x / 6)) for x in np.arange(0, c.w + 1, 1.0)]), fill=255, width=round(1.2 * S))
    figure(c, ink, SKIRT_GOLD, height=0.7)
    trim(c, [(4, 223), (276, 223)], SKIRT_GOLD, width=1.6)
    trim(c, [(2, 255.5), (278, 255.5)], SKIRT_GOLD, width=1.2)


def mamianqun(c: Canvas) -> None:
    """Horse-face skirt: flat front panels framed by knife pleats, a waistband with ties, a woven hem border."""
    c.shape(catmull([(70, 19), (210, 19), (262, 130), (280, 258), (140, 262), (0, 258), (18, 130)], steps=12))
    band = [(64, 0), (216, 0), (216, 21), (64, 21)]
    ties = [[(208, 8), (215, 8), (240, 98), (233, 100)], [(72, 8), (65, 8), (40, 98), (47, 100)]]
    for piece in (band, *ties):
        c.shape(piece)
    c.fill(twill(c.grid_shape, c.np_rng, NAVY, pitch=1.2))
    cream = linen(c.grid_shape, c.np_rng, BAND_CREAM)
    for piece in (band, *ties):
        c.fill(cream, region=c.region(piece))
    seam(c, [(66, 21), (214, 21)])
    for y in (2, 19):
        stitches(c, [(66, y), (214, y)], SKIRT_THREAD)
    for k in range(1, 12):  # knife pleats fanning out either side of the flat front panels
        top, bottom = 106 - k * 3.3, 98 - k * 8.6
        pleat(c, [(top, 22), (bottom, 257)])
        pleat(c, [(c.w - bottom, 257), (c.w - top, 22)])  # walked the other way, so it folds toward the centre too
    trim(c, [(106, 22), (98, 222)], SKIRT_GOLD, width=2.6)  # the panel's edges
    trim(c, [(174, 22), (182, 222)], SKIRT_GOLD, width=2.6)
    medallion, draw = c.ink()
    peony(draw, 140, 150, 14, 255, c.rng)
    figure(c, medallion, SKIRT_GOLD, height=0.6)
    _hem_border(c)
    for tie in ties:
        raised(c, tie, 0.5)
```

In `tools/generate_clothes.py`: `from clothes.traditional import blouse, mamianqun, qipao  # noqa: E402` and add to `GARMENTS`:
```python
    Garment("blouse", "mandarin-collar blouse", (300, 230), material(1.5e-4, 0.4, 0.25, 1.3), (0.5, 0.03), blouse),
    Garment("mamianqun", "horse-face skirt", (280, 262), material(6e-5, 0.5, 0.3, 1.8), (0.5, 0.55), mamianqun),
```

- [ ] **Step 3: Draw, settle and test**

Run: `npm run clothes && npm test && npm run test:py`
Expected: three garments redrawn, budget printed under 3 MB, a pile seed accepted, all tests pass.

- [ ] **Step 4: Look at them**

Flat views over cardboard for `blouse` and `mamianqun` (same one-liner as Task 10 Step 12, changing the id) and `node tools/shots.mjs`. Check the spec rows: blouse — stand collar, button placket with knots and loops, set-in sleeves, cuffs with a knot, hem stitching, linen slubs; skirt — waistband and dangling ties in cream, flat front panel with gold edges and medallion, pleats fanning out on both sides toward the centre, cloud-and-wave border at the hem. Fix coordinates that put a detail off its garment.

- [ ] **Step 5: Verify and commit**

Run `/verify`, then:
```bash
git add tools/clothes/traditional.py tools/generate_clothes.py assets/clothes tests/unit/clothes-data.test.js
git commit -m "feat: a linen mandarin-collar blouse and a pleated horse-face skirt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The contemporary pieces

**Files:**
- Create: `tools/clothes/modern.py`
- Modify: `tools/generate_clothes.py` (`GARMENTS`, import), `tests/unit/clothes-data.test.js`
- Output: the five garments' pictures, `garments.json`, `pile.json`

**Interfaces:**
- Consumes: Task 10's modules.
- Produces: `tee_white(c)`, `tee_breton(c)`, `ruched_top(c)`, `floral_skirt(c)`, `slip_skirt(c)`.

- [ ] **Step 1: Make every garment's relief mandatory (failing)**

In the "redrawn garments" test, replace the redrawn-ids line with:
```js
  assert.equal(redrawn.length, data.garments.length, 'every garment is drawn with relief');
```
Run: `npm test` → Expected: FAIL (3 of 8).

- [ ] **Step 2: Write `tools/clothes/modern.py`**

```python
"""The contemporary pieces: two T-shirts, a ruched top, a floral midi skirt and a satin slip skirt."""

from __future__ import annotations

import math

import numpy as np

from .canvas import Canvas, S
from .curves import along, catmull, flip, mirror_x, offset, sym
from .details import (button, gathers, hem, knot_button, lace, picot, piping, raised, rib_band, seam, stitches,
                      zip_line)
from .fabrics import blend, cotton, jersey, rib, satin, stripes
from .motifs import flower

JERSEY_WHITE = "#f3f1ea"
JERSEY_INSIDE = "#e7e3d8"  # the knit's reverse, seen through the neck opening
WHITE_THREAD = (222, 218, 206, 255)


def tee_white(c: Canvas) -> None:
    """Boxy crew-neck tee: rib neckband, short set-in sleeves, twin-needle hems."""
    half = [(145, 5), (160, 4.5), (172, 2.5), (200, 9), (222, 15), (252, 40), (284, 74), (262, 96), (227, 80),
            (222, 150), (224, 246), (145, 250)]
    c.shape(sym(half, c.w))
    c.fill(jersey(c.grid_shape, c.np_rng, JERSEY_WHITE))
    front_neck = catmull([(118, 2.5), (126, 11), (145, 17.5), (164, 11), (172, 2.5)], closed=False, steps=10)
    inside = c.region(front_neck + [(160, 4.5), (145, 5), (130, 4.5)])
    c.fill(jersey(c.grid_shape, c.np_rng, JERSEY_INSIDE), region=inside)
    c.raise_(inside, -1.0, blur=0.2)  # the back lies a layer below the front
    rib_band(c, offset([(121, 3.6), (145, 6.2), (169, 3.6)], -1.3), 2.6, sewn=-1)  # back neckband
    rib_band(c, offset(front_neck, -1.6), 3.2, sewn=-1)  # front neckband
    for side in (1, -1):
        x = mirror_x(side, c.w)
        seam(c, [(x(172), 2.5), (x(222), 15)])
        seam(c, [(x(222), 15), (x(228), 38), (x(229), 60), (x(227), 80)])
        hem(c, [(x(281.9), 71.9), (x(259.9), 93.9)], WHITE_THREAD, depth=3.2, twin=True)
    hem(c, [(66.5, 243.5), (145, 245.5), (223.5, 243.5)], WHITE_THREAD, depth=4.5, twin=True)


ECRU = "#f1ebdc"
BRETON_NAVY = "#1f2a52"
ECRU_THREAD = (222, 214, 196, 255)


def tee_breton(c: Canvas) -> None:
    """Boat neck, three-quarter sleeves, navy stripes that meet across the side seams; stripes run round the sleeves."""
    half = [(150, 9), (186, 6), (206, 7), (222, 13), (250, 58), (285, 127), (271, 138), (240, 84), (225, 72),
            (225, 150), (227, 256), (150, 260)]
    c.shape(sym(half, c.w))
    ground = jersey(c.grid_shape, c.np_rng, ECRU)
    fabric = stripes(ground, BRETON_NAVY, pitch=15, band=5, start=40)  # a plain yoke above the first stripe
    right = [(222, 13), (250, 58), (285, 127), (271, 138), (240, 84), (225, 72), (228, 40)]
    for sleeve, angle, shoulder in ((right, 25.0, (222, 13)), (flip(right, c.w), -25.0, (c.w - 222, 13))):
        striped = stripes(ground, BRETON_NAVY, pitch=15, band=5, start=14, angle=angle, origin=shoulder)
        fabric = blend(fabric, striped, np.asarray(c.region(catmull(sleeve, steps=6)), np.float32) / 255)
    c.fill(fabric)
    hem(c, [(96, 9.2), (150, 11.6), (204, 9.2)], ECRU_THREAD, depth=2.6)  # the boat neck's facing
    for side in (1, -1):
        x = mirror_x(side, c.w)
        seam(c, [(x(206), 7), (x(222), 13)])
        seam(c, [(x(222), 13), (x(229), 36), (x(231), 56), (x(225), 72)])
        hem(c, [(x(283.1), 124.6), (x(269.1), 135.6)], ECRU_THREAD, depth=3)
    hem(c, [(73.5, 252.5), (150, 255), (226.5, 252.5)], ECRU_THREAD, depth=4)


RIB_RED = "#cc1b36"
TRIM_PINK = (238, 120, 140, 255)
CORD = (178, 18, 42, 255)
RED_THREAD = (196, 30, 54, 255)


def _puff(c: Canvas, side: int) -> None:
    """Gathers at a puffed sleeve's cap, and its elastic band at the hem."""
    x = mirror_x(side, c.w)
    cap = [(x(176), 7), (x(181), 26), (x(182), 46)]
    ridges = [[(px + side * dy, py - side * dx), (px + side * 8 * dy, py - side * 8 * dx)]
              for (px, py), (dx, dy) in along(catmull(cap, closed=False), 3.5)]
    gathers(c, ridges, height=0.9)
    rib_band(c, [(x(209), 56), (x(189), 60.5)], 3.0, sewn=-side)


def ruched_top(c: Canvas) -> None:
    """Sweetheart neckline with picot trim, centre ruching on a tie, short puff sleeves; red rib knit."""
    half = [(110, 42), (120, 32), (132, 26), (142, 23), (148, 13), (150, 4), (176, 6), (196, 15), (212, 35),
            (210, 58), (188, 63), (178, 72), (172, 120), (176, 186), (110, 190)]
    c.shape(sym(half, c.w))
    c.fill(rib(c.grid_shape, c.np_rng, RIB_RED, pitch=1.4))
    neckline = [(71, 5), (72.5, 14), (79, 24), (88, 27), (98, 33), (110, 43), (122, 33), (132, 27), (141, 24),
                (147.5, 14), (149, 5)]
    picot(c, offset(neckline, -0.8), TRIM_PINK)
    hem(c, offset(neckline, -2.4), RED_THREAD, depth=2)
    seam(c, [(110, 44), (110, 122)])
    gathers(c, [[(110 + side * 1.5, y), (110 + side * 13, y - 2.2 + k * 0.12), (110 + side * 30, y + 2.5)]
                for k, y in enumerate(range(47, 122, 5)) for side in (-1, 1)])
    piping(c, [(110, 44), (106, 55), (104.5, 67)], CORD, width=1.3)
    piping(c, [(110, 44), (114.5, 56), (116.5, 69)], CORD, width=1.3)
    for x, y, r in ((110, 45, 2.0), (104.5, 68, 1.0), (116.5, 70, 1.0)):
        knot_button(c, x, y, r, CORD)
    for side in (1, -1):
        x = mirror_x(side, c.w)
        seam(c, [(x(150), 4.5), (x(176), 6.5)])
        seam(c, [(x(176), 6.5), (x(180.5), 26), (x(181.5), 48), (x(178), 72)])
        _puff(c, side)
    hem(c, [(46, 184), (110, 186), (174, 184)], RED_THREAD, depth=3.5)


SKIRT_BLUE = "#2a92d2"
BLUE_THREAD = (120, 186, 230, 255)
LEAF = (46, 132, 92, 230)
PETALS = [(235, 92, 138, 255), (214, 56, 74, 255), (246, 160, 186, 255)]


def _ditsy_print(c: Canvas) -> None:
    img, draw = c.layer()
    for _ in range(330):
        x, y = c.rng.uniform(0, c.w), c.rng.uniform(14, c.h)
        draw.ellipse([(x + 2) * S, (y - 1) * S, (x + 5) * S, (y + 1) * S], fill=LEAF)
        flower(draw, x, y, c.rng.uniform(2.2, 3.2), c.rng.choice(PETALS), (255, 236, 200, 255))
    c.paint(img)


def floral_skirt(c: Canvas) -> None:
    """A-line midi: waistband with a side zip and button, two panel seams, a lettuce-edge hem; ditsy floral print."""
    wave = lambda t, y: (4 + 222 * t, y + 2.6 * math.sin(t * math.pi * 46))  # noqa: E731
    c.shape([(48, 0), (182, 0), (184, 12), (208, 150), (226, 292),
             *[wave(t, 292) for t in np.linspace(1, 0, 460)][1:-1], (4, 292), (22, 150), (46, 12)])
    c.fill(cotton(c.grid_shape, c.np_rng, SKIRT_BLUE))
    _ditsy_print(c)
    raised(c, [(46, 0), (184, 0), (184, 12), (46, 12)], 0.5)
    seam(c, [(46, 12.2), (184, 12.2)])
    for y in (1.6, 10.6):
        stitches(c, [(48, y), (182, y)], BLUE_THREAD)
    zip_line(c, [(50, 13), (45.5, 72)], BLUE_THREAD)
    button(c, 54, 6, 1.6, (176, 178, 186, 255), BLUE_THREAD)
    seam(c, [(92, 12.5), (76, 291)])
    seam(c, [(138, 12.5), (154, 291)])
    stitches(c, [wave(t, 289.6) for t in np.linspace(0, 1, 460)], BLUE_THREAD, dash=0.7, gap=0.25, curve=False)


CHAMPAGNE = "#e2c9a2"
LACE_IVORY = (240, 226, 200, 255)
SATIN_THREAD = (206, 182, 140, 255)


def _shirred_waistband(c: Canvas) -> None:
    raised(c, [(34, 0), (166, 0), (167, 14), (33, 14)], 0.6)
    seam(c, [(33, 14.3), (167, 14.3)])
    ridges, x = [], 36.0
    while x < 164:
        ridges.append([(x, 1.0), (x + c.rng.uniform(-0.6, 0.6), 7.0), (x + c.rng.uniform(-0.5, 0.5), 13.0)])
        x += c.rng.uniform(1.3, 2.1)
    gathers(c, ridges, height=0.9)
    for y in (4.5, 9.5):
        stitches(c, [(35, y), (165, y)], SATIN_THREAD, dash=1.2, gap=0.6)


def slip_skirt(c: Canvas) -> None:
    """Bias-cut satin midi: a shirred elastic waistband and a scalloped lace hem."""
    scallops = [(196 - k * 12 - 12 * t, 262 + 7 * math.sin(math.pi * t))
                for k in range(16) for t in np.linspace(0, 1, 10, endpoint=False)]
    c.shape([(40, 0), (160, 0), (166, 14), (181, 140), (196, 250), (196, 262), *scallops,
             (4, 262), (4, 250), (19, 140), (34, 14)])
    c.fill(satin(c.grid_shape, c.np_rng, CHAMPAGNE))
    _shirred_waistband(c)
    lace(c, [(0, 241), (200, 241), (200, 272), (0, 272)], LACE_IVORY)
    seam(c, [(6, 241), (194, 241)])
    stitches(c, [(6, 242.5), (194, 242.5)], SATIN_THREAD)
```

In `tools/generate_clothes.py`: `from clothes.modern import floral_skirt, ruched_top, slip_skirt, tee_breton, tee_white  # noqa: E402`, and append to `GARMENTS`:
```python
    Garment("tee-white", "white T-shirt", (290, 250), material(2.5e-4, 0.6, 0.04, 1.2), (0.5, 0.04), tee_white),
    Garment("tee-breton", "striped top", (300, 260), material(2e-4, 0.6, 0.04, 1.2), (0.5, 0.03), tee_breton),
    Garment("slip-skirt", "satin slip skirt", (200, 272), material(6e-4, 0.3, 0.8, 0.6), (0.5, 0.95), slip_skirt),
    Garment("ruched-top", "red ruched top", (220, 190), material(3e-4, 0.55, 0.12, 1.5), (0.5, 0.2), ruched_top),
    Garment("floral-skirt", "floral midi skirt", (230, 300), material(3e-4, 0.45, 0.08, 1.0), (0.5, 0.04), floral_skirt),
```

- [ ] **Step 3: Draw, settle and test**

Run: `npm run clothes && npm test && npm run test:py && npx playwright test tests/e2e/clothes.spec.js tests/e2e/journey.spec.js tests/e2e/assets.spec.js --workers=2`
Expected: eight garments drawn, under 3 MB, a seed accepted, all tests pass.

- [ ] **Step 4: Look at them**

A contact sheet of all eight over cardboard (not committed):
```bash
python -c "
from PIL import Image
ids=['qipao','blouse','mamianqun','tee-white','tee-breton','slip-skirt','ruched-top','floral-skirt']
ims=[Image.open(f'assets/clothes/{i}.webp') for i in ids]; H=600
row=[im.resize((round(im.width*H/im.height),H)) for im in ims]
sheet=Image.new('RGBA',(sum(r.width+12 for r in row),H),(214,186,142,255)); x=0
for r in row: sheet.alpha_composite(r,(x,0)); x+=r.width+12
sheet.convert('RGB').save('shots/garments.png')"
```
and `node tools/shots.mjs`. Check each spec row: the two tees differ at a glance (crew neck + short sleeves vs boat neck + ¾ striped sleeves with stripes around the sleeve); the ruched top's sweetheart neckline, picot, ruching and tie, puff sleeves; the floral skirt's A-line, waistband, zip, panel seams and lettuce hem; the slip skirt's sheen, shirred waist and lace with holes. Fix anything off its garment.

- [ ] **Step 5: Verify and commit**

Run `/verify`, then:
```bash
git add tools/clothes/modern.py tools/generate_clothes.py assets/clothes tests/unit/clothes-data.test.js
git commit -m "feat: detailed tees, ruched top and skirts with distinct cuts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Held low, dropped with weight

*(Spec §4 at Revision B's scale: B3's grip radius 8 and lift 12.)*

**Files:**
- Modify: `js/cloth/hand.js` (constants, `take`), `js/cloth/solver.js` (`DEFAULTS.airDamping`), `tools/shots.mjs` (a mid-drag shot); possibly `tools/clothes/*.py` garment `material(bend, …)` values
- Test: `tests/unit/cloth-hand.test.js`, `tests/unit/cloth-solver.test.js`

**Interfaces:**
- Consumes: `createHand` with `holds` (Task 8), `gripCluster`, `world.grip.ids` (unchanged APIs).
- Produces: `LIFT = 12`, `GRIP_RADIUS = 8`, no `MIN_HEIGHT`; `DEFAULTS.airDamping = 1.2`; `DEFAULTS.gravity` stays −2400 (see the ruling in the header: at the new scale it already gives §4's weight).

- [ ] **Step 1: Write the failing tests**

`tests/unit/cloth-hand.test.js` — add next to `sheet`:
```js
const FINE = 4.5; // the pile's thickness (tools/build-pile.mjs)
const fine = (cols, rows) => buildMesh({ id: 'fine', size: [cols * 6, rows * 6], grid: { cols, rows, cells: '1'.repeat(cols * rows) } });
```
In `'the hand lifts what it grabs and carries it under the pointer'` replace the last assertion with:
```js
  const below = world.pos[3 * i + 2];
  assert.ok(z >= below + 12 && z < below + 18, `held at ${z}, just clear of the cloth at ${below}`);
```
in `'carried over a wall, the hand rises above the rim at once'` use `RIM + 12`, and append:
```js
test('the hand holds a fingertip-sized patch: the grab point and its four nearest neighbours', () => {
  const mesh = fine(10, 10);
  const world = createWorld({
    garments: [{ mesh, material: { stretchCompliance: 0, bendCompliance: 2e-4, friction: 0.5 } }],
    bounds: { min: [-700, -600, 0], max: [1200, 1000, 700] },
    thickness: FINE,
  });
  setPositions(world, 0, Float32Array.from(mesh.rest, (v, k) => v + [100, 100, FINE / 2][k % 3]));
  sleepAll(world);
  const hand = createHand({ world, colliders: [], ray });
  const i = [...Array(mesh.count).keys()].find((v) => mesh.rest[3 * v] === 30 && mesh.rest[3 * v + 1] === 30);
  hand.grab(hitAt(world, i), world.pos[3 * i], world.pos[3 * i + 1]);
  assert.equal(world.grip.ids.length, 5, 'within 8 units: the particle and the four 6 units away');
});

test('held low, most of a garment stays spread out behind the hand', () => {
  const mesh = fine(16, 16);
  const world = createWorld({
    garments: [{ mesh, material: { stretchCompliance: 0, bendCompliance: 2e-4, friction: 0.5 } }],
    bounds: { min: [-700, -600, 0], max: [1200, 1000, 700] },
    thickness: FINE,
  });
  setPositions(world, 0, Float32Array.from(mesh.rest, (v, k) => v + [100, 100, FINE / 2][k % 3]));
  sleepAll(world);
  const hand = createHand({ world, colliders: [], ray });
  const edge = [...Array(mesh.count).keys()].find((v) => mesh.rest[3 * v] === 96 && mesh.rest[3 * v + 1] === 48);
  hand.grab(hitAt(world, edge), world.pos[3 * edge], world.pos[3 * edge + 1]);
  for (let f = 1; f <= 60; f += 1) {
    hand.dragTo(196 + f, 148);
    frames(world, hand, 1);
  }
  frames(world, hand, 30);
  const xs = [...Array(world.count).keys()].map((j) => world.pos[3 * j]);
  const span = Math.max(...xs) - Math.min(...xs);
  assert.ok(span > 58, `the garment spans ${span.toFixed(0)} units along the pull (96 flat)`);
});
```

`tests/unit/cloth-solver.test.js` — append (it has `FINE` and `fine` since Task 8):
```js
/** A 10 × 10 fine sheet turned 30° (so its particles cannot nest in the grid below), centred at (x, y), lowest at z. */
function turnedSheet(x, y, z) {
  const mesh = fine(10, 10);
  const a = Math.PI / 6;
  return Float32Array.from(mesh.rest, (v, k) => {
    const i = k - (k % 3);
    const [px, py] = [mesh.rest[i] - 30, mesh.rest[i + 1] - 30];
    return [x + px * Math.cos(a) - py * Math.sin(a), y + px * Math.sin(a) + py * Math.cos(a), z][k % 3];
  });
}
const fineWorld = (meshes) => createWorld({ garments: meshes.map((mesh) => ({ mesh, material })), bounds, thickness: FINE });

test('let go 24 above the floor, a garment lands within 0.2 s: it has weight', () => {
  const w = fineWorld([fine(10, 10)]);
  setPositions(w, 0, turnedSheet(100, 100, 24));
  let t = 0;
  for (; t < 1 && Math.min(...zs(w)) > FINE / 2 + 0.5; t += 1 / 60) step(w, 1 / 60);
  assert.ok(t <= 0.2 + 1e-9, `landed after ${t.toFixed(2)} s`);
});

test('dropped from the hold height onto a sleeping garment, it is asleep within 1.5 s', () => {
  const w = fineWorld([fine(16, 16), fine(10, 10)]);
  setPositions(w, 0, Float32Array.from(fine(16, 16).rest, (v, k) => v + [0, 0, FINE / 2][k % 3]));
  setPositions(w, 1, turnedSheet(48, 48, FINE / 2 + FINE + 12));
  sleep(w, 0);
  let t = 0;
  for (; t < 1.5 && !isSettled(w); t += 1 / 60) step(w, 1 / 60);
  assert.ok(isSettled(w), `still moving after ${t.toFixed(2)} s`);
  const top = zs(w).slice(w.offsets[1]);
  assert.ok(Math.min(...top) > FINE, 'it lies on the lower sheet');
});

test('air drag is light: a falling garment keeps most of its speed', () => {
  const w = fineWorld([fine(4, 4)]);
  setPositions(w, 0, Float32Array.from(fine(4, 4).rest, (v, k) => v + [0, 0, 300][k % 3]));
  const fall = (seconds) => 0.5 * -w.settings.gravity * seconds ** 2;
  run(w, 0.1);
  const dropped = 300 - Math.min(...zs(w));
  assert.ok(dropped > 0.95 * fall(0.1), `fell ${dropped.toFixed(1)} of ${fall(0.1).toFixed(1)} units in 0.1 s`);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/unit/cloth-hand.test.js tests/unit/cloth-solver.test.js`
Expected: FAIL — held at ≥ 60 and rim + 45 (`MIN_HEIGHT`, `LIFT` 45); 9 particles held, not 5 (radius 11); the pulled garment hangs from 60 units up and spans less; the falling garment loses more than 5 % to air drag 2.5/s (it keeps ≈ 92 %). The landing and settling tests may already pass at this scale — they guard the change.

- [ ] **Step 3: Implement**

`js/cloth/hand.js`:
```js
const LIFT = 12; // the hand holds cloth just clear of what lies beneath: the garment slides over the pile, keeping its shape
const GRIP_RADIUS = 8; // particles this close to the hold point are held: a fingertip's patch, about 1.3 cells
```
Delete `MIN_HEIGHT`. In `take`:
```js
    const { radius, lift } = holds[garment] ?? { radius: GRIP_RADIUS, lift: LIFT };
    hold(world, garment, gripCluster(world, { garment, ids, point }, radius), point);
    held = {
      garment, lift, base: point[2] + lift, height: point[2], want: 0, xy: [point[0], point[1]], sx: 0, sy: 0, script: null,
    };
```
(and drop the comment about bodies with their own hold riding only their own lift — every body now does). Update the file comment if it mentions a minimum height.

`js/cloth/solver.js` `DEFAULTS`:
```js
  gravity: -2400, // at the garments' size (Revision B) cloth drops with weight, yet the eye can follow it
```
```js
  airDamping: 1.2, // per second: fabric still meets some air
```

- [ ] **Step 4: Run all unit tests**

Run: `npm test`
Expected: all pass, including the 20°/50° heap and 24°/45° flap slope tests and the pack's hold and shape tests. If a slope or sleep test fails, the friction balance moved with the air drag: first check `contactDamping` and `wakeSpeed` — never loosen a test's expectation.

- [ ] **Step 5: Re-settle the pile and run the clothes e2e tests**

Run: `node tools/build-pile.mjs && npx playwright test tests/e2e/clothes.spec.js tests/e2e/journey.spec.js --workers=2`
Expected: a seed accepted; all pass (keyboard and mouse clearing still uncover the booklet; the pack still drags).

- [ ] **Step 6: Look at a held garment**

Add to `tools/shots.mjs`, inside the loop after the pack close-up (desktop only):
```js
    if (name === 'desktop') {
      const grab = await page.evaluate(() => {
        const box = document.querySelector('.book-top').getBoundingClientRect();
        for (let j = 4; j <= 12; j += 1) {
          for (let i = 4; i <= 12; i += 1) {
            const x = box.left + (box.width * i) / 16;
            const y = box.top + (box.height * j) / 16;
            if (window.__parcel.pick(x, y)) return { x, y };
          }
        }
        return null;
      });
      if (grab) {
        await page.mouse.move(grab.x, grab.y);
        await page.mouse.down();
        for (let k = 1; k <= 20; k += 1) {
          await page.mouse.move(grab.x - 4 * k, grab.y + 3 * k);
          await page.waitForTimeout(16);
        }
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${out}/${name}-held.png` });
        await page.mouse.up();
      }
    }
```
Run `node tools/shots.mjs`; view `shots/desktop-held.png`. The held garment should keep its outline (collar, sleeves, hem recognizable) with its trailing part folding over the pile — not a ball. If a garment crumples, lower its bend compliance (the first `material(…)` argument in `tools/generate_clothes.py`, e.g. 2.5e-4 → 1.5e-4), re-run `npm run clothes`, `npm test`, and look again.

- [ ] **Step 7: Verify and commit**

Run `/verify`, then:
```bash
git add js/cloth/hand.js js/cloth/solver.js tools/shots.mjs tests/unit/cloth-hand.test.js tests/unit/cloth-solver.test.js assets/clothes tools/generate_clothes.py
git commit -m "feat: garments are held low and drop with weight

A fingertip's hold just clear of the pile keeps a garment's outline while it
is dragged; lighter air drag makes it land and settle.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: A pile that shows what each garment is

**Files:**
- Modify: `js/cloth/mesh.js` (`particleNear`), `js/cloth/coverage.js` (`isExposed`), `tools/build-pile.mjs` (`fold`, `PLAN`, `TARGETS`, acceptance)
- Test: `tests/unit/cloth-mesh.test.js`, `tests/unit/cloth-coverage.test.js`, `tests/unit/clothes-data.test.js`
- Output: `assets/clothes/pile.json`

**Interfaces:**
- Consumes: `signature` per garment (Tasks 10–12).
- Produces: `particleNear(mesh, [x, y]) -> index`; `isExposed(world, i, radius = 7) -> boolean` (spec §5's 12 units at a 10-unit cell, scaled to the 6-unit cell).

- [ ] **Step 1: Write the failing tests**

`tests/unit/cloth-mesh.test.js`, append (add `particleNear` to the import):
```js
test('particleNear finds the particle nearest a point of the flat layout', () => {
  const m = buildMesh(garment('1111', 2, 2));
  const v = particleNear(m, [19, 1]);
  assert.deepEqual([m.rest[3 * v], m.rest[3 * v + 1]], [20, 0]);
});
```

`tests/unit/cloth-coverage.test.js`, append (add `isExposed` to the import):
```js
test('a particle is exposed unless cloth lies over it', () => {
  const material = { stretchCompliance: 0, bendCompliance: 1e-4, friction: 0.5 };
  const lower = buildMesh({ id: 'lower', size: [40, 40], grid: { cols: 4, rows: 4, cells: '1'.repeat(16) } });
  const upper = buildMesh({ id: 'upper', size: [20, 40], grid: { cols: 2, rows: 4, cells: '1'.repeat(8) } });
  const w = createWorld({ garments: [{ mesh: lower, material }, { mesh: upper, material }],
    bounds: { min: [-100, -100, 0], max: [200, 200, 200] }, thickness: 7.5 });
  setPositions(w, 0, Float32Array.from(lower.rest, (v, i) => (i % 3 === 2 ? 3.75 : v)));
  setPositions(w, 1, Float32Array.from(upper.rest, (v, i) => (i % 3 === 2 ? 11.25 : v)));
  const at = (g, x, y) => w.offsets[g] + particleNear(g === 0 ? lower : upper, [x, y]);
  assert.equal(isExposed(w, at(0, 10, 20)), false, 'under the upper sheet');
  assert.equal(isExposed(w, at(0, 40, 20)), true, 'beyond its edge');
  assert.equal(isExposed(w, at(1, 10, 20)), true, 'the upper sheet itself');
});
```
(import `particleNear` from `mesh.js` there too.)

`tests/unit/clothes-data.test.js`, in the pile test (import `particleNear` and `isExposed` alongside the existing dynamic imports), before the coverage assertions:
```js
  const seen = data.garments.filter(({ signature, size }, g) => signature && isExposed(world,
    world.offsets[g] + particleNear(meshes[g], [signature[0] * size[0], signature[1] * size[1]])));
  assert.ok(seen.length >= 6, `signatures in view: ${seen.map((g) => g.id).join(', ')}`);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test`
Expected: FAIL — `particleNear`/`isExposed` not exported (and, once they exist, today's pile probably shows fewer than 6 signatures).

- [ ] **Step 3: Implement the two helpers**

`js/cloth/mesh.js`:
```js
/** The particle lying nearest (x, y) in the garment's flat layout. */
export function particleNear({ count, rest }, [x, y]) {
  let best = 0;
  let bestDistance = Infinity;
  for (let v = 0; v < count; v += 1) {
    const d = (rest[3 * v] - x) ** 2 + (rest[3 * v + 1] - y) ** 2;
    if (d < bestDistance) {
      best = v;
      bestDistance = d;
    }
  }
  return best;
}
```

`js/cloth/coverage.js`:
```js
/** Can particle i be seen from above: no cloth lies over it within `radius`? */
export function isExposed(world, i, radius = 7) {
  const x = world.pos[3 * i];
  const y = world.pos[3 * i + 1];
  const above = world.pos[3 * i + 2] + world.thickness / 2;
  const r2 = radius * radius;
  for (let j = 0; j < world.count; j += 1) {
    const p = 3 * j;
    if (world.pos[p + 2] > above && (world.pos[p] - x) ** 2 + (world.pos[p + 1] - y) ** 2 < r2) return false;
  }
  return true;
}
```

- [ ] **Step 4: Restage the pile (`tools/build-pile.mjs`)**

Imports: `import { buildMesh, particleNear } from '../js/cloth/mesh.js';` and `import { bookCoverage, isExposed } from '../js/cloth/coverage.js';`.

```js
const TARGETS = { book: 0.88, pack: 0.2, signatures: 6 };
```
Replace the `PLAN` comment and value:
```js
/**
 * Bottom to top. Each garment lies loosely with at most one fold:
 * [axis, at, keep, side] folds everything on the far side of the line
 * axis = at (a share of the garment's width for 'x', of its length for 'y')
 * onto the kept side — 'x' folds left/right, 'y' up/down; keep
 * 'low' keeps the side below `at` — laying it 'over' (on top) or tucking it
 * 'under'. Turns and places put each garment's signature feature face up.
 */
const PLAN = [
  { id: 'mamianqun', folds: [], turn: 90, centre: [306, 82] },
  { id: 'slip-skirt', folds: [['y', 0.55, 'low', 'over']], turn: 96, centre: [321, 114] },
  { id: 'tee-white', folds: [['x', 0.69, 'low', 'over']], turn: -12, centre: [291, 59] },
  { id: 'floral-skirt', folds: [['y', 0.53, 'low', 'under']], turn: -74, centre: [332, 82] },
  { id: 'tee-breton', folds: [['x', 0.33, 'high', 'over']], turn: 14, centre: [289, 100] },
  { id: 'blouse', folds: [['x', 0.7, 'low', 'over']], turn: -22, centre: [313, 62] },
  { id: 'qipao', folds: [['y', 0.58, 'low', 'under']], turn: 78, centre: [296, 80] },
  { id: 'ruched-top', folds: [], turn: 24, centre: [276, 61] },
];
```
Replace `fold`:
```js
/** Fold flat positions over a line (see PLAN); the layer on top lies one thickness higher. */
function fold(positions, [axis, at, keep, side = 'over'], size) {
  const k = axis === 'x' ? 0 : 1;
  const line = at * size[k];
  const out = Float32Array.from(positions);
  for (let i = 0; i < out.length; i += 3) {
    const v = out[i + k];
    const far = keep === 'low' ? v > line : v < line;
    if (far) out[i + k] = 2 * line - v;
    if (far === (side === 'over')) out[i + 2] += THICKNESS;
  }
  return out;
}
```
In `buildPile`, return `{ world, meshes }` instead of `world`. Add:
```js
/** Ids of the garments whose signature feature can be seen from above. */
function visibleSignatures(world, garments, meshes) {
  return garments
    .filter(({ signature, size }, g) => signature
      && isExposed(world, world.offsets[g] + particleNear(meshes[g], [signature[0] * size[0], signature[1] * size[1]])))
    .map(({ id }) => id);
}
```
In `main()`:
```js
    const { world, meshes } = buildPile(data.garments, seed);
    const book = bookCoverage(world, CONTENTS.book);
    const pack = bookCoverage(world, CONTENTS.pack);
    const seen = visibleSignatures(world, data.garments, meshes);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`seed ${seed}: booklet ${(book * 100).toFixed(0)} % hidden, pack ${(pack * 100).toFixed(0)} % covered, `
      + `${seen.length} signatures in view (${seen.join(', ')}) (${seconds} s)`);
    if (book >= TARGETS.book && pack <= TARGETS.pack && seen.length >= TARGETS.signatures) {
```
and the final error: `'No seed produced a pile that hides the booklet, spares the pack and shows the garments; adjust PLAN.'`. Update the file's top comment ("folded a little (sleeves in, halves over)" → "laid loosely with at most one fold"; add "and at least six signature features show").

- [ ] **Step 5: Build the pile**

Run: `node tools/build-pile.mjs`
Expected: `wrote assets/clothes/pile.json (seed N)`. If no seed passes, read the per-seed log and adjust `PLAN`: a garment whose signature is never in view moves up the order or turns so its feature points away from the centre; low booklet cover → centres closer to (300, 78); pack covered → move the leftmost centres right by 6. Re-run until accepted.

- [ ] **Step 6: Run the tests and look at the pile**

Run: `npm test && npx playwright test --workers=2`
Expected: all pass (full e2e suite: the clearing journeys may need more moves; `clearWithMouse` allows 16).

`node tools/shots.mjs` → `shots/desktop-overhead.png` and `shots/phone-overhead.png`: the pile reads as clothes — qipao collar and closures, Breton stripes and neckline, ruched top, a skirt's lace or pleats — loosely overlapping on the booklet, the pack mostly clear.

- [ ] **Step 7: Verify and commit**

Run `/verify`, then:
```bash
git add js/cloth/mesh.js js/cloth/coverage.js tools/build-pile.mjs assets/clothes/pile.json tests/unit
git commit -m "feat: a loose pile that shows what each garment is

Garments lie with at most one fold, and a pile is kept only when at least
six signature features — collars, necklines, lace, pleats — are in view.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Docs, review and release

**Files:**
- Modify: `README.md`, `docs/design.md`, `C:\Users\Ab Leo\.claude\projects\F--\memory\parcel-personal-site.md`

- [ ] **Step 1: README**

Replace section "### 4. Your photo — `assets/photo/` + `content/site.js` → `photo`" with:
```markdown
### 4. Your vacuum pack — `assets/photo/` + `content/site.js` → `photo`

Your artwork lies in the box as a vacuum-sealed pack along the left wall, the
full depth of the box. Visitors can pick it up anywhere and move it: it is
heavy and stiff, flexes a little and settles flat. `tools/prepare_pack.py`
cuts it out of its white canvas and keeps the plastic see-through:

    python tools/prepare_pack.py F:/CXY.png assets/photo --solid 950,1200,44,40
    npm run clothes

- Everything coloured or dark inside the pack stays solid; `--solid x,y,rx,ry`
  (in the artwork's pixels) marks pale solids the colour test misses — here
  the white sandal on the left foot.
- `--film 0.45` sets how see-through the clear plastic is (lower shows more
  of what lies beneath). Laid back over white, the result always equals your
  artwork; the tool refuses to write if it would not.
- An image that already has transparency is used as it is.
- It writes `vacuum-pack.webp`, `vacuum-pack-relief.webp` (where the contents
  bulge the plastic, lit by the box's lamp) and `vacuum-pack-shade.webp` (the
  same light and shade, for browsers without WebGL2, which show a still pack).
  `npm run clothes` then rebuilds the pack's cloth body
  (`tools/pack_body.py`). The pack is 181 × 290 units (`CONTENTS.pack` in
  `js/scene/geometry.js`); a new picture should keep the 0.62 aspect.

`photo.alt` describes it for screen-reader users — the current text is a
draft for you to check and reword.
```
Remove every mention of `photoCaption` and `prepare_photo.py`. After the clothes section add:
```markdown
### 8. Your books — `content/site.js` → `books`

Four books lie in the lower right: *Hunter × Hunter*, a German-Chinese
dictionary, *One Hundred Years of Solitude* (Gabriel García Márquez) and
*Siddhartha* (Hermann Hesse). `npm run books` (`tools/generate_books.py`)
draws their covers in the site's own fonts — titles only, no publisher
marks. Their places and sizes are `BOOKS` in `js/scene/geometry.js`; each
book's `alt` text in `content/site.js` is what screen readers say.
```
In section 7 (clothes), replace the generator paragraph with:
```markdown
`npm run clothes` redraws the garments (`tools/generate_clothes.py`, with the
drawing code in `tools/clothes/`: `canvas.py`, `fabrics.py`, `details.py`,
`motifs.py`, `traditional.py`, `modern.py`, and `fit.py`, which sizes every
garment to the figure in your pack), adds the pack's body and settles the
pile (`tools/build-pile.mjs`). Each garment is a colour picture with no
painted shading plus a relief map (seams, hems, piping, closures, weave)
that the site lights with the box's lamp. `--only qipao,blouse` redraws just
those. The pile is kept only if it hides the booklet, spares the pack and
shows at least six garments' signature features. `npm run test:py` tests the
Python tools; `node tools/shots.mjs` takes overhead screenshots into `shots/`.
```
Update the "How it works" row for the clothes (smooth surface, relief lighting, textures at the screen's resolution, the pack as a film body) and the credits line for generated art (add `prepare_pack.py` and `generate_books.py`; the covers use the bundled Noto Sans, SIL OFL).

- [ ] **Step 2: `docs/design.md`**

In the architecture table add rows:
```markdown
| `js/cloth/smooth.js` | Pure: four-point interpolation stencils — each cloth cell drawn as 2 × 2 quads | mesh |
| `js/cloth/budget.js` | Pure: device px per unit at the overhead view; texture upload scale | geometry, projection |
```
In "Clothes layer", after the paragraph on particles, add:
```markdown
**Drawn finer than simulated.** A grid cell is cloth when any of it is
opaque, and the outline is cut from the picture's alpha, so sleeves and
collars keep their drawn shape; `core` cells (mostly opaque) are the only
ones that count as hiding the booklet. Each cell is drawn as a 2 × 2 patch
from the four-point scheme, which passes through every particle. A relief
map per garment is lit in the shader through a tangent frame built from
screen-space derivatives, so seams and pleats catch the same light as the
folds. Textures are uploaded at the resolution the screen needs.

**Scale.** Garments are drawn in pattern units and sized by a per-garment
fit to the figure in the owner's pack (`tools/clothes/fit.py`); cloth cells
are at most 6 units, the cloth 4.5 thick, 16 substeps a frame.

**The pack is cloth too.** It is the last body (`kind: "film"`): four times
as heavy per particle, very stiff, held by a wide patch (30 units) lifted 6.
It is drawn after the garments, blended and without writing depth, so cloth
beneath shows through its clear film; only its contents cast a shadow.
Without WebGL2 the CSS pack (`.pack`) shows instead; with it, the CSS pack
hides while the layer shows.

**Holding.** The hand holds a fingertip's patch (8 units) 12 units above
what lies beneath, so a garment slides over the pile with its outline
intact; gravity is −2400 units/s² with air drag 1.2/s.
```
Replace the photo description in the floor layout with: the pack along the left wall (full depth, a film body), the booklet in the upper right under the pile, the four books in the lower right (the manga on the dictionary, the desiccant on *Siddhartha*), each book a collider. Add to Testing: "Python (pytest): the pack matte and relief, the pack body, garment fit and canvas, book covers, record merging."

- [ ] **Step 3: Review**

This is the plan's final whole-branch review (superpowers:executing-plans, "Final Review"): run `review-package` for `$(git merge-base main HEAD)..HEAD`, dispatch the reviewer on the most capable model with the package, the plan and spec paths, the Review Focus section and the ledger's `Ruling:` lines. Fix Critical and Important findings in one pass, each with a test that failed first; ledger minors.

- [ ] **Step 4: Full checks**

Run: `npm test && npm run test:py && npx playwright test --workers=2`
Expected: all pass.

- [ ] **Step 5: Commit the docs; merge and push only with the owner's go-ahead**

```bash
git add README.md docs/design.md
git commit -m "docs: the movable pack, the books, garments at the figure's size

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Then use superpowers:finishing-a-development-branch. Merging into `main` and pushing publishes the site: ask the owner first. On their yes:
```bash
git checkout main && git merge --ff-only feat/pack-and-garments && git push origin main
```
Wait for the Pages build (`gh api repos/ERICLuoYuu/ERICLuoYuu.github.io/pages/builds/latest --jq .status` → `built`).

- [ ] **Step 6: Live checks**

Run: `BASE_URL=https://ericluoyuu.github.io/ npx playwright test --workers=2` and `node tools/shots.mjs https://ericluoyuu.github.io/ shots/live`.
Expected: all pass; live screenshots match the local ones.

- [ ] **Step 7: Memory**

Update `parcel-personal-site.md`: the pack (prepare_pack.py, `--solid` hint, film 0.45, relief map; a movable film body with a CSS fallback), the books (generate_books.py, `BOOKS`), garment fit to the figure and the 6-unit grid, the generator modules and relief maps, the smooth surface, hold/gravity values, the signature-visibility rule for the pile.
