import argparse

import numpy as np
import pytest
from scipy import ndimage

from solids.grass import parse_share, without_grass

SKIN = (240.0, 215.0, 200.0)
SANDAL = (220.0, 232.0, 246.0)
DRY = (125.0, 119.0, 85.0)  # a dry blade, as on the owner's ankle
GREEN = (70.0, 140.0, 40.0)
DARK = (89.0, 74.0, 78.0)  # a blade in shadow
TOE_GAP = (142.0, 86.0, 82.0)  # the pink shadow between two toes
SEAM = (186.0, 200.0, 221.0)  # the sandal strap's faint seam


def feet_scene():
    """A leg (x 40–160, y 0–300) on nothing, a sandal across its foot (y 200–260) with its seam at x 120, a toe gap
    at x 70 below it, a strand of grass sticking out of its left side, and three blades across it."""
    yy, xx = np.mgrid[0:300, 0:200]
    leg = (xx >= 40) & (xx < 160)
    strand = (yy >= 150) & (yy < 152) & (xx >= 10) & (xx < 40)
    rgb = np.zeros((300, 200, 3)) + SKIN
    rgb[(yy >= 200) & (yy < 260)] = SANDAL
    rgb[(yy >= 200) & (yy < 260) & (np.abs(xx - 120) <= 1)] = SEAM
    rgb[(yy >= 262) & (np.abs(xx - 70) <= 1)] = TOE_GAP
    blades = {
        "dry": np.abs((xx - 50) - (yy - 120)) <= 1,  # diagonal
        "green": (np.abs(yy - 180) <= 1) & (xx >= 60) & (xx < 150),
        "dark": (np.abs(xx - 100) <= 1) & (yy >= 140) & (yy < 280),
    }
    for name, colour in (("dry", DRY), ("green", GREEN), ("dark", DARK)):
        rgb[blades[name] & leg & (yy >= 110)] = colour
    rgb[strand] = GREEN
    alpha = (leg | strand).astype(float)
    return np.concatenate([rgb, alpha[..., None] * 255], axis=-1), {k: v & leg & (yy >= 110) for k, v in blades.items()}


def test_blades_across_the_feet_are_painted_over_in_the_colour_round_them():
    rgba, blades = feet_scene()
    out = without_grass(rgba, share=0.7)
    on_skin = (np.arange(300)[:, None] >= 130) & (np.arange(300)[:, None] < 190)  # clear of the fade above the feet and the sandal
    for name, blade in blades.items():
        off = np.abs(out[..., :3][blade & on_skin] - SKIN).max()
        assert off < 12, f"the {name} blade still shows on the skin, {off:.0f} levels off it"
    away = ~np.any([ndimage.binary_dilation(b, iterations=6) for b in blades.values()], axis=0)
    away &= rgba[..., 3] == 255
    away[140:160, :50] = False  # where the strand was
    assert (out[..., :3][away] == rgba[..., :3][away]).all(), "the skin and sandal away from the blades are as they were"


def test_a_toe_gap_s_pink_shadow_and_a_sandal_s_faint_seam_stay():
    rgba, _ = feet_scene()
    out = without_grass(rgba, share=0.7)
    for name, where in (("toe gap", np.s_[265:295, 70]), ("seam", np.s_[205:255, 120])):
        assert (out[where][:, :3] == rgba[where][:, :3]).all(), f"the {name} was taken for grass"


def test_a_strand_sticking_out_of_the_outline_goes_but_the_outline_stays():
    rgba, _ = feet_scene()
    a = without_grass(rgba, share=0.7)[..., 3] / 255
    assert a[150:152, 10:34].max() < 0.05, "the strand of grass is left sticking out"
    rows = np.r_[120:140, 230:250]
    assert a[rows, 44].min() > 0.99 and a[rows, 36].max() < 0.01, "the leg's straight side is kept where it was"


def test_only_the_bottom_share_of_the_figure_is_cleaned():
    rgba, blades = feet_scene()
    out = without_grass(rgba, share=0.3)  # from y 210 down
    assert (out[:200] == rgba[:200]).all(), "above the feet nothing changes"
    rows = np.arange(300)[:, None]
    assert np.abs(out[..., :3][blades["dark"] & (rows >= 245) & (rows < 258)] - SANDAL).max() < 12, "the feet are cleaned"


def test_the_input_is_not_changed():
    rgba, _ = feet_scene()
    before = rgba.copy()
    without_grass(rgba, share=0.7)
    assert (rgba == before).all()


def test_the_share_of_the_figure_to_clean_is_a_number_above_0_up_to_1():
    assert parse_share("0.38") == 0.38 and parse_share("1") == 1.0
    for bad in ("0", "-0.1", "1.5", "nan", "inf", "x", ""):
        with pytest.raises(argparse.ArgumentTypeError):
            parse_share(bad)
