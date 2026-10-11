import numpy as np
from PIL import Image

import generate_books as gb

OWNER = {  # as the owner wrote them
    "hunter-x-hunter": ("Hunter × Hunter", ""),
    "dictionary": ("German-Chinese dictionary", ""),
    "solitude": ("One Hundred Years of Solitude", "Gabriel García Márquez"),
    "siddhartha": ("Siddhartha", "Hermann Hesse"),
}


def test_titles_and_authors_are_as_the_owner_wrote_them():
    assert {b.id: (b.title, b.author) for b in gb.BOOKS} == OWNER


def test_the_cover_lines_spell_the_title_and_nothing_else():
    for b in gb.BOOKS:
        assert " ".join(b.lines) == b.title


def test_sizes_match_the_books_in_the_box():
    # BOOKS in js/scene/geometry.js, width × height in parcel units
    assert {b.id: b.size for b in gb.BOOKS} == {
        "hunter-x-hunter": (50, 78), "dictionary": (70, 96), "solitude": (58, 88), "siddhartha": (56, 86)}


def test_a_cover_is_drawn_at_PX_per_unit_and_is_not_a_blank():
    for b in gb.BOOKS:
        img = gb.cover(b)
        assert img.size == (b.size[0] * gb.PX, b.size[1] * gb.PX)
        assert np.asarray(img.convert("L"), np.float32).std() > 12, f"{b.id}: no lettering"


def test_text_shrinks_until_it_fits():
    font = gb.fit_font("One Hundred Years of Solitude", gb.BOLD, 120, 60)
    assert font.getlength("One Hundred Years of Solitude") <= 120


def test_the_same_book_draws_the_same_cover():
    b = gb.BOOKS[0]
    assert np.array_equal(np.asarray(gb.cover(b)), np.asarray(gb.cover(b)))


def test_cli_writes_one_cover_per_book(tmp_path):
    assert gb.main([str(tmp_path)]) == 0
    for b in gb.BOOKS:
        assert Image.open(tmp_path / f"{b.id}.webp").size == (b.size[0] * gb.PX, b.size[1] * gb.PX)
