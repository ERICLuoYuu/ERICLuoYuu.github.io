"""Generate the site's built-in art, placeholders, textures, cursors and sounds.

The cardboard box faces are the site's own box art and go to assets/art/.
The fallback photo and the question mark are stand-ins: they go to
assets/placeholders/ and are stamped "placeholder". (The booklet's drawings
come from tools/generate_manual.py.)
Neutral UI pieces (cursors, textures, sounds) go to assets/ui, assets/textures
and assets/sounds and can be kept or replaced.

Run from the repository root:  python tools/generate_placeholders.py
"""

from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "assets" / "art"
PLACEHOLDERS = ROOT / "assets" / "placeholders"
UI = ROOT / "assets" / "ui"
TEXTURES = ROOT / "assets" / "textures"
SOUNDS = ROOT / "assets" / "sounds"

INK = "#4a3426"
STAMP_RED = "#b9533a"
CARD_OUT = "#c99c67"
CARD_OUT_DARK = "#a97d4d"
CARD_IN = "#d8c29b"
CREAM = "#f5ecd7"

rng = random.Random(7)


def reseed(group: str) -> None:
    """Give each group of artwork its own repeatable random stream,
    so redrawing one group never reshuffles the others."""
    rng.seed(f"parcel:{group}")


# ---------------------------------------------------------------- rough SVG --

def _j(amount: float) -> float:
    return rng.uniform(-amount, amount)


def rough_line(x1, y1, x2, y2, rough=1.0, passes=2) -> str:
    """Two slightly different bowed strokes, like a quick pencil line."""
    length = math.hypot(x2 - x1, y2 - y1) or 1
    off = min(rough * 1.6, length * 0.06)
    nx, ny = -(y2 - y1) / length, (x2 - x1) / length
    parts = []
    for _ in range(passes):
        bow = _j(off * 0.8)
        c1 = (x1 + (x2 - x1) * 0.3 + nx * bow + _j(off), y1 + (y2 - y1) * 0.3 + ny * bow + _j(off))
        c2 = (x1 + (x2 - x1) * 0.7 + nx * bow + _j(off), y1 + (y2 - y1) * 0.7 + ny * bow + _j(off))
        parts.append(
            f"M{x1 + _j(off):.1f},{y1 + _j(off):.1f} C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} "
            f"{x2 + _j(off):.1f},{y2 + _j(off):.1f}"
        )
    return " ".join(parts)


def rough_rect(x, y, w, h, rough=1.0) -> str:
    return " ".join([
        rough_line(x, y, x + w, y, rough), rough_line(x + w, y, x + w, y + h, rough),
        rough_line(x + w, y + h, x, y + h, rough), rough_line(x, y + h, x, y, rough),
    ])


