"""Crop the owner's collage to its plastic sheet and save a web-sized copy.

    python tools/prepare_photo.py <source image> assets/photo/vacuum-collage.webp

The collage sits on a plain white background; everything brighter than
WHITE in every channel counts as background and is trimmed away.
"""

import sys
from pathlib import Path

from PIL import Image

WHITE = 245
PADDING = 8
HEIGHT = 900
QUALITY = 84


def content_box(image: Image.Image) -> tuple[int, int, int, int]:
    """Bounds of every pixel that is not near-white, padded a little."""
    gray = image.convert("RGB").point(lambda v: 255 if v < WHITE else 0).convert("L")
    box = gray.getbbox()
    if box is None:
        raise SystemExit("The image is blank: nothing darker than the background to keep.")
    left, top, right, bottom = box
    return (
        max(0, left - PADDING),
        max(0, top - PADDING),
        min(image.width, right + PADDING),
        min(image.height, bottom + PADDING),
    )


def main(source: str, target: str) -> None:
    image = Image.open(source).convert("RGB")
    cropped = image.crop(content_box(image))
    width = round(cropped.width * HEIGHT / cropped.height)
    resized = cropped.resize((width, HEIGHT), Image.LANCZOS)
    out = Path(target)
    out.parent.mkdir(parents=True, exist_ok=True)
    resized.save(out, "WEBP", quality=QUALITY, method=6)
    print(f"{out}: {width} x {HEIGHT} (aspect {width / HEIGHT:.3f}), {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
