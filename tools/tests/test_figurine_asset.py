"""The figurine picture the site serves, as made from the owner's photo (see the README's command)."""
from pathlib import Path

import numpy as np
from PIL import Image

PICTURE = Path(__file__).resolve().parents[2] / "assets" / "figurine" / "figurine.webp"
FEET = 0.3  # share of the figure's length, from its soles up (the dress, green-flowered, starts above some 0.4)


def test_the_figurine_s_feet_show_no_grass():
    pixels = np.asarray(Image.open(PICTURE).convert("RGBA")).astype(float)
    rgb, alpha = pixels[..., :3], pixels[..., 3]
    rows, _ = np.nonzero(alpha > 128)
    feet = (alpha > 128) & (np.arange(alpha.shape[0])[:, None] >= rows.max() - FEET * (rows.max() - rows.min()))
    r, g, b = (rgb[..., i] for i in range(3))
    green = (g > r + 10) & (g > b + 10)  # skin, a white sandal and its shadows are never greener than red and blue
    assert (green & feet).sum() < 20, f"{(green & feet).sum()} px of green grass on the figurine's feet"
