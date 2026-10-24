from pathlib import Path

import numpy as np
import pytest
from PIL import Image
from scipy import ndimage

import prepare_figurine as pf

RED = (180.0, 40.0, 40.0)


def figure_png(tmp_path):
    yy, xx = np.mgrid[0:400, 0:900]
    inside = ((xx - 450) / 400) ** 2 + ((yy - 200) / 120) ** 2 <= 1
    rgb = np.where(inside[..., None], (180, 40, 40), (200, 200, 200)).astype(np.uint8)
    path = tmp_path / "chosen.png"
    Image.fromarray(rgb).save(path)
    return path


FIGURE = (lambda yy, xx: ((xx - 250) / 120) ** 2 + ((yy - 450) / 380) ** 2 <= 1)(*np.mgrid[0:900, 0:500])


def backdrop_png(tmp_path, sole=False):
    """A figure (x 130–370, y 70–830) on a grey backdrop whose light falls off from left to right,
    with its shadow cast to the right of it, soft edges and a little noise: as an image model draws it.
    With `sole`, its lowest 70 px are the backdrop's own grey, like a pale sandal's sole."""
    yy, xx = np.mgrid[0:900, 0:500]
    grey = np.array([188.0, 187.0, 190.0]) * np.linspace(1.06, 0.97, 500)[None, :, None]
    shadow = ((xx - 290) / 120) ** 2 + ((yy - 470) / 380) ** 2 <= 1
    rgb = np.where(FIGURE[..., None], RED, np.where(shadow[..., None], 0.7 * grey, grey))
    if sole:
        rgb = np.where((FIGURE & (yy >= 760))[..., None], grey, rgb)
    rgb = ndimage.gaussian_filter(rgb, (1, 1, 0)) + np.random.default_rng(1).normal(0, 5, rgb.shape)
    path = tmp_path / "backdrop.png"
    Image.fromarray(np.clip(np.round(rgb), 0, 255).astype(np.uint8)).save(path)
    return path


def test_a_cast_shadow_and_a_falling_light_are_cut_away_with_the_backdrop(tmp_path):
    cut = pf.cut_out(backdrop_png(tmp_path), None, "auto")
    assert abs(cut.shape[0] - 761) <= 6 and abs(cut.shape[1] - 241) <= 6, f"cropped to {cut.shape[:2]}, the figure is 761 × 241"


def test_with_the_model_s_outline_a_part_as_grey_as_the_backdrop_stays(tmp_path, monkeypatch):
    outline = ndimage.gaussian_filter(FIGURE.astype(float), 4)  # soft, as u2net's is
    monkeypatch.setattr(pf, "u2net_matte", lambda rgb, model: outline)
    cut = pf.cut_out(backdrop_png(tmp_path, sole=True), Path("u2netp.onnx"), "auto")
    assert abs(cut.shape[0] - 761) <= 6 and abs(cut.shape[1] - 241) <= 6, f"cropped to {cut.shape[:2]}, the figure is 761 × 241"
    assert (cut[-40:-10, 100:140, 3] == 255).all(), "the sole is part of the figure"


def test_an_edge_against_the_shadow_keeps_the_figure_s_own_colour(tmp_path):
    cut = pf.cut_out(backdrop_png(tmp_path), None, "auto")
    a = cut[..., 3] / 255
    right = (a > 0.2) & (a < 0.9) & (np.arange(cut.shape[1]) > cut.shape[1] // 2)[None, :]
    assert right.sum() > 100
    off = np.abs(cut[..., :3][right] - RED).mean()
    assert off < 20, f"the edge beside the shadow is {off:.0f} levels off the figure's colour"


@pytest.fixture(scope="module")
def made(tmp_path_factory):
    """The four pictures, made once for the module (encoding them takes seconds)."""
    tmp_path = tmp_path_factory.mktemp("figurine")
    out = tmp_path / "out"
    assert pf.main([str(figure_png(tmp_path)), str(out)]) == 0
    load = lambda name: np.asarray(Image.open(out / name))  # noqa: E731
    return load("figurine.webp"), load("figurine-relief.webp"), load("wrap.webp"), load("wrap-relief.webp")


def test_a_wide_figure_is_turned_upright_and_sized_to_the_figure_the_clothes_fit(made):
    figure, *_ = made
    assert figure.shape[:2] == (1160, 500)
    ys, xs = np.nonzero(figure[..., 3] > 127)
    assert ys.max() - ys.min() > xs.max() - xs.min()
    assert abs((ys.max() - ys.min()) - pf.FIGURE_LENGTH * pf.PX) <= 8


def test_the_figure_lies_inside_the_bag_with_room_for_the_seals(made):
    figure, *_ = made
    ys, xs = np.nonzero(figure[..., 3] > 12)
    side, end = (m * pf.PX for m in pf.MARGIN)
    assert xs.min() >= side - 1 and xs.max() <= 500 - side and ys.min() >= end - 1 and ys.max() <= 1160 - end


def test_the_bag_is_clear_film_inside_its_outline_and_denser_at_the_seals(made):
    _, _, wrap, _ = made
    alpha = wrap[..., 3] / 255
    assert alpha[0, 0] == 0 and alpha[580, 30] > 0.04 and alpha[580, 250] < 0.5
    assert alpha[: 10 * pf.PX, 60:440].mean() > 1.5 * alpha[500:660, 60:440].mean()


def test_the_bag_lies_over_the_figure_everywhere(made):
    figure, level, _, wrap_level = made
    on = figure[..., 3] > 127
    fig_h = level[on] / 255 * pf.HEIGHT
    bag_h = wrap_level[on] / 255 * (pf.HEIGHT + pf.CLEARANCE)
    assert (bag_h >= fig_h + 0.5).all()
