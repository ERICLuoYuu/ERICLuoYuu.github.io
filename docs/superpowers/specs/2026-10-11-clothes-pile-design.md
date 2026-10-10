# Clothes pile, new photo, desiccant and IKEA-style booklet — design

Date: 2026-10-11 · Status: approved in chat, awaiting spec review

## Goal

When the visitor looks down into the open parcel they find, instead of a photo
and a book lying side by side:

- the owner's photo (the "vacuum-packed" collage, `F:\CXY.png`) as a glossy
  print on the **left of the box floor**;
- a **desiccant packet** in one corner (redrawn, brand-free);
- a loose **pile of clothes** over the rest of the floor, which the visitor can
  **grab and drag anywhere** — the cloth bends, folds and drapes while held,
  then falls, settles and stays where it was dropped;
- the **introduction booklet underneath the pile**, restyled as a black-and-white
  **IKEA-style instruction manual**. It can only be opened once uncovered.

## Decisions taken with the owner

| Topic | Decision |
|-------|----------|
| Photo | `F:\CXY.png`, flat on the floor, left side (keeps today's spot) |
| Desiccant | Redraw Image #4's look (white embossed packet, "SILICA GEL / DO NOT EAT / THROW AWAY / DESICCANT") without DDC's logo or URL |
| Drag range | Anywhere — inside the box, over the rim onto the flaps, or out onto the table |
| Clothes tech | Approach A: WebGL2 layer + XPBD cloth simulation, no new libraries |
| Book text | Owner sends it later; build the manual with clearly marked slots |
| Brands | Clothes are Zara/H&M/Mango-*inspired* only: no logos or labels. The manual has no IKEA name, logo or fonts |

Nothing biographical is invented. The photo's alt text is a factual description
of what is visible, flagged in `site.js` for the owner to personalise.

## Layout on the floor (420 × 300 parcel units)

```
 back wall
┌───────────────────────────────────────────────┐
│ ┌──────────┐    ░░░░ pile of clothes ░░░░░░    │
│ │  photo   │  ░░░░░░┌──────────────┐░░░░░░░    │
│ │  print   │  ░░░░░░│   booklet    │░░░░░░     │
│ │ (≈2 : 3) │  ░░░░░░│ (under pile) │░░░░░░     │
│ └──────────┘    ░░░░└──────────────┘░░░░  [d]  │
└───────────────────────────────────────────────┘
 front wall                        [d] desiccant
```

- Photo print ≈ 152 × 230 at (22, 34), rotated −6°, white border + washi tape.
  The collage is cropped to the plastic sheet and saved as
  `assets/photo/vacuum-collage.webp` (≈ 900 px tall).
- Booklet 164 × 228 at about (200, 30), thinner than today (≈ 8 units).
- Desiccant ≈ 42 × 60 in the front-right corner, rotated a little. It is static,
  but the clothes collide with it.

## Architecture

New units (pure ones are unit-tested in Node):

| Unit | Responsibility | Pure? |
|------|----------------|-------|
| `js/scene/projection.js` | 4 × 4 matrix that reproduces the CSS camera (stage perspective → pan → zoom → rotateX(tilt) → rotateZ(spin) → parcel offset); inverse for picking rays | yes |
| `js/scene/geometry.js` (extended) | Owns the open-flap angles (CSS reads them as variables) and returns world-space boxes for walls, open flaps, book and desiccant | yes |
| `js/cloth/mesh.js` | Garment coverage grid → particles, UVs, triangles, stretch / shear / bend constraints | yes |
| `js/cloth/hash.js` | Dense spatial hash for particle neighbours (after Müller) | yes |
| `js/cloth/solver.js` | XPBD step: gravity, substeps, distance constraints with compliance, plane / OBB collisions, self- and cross-garment collisions, friction, damping, sleeping | yes |
| `js/cloth/pick.js` | Screen point → ray → nearest garment triangle (alpha-tested) | yes |
| `js/cloth/coverage.js` | How much of the booklet's top is covered; `isBookUncovered()` rule | yes |
| `js/cloth/render.js` | WebGL2: shadow map, depth-only box occluders that also receive soft shadows, lit garments | no |
| `js/cloth/layer.js` | Owns canvas, garments, sim loop, render-on-demand, reset | no |
| `js/cloth/interaction.js` | Pointer/touch grab-drag-release, hover cursor, click suppression, keyboard "move aside" | no |
| `tools/generate_clothes.py` | Draws the garment textures (PNG with alpha) and writes `assets/clothes/garments.json` (sizes, coverage grids, materials) | — |
| `tools/build-pile.mjs` | Runs the same solver in Node to drop pre-folded garments into the box; writes `assets/clothes/pile.json` | — |

The XPBD solver, hash and self-collision approach are ported from Matthias
Müller's *Ten Minute Physics* demos 14 and 15 (MIT). The copyright notice is
kept in the ported files and added to the README credits.

### How the two 3D worlds line up

The box stays in CSS 3D. The clothes live in a transparent WebGL2 canvas laid
over the stage (above the scene, below the flyer, reader and controls). Its
camera matrix is computed from the same frame values `camera.js` applies
(tilt, spin, zoom, pan, perspective), so both layers agree pixel for pixel.

The walls, open flaps, floor, table and booklet are drawn into the WebGL depth
buffer only. Garments behind a flap or outside a wall are therefore hidden
correctly, and the same surfaces receive the garments' soft shadows as a dark,
semi-transparent tint. An e2e test projects the DOM probe points through the
matrix and checks they land within 1 px of the probes.

The interior light is matched: garments are darkened by
`1 − (1 − light) × 0.95`, the same as `.inside::after`. The layer is hidden in
the dark state ("dark except for a question mark") and fades in with the
light during the reveal.

### Cloth model

- Each garment is a single cloth sheet (a flat-lay front). Particles are about
  every 10 units, roughly 300–600 per garment, about 3–4k for eight garments.
- XPBD distance constraints handle stretch (stiff), shear and bending (soft).
  Each garment can have its own bending compliance, so silk folds more
  easily than cotton.
- Collisions:
  - the floor and table plane (z ≥ thickness);
  - wall and open-flap slabs, as oriented boxes;
  - the booklet and the desiccant, as boxes;
  - other particles, via the hash. This covers both self-collision (folding
    over itself) and garment-on-garment contact.
- Friction on contact, mild damping.
- **Sleeping:** a garment whose particles barely move for about 0.5 s goes to
  sleep and costs nothing. Grabbing a garment wakes it. A moving garment that
  disturbs a sleeping one wakes that one too.
- Substeps adapt if a frame runs long. The simulation pauses when the tab is
  hidden.

### Grab, drag, release

- **Hover** (fine pointer): an open-hand cursor over a garment. **Dragging**:
  a closed hand. Both are new cursor drawings in the same hand-drawn style
  as the knife.
- **Pointer down on a garment** pins a small cluster of particles around the
  hit point to a target. The target follows the pointer along a horizontal
  plane about 45 units above the hit point (at least 60), so the garment
  lifts, hangs from the grip, trails, bends and folds.
- **Release** unpins the particles: the garment falls, settles and sleeps
  where it lands. Positions last for the visit. Restart or a reload brings
  back the packed pile.
- Anywhere means anywhere:
  - over the rim, garments drape on the walls and open flaps;
  - beyond the flaps, they fall onto the table (mostly off screen);
  - a soft outer bound keeps them from being flung into the void.
- Pointer events cover mouse and touch alike. The stage already has
  `touch-action: none`.
- The pointer-down that starts a drag is captured. The click it would cause is
  suppressed, so dragging a garment off the booklet never opens it by
  accident.

### Booklet under the pile

- `coverage.js` samples a grid over the booklet's top and counts the points
  that have cloth above them.
- **Owner contribution:** `isBookUncovered(coverage, wasUncovered)` decides when
  the booklet becomes reachable: a threshold and a little hysteresis, so it
  doesn't flicker as a sleeve slides over a corner.
- **While covered:**
  - the booklet ignores clicks, has no hover lift and is not in the tab order;
  - the hint reads *"Move the clothes aside to find what's underneath."*
- **Once uncovered:**
  - hover lift, hand cursor and tab stop come back;
  - the screen reader hears *"The little book is uncovered."*
- Dropping clothes back on the booklet locks it again.

### Keyboard and screen readers

- After the reveal, each garment has a focusable control: *"Move the qipao
  aside"*.
- On focus, a ring is drawn around the garment's on-screen outline.
- Enter or Space plays a scripted drag through the same grab API: lift, carry
  towards the nearest free edge or flap, release.
- Tab order is the clothes from the top of the pile down, then the booklet
  once it is uncovered.
- The reveal announcement becomes: *"Looking down into the box: a photo, a
  pile of clothes, and something underneath."*

### Reduced motion and fallbacks

- **Reduced motion:** direct dragging still works (the visitor drives it).
  Keyboard moves jump to the result: a short settle with no carrying arc.
- **No WebGL2, or the clothes data fails to load:** the clothes are skipped
  with a console warning, the booklet is reachable at once, and every other
  stage works as today.
- **Cost:** drawing happens on demand only, when the simulation is awake, the
  camera moves, the window is resized or the state changes. The pixel ratio is
  capped at 2.

## Garments (drawn by `tools/generate_clothes.py`)

| id | Garment | Look | Material |
|----|---------|------|----------|
| qipao | Qipao | deep red silk, gold peony/cloud brocade, cream piping, mandarin collar, pankou frog buttons on a curved placket, side slits | silk: low bending stiffness, strong sheen |
| blouse | Mandarin-collar blouse | ivory silk, diagonal pankou placket, cuffed sleeves | silk |
| mamianqun | Horse-face skirt | ink blue, pressed side pleats, gold embroidered hem band | brocade: stiffer |
| tee-white | Crew-neck tee | white cotton jersey, rib collar, hem stitching | cotton |
| tee-breton | Breton tee | navy/cream stripes, boat neck | cotton |
| slip-skirt | Slip midi skirt | champagne satin, bias drape | satin: soft, sheen |
| ruched-top | Ruched top | red jersey, sweetheart neckline, cap sleeves (echoes the photo) | jersey: soft |
| floral-skirt | Floral midi skirt | blue with ditsy pink/red flowers, lettuce hem (echoes the photo) | chiffon: very soft |

Sizes are a little smaller than real life, against the 164 × 228 booklet, so the
pile reads as clothes in a parcel. A garment's art can be replaced: keep the PNG
and run `npm run clothes` to rebuild the coverage grids and the pile.

## IKEA-style booklet

- **Cover** (`assets/art/manual-cover.svg`, 360 × 500):
  - white paper with a bold black sans-serif title from `text.bookTitle`;
  - a line-drawn figure (generic manual-style person) with a parcel;
  - a small "1 person" pictogram and a document code line.
- **Inside cover** (`assets/art/manual-endpaper.svg`): the ex-libris becomes
  a parts-inventory panel with `ownerLine` and `ownerName`.
- **Pages:**
  - Plain white paper, black ink, Noto Sans 400/700 (OFL, vendored woff2).
    CJK text falls back to system fonts (PingFang SC, Microsoft YaHei).
  - `#` gives a bold title.
  - `##` gives a numbered step, with a large bold numeral. The numbering is
    automatic in `markdown.js` (`block.number`), so pagination never breaks
    it.
  - `>` gives a "!" note in a thin-ruled box.
  - Lists get square bullets, or a quantity badge when an item starts with
    `2×`.
  - Images sit in thin-ruled panels.
- **Line drawings** (`assets/manual/*.svg`):
  - the figure waving, reading, thinking, on the phone (the "need help?"
    page), and two figures together;
  - ✓ and ✗ panels, an arrow and a magnifier.
- **`content/book.md`** becomes a manual outline: a parts page, numbered steps
  and a help/contact page. Every place for the owner's words is marked
  `[Placeholder — …]`, so `hasPlaceholders()` still reports it.
- **The booklet in the box:** a thin white booklet with paper-white page edges.
  The flyer's lift and cover-opening animation is unchanged apart from colours
  and typeface.

## Flow and state changes

- **State machine:** no new states. The clothes live inside `overhead`.
- **`reveal()`:**
  - shows the clothes layer, fading it in with the light;
  - new announcement and hint;
  - keyboard focus goes to the first garment control.
- **`openBook()`:** refused while the booklet is covered.
- **`restart()`:** restores `pile.json` and locks the booklet.
- **`?jump=`:**
  - `overhead` keeps the pile;
  - a new `clear` gives overhead with the clothes already moved aside;
  - `book` clears the clothes, then opens the booklet.
- **`window.__parcel`** gains `clothes()`, which reports garment positions and
  sleep state, plus whether the booklet is covered (for e2e tests).

## Testing

**Unit tests (node --test):**
- projection, against hand-computed CSS cases;
- mesh building;
- each constraint type, conserving rest length;
- plane and OBB collisions;
- hash queries;
- sleep detection;
- picking, including alpha-tested misses;
- coverage;
- step numbering in `markdown.js`;
- `garments.json` and `pile.json` agree with each other;
- the box-art test keeps passing.

**e2e tests (desktop and Pixel 7):**
- the WebGL camera matches the DOM probes;
- a mouse drag moves a garment, which then stays put after settling;
- touch drag;
- the booklet is locked until uncovered, then opens;
- the keyboard path (garment controls, then the booklet);
- reduced motion;
- the no-WebGL fallback (WebGL2 disabled through an init script);
- the existing journey, cutting, access and asset tests are updated to clear
  the clothes first.

**Coverage:** 80 %+ on the pure modules.

**Visual checks:** screenshots of the overhead pile, mid-drag, cloth over the
rim, and the booklet pages, at desktop and phone sizes.

## Build order

1. Photo print and desiccant, plus the new floor layout.
2. IKEA-style booklet: fonts, cover and inside cover, page styles, step
   numbering, line drawings, `book.md` outline.
3. Clothes:
   - garment art and `garments.json`;
   - the pure cloth modules, test-first;
   - `pile.json`;
   - the WebGL layer;
   - interaction and keyboard;
   - the booklet lock;
   - e2e tests and visual tuning.
4. README ("Make it yours": photo, clothes, booklet), `docs/design.md`, deploy,
   `npm run test:live`.

## Risks

- **Phone performance with 3–4k particles.** Mitigated by sleeping, adaptive
  substeps and the 2× pixel-ratio cap. If it is still slow, use a coarser
  particle spacing on small screens.
- **WebGL in headless Chrome (SwiftShader) is slow.** The e2e tests wait for
  sleep states rather than fixed timeouts.
- **Procedural garment art may look too synthetic.** Tune it from screenshots.
  The fold shading comes from the simulation, not the texture.

## Out of scope

- Saving garment positions across reloads.
- Dragging the photo, the desiccant or the booklet.
- Garments interacting with the tape or flaps before the reveal.
