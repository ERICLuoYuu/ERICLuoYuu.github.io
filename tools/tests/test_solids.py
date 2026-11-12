import numpy as np
from scipy import ndimage
from solids.cutout import border_colour, foreground_beside, guided_filter, held_by_shape, key_matte, rounded_matte, unmix
from solids.relief import relief
from solids.finish import add_grain, fit_canvas, remove_marks, sharpen


def disc(size, colour, background):
    yy, xx = np.mgrid[0:size, 0:size]
    cover = np.clip(size * 0.3 - np.hypot(xx - size / 2, yy - size / 2) + 0.5, 0, 1)[..., None]
    return np.array(colour) * cover + np.array(background) * (1 - cover)


def test_a_disc_is_cut_off_black_with_no_dark_fringe():
    rgb = disc(200, (220, 40, 30), (0, 0, 0))
    alpha = key_matte(rgb)
    assert alpha[0, 0] == 0 and alpha[100, 100] == 1
    edge = (alpha > 0.1) & (alpha < 0.9)
    assert edge.any()
    assert unmix(rgb, alpha, border_colour(rgb))[edge][:, 0].mean() > 190


def test_a_background_coloured_hole_inside_stays():
    rgb = disc(200, (220, 40, 30), (255, 255, 255))
    rgb[95:105, 95:105] = 255
    assert key_matte(rgb)[100, 100] == 1


def test_relief_is_zero_outside_and_peaks_inside():
    rgb = disc(200, (220, 40, 30), (0, 0, 0))
    level = relief(key_matte(rgb), rgb, radius_px=30)
    assert level[0, 0] == 0 and level.max() == 255 and level[100, 100] > 200


def test_a_mark_is_painted_over_in_the_surrounding_colour():
    rgb = np.full((80, 80, 3), (200, 30, 30), float)
    rgb[30:50, 30:50] = (250, 200, 40)  # a yellow logo on red
    out = remove_marks(rgb, [(28, 28, 52, 52)])
    patch = out[30:50, 30:50]
    assert np.abs(patch - (200, 30, 30)).max() < 25
    assert rgb[40, 40, 1] == 200, "the input is not changed"


def test_fit_canvas_keeps_proportions_and_centres():
    rgba = np.zeros((100, 50, 4), np.uint8); rgba[..., 3] = 255
    out = fit_canvas(rgba, (80, 80))
    cols = np.nonzero(out[..., 3].max(axis=0))[0]
    assert out.shape[:2] == (80, 80) and cols.min() == 20 and cols.max() == 59


def test_the_object_s_shape_holds_the_key_whole_inside_and_clears_it_far_outside():
    square = np.zeros((60, 60)); square[10:50, 10:50] = 1
    shape = ndimage.gaussian_filter(square, 2)  # the soft outline a salient-object model gives
    key = square.copy()
    key[10:25, 20:30] = 0  # a backdrop-grey part of the object, at its edge, that the key cut away
    key[10:50, 50:58] = 1  # a shadow beside the object that the key kept
    held = held_by_shape(key, shape, inset=3)
    assert held[20, 25] == 1, "the part inside the outline is whole again"
    assert held[30, 56] == 0, "the shadow outside the outline is gone"
    assert held[30, 9] == key[30, 9] and held[30, 10] == key[30, 10], "at the outline's edge the key decides"


def test_a_tray_filling_its_photo_is_cut_to_a_rounded_rectangle():
    alpha = rounded_matte((200, 100), radius=0.1, inset=0.02)
    assert alpha.shape == (200, 100)
    assert alpha[100, 50] == 1 and alpha[0, 0] == 0 and alpha[1, 1] == 0, "the corners are round"
    assert alpha[100, 0] == 0 and alpha[100, 3] == 1, "the sides are inset a little"


def test_grain_is_laid_over_like_the_box_s_at_half_opacity():
    rgb = np.full((4, 4, 3), 200.0)
    grain = np.zeros((2, 2, 4)); grain[0, 0] = (0, 0, 0, 255)  # one opaque black dot per tile
    out = add_grain(rgb, np.ones((4, 4)), grain)
    assert out[0, 0, 0] == 100 and out[2, 2, 0] == 100 and out[1, 1, 0] == 200
    assert add_grain(rgb, np.zeros((4, 4)), grain)[0, 0, 0] == 200, "nothing outside the object"


