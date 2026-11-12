import argparse

import numpy as np
import pytest

from solids.lens import WIRE, Lens, drawn_lens, parse_lens

RED = (180.0, 40.0, 40.0)


def lens_scene():
    """A face's edge (opaque from x 60 on) on grass, and the far lens of its glasses round (45, 50) that the
    model left out with the grass seen through it, a bright grey glare in the glass at (38, 50)."""
    yy, xx = np.mgrid[0:100, 0:100]
    grass = np.array([70.0, 140.0, 40.0]) * np.random.default_rng(3).uniform(0.6, 1.4, (100, 100, 1))
    photo = np.where((xx >= 60)[..., None], RED, grass)
    photo[(xx - 38) ** 2 + (yy - 50) ** 2 <= 9] = (235.0, 235.0, 230.0)
    alpha = (xx >= 60).astype(float)
    colour = np.where(alpha[..., None] > 0, photo, 0.0)
    return colour, alpha, photo, Lens(centre=(45.0, 50.0), axes=(20.0, 10.0), tilt=0.0)


def test_the_far_lens_is_drawn_back_as_a_wire_ring_behind_the_face():
    colour, alpha, photo, lens = lens_scene()
    out_rgb, out_a = drawn_lens(colour, alpha, photo, lens)
    assert out_a[50, 25] > 0.95 and out_a[40, 45] > 0.95, "the ring, at the lens's end and its side"
    assert np.abs(out_rgb[50, 25] - WIRE).max() < 3, f"the ring is {out_rgb[50, 25]}, not the wire's colour"
    assert out_a[50, 70] == 1 and (out_rgb[50, 70] == RED).all() and (out_rgb[50, 64] == RED).all(), "the face is in front of it"
    assert out_a[10, 10] == 0 and out_a[50, 15] == 0, "nothing beyond the lens"


def test_the_box_shows_through_the_glass_but_the_photo_s_glare_stays():
    colour, alpha, photo, lens = lens_scene()
    out_rgb, out_a = drawn_lens(colour, alpha, photo, lens)
    yy, xx = np.mgrid[0:100, 0:100]
    inside = ((xx - 45) / 17) ** 2 + ((yy - 50) / 7) ** 2 <= 1
    spot = (xx - 38) ** 2 + (yy - 50) ** 2
    glare, grass = spot <= 4, inside & (spot > 9) & (xx < 55)  # the glare's core; the glass clear of it
    assert out_a[grass].max() == 0, f"the grass seen through the glass is kept (alpha up to {out_a[grass].max():.2f})"
    assert out_a[glare].min() > 0.9 and out_rgb[glare].min() > 220, "the glass's own glare is kept"


def test_on_a_plain_backdrop_its_grey_is_no_glare():
    colour, alpha, photo, lens = lens_scene()
    plain = np.where(alpha[..., None] > 0, photo, 200.0)  # a bright grey backdrop, no glare in the glass
    _, out_a = drawn_lens(colour, alpha, plain, lens)
    yy, xx = np.mgrid[0:100, 0:100]
    inside = ((xx - 45) / 17) ** 2 + ((yy - 50) / 7) ** 2 <= 1
    assert out_a[inside & (xx < 55)].max() == 0, "the backdrop seen through the glass was taken for glare"


def test_the_inputs_are_not_changed():
    colour, alpha, photo, lens = lens_scene()
    before = colour.copy(), alpha.copy(), photo.copy()
    drawn_lens(colour, alpha, photo, lens)
    assert all((a == b).all() for a, b in zip(before, (colour, alpha, photo)))


def test_a_lens_is_given_as_its_centre_axes_and_tilt():
    assert parse_lens("164,189,26,9.5,52") == Lens(centre=(164.0, 189.0), axes=(26.0, 9.5), tilt=52.0)
    for bad in ("164,189,26", "a,b,c,d,e", "164,189,-26,9.5,52", "164,189,26,0,52", "nan,189,26,9.5,52", "164,189,inf,9.5,52", "164,189,26,9.5,nan"):
        with pytest.raises(argparse.ArgumentTypeError):
            parse_lens(bad)


def test_a_lens_moves_with_a_crop_and_a_resize():
    assert Lens((100.0, 200.0), (20.0, 10.0), 30.0).moved((40.0, 50.0), 0.5) == Lens((30.0, 75.0), (10.0, 5.0), 30.0)