def smooth_closed(points) -> str:
    """Catmull-Rom through points, closed."""
    n = len(points)
    d = f"M{points[0][0]:.1f},{points[0][1]:.1f}"
    for i in range(n):
        p0, p1, p2, p3 = points[i - 1], points[i], points[(i + 1) % n], points[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"
    return d + " Z"


def smooth_open(points) -> str:
    d = f"M{points[0][0]:.1f},{points[0][1]:.1f}"
    for i in range(len(points) - 1):
        p0 = points[max(i - 1, 0)]
        p1, p2 = points[i], points[i + 1]
        p3 = points[min(i + 2, len(points) - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"
    return d


def rough_ellipse(cx, cy, rx, ry, rough=1.0, steps=14) -> str:
    pts = []
    for i in range(steps):
        a = 2 * math.pi * i / steps
        k = 1 + _j(0.04 * rough)
        pts.append((cx + math.cos(a) * rx * k, cy + math.sin(a) * ry * k))
    return smooth_closed(pts)


def wobbly_panel(w, h, inset=0.0, jitter=1.2) -> str:
    """A filled shape with slightly uneven edges (torn-paper feel)."""
    pts = []
    steps = 10
    for side in range(4):
        for i in range(steps):
            t = i / steps
            if side == 0:
                p = (inset + t * (w - 2 * inset), inset)
            elif side == 1:
                p = (w - inset, inset + t * (h - 2 * inset))
            elif side == 2:
                p = (w - inset - t * (w - 2 * inset), h - inset)
            else:
                p = (inset, h - inset - t * (h - 2 * inset))
            pts.append((p[0] + _j(jitter), p[1] + _j(jitter)))
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + " Z"


def scribble_lines(x, y, w, rows, gap=9, rough=0.8) -> str:
    out = []
    for r in range(rows):
        yy = y + r * gap
        ww = w * rng.uniform(0.55, 1.0)
        pts = [(x + i * ww / 8, yy + math.sin(i * 1.7 + r) * 1.6 + _j(0.6)) for i in range(9)]
        out.append(smooth_open(pts))
    return " ".join(out)


def stamp_text(x, y, text="placeholder", size=9, rotate=-4, color=STAMP_RED) -> str:
    return (
        f'<text x="{x}" y="{y}" transform="rotate({rotate} {x} {y})" font-family="Georgia, \'Times New Roman\', serif" '
        f'font-style="italic" font-size="{size}" fill="{color}" opacity=".75" letter-spacing=".5">{text}</text>'
    )


def svg(w, h, body: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
        f'preserveAspectRatio="none">\n{body}\n</svg>\n'
    )


def stroke(d, color=INK, width=1.4, opacity=0.85, extra="") -> str:
    return (
        f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" '
        f'stroke-linejoin="round" opacity="{opacity}" {extra}/>'
    )


# ---------------------------------------------------------- cardboard faces --

def soft_patches(w: float, h: float, n: int, color: str, opacity_range: tuple[float, float], name: str) -> str:
    """A few large patches with feathered edges: the uneven tone of real board, not stains."""
    patches = []
    for _ in range(n):
        cx, cy = rng.uniform(0, w), rng.uniform(0, h)
        rx, ry = rng.uniform(0.2, 0.4) * w, rng.uniform(0.3, 0.55) * h
        patches.append(
            f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" '
            f'transform="rotate({rng.uniform(-20, 20):.1f} {cx:.1f} {cy:.1f})" '
            f'fill="url(#{name})" opacity="{rng.uniform(*opacity_range):.2f}"/>'
        )
    gradient = (
        f'<defs><radialGradient id="{name}"><stop offset="0" stop-color="{color}"/>'
        f'<stop offset="1" stop-color="{color}" stop-opacity="0"/></radialGradient></defs>'
    )
    return gradient + "".join(patches)


def cardboard(w: float, h: float, base: str, edge_dark: str, extra: str = "") -> str:
    """One flat face of the box: board colour, a soft sheen, gentle tonal variation and a pencil edge."""
    body = (
        f'<rect width="{w}" height="{h}" fill="{base}"/>'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="#fff" stop-opacity=".10"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/>'
        f'<stop offset="1" stop-color="#000" stop-opacity=".10"/></linearGradient></defs>'
        f'<rect width="{w}" height="{h}" fill="url(#g)"/>'
        + soft_patches(w, h, 3, "#fff", (0.10, 0.16), "tone-light")
        + soft_patches(w, h, 2, "#5b3a1c", (0.07, 0.11), "tone-dark")
        + stroke(rough_rect(3, 3, w - 6, h - 6, 1.2), edge_dark, 1.6, 0.55)
        + extra
    )
    return svg(w, h, body)


def arrow_up(x, y, s=1.0) -> str:
    return stroke(rough_line(x, y + 26 * s, x, y, 0.6) + " " + rough_line(x - 8 * s, y + 9 * s, x, y, 0.5)
                  + " " + rough_line(x + 8 * s, y + 9 * s, x, y, 0.5), INK, 2.2, 0.8)


def fragile_glass(x, y) -> str:
    cup = smooth_open([(x - 10, y), (x - 9, y + 12), (x, y + 18), (x + 9, y + 12), (x + 10, y)])
    stem = rough_line(x, y + 18, x, y + 30, 0.4) + " " + rough_line(x - 8, y + 31, x + 8, y + 31, 0.4)
    crack = smooth_open([(x - 4, y + 2), (x - 1, y + 6), (x - 4, y + 9), (x, y + 13)])
    return stroke(cup + " " + stem, STAMP_RED, 2, 0.75) + stroke(crack, STAMP_RED, 1.2, 0.75)


def address_label(x, y, w=150, h=78, rot=-3) -> str:
    return (
        f'<g transform="rotate({rot} {x + w / 2} {y + h / 2})">'
        f'<path d="{wobbly_panel(w, h, 0, 1.0)}" transform="translate({x} {y})" fill="{CREAM}"/>'
        + stroke(rough_rect(x + 2, y + 2, w - 4, h - 4, 0.7), INK, 1, 0.35)
        + stroke(scribble_lines(x + 14, y + 22, w - 28, 5, 11), INK, 1.5, 0.7)
        + "</g>"
    )


def make_box_faces():
    reseed("box")
    front_extra = (
        address_label(150, 70, 150, 80)
        + arrow_up(42, 40) + arrow_up(66, 40)
        + fragile_glass(54, 120)
    )
    (ART / "box-front.svg").write_text(cardboard(420, 220, CARD_OUT, CARD_OUT_DARK, front_extra))

    side_extra = (
        stroke(rough_ellipse(80, 95, 34, 34, 1.2), STAMP_RED, 2, 0.6)
        + stroke(rough_ellipse(80, 95, 26, 26, 1.2), STAMP_RED, 1, 0.5)
        + stroke(scribble_lines(160, 70, 110, 4, 12), INK, 1.4, 0.55)
        + "".join(stroke(rough_line(160 + i * 5, 140, 160 + i * 5, 168, 0.2), INK, 1.2 if i % 3 else 2.4, 0.6) for i in range(18))
    )
    (ART / "box-side.svg").write_text(cardboard(300, 220, "#c49763", CARD_OUT_DARK, side_extra))

    flap_scuffs = stroke(smooth_open([(40, 40), (70, 46), (95, 41)]), "#7a5634", 1.2, 0.35)
    (ART / "flap-long.svg").write_text(cardboard(420, 150, "#cda06a", CARD_OUT_DARK, flap_scuffs))
    (ART / "flap-short.svg").write_text(cardboard(300, 150, "#c69a65", CARD_OUT_DARK))

    corrugation = "".join(
        f'<line x1="{x}" y1="0" x2="{x}" y2="220" stroke="#8d6a43" stroke-width="1" opacity=".09"/>' for x in range(4, 420, 7)
    )
    (ART / "box-inside.svg").write_text(cardboard(420, 220, CARD_IN, "#a88b62", corrugation))
    seam = stroke(rough_line(0, 150, 420, 150, 0.8), "#7d6043", 1.4, 0.35)
    (ART / "box-floor.svg").write_text(cardboard(420, 300, "#d4bd95", "#a88b62", seam))


# ------------------------------------------------------------------- photo --

def make_photo_placeholder():
    reseed("photo")
    pw, ph = 400, 500
    hatch = "".join(stroke(rough_line(-40 + i * 16, ph, 120 + i * 16, 0, 0.6), "#7d8fa3", 1, 0.18) for i in range(34))
    person = (
        f'<path d="{rough_ellipse(200, 205, 58, 66, 1)}" fill="#b9c4cf"/>'
        f'<path d="{smooth_closed([(90, 500), (110, 360), (200, 318), (290, 360), (310, 500)])}" fill="#b9c4cf"/>'
        + stroke(rough_ellipse(200, 205, 58, 66, 1), INK, 2.2, 0.55)
        + stroke(smooth_open([(100, 470), (114, 364), (200, 322), (286, 364), (300, 470)]), INK, 2.2, 0.55)
    )
    photo = (
        f'<rect width="{pw}" height="{ph}" fill="#dfe5ea"/>' + hatch + person
        + f'<text x="200" y="110" text-anchor="middle" font-family="Georgia, serif" font-style="italic" '
        f'font-size="30" fill="{INK}" opacity=".7">your photo here</text>'
        + stamp_text(270, 486, "placeholder photo", 14, -3)
    )
    (PLACEHOLDERS / "photo.svg").write_text(svg(pw, ph, photo))


def make_question_mark():
    reseed("question-mark")
    w, h = 200, 280
    hook = [(52, 92), (60, 54), (100, 34), (142, 50), (152, 88), (128, 122), (104, 146), (100, 186)]
    glow = f'<path d="{smooth_open(hook)}" fill="none" stroke="#ffd98a" stroke-width="34" stroke-linecap="round" opacity=".18"/>'
    passes = "".join(
        stroke(smooth_open([(x + _j(2), y + _j(2)) for x, y in hook]), "#f7e1a8", 13 - i * 3, 0.95 - i * 0.2)
        for i in range(3)
    )
    dot = f'<path d="{rough_ellipse(100, 236, 13, 12, 1)}" fill="#f7e1a8"/>'
    body = glow + passes + dot + stamp_text(118, 272, "placeholder", 12, -4, "#f7e1a8")
    (PLACEHOLDERS / "question-mark.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{body}</svg>\n'
    )


# ------------------------------------------------------------------ cursors --

KNIFE_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <!-- blade tip is the hotspot at (3,29) -->
  <path d="M3 29 L12.5 17.5 L16.5 21 Z" fill="#eef1f3" stroke="#3c2f27" stroke-width="1.3" stroke-linejoin="round"/>
  <path d="M5.5 25.5 L13 19" stroke="#9aa3aa" stroke-width=".9" stroke-linecap="round"/>
  <path d="M12.2 17.2 L24.5 5.6 C26.2 4 28.7 6.2 27.2 8 L16.8 21.3 Z" fill="#e2a33b" stroke="#3c2f27" stroke-width="1.3" stroke-linejoin="round"/>
  <path d="M17.5 14.6 L21.6 18.2 M20.4 11.9 L24.2 15.2" stroke="#3c2f27" stroke-width="1" stroke-linecap="round" opacity=".55"/>
</svg>
"""

KNIFE_PRESSED_SVG = KNIFE_SVG.replace("#e2a33b", "#d38d26").replace("#eef1f3", "#ffffff")

HAND_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <!-- fingertip is the hotspot at (11,2) -->
  <path d="M9 3.2 C9 1.4 12.6 1.4 12.6 3.2 L12.6 13 C13 11.6 16.2 11.7 16.3 13.4 C16.8 12 19.9 12.2 20 14.1 C20.6 12.9 23.6 13.2 23.6 15.2 L23.6 21.5 C23.6 26 20.8 29.5 16.4 29.5 L14.6 29.5 C11.8 29.5 10 28 8.4 25.6 L4.6 19.6 C3.6 18 5.8 16.2 7.2 17.6 L9 19.6 Z"
        fill="#fbf3e2" stroke="#3c2f27" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M12.6 13 L12.6 18.4 M16.3 13.4 L16.3 18.4 M20 14.1 L20 18.6" stroke="#3c2f27" stroke-width="1.1" stroke-linecap="round" opacity=".6"/>
</svg>
"""


def raster_cursor(kind: str, path: Path):
    """PNG fallbacks for browsers that do not accept SVG cursors (drawn 4x, then downsampled)."""
    s = 4
    img = Image.new("RGBA", (32 * s, 32 * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ink = (60, 47, 39, 255)
    if kind == "knife":
        d.polygon([(3 * s, 29 * s), (12.5 * s, 17.5 * s), (16.5 * s, 21 * s)], fill=(238, 241, 243, 255), outline=ink, width=5)
        d.polygon([(12.2 * s, 17.2 * s), (24.5 * s, 5.6 * s), (27.5 * s, 7.5 * s), (16.8 * s, 21.3 * s)], fill=(226, 163, 59, 255), outline=ink, width=5)
    else:
        d.rounded_rectangle([9 * s, 1.5 * s, 12.6 * s, 19 * s], radius=7, fill=(251, 243, 226, 255), outline=ink, width=5)
        d.rounded_rectangle([8.5 * s, 12 * s, 23.6 * s, 29.5 * s], radius=22, fill=(251, 243, 226, 255), outline=ink, width=5)
        d.rectangle([9.6 * s, 11 * s, 12 * s, 14 * s], fill=(251, 243, 226, 255))
    img.resize((32, 32), Image.LANCZOS).save(path)


# ----------------------------------------------------------------- textures --

def tileable_noise(size: int, scale: float, seed: int) -> np.ndarray:
    """Periodic smooth noise via FFT low-pass of white noise (tiles seamlessly)."""
    g = np.random.default_rng(seed)
    white = g.standard_normal((size, size))
    fx = np.fft.fftfreq(size)[:, None]
    fy = np.fft.fftfreq(size)[None, :]
    falloff = np.exp(-((fx ** 2 + fy ** 2) * (size / scale) ** 2))
    smooth = np.real(np.fft.ifft2(np.fft.fft2(white) * falloff))
    return (smooth - smooth.mean()) / (smooth.std() + 1e-9)


def make_textures():
    size = 256
    base = np.array([244, 236, 219], dtype=float)
    n = tileable_noise(size, 6, 1) * 4 + tileable_noise(size, 40, 2) * 2.5 + np.random.default_rng(3).standard_normal((size, size)) * 2.2
    paper = np.clip(base[None, None, :] + n[:, :, None], 0, 255).astype(np.uint8)
    img = Image.fromarray(paper, "RGB")
    d = ImageDraw.Draw(img, "RGBA")
    g = random.Random(4)
    for _ in range(70):  # fibres, wrapped so the tile stays seamless
        x, y = g.uniform(0, size), g.uniform(0, size)
        a = g.uniform(0, math.pi)
        length = g.uniform(4, 14)
        colour = (150, 120, 90, g.randint(10, 28))
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                d.line([(x + ox, y + oy), (x + ox + math.cos(a) * length, y + oy + math.sin(a) * length)], fill=colour, width=1)
    img.save(TEXTURES / "paper.png", optimize=True)

    # Fine fibre specks only: anything blob-sized reads as a stain once the
    # camera magnifies the board (the open flaps in the overhead view).
    grain = np.zeros((size, size, 4), dtype=np.uint8)
    speck = np.random.default_rng(5).random((size, size))
    grain[speck > 0.985] = (70, 45, 20, 60)
    grain[speck < 0.012] = (255, 245, 225, 55)
    Image.fromarray(grain, "RGBA").filter(ImageFilter.GaussianBlur(0.35)).save(TEXTURES / "grain.png", optimize=True)


# ------------------------------------------------------------------- sounds --

RATE = 22050


def write_wav(path: Path, samples: np.ndarray):
    data = np.clip(samples, -1, 1)
    pcm = (data * 32767).astype("<i2").tobytes()
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm)


def one_pole_lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    a = math.exp(-2 * math.pi * cutoff / RATE)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def bandpass(x, lo, hi):
    return one_pole_lowpass(x - one_pole_lowpass(x, lo), hi)


def normalize(x, peak):
    return x / (np.max(np.abs(x)) + 1e-9) * peak


def make_sounds():
    g = np.random.default_rng(11)
    t_len = 1.2
    n = int(RATE * t_len)
    noise = g.standard_normal(n)
    hiss = bandpass(noise, 1800, 6500)
    crackle = np.zeros(n)
    for idx in g.integers(0, n, 260):
        crackle[idx:idx + 30] += np.exp(-np.arange(min(30, n - idx)) / 5) * g.uniform(0.3, 1.0) * g.choice([-1, 1])
    crackle = bandpass(crackle, 900, 5000)
    flutter = 0.75 + 0.25 * np.sin(2 * np.pi * 23 * np.arange(n) / RATE)
    loop = normalize(hiss * flutter * 0.6 + crackle * 0.9, 0.42)
    fade = int(RATE * 0.12)  # crossfade the ends so the loop is seamless
    ramp = np.linspace(0, 1, fade)
    looped = loop[:-fade].copy()
    looped[:fade] = loop[:fade] * ramp + loop[-fade:] * (1 - ramp)
    write_wav(SOUNDS / "tape-cut.wav", looped)

    n = int(RATE * 0.7)
    t = np.arange(n) / RATE
    thump = bandpass(g.standard_normal(n), 60, 700) * np.exp(-t * 14)
    creak_f = 180 + 40 * np.sin(2 * np.pi * 3 * t) + g.standard_normal(n).cumsum() * 0.02
    creak = np.sign(np.sin(2 * np.pi * np.cumsum(creak_f) / RATE)) * 0.08 * np.exp(-((t - 0.18) ** 2) / 0.01)
    write_wav(SOUNDS / "flap.wav", normalize(thump + one_pole_lowpass(creak, 1500), 0.5))

    n = int(RATE * 0.55)
    t = np.arange(n) / RATE
    env = np.sin(np.pi * np.clip(t / 0.55, 0, 1)) ** 1.5
    rustle = bandpass(g.standard_normal(n), 900, 7000) * env * (0.7 + 0.3 * np.abs(np.sin(2 * np.pi * 9 * t)))
    write_wav(SOUNDS / "page.wav", normalize(rustle, 0.35))

    n = int(RATE * 0.8)
    t = np.arange(n) / RATE
    white = g.standard_normal(n)
    sweep = np.zeros(n)
    acc = 0.0
    for i in range(n):
        cutoff = 300 + 2600 * math.sin(math.pi * t[i] / 0.8)
        a = math.exp(-2 * math.pi * cutoff / RATE)
        acc = (1 - a) * white[i] + a * acc
        sweep[i] = acc
    write_wav(SOUNDS / "whoosh.wav", normalize(sweep * np.sin(np.pi * t / 0.8), 0.32))

    n = int(RATE * 1.8)
    t = np.arange(n) / RATE
    chime = np.zeros(n)
    for k, f in enumerate([523.25, 659.25, 783.99, 1046.5]):
        start = k * 0.12
        tt = np.clip(t - start, 0, None)
        on = (t >= start).astype(float)
        chime += on * np.sin(2 * np.pi * f * tt) * np.exp(-tt * 2.6) * (0.6 if k < 3 else 0.35)
        chime += on * np.sin(2 * np.pi * f * 2.01 * tt) * np.exp(-tt * 4) * 0.12
    write_wav(SOUNDS / "reveal.wav", normalize(chime, 0.3))

    n = int(RATE * 0.18)
    t = np.arange(n) / RATE
    tap = np.sin(2 * np.pi * 620 * t) * np.exp(-t * 38) + bandpass(g.standard_normal(n), 800, 4000) * np.exp(-t * 90) * 0.4
    write_wav(SOUNDS / "tap.wav", normalize(tap, 0.35))


def main():
    for folder in (ART, PLACEHOLDERS, UI, TEXTURES, SOUNDS):
        folder.mkdir(parents=True, exist_ok=True)
    make_box_faces()
    make_photo_placeholder()
    make_question_mark()
    (UI / "knife.svg").write_text(KNIFE_SVG)
    (UI / "knife-pressed.svg").write_text(KNIFE_PRESSED_SVG)
    (UI / "hand.svg").write_text(HAND_SVG)
    raster_cursor("knife", UI / "knife.png")
    raster_cursor("hand", UI / "hand.png")
    make_textures()
    make_sounds()
    print("box art written to", ART.relative_to(ROOT), "and placeholders to", PLACEHOLDERS.relative_to(ROOT))


if __name__ == "__main__":
    main()
