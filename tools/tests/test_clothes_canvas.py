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
