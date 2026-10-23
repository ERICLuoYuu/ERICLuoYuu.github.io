"""Garment scale: every garment is sized to fit the figure in the owner's figurine.

Garments are drawn in pattern units; `fit` scales a pattern to the figure
(spec Revision B, B2). Whatever the fit, the cloth grid is cut at no more
than CELL parcel units, in equal divisions of the garment, because
js/cloth/mesh.js spaces particles size / cols apart.
"""

from __future__ import annotations

import math

import numpy as np

CELL = 6  # parcel units per cloth cell, at most

# How long each garment is, in parcel units, measured on the figure in the owner's figurine
# (head to sole ≈ 248 units in the 290-unit pack).
LENGTH = {
    "qipao": 158,  # shoulder → mid-calf
    "blouse": 83,  # shoulder → hip
    "mamianqun": 127,  # waist → ankle
    "tee-white": 83,  # shoulder → hip
    "tee-breton": 83,  # shoulder → hip
    "slip-skirt": 103,  # waist → mid-calf
    "ruched-top": 55,  # shoulder → waist: cropped, like the one in the photo
    "floral-skirt": 103,  # waist → mid-calf
}


def fit(garment_id: str, pattern_length: float) -> float:
    """Scale from pattern units to parcel units for a garment drawn `pattern_length` long."""
    if garment_id not in LENGTH:
        raise KeyError(f"no figure length for {garment_id!r}; add one to LENGTH")
    return LENGTH[garment_id] / pattern_length


def grid_shape(width: float, height: float, cell: float = CELL) -> tuple[int, int]:
    """Cells across and down for a body `width` × `height` parcel units, none wider than `cell`."""
    return math.ceil(width / cell), math.ceil(height / cell)


def cell_grid(alpha: np.ndarray, cols: int, rows: int, cloth: float, core: float | None = None) -> dict:
    """Cut an opacity image (0…1) into cols × rows equal cells: cloth where the mean
    opacity reaches `cloth`; core (it hides what lies under it) where it reaches `core`."""
    height, width = alpha.shape
    cells, cores = [], []
    for j in range(rows):
        y0, y1 = round(j * height / rows), round((j + 1) * height / rows)
        for i in range(cols):
            x0, x1 = round(i * width / cols), round((i + 1) * width / cols)
            share = float(alpha[y0:y1, x0:x1].mean()) if y1 > y0 and x1 > x0 else 0.0
            cells.append("1" if share >= cloth else "0")
            cores.append("1" if core is not None and share >= core else "0")
    grid = {"cols": cols, "rows": rows, "cells": "".join(cells)}
    if core is not None:
        grid["core"] = "".join(cores)
    return grid
