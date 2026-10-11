import numpy as np
import pytest

from clothes.fit import CELL, cell_grid, fit, grid_shape


def test_each_garment_is_scaled_to_its_length_on_the_figure():
    assert fit("qipao", 400) * 400 == pytest.approx(158)
    assert fit("ruched-top", 190) == pytest.approx(55 / 190)


def test_a_garment_without_a_figure_length_is_refused():
    with pytest.raises(KeyError, match="LENGTH"):
        fit("ballgown", 100)


def test_no_cell_is_wider_than_CELL():
    assert grid_shape(96, 83) == (16, 14)
    assert grid_shape(75.05, 158) == (13, 27)
    assert 75.05 / 13 <= CELL and 158 / 27 <= CELL


def test_cells_are_equal_divisions_of_the_picture():
    alpha = np.zeros((20, 30))
    alpha[:, :10] = 1  # the left third is opaque
    assert cell_grid(alpha, 3, 2, cloth=0.3)["cells"] == "100100"


def test_core_marks_mostly_opaque_cells_only_when_asked():
    alpha = np.zeros((10, 20))
    alpha[:, :12] = 1  # the right cell is 20 % opaque
    grid = cell_grid(alpha, 2, 1, cloth=0.02, core=0.3)
    assert (grid["cells"], grid["core"]) == ("11", "10")
    assert "core" not in cell_grid(alpha, 2, 1, cloth=0.3)
