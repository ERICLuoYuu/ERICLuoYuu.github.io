"""Line drawings for the instruction-manual booklet.

    python tools/generate_manual.py

Writes assets/manual/*.svg (illustrations for content/book.md) and the
booklet's cover and inside cover (assets/art/manual-cover.svg,
assets/art/manual-endpaper.svg). Every drawing is black line work on white,
built from one jointed figure so all the poses match.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANUAL = ROOT / "assets" / "manual"
ART = ROOT / "assets" / "art"

INK = "#161616"
PAPER = "#fcfcfa"
LINE = 2.6  # outline width
LIMB = 9.0  # outer width of a limb tube (black), the white core is LIMB - 2 * LINE


@dataclass(frozen=True)
class Pose:
    """Limb angles in degrees: 0 points straight down, 90 to the right, 180 up."""

    left_arm: tuple[float, float] = (-14, -6)
    right_arm: tuple[float, float] = (14, 6)
    left_leg: tuple[float, float] = (-5, 0)
    right_leg: tuple[float, float] = (5, 0)
    head_tilt: float = 0.0


STAND = Pose()
WAVE = Pose(right_arm=(128, 172))
READ = Pose(left_arm=(-22, 58), right_arm=(22, -58), head_tilt=6)
THINK = Pose(right_arm=(28, 166), left_arm=(-12, 52), head_tilt=-5)
PHONE = Pose(right_arm=(30, 172))
OFFER = Pose(right_arm=(58, 92))
TAKE = Pose(left_arm=(-58, -92))
PRESENT = Pose(right_arm=(118, 150), left_arm=(-16, -8))


def point(x: float, y: float, angle: float, length: float) -> tuple[float, float]:
    rad = math.radians(angle)
    return x + math.sin(rad) * length, y + math.cos(rad) * length


def tube(points: list[tuple[float, float]]) -> str:
    """A limb drawn as an outlined tube: a thick black stroke with a white core."""
    d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in points)
    return (
        f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{LIMB}" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<path d="{d}" fill="none" stroke="{PAPER}" stroke-width="{LIMB - 2 * LINE}" stroke-linecap="round" stroke-linejoin="round"/>'
    )


def limb(start: tuple[float, float], angles: tuple[float, float], lengths: tuple[float, float]) -> tuple[str, tuple[float, float]]:
    elbow = point(*start, angles[0], lengths[0])
    hand = point(*elbow, angles[1], lengths[1])
    return tube([start, elbow, hand]), hand


def person(cx: float, top: float, pose: Pose = STAND, scale: float = 1.0) -> tuple[str, dict[str, tuple[float, float]]]:
    """A round-headed manual figure about 150 units tall (at scale 1); returns its SVG and hand positions."""
    s = scale
    shoulder_y, hip_y = top + 40 * s, top + 92 * s
    left_sh, right_sh = (cx - 15 * s, shoulder_y), (cx + 15 * s, shoulder_y)
    left_hip, right_hip = (cx - 8 * s, hip_y), (cx + 8 * s, hip_y)
    arm, leg = (26 * s, 24 * s), (30 * s, 30 * s)

    left_arm, left_hand = limb(left_sh, pose.left_arm, arm)
    right_arm, right_hand = limb(right_sh, pose.right_arm, arm)
    left_leg, _ = limb(left_hip, pose.left_leg, leg)
    right_leg, _ = limb(right_hip, pose.right_leg, leg)

    torso = (
        f'<path d="M{cx - 17 * s:.1f} {shoulder_y - 4 * s:.1f} Q{cx:.1f} {shoulder_y - 10 * s:.1f} {cx + 17 * s:.1f} {shoulder_y - 4 * s:.1f} '
        f'Q{cx + 19 * s:.1f} {hip_y - 20 * s:.1f} {cx + 13 * s:.1f} {hip_y + 4 * s:.1f} '
        f'L{cx - 13 * s:.1f} {hip_y + 4 * s:.1f} Q{cx - 19 * s:.1f} {hip_y - 20 * s:.1f} {cx - 17 * s:.1f} {shoulder_y - 4 * s:.1f} Z" '
        f'fill="{PAPER}" stroke="{INK}" stroke-width="{LINE}" stroke-linejoin="round"/>'
    )
    hx, hy = cx + pose.head_tilt * 0.4 * s, top + 16 * s
    head = (
        f'<circle cx="{hx:.1f}" cy="{hy:.1f}" r="{14 * s:.1f}" fill="{PAPER}" stroke="{INK}" stroke-width="{LINE}"/>'
        f'<path d="M{hx - 5 * s:.1f} {hy + 4 * s:.1f} Q{hx:.1f} {hy + 8 * s:.1f} {hx + 5 * s:.1f} {hy + 4 * s:.1f}" fill="none" '
        f'stroke="{INK}" stroke-width="{LINE * 0.8}" stroke-linecap="round"/>'
    )
    svg = left_leg + right_leg + left_arm + torso + right_arm + head
    return svg, {"left": left_hand, "right": right_hand, "head": (hx, hy)}


def booklet(x: float, y: float, w: float = 22, h: float = 28, angle: float = 0) -> str:
    lines = "".join(
        f'<path d="M{x + 4:.1f} {y + 7 + i * 6:.1f} H{x + w - 4:.1f}" stroke="{INK}" stroke-width="1.6" stroke-linecap="round"/>'
        for i in range(3)
    )
    return (
        f'<g transform="rotate({angle} {x + w / 2:.1f} {y + h / 2:.1f})">'
        f'<rect x="{x:.1f}" y="{y:.1f}" width="{w}" height="{h}" rx="2" fill="{PAPER}" stroke="{INK}" stroke-width="{LINE}"/>{lines}</g>'
    )


def parcel(x: float, y: float, w: float = 96, h: float = 60, depth: float = 34) -> str:
    """An open cardboard box in simple oblique line work."""
    dx, dy = depth * 0.7, -depth * 0.5
    stroke = f'fill="{PAPER}" stroke="{INK}" stroke-width="{LINE}" stroke-linejoin="round"'
    back = f'<path d="M{x + dx} {y + dy} H{x + w + dx} V{y + h + dy} H{x + dx} Z" {stroke}/>'
    front = f'<path d="M{x} {y} H{x + w} V{y + h} H{x} Z" {stroke}/>'
    side = f'<path d="M{x + w} {y} L{x + w + dx} {y + dy} V{y + h + dy} L{x + w} {y + h} Z" {stroke}/>'
    flaps = (
        f'<path d="M{x} {y} L{x - 14} {y - 26} L{x + w - 14} {y - 26} L{x + w} {y} Z" {stroke}/>'
        f'<path d="M{x + w} {y} L{x + w + dx + 18} {y + dy - 6} L{x + w + dx} {y + dy} Z" {stroke}/>'
    )
    return back + side + front + flaps


def badge(x: float, y: float, good: bool) -> str:
    mark = (
        f'<path d="M{x - 8} {y} L{x - 2} {y + 7} L{x + 9} {y - 7}"/>' if good
        else f'<path d="M{x - 7} {y - 7} L{x + 7} {y + 7} M{x + 7} {y - 7} L{x - 7} {y + 7}"/>'
    )
    return (
        f'<circle cx="{x}" cy="{y}" r="16" fill="{PAPER}" stroke="{INK}" stroke-width="{LINE}"/>'
        f'<g fill="none" stroke="{INK}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">{mark}</g>'
    )


def svg(width: float, height: float, body: str, title: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img">'
        f"<title>{title}</title>{body}</svg>\n"
    )


def floor(x0: float, x1: float, y: float) -> str:
    return f'<path d="M{x0} {y} H{x1}" stroke="{INK}" stroke-width="{LINE}" stroke-linecap="round"/>'


# ─── the illustrations ──────────────────────────────────────────────────────


def figure_wave() -> str:
    body, _ = person(120, 16, WAVE)
    motion = f'<path d="M168 30 q8 6 4 16 M178 22 q12 10 6 26" fill="none" stroke="{INK}" stroke-width="{LINE}" stroke-linecap="round"/>'
    return svg(240, 180, floor(60, 180, 170) + body + motion, "A figure waving hello")


def figure_read() -> str:
    body, hands = person(120, 16, READ)
    x = (hands["left"][0] + hands["right"][0]) / 2
    return svg(240, 180, floor(60, 180, 170) + body + booklet(x - 14, hands["left"][1] - 18, 28, 22, -6), "A figure reading a booklet")


def figure_think() -> str:
    body, _ = person(120, 16, THINK)
    question = (
        f'<path d="M150 26 q0 -12 12 -12 q12 0 12 11 q0 8 -10 12 v7" fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
        f'<circle cx="164" cy="54" r="2.4" fill="{INK}"/>'
    )
    return svg(240, 180, floor(60, 180, 170) + body + question, "A figure thinking")


def figure_phone() -> str:
    body, hands = person(110, 16, PHONE)
    hx, hy = hands["right"]
    phone = f'<rect x="{hx - 4:.1f}" y="{hy - 10:.1f}" width="10" height="18" rx="2" fill="{PAPER}" stroke="{INK}" stroke-width="{LINE}"/>'
    bubble = (
        f'<path d="M150 22 h56 a8 8 0 0 1 8 8 v22 a8 8 0 0 1 -8 8 h-38 l-10 10 v-10 h-8 a8 8 0 0 1 -8 -8 v-22 a8 8 0 0 1 8 -8 z" '
        f'fill="{PAPER}" stroke="{INK}" stroke-width="{LINE}" stroke-linejoin="round"/>'
        + "".join(f'<circle cx="{166 + i * 14}" cy="41" r="3" fill="{INK}"/>' for i in range(3))
    )
    return svg(240, 180, floor(50, 170, 170) + body + phone + bubble, "A figure on the phone")


def two_people() -> str:
    giver, hands = person(78, 16, OFFER)
    taker, _ = person(170, 16, TAKE)
    hx, hy = hands["right"]
    return svg(250, 180, floor(30, 220, 170) + giver + taker + booklet(hx - 2, hy - 18, 24, 20, 8), "Two figures handing over a booklet")


def parts() -> str:
    cells = []
    items = [
        booklet(34, 30, 30, 38),
        f'<path d="M129 70 c-14 -10 -22 -18 -22 -27 a10 10 0 0 1 22 -4 a10 10 0 0 1 22 4 c0 9 -8 17 -22 27 z" fill="{PAPER}" stroke="{INK}" stroke-width="{LINE}" stroke-linejoin="round"/>',
        f'<path d="M209 30 l6 13 14 2 -10 10 2 14 -12 -7 -12 7 2 -14 -10 -10 14 -2 z" fill="{PAPER}" stroke="{INK}" stroke-width="{LINE}" stroke-linejoin="round"/>',
    ]
    for i, item in enumerate(items):
        x = 14 + i * 80
        cells.append(f'<rect x="{x}" y="14" width="70" height="92" rx="4" fill="none" stroke="{INK}" stroke-width="1.6"/>{item}')
        cells.append(f'<text x="{x + 8}" y="98" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="{INK}">1×</text>')
    return svg(258, 120, "".join(cells), "A parts list with three items")


def check() -> str:
    return svg(60, 60, badge(30, 30, True), "Do this")


def cross() -> str:
    return svg(60, 60, badge(30, 30, False), "Not like this")


# ─── cover and inside cover ─────────────────────────────────────────────────


def cover() -> str:
    """360 × 500. The title is set by the page in the top 28 %, so this stays clear there."""
    figure, hands = person(118, 236, PRESENT, scale=1.25)
    hx, hy = hands["right"]
    pictogram_x, pictogram_y = 30, 440
    single, _ = person(pictogram_x + 20, pictogram_y, STAND, scale=0.3)
    body = (
        f'<rect width="360" height="500" fill="{PAPER}"/>'
        + floor(40, 330, 428)
        + parcel(190, 340, 108, 92, 40)
        + figure
        + booklet(hx - 8, hy - 30, 28, 34, -10)
        + f'<rect x="{pictogram_x}" y="{pictogram_y - 6}" width="40" height="54" rx="4" fill="none" stroke="{INK}" stroke-width="1.8"/>'
        + single
        + f'<text x="330" y="482" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="11" letter-spacing="1" fill="{INK}">AA-000001-1</text>'
    )
    return svg(360, 500, body, "Cover: a figure holds up a booklet beside an open parcel")


def endpaper() -> str:
    """360 × 500. Two panels; the owner label is laid over the lower part by the page."""
    alone, _ = person(78, 112, THINK, scale=1.05)
    giver, hands = person(226, 112, OFFER, scale=1.05)
    taker, _ = person(306, 112, TAKE, scale=1.05)
    hx, hy = hands["right"]
    panel = lambda x: f'<rect x="{x}" y="40" width="150" height="270" rx="5" fill="none" stroke="{INK}" stroke-width="1.8"/>'  # noqa: E731
    body = (
        f'<rect width="360" height="500" fill="{PAPER}"/>'
        + panel(22) + panel(188)
        + alone + parcel(112, 252, 36, 32, 16) + badge(44, 62, False)
        + giver + taker + booklet(hx - 2, hy - 18, 22, 18, 8) + badge(210, 62, True)
        + floor(34, 160, 274) + floor(200, 326, 274)
    )
    return svg(360, 500, body, "Inside cover: one person alone, crossed out; two people together, ticked")


def main() -> None:
    MANUAL.mkdir(parents=True, exist_ok=True)
    drawings = {
        MANUAL / "figure-wave.svg": figure_wave(),
        MANUAL / "figure-read.svg": figure_read(),
        MANUAL / "figure-think.svg": figure_think(),
        MANUAL / "figure-phone.svg": figure_phone(),
        MANUAL / "two-people.svg": two_people(),
        MANUAL / "parts.svg": parts(),
        MANUAL / "check.svg": check(),
        MANUAL / "cross.svg": cross(),
        ART / "manual-cover.svg": cover(),
        ART / "manual-endpaper.svg": endpaper(),
    }
    for path, content in drawings.items():
        path.write_text(content, encoding="utf-8", newline="\n")
    print(f"wrote {len(drawings)} drawings to {MANUAL.relative_to(ROOT)} and {ART.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
