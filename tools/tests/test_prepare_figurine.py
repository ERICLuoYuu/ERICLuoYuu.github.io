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


BLUE = (40.0, 60.0, 180.0)


def test_a_phone_photo_stored_turned_is_cut_the_right_way_up(tmp_path):
    yy, _ = np.mgrid[0:900, 0:500]
    rgb = np.where(FIGURE[..., None], RED, (188.0, 187.0, 190.0))
    rgb = np.where((FIGURE & (yy < 200))[..., None], BLUE, rgb)  # a blue head at the top
    exif = Image.Exif()
    exif[0x0112] = 3  # the orientation flag: "turn me half round to view"
    path = tmp_path / "phone.jpg"
    Image.fromarray(np.rot90(rgb, 2).astype(np.uint8)).save(path, quality=95, exif=exif)
    cut = pf.cut_out(path, None, "0")
    top = cut[:100][cut[:100, :, 3] > 127]
    assert top[:, 2].mean() > top[:, 0].mean(), "the blue head is at the top"


def grass_png(tmp_path, scale=1):
    """The figure (x 180–420, y 70–830, times `scale`) sitting on grass: a busy, green, uneven background."""
    h, w = 900 * scale, 600 * scale
    yy, xx = np.mgrid[0:h, 0:w]
    figure = ((xx - 300 * scale) / (120 * scale)) ** 2 + ((yy - 450 * scale) / (380 * scale)) ** 2 <= 1
    light = np.random.default_rng(2).uniform(0.55, 1.45, (h, w, 1))
    rgb = np.where(figure[..., None], RED, np.array([70.0, 140.0, 40.0]) * light)
    path = tmp_path / "grass.png"
    Image.fromarray(np.clip(np.round(ndimage.gaussian_filter(rgb, (1, 1, 0))), 0, 255).astype(np.uint8)).save(path)
    return path


def red_finder(rgb, model):
    """A stand-in for u2net: it knows the red figure, but draws its outline soft, as the model does."""
    return ndimage.gaussian_filter((rgb[..., 0] - rgb[..., 1] > 60).astype(float), max(rgb.shape[:2]) / 60)


def test_a_person_on_grass_is_cut_to_their_own_edge_without_the_grass_s_green(tmp_path, monkeypatch):
    monkeypatch.setattr(pf, "u2net_matte", red_finder)
    cut = pf.cut_out(grass_png(tmp_path), Path("u2netp.onnx"), "auto")
    assert abs(cut.shape[0] - 761) <= 6 and abs(cut.shape[1] - 241) <= 6, f"cropped to {cut.shape[:2]}, the figure is 761 × 241"
    a = cut[..., 3] / 255
    edge = (a > 0.1) & (a < 0.9)
    perimeter = 1770  # px around the figure's ellipse
    assert edge.sum() < 3 * perimeter, f"{edge.sum()} px of soft edge: the outline was not pulled onto the photo's edge"
    assert edge.sum() > perimeter / 2, f"{edge.sum()} px of soft edge: a jagged cut, not an antialiased one"
    faint = ((a > 0) & (a < 0.1)).sum()
    assert faint < perimeter / 2, f"{faint} px of faint glow around the edge: the grass's texture leaking through"
    off = np.abs(cut[..., :3][edge] - RED).mean()
    assert off < 20, f"the edge is {off:.0f} levels off the figure's colour: the grass shows through it"


def test_a_large_photo_is_cut_at_a_working_size(tmp_path, monkeypatch):
    monkeypatch.setattr(pf, "u2net_matte", red_finder)
    cut = pf.cut_out(grass_png(tmp_path, scale=3), Path("u2netp.onnx"), "auto")
    assert abs(cut.shape[0] - pf.WORK_LENGTH) <= 0.03 * pf.WORK_LENGTH, f"the figure is {cut.shape[0]} px long"


def test_the_figure_s_height_is_a_smooth_dome_without_the_photo_s_texture():
    a = FIGURE.astype(float)
    flat = np.full(FIGURE.shape + (3,), 150.0)
    striped = flat * (1 + 0.4 * (np.arange(FIGURE.shape[0]) // 4 % 2))[:, None, None]  # skin texture, grass blades
    assert (pf.figure_level(a, striped) == pf.figure_level(a, flat)).all()


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


def test_the_figure_s_arms_and_legs_are_round_without_a_ridge_down_their_middle():
    strip = np.zeros((200, 161)); strip[:, 40:121] = 1  # a leg, 20 units across
    level = pf.figure_level(strip, np.full((200, 161, 3), 150.0)).astype(float)
    p = level[100]
    ridge = (p[80] - p[79]) - (p[81] - p[80])  # how far the slope turns within a pixel at the middle
    assert ridge <= 2, f"the slope turns {ridge:.0f} levels at once down the middle: a seam"


def test_a_photo_on_a_busy_background_asks_for_the_model(tmp_path):
    with pytest.raises(SystemExit, match="--u2net"):
        pf.cut_out(grass_png(tmp_path), None, "auto")


def test_a_photo_with_no_one_in_it_says_so(tmp_path, monkeypatch):
    monkeypatch.setattr(pf, "u2net_matte", lambda rgb, model: np.zeros(rgb.shape[:2]))
    with pytest.raises(SystemExit, match="no one"):
        pf.cut_out(grass_png(tmp_path), Path("u2netp.onnx"), "auto")


def test_where_the_photo_has_no_edge_the_cut_fades_out_without_a_rim(monkeypatch):
    yy, xx = np.mgrid[0:200, 0:200]
    disc = (np.hypot(xx - 100, yy - 100) < 50).astype(float)
    monkeypatch.setattr(pf, "u2net_matte", lambda rgb, model: disc)
    flat = np.full((200, 200, 3), 120.0)  # the model's outline crosses no colour edge in the photo
    ray = pf.busy_matte(flat, Path("u2netp.onnx"))[100, 100:]
    step = np.abs(np.diff(ray)).max()
    assert step < 0.1, f"the soft edge drops {step:.2f} at once: a hard rim"
    assert ray[-1] == 0
