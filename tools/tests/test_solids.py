import numpy as np
from scipy import ndimage
from solids.cutout import border_colour, held_by_shape, key_matte, rounded_matte, unmix
from solids.relief import relief
from solids.finish import add_grain, fit_canvas, remove_marks


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
