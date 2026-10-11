# Vacuum pack and detailed garments — design

Date: 2026-10-11 · Status: approved in chat, awaiting spec review

Builds on `2026-10-11-clothes-pile-design.md` (the cloth layer, the pile and
the booklet lock stay as specified there unless this document says otherwise).

## Goal

Two refinements of the overhead view:

1. **The owner's artwork becomes a physical object.** `F:\CXY.png` (the owner,
   the things they like and the transparent plastic wrapper around them) lies in
   the box as a small vacuum-sealed pack — no photo card, no tape, no white
   border. The plastic stays translucent: cardboard shows through the clear
   film, while its wrinkles, pale highlights and seal edge stay as drawn.
2. **The clothes become detailed, recognizable garments.** Clear silhouettes,
   believable proportions and construction details (necklines, collars,
   sleeves, seams, hems, fastenings), sharp artwork and fabric texture, folds
   and shadows lit by one consistent light. Held garments keep their outline
   while they bend and fold; released, they drop with weight, settle and stay.

## Decisions taken with the owner

| Topic | Decision |
|-------|----------|
| Separation | From the flat PNG (no layered file needed): the probe reproduced the original exactly over white and looked right over cardboard |
| Pack spot | On the floor, left, its long edge against the left wall; the seal border curls up the wall a little |
| Garment art | Drawn in code (`tools/generate_clothes.py`), no brands, no text |
| Lineup | The same eight garments, redrawn with distinct cuts |
| Holding | Slid low with its shape intact: a palm-sized hold just clear of the pile |
| Approach | A — keep today's simulation density; make outlines, folds, art and lighting finer |

Nothing about the owner is invented; the artwork's content is not altered.

## 1. The vacuum pack

### Separating it from the canvas — `tools/prepare_pack.py`

Replaces `tools/prepare_photo.py`.

```
python tools/prepare_pack.py F:/CXY.png assets/photo/ [--film 0.45] [--solid x,y,rx,ry ...]
```

- **Canvas.** Pixels that are pure white (all channels ≥ 254) *and* connected
  to the image border. Holes inside the pack are never canvas. If no such
  border region exists, the tool stops with a clear message (the input is not
  "artwork on a white canvas").
- **Solids** — the owner, food, containers. A pixel is solid when it is
  coloured (max − min channel > 10) or dark (min channel < 170); the mask is
  cleaned (opening, closing, hole filling, specks under 1500 px dropped) and
  extended by `--solid x,y,rx,ry` ellipses (source pixels) for neutral-coloured
  solids such as the white sandal.
- **Alpha.** Solids are opaque. Film is see-through: alpha = `FILM` (0.45,
  `--film`) blended to 1 over a 1.2 px soft edge into solids, never below the
  minimum the pixel needs (`(255 − min channel) / 255`). The edge to the canvas
  is feathered by one pixel.
- **Colour.** Un-premultiplied against white: `F = (C − (1 − α)·255) / α`.
  Composited back over white, the result equals the original. The tool checks
  this (max error ≤ 1 level inside the pack) and refuses to write on failure.
- **Outputs** (cropped to the pack plus 4 px):
  - `assets/photo/vacuum-pack.webp` — RGBA, about 1200 px tall (lossless alpha,
    quality ≥ 88 colour);
  - `assets/photo/vacuum-pack-shade.webp` — the relief overlay (below);
  - the pack's aspect ratio, printed for `geometry.js`.