def test_a_soft_outline_is_pulled_onto_the_picture_s_own_edge():
    guide = np.zeros((40, 80, 3)); guide[:, :40] = (0.8, 0.15, 0.15); guide[:, 40:] = (0.25, 0.55, 0.15)  # red | green
    soft = ndimage.gaussian_filter(np.where(np.arange(80) < 40, 1.0, 0.0)[None, :].repeat(40, 0), (0, 6))
    assert soft[20, 39] - soft[20, 40] < 0.1, "the outline is soft where the picture is sharp"
    sharp = guided_filter(guide, soft, radius=8, eps=1e-3)
    assert sharp[20, 39] - sharp[20, 40] > 0.4, "a step where the picture's colour changes"
    assert abs(sharp[20, 38] - sharp[20, 39]) < 0.05 and abs(sharp[20, 40] - sharp[20, 41]) < 0.05, "and nowhere else"


def test_a_soft_edge_takes_the_colour_of_the_object_beside_it():
    rgb = np.zeros((1, 5, 3))
    rgb[0, :2] = (200.0, 150.0, 120.0)  # skin
    rgb[0, 2:] = (90.0, 160.0, 50.0)  # grass, showing through the soft edge
    alpha = np.array([[1.0, 1.0, 0.6, 0.2, 0.0]])
    out = foreground_beside(rgb, alpha)
    assert (out[0, 2] == (200, 150, 120)).all() and (out[0, 3] == (200, 150, 120)).all(), "the edge is skin"
    assert (out[0, :2] == rgb[0, :2]).all(), "the solid object keeps its own colours"
    assert rgb[0, 2, 1] == 160, "the input is not changed"


def crease(level, row=50, middle=40):
    """How far the slope turns within a pixel at a strip's middle: a ridge turns it at once and shades as a
    hard light/dark seam; a round top turns it gradually."""
    p = level[row].astype(float)
    return (p[middle] - p[middle - 1]) - (p[middle + 1] - p[middle])


def test_a_smoothed_dome_is_round_across_a_thin_part_without_a_ridge_down_its_middle():
    strip = np.zeros((100, 81)); strip[:, 20:61] = 1  # an arm or a leg, 41 px across
    grey = np.full((100, 81, 3), 150.0)
    sharp = relief(strip, grey, radius_px=30, detail=0.0)
    round_ = relief(strip, grey, radius_px=30, detail=0.0, smooth_px=8)
    assert crease(round_) < 0.25 * crease(sharp), f"ridge {crease(round_):.0f} against {crease(sharp):.0f} unsmoothed"
    assert round_[50, 40] == 255 and round_[50, 10] == 0 and round_[50, 70] == 0


def test_a_filter_fitted_on_every_second_pixel_matches_the_full_one_in_far_less_memory():
    import tracemalloc

    yy, xx = np.mgrid[0:600, 0:600]
    inside = np.hypot(xx - 300, yy - 300) < 180
    guide = np.where(inside[..., None], (0.8, 0.2, 0.2), (0.3, 0.55, 0.15)) + np.random.default_rng(3).normal(0, 0.03, (600, 600, 3))
    soft = ndimage.gaussian_filter(inside.astype(float), 6)
    peaks = []
    for subsample in (1, 2):
        tracemalloc.start()
        out = guided_filter(guide, soft, radius=10, eps=1e-3, subsample=subsample)
        peaks.append(tracemalloc.get_traced_memory()[1])
        tracemalloc.stop()
        if subsample == 1:
            full = out
    assert np.abs(out - full).mean() < 0.01, "the same edge"
    assert peaks[1] < 0.4 * peaks[0], f"{peaks[1] / 2**20:.0f} MB against {peaks[0] / 2**20:.0f} MB"


def test_sharpening_steepens_a_step_inside_the_figure_and_leaves_its_flat_colour_and_edge_alone():
    rgb = np.full((60, 60, 3), 100.0)
    rgb[:, 30:] = 150.0  # a step from dark to light inside the figure, like a feature's shadow
    alpha = np.zeros((60, 60))
    alpha[10:50, 10:50] = 1
    out = sharpen(rgb, alpha, radius_px=3, amount=0.6)
    assert out[30, 28, 0] < 97 and out[30, 31, 0] > 153, "darker beside the step's dark side, lighter beside its light side"
    assert abs(out[30, 15, 0] - 100) < 1 and abs(out[30, 45, 0] - 150) < 1, "the flat colour away from the step is as it was"
    assert abs(out[12, 20, 0] - 100) < 1, "nor does the figure's edge change: the empty surround is not blurred in"
    assert rgb[30, 28, 0] == 100, "the input is not changed"
