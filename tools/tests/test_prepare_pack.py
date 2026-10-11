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