- **Relief overlay.** A height field — the solid mask blurred (σ ≈ 1.5 % of the
  pack's height) plus a very low dome from the distance to the seal edge — lit
  by the cloth layer's `LIGHT_DIR` (`js/cloth/shading.js`). Slopes facing away
  from the light become black at low alpha, slopes facing it white at low
  alpha (both ≤ 0.18). It is a separate image laid over the pack; the
  artwork's pixels are never repainted.

The exact command used (with its `--solid` hints) is recorded in the README.
`vacuum-collage.webp` and `prepare_photo.py` are removed.

### In the scene

```
 back wall
┌───────────────────────────────────────────────┐
│▐┌─────────┐      ░░░░ pile of clothes ░░░░░    │
│▐│ vacuum  │    ░░░░░┌──────────────┐░░░░░░    │
│▐│  pack   │    ░░░░░│   booklet    │░░░░░     │
│▐│ (0.62:1)│    ░░░░░│ (under pile) │░░░░░     │
│▐└─────────┘      ░░░└──────────────┘░░░  [d]  │
└───────────────────────────────────────────────┘
 ▐ seal border curling up the left wall
```

- `CONTENTS.pack` replaces `CONTENTS.photo`: about 142 × 230 (the printed
  aspect), its left edge at the wall, y ≈ 35, turned ≤ 1.5°, `thickness` 4.
- Built in `parcel.js` as `.pack` (replacing `.photo-card`):
  - `.pack-body` — the flat part, `translateZ(thickness)`, showing the pack
    image with the relief overlay above it;
  - `.pack-edge` — the leftmost ≈ 8 units of the same image (the seal border
    only — no contents), hinged at its right edge and tilted ≈ 60° up so its
    outer edge rests on the wall's inner face;
  - contact shadows: `filter: drop-shadow(…)` on the pack image, so the clear
    film casts a faint shadow and the contents a firmer one, falling away from
    the light (+x, +y) like the cloth's; a soft dark band along the floor/wall
    joint under the curled edge.
- Darkens with the interior until the light comes on (same `--light`
  brightness filter as the desiccant).
- `content/site.js`: `photo.src` points at the pack, `photo.shade` at its
  overlay, `photo.alt` keeps the owner's draft description. The unused
  handwritten `photoCaption` is removed.
- Cloth: `boxColliders()` gains a `pack` floor collider (thickness 4), so
  garments can rest on it; its faces join the depth-only occluders, so cloth
  shadows fall on it.

## 2. Garment artwork — `tools/generate_clothes.py`

Each garment is drawn flat (front view, laid on a table) into two aligned
images:

- `assets/clothes/<id>.webp` — **colour** (RGBA): fabric colour, weave or print,
  trims, buttons and closures; transparent around the garment. **No painted
  light or shade** — no vignettes, no fold shading.
- `assets/clothes/<id>-relief.webp` — **relief** (greyscale): height of the
  surface detail — seams and topstitching, hems, ribbing, pleat edges, piping,
  closures, lace, and a fine weave/knit grain. Lit at run time (section 3).

Resolution 4 texture pixels per parcel unit (2.4 today), drawn 3× supersampled.
The generator is split into small modules under `tools/clothes/` (canvas and
relief layer, fabrics, construction details, one module per garment group); the
entry point stays `tools/generate_clothes.py` / `npm run clothes`.

| Garment | Silhouette and construction |
|---------|-----------------------------|
| **Qipao** | Fitted sheath to mid-calf with a defined waist; rounded mandarin collar; curved *dajin* opening from the collar across the right chest to the underarm, then down the right side seam; 4–5 frog closures (*pankou*) along it and at the collar; contrast piping on the collar, opening, cap sleeves, hem and side slits; side slits from the knee; deep red tone-on-tone brocade with a woven floral/cloud motif |
| **Mandarin-collar blouse** | Straight body, stand collar; centre placket with knotted cloth buttons; long set-in sleeves with cuffs; cream linen weave, topstitched hems |
| **Horse-face skirt** (*mamianqun*) | Wide wrap skirt: flat front panels (the "horse face") framed by knife-pleated sides; waistband with ties; woven border band at the hem; navy with a gold motif |
| **Ruched top** | Sweetheart neckline with picot trim; centre-front ruching gathered on a tie; short puff sleeves; red rib knit |
| **White tee** | Boxy, crew neck with a rib band; short set-in sleeves; shoulder seams; twin-needle hems; cotton jersey |
| **Breton top** | Boat neck; ¾ sleeves; navy stripes on ecru that line up across the side seams; straight hem |
| **Floral skirt** | A-line midi; waistband with a side zip and hook; lettuce-edge hem; ditsy floral print on blue |
| **Slip skirt** | Bias-cut satin midi; elastic waistband; scalloped lace hem; champagne |

`garments.json` per garment gains `relief`, `signature` (the `[u, v]` of its
most recognizable feature — the qipao's collar, the Breton neckline …) and
`material.bump` (relief strength). `pxPerUnit` becomes 4. The coverage grid
(section 3) is derived from the colour image's alpha.

**Checkpoint:** the qipao is drawn first, end to end, and shown to the owner in
the box before the other seven are drawn.

## 3. Shapes, folds and light

- **Exact outlines.** A grid cell becomes cloth when *any* of it is opaque
  (> 2 %), instead of ≥ 30 %. The visible outline comes from the colour image's
  alpha (the existing alpha-to-coverage edge), so sleeves, collars and hems keep
  their drawn shape. Picking already ignores transparent texture. The grid
  also keeps today's ≥ 30 % cells as `core`; booklet coverage (and the pile
  builder, which runs in Node without image decoding) counts only particles
  that touch a core cell, so a transparent margin never "covers" the booklet.
- **Smooth folds.** Each simulated cell is drawn as 2 × 2 quads (3 × 3 points):
  edge midpoints and centres come from the four-point interpolating scheme
  (`(−p₀ + 9p₁ + 9p₂ − p₃) / 16`, applied along rows, then columns), with
  linear extrapolation where a neighbour is missing at an edge. The surface
  passes through every particle, so contacts and picking still match. Normals
  and the crease term (`cavity`) are computed on the smooth mesh. Sleeping
  garments keep their last smooth mesh; only moving ones are recomputed.
  New pure unit: `js/cloth/smooth.js`.
- **Relief lighting.** The cloth shader samples the relief map at four
  neighbouring texels, builds a bump normal in a tangent frame derived from
  screen-space derivatives of position and UV (no extra vertex data), and
  lights it with the same `LIGHT_DIR`, wrap and shadow map as before. Seams,
  ribs and pleats therefore catch light and shadow consistently however the
  garment lies. The relief texture is uploaded single-channel (`R8`).
- **Texture budget.** Garment assets ≤ 3 MB to download in total. Textures are
  uploaded at the resolution the screen needs (device pixels per unit at the
  overhead view × 1.25, capped at the file's), so phones hold far less than
  desktops.

## 4. Holding and settling

- **The hold.** The hand holds the particles within 13 units of the grab point
  (`GRIP_RADIUS`, 11 today) and rides 20 units above whatever lies beneath
  (`LIFT`, 45 today); the 60-unit minimum height goes. Rising over a wall's rim
  and carrying a garment let go beyond the rim out past the flap are unchanged.
- **Shape while held.** The garment keeps its outline: in-plane stretch stays
  rigid (triangulated cells), and bending stiffness is set per fabric
  (brocade and denser weaves fold broadly, satin and jersey drape softer), so
  the trailing part bunches and folds over the pile instead of collapsing into
  a ball.
- **Weight.** Gravity becomes stronger (about 5000 units/s², from 2400) and air
  drag smaller (about 1.2/s, from 2.5), so a released garment falls with weight
  and settles. Targets: dropped from the hold height onto the pile, a garment
  is asleep within 1.5 s; Coulomb friction still grips on a 20° heap and slides
  off a 50° one; `travel` stays the speed limit, so nothing tunnels.

## 5. The pile

`tools/build-pile.mjs` restages the pile for recognizability:

- garments lie loosely, each with at most one soft fold (no sleeves folded
  in), turned so their signature features face up and outward;
- after settling, a garment's `signature` counts as visible when no other
  cloth lies above it within 12 units; a seed is accepted only when at least 6
  of the 8 signatures are visible, the booklet is ≥ 88 % covered and the pack
  ≤ 20 % covered.

## Testing

Unit (`node --test`):
- `smooth.js`: passes exactly through particles; midpoints of a straight and of
  a circular row; missing-neighbour extrapolation; UVs bilinear; output sizes.
- `mesh.js`: cells with a sliver of coverage are meshed.
- `coverage.js`: particles that touch no core cell do not cover the booklet.
- `hand.js` / `grip.js`: hold radius 13, ride height 20 over cloth and over the
  floor, no 60-unit floor.
- `solver.js`: dropped from 20 above a sleeping sheet, a garment sleeps within
  1.5 s at the new gravity; the 20° / 50° heap tests still pass.
- `geometry.js` / `solids.js`: the pack lies inside the box against the left
  wall, clear of the booklet; its collider exists.
- `clothes-data.test.js`: every garment has colour, relief and signature; the
  relief image matches the colour image's size; grids derive from alpha.

Python (`python -m unittest`, no extra test dependencies):
- `prepare_pack.py`: the canvas becomes transparent; solids are opaque; film
  alpha stays in range; recomposited over white it matches the input; a
  borderless input is refused.

End to end (Playwright): existing journeys pass; the pack image and its overlay
load; no photo card remains; hovering a garment's transparent margin shows no
hand cursor.

Visual: screenshots of the overhead view (desktop and Pixel 7) at each
checkpoint, reviewed before moving on.

## Build order

1. The pack tool and the pack in the scene. *Checkpoint A: screenshot to the
   owner.*
2. Engine: exact outlines, smooth folds, relief lighting, texture budget —
   working with today's garments and a flat relief.
3. Generator infrastructure + the qipao. *Checkpoint B: the qipao in the box,
   shown to the owner.*
4. The other seven garments.
5. Holding and weight.
6. The restaged pile.
7. Docs (README, `docs/design.md`), review, live checks, deploy.

## Risks

- **Drawn-in-code art is subjective** → checkpoint B before drawing the rest.
- **Interpolation overshoot** at tight folds could poke through cloth below →
  the render offset (`DROP`) already sits the drawn cloth a little low; the
  four-point scheme overshoots at most ≈ 6 % of a cell.
- **Heavier gravity shifts the friction balance** → the heap and slope tests,
  the settle-time test and the e2e journeys guard it.
- **Phone memory** → textures uploaded at the size the screen needs.
- **Neutral-coloured solids in the pack** (white sandals, clear punnet) → the
  `--solid` hints, and the punnet may stay partly see-through, as it is clear
  plastic too.

## Out of scope

The booklet's text, the box art, new garments, sound, and the
`isBookUncovered` rule (still the owner's to write).
