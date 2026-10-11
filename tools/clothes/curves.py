"""Curves for drawing garments, in parcel units (x right, y down)."""

from __future__ import annotations

import math
from typing import Callable

Point = tuple[float, float]


def catmull(points: list[Point], closed: bool = True, steps: int = 10) -> list[Point]:
    """A smooth curve through the given points."""
    pts = points + points[:3] if closed else [points[0], *points, points[-1]]
    out: list[Point] = []
    count = len(points) if closed else len(points) - 1
    for i in range(count):
        p0, p1, p2, p3 = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                       + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
                for k in (0, 1)
            ))
    if not closed:
        out.append(points[-1])
    return out


def mirror(half: list[Point], width: float) -> list[Point]:
    """Right half of a symmetric outline (top centre → bottom centre) → the whole outline."""
    return half + [(width - x, y) for x, y in reversed(half)]


def sym(half: list[Point], width: float, steps: int = 10) -> list[Point]:
    """A smooth symmetric outline from its right half."""
    return catmull(mirror(half, width), steps=steps)


def flip(points: list[Point], width: float) -> list[Point]:
    """The points mirrored left ↔ right."""
    return [(width - x, y) for x, y in points]


def mirror_x(side: int, width: float) -> Callable[[float], float]:
    """x as drawn on the right half (side 1) or mirrored onto the left (side −1)."""
    return (lambda x: x) if side == 1 else (lambda x: width - x)


def offset(points: list[Point], d: float) -> list[Point]:
    """The polyline moved sideways by d: to the left of its direction of travel as seen on screen."""
    out: list[Point] = []
    last = len(points) - 1
    for k, (x, y) in enumerate(points):
        (x0, y0), (x1, y1) = points[max(0, k - 1)], points[min(last, k + 1)]
        dx, dy = x1 - x0, y1 - y0
        length = math.hypot(dx, dy) or 1.0
        out.append((x + d * dy / length, y - d * dx / length))
    return out


def along(points: list[Point], step: float) -> list[tuple[Point, Point]]:
    """Points every `step` units along a polyline, each with the unit direction there."""
    out: list[tuple[Point, Point]] = []
    carry = 0.0
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        length = math.hypot(x1 - x0, y1 - y0)
        if length == 0:
            continue
        dx, dy = (x1 - x0) / length, (y1 - y0) / length
        t = carry
        while t <= length:
            out.append(((x0 + dx * t, y0 + dy * t), (dx, dy)))
            t += step
        carry = t - length
    return out


def dash_segments(points: list[Point], dash: float, gap: float) -> list[tuple[Point, Point]]:
    """The 'on' pieces of a dashed line along a polyline."""
    segments: list[tuple[Point, Point]] = []
    run, on = 0.0, True
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        length = math.hypot(x1 - x0, y1 - y0)
        t = 0.0
        while t < length:
            step = min(length - t, (dash if on else gap) - run)
            if on:
                a = (x0 + (x1 - x0) * t / length, y0 + (y1 - y0) * t / length)
                b = (x0 + (x1 - x0) * (t + step) / length, y0 + (y1 - y0) * (t + step) / length)
                segments.append((a, b))
            t += step
            run += step
            if run >= (dash if on else gap) - 1e-6:
                run, on = 0.0, not on
    return segments
