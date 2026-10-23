import numpy as np
import pytest
from PIL import Image

import prepare_figurine as pf


def figure_png(tmp_path):
    yy, xx = np.mgrid[0:400, 0:900]
    inside = ((xx - 450) / 400) ** 2 + ((yy - 200) / 120) ** 2 <= 1
    rgb = np.where(inside[..., None], (180, 40, 40), (200, 200, 200)).astype(np.uint8)
    path = tmp_path / "chosen.png"
    Image.fromarray(rgb).save(path)
    return path


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
