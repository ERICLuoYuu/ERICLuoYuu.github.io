import numpy as np

from solids.wrap import FILM, bag

SIZE = (200, 400)  # px: the bag's width and length


def figure():
    yy, xx = np.mgrid[0:400, 0:200]
    alpha = (((xx - 100) / 60) ** 2 + ((yy - 200) / 150) ** 2 <= 1).astype(float)
    return alpha, (alpha * 255).astype(np.uint8)


def test_the_creases_keep_off_where_they_are_told_and_stay_elsewhere():
    alpha, level = figure()
    keep_off = np.zeros((400, 200))
    keep_off[:200] = 1  # the top half
    plain, plain_level = bag(SIZE, alpha, level, px=4)
    clear, clear_level = bag(SIZE, alpha, level, px=4, keep_off=keep_off)
    top = (slice(60, 180), slice(50, 150))  # inside the top half, away from the seal and the sides
    assert plain[top][..., 3].max() / 255 > FILM[1] + 0.05, "creases cross the top half"
    assert clear[top][..., 3].max() / 255 <= FILM[1] + 0.01, "kept off it, no crease shows there"
    assert (clear_level[top] <= plain_level[top]).all() and (clear_level[top] < plain_level[top]).any(), "nor stands up there"
    assert np.array_equal(clear[240:340], plain[240:340]), "the bottom half keeps its creases"
