# Figurine, loose food and solid books — design

Date: 2026-10-21 · Status: approved and implemented (plan docs/superpowers/plans/2026-10-22-figurine-food-books.md)

Builds on `2026-10-11-pack-and-garments-design.md`. The clothes pile, the
booklet beneath it and the booklet lock stay as specified there; this document
replaces only the vacuum pack and changes the books and the overhead camera.

## Goal

1. **The person on the left becomes a solid figurine in soft plastic.** A
   collectible-style figure of the owner, with volume and shading, lying in a
   thin, clear, crinkled bag like option A of `F:\parcel-art\option-a.png`
   (a loose pillow bag, crimped seals at both ends, folds and glossy
   highlights). Dragged, figure and bag move as one rigid object: the figure
   never bends, stretches or ripples; the bag's wrinkles are surface texture.
2. **The food leaves the bag.** Sushi, fries, strawberries, the fruit bowl and
   the dumplings each become their own unwrapped rigid object. Each can be
   dragged by mouse or touch anywhere on screen — out of its section, onto the
   clothes, over the walls, onto the flaps or the table — without moving
   anything else, and keeps its shape while it moves.
3. **Clear sections at the start.** Figurine left, food column in the middle,
   clothes upper right (unchanged, with the booklet under them), books lower
   right.
4. **Books read as physical objects.** Thickness, spines and page edges, with
   shading and contact shadows, visible in the default view without
   interaction.

## Decisions taken with the owner

| Topic | Decision |
|-------|----------|
| Source art | The owner's own files in `F:\parcel-art\` (outside the repo): `figure.jpg`, five food photos, `option-a.png` as the wrap reference |
| Figurine picture | Generated from `figure.jpg` with an image model through OpenRouter (the owner's key in `F:\parcel-art\.env`); styled to look as little AI-made as possible; the owner picks one of several candidates |
| Pose | The owner's pose from the photo (leaning back on the hands, legs out, head turned) |
| Brands | Plain packaging: no "M" on the fries packet, no Waitrose label on the strawberries |
| Dropped food | Rests on whatever lies under it, level; pulled out from under, it settles straight down onto the next surface; it never tips or slides |
| Layout | Food column between the figurine and the clothes/books |
| Objects | Movable rigid solids drawn in the WebGL layer (approach 1) |
| Books | A slight overhead tilt plus shading and shadows (see the revision below) |
| Everything else | The designer's recommendations, as written here |

### Revision to the books decision (measured, 2026-10-21)

The owner chose "tilt the overhead camera about 10°". Measured with
`projection.js` on the desktop frame (1280 × 800), a 10° tilt shows a book's
front page edge only 0.7–1.5 px tall, and 18° still only 2.5–6.5 px; at 0° the
perspective shows the back edges by about as much. A slight tilt alone cannot
make thin books read as thick. The design therefore keeps a slight tilt
(**14°**: it also lets the figurine and food show their sides) and gets the
books' depth mainly from what scales with their thickness: a cast shadow from
the scene's light (`LIGHT_DIR`, upper left: the shadow falls down-right by
0.57 × the book's height — about 27 px for the dictionary and 8 px for
Siddhartha on desktop), a tight contact shadow, edge shading, and the two thick
books at their real proportions.

## 1. Art pipeline

### Figurine (a one-off manual step, outside the repo)

- Run the image tool (`~/.claude/skills/generate-image`, default model
  `google/gemini-3.1-flash-image-preview`, FLUX.2 Pro as the alternative) from
  `F:\parcel-art`, so it finds `.env` there, editing `figure.jpg`.
- Prompt intent: *a studio product photograph of a real, hand-painted resin
  collectible figure of this person* — same face, glasses, hair, red top, blue
  floral skirt, white sandals and pose — lying on its back, shot from straight
  above on plain light grey, one soft light from the upper left. Matte paint
  with slightly uneven edges, faint mould seams, no skin retouching, no
  shallow depth of field, no perfect symmetry, no text.
- About six candidates go to `F:\parcel-art\candidates\`; the owner picks one.
  `figure.jpg`, the candidates and `.env` never enter the repo. The README
  records the prompt and the steps, never the key.

### `tools/prepare_figurine.py` (new)

`python tools/prepare_figurine.py <chosen.png> assets/figurine` writes:

- `figurine.webp` — the figure cut from its plain background (colour key with
  a soft matte; `u2netp` from `F:\portrait-collage\models` as a fallback when
  the background is not plain enough), colour-matched to the box's light,
  with the scene's fine grain added and no sharpening;
- `figurine-relief.webp` — height: the silhouette inflated into a soft dome
  (distance transform) plus fine detail from the picture's luminance;
- `wrap.webp` + `wrap-relief.webp` — the bag, drawn procedurally: a loose
  pillow outline around the figure, crimped seals top and bottom, mostly clear
  film that is denser where it bunches, crinkle lines and creases that live
  only in its relief.

### `tools/prepare_food.py` (new)

`python tools/prepare_food.py F:/parcel-art assets/food`, for each of the five
photos:

- cut out from its plain background (black, white or grey key; `u2netp` for
  the sushi tray, whose dark edges sit on black);
- de-brand: the fries' "M" painted over in the packet's own red; the
  strawberry label made blank paper (regions given as masks in the tool,
  checked by a test);
- write `assets/food/<id>.webp`, `<id>-relief.webp` (a gentle dome of its
  shape) and `assets/food/food.json` (id, label, size in units, peak height).

Food ids and sizes (units; the collage's proportions, fitting the 60-wide
column): `sushi` 52 × 68, `fries` 32 × 40, `strawberries` 44 × 44, `bowl`
42 × 42, `dumplings` 40 × 40.

### Budget

All textures together stay inside the site's texture budget; the 3 MB file
budget in `tests/unit/clothes-data.test.js` grows only by what the new assets
need and is stated in the test.

## 2. Rigid objects

### Data

- `js/rigid/` holds rigid bodies: `{ id, label, footprint: [w, d], height,
  start: [x, y], rotate }` plus a live position `[x, y, z]`. Bodies are
  immutable records; each move makes a new one.
- The starting layout lives in `js/scene/geometry.js` beside `BOOKS`:
  `FIGURINE` (the bag, about 125 × 290, x 6–131, full depth) and `FOOD`
  (centred on x ≈ 170, y from about 45 to 255, in the order sushi, fries,
  strawberries, bowl, dumplings). At the start no two items overlap, no food
  overlaps the clothes or the books, and the figurine overlaps nothing.
- `content/site.js`: the `photo` entry becomes `figurine` (picture, wrap,
  reliefs, alt text) and `food` (per item: picture, relief, alt text). Alt
  texts are drafts marked "[Draft — check this]" for the owner to reword.
- Retired: the pack's cloth body (`tools/pack_body.py`, the `film` record in
  `assets/clothes/garments.json`, `tools/prepare_pack.py` and its assets).
  `assets/clothes/pile.json` is rebuilt without the pack (same seed; the pile
  acceptance — booklet ≥ 0.88 covered, ≥ 6 signatures visible — still holds).

### Holding (`js/cloth/hand.js` gains a rigid hold)

- Picking chooses the nearest hit along the pointer's line of sight among cloth
  and rigid bodies; a body is hit only on its picture's opaque pixels (clear
  bag counts as the figurine).
- A held body only translates. It rides `LIFT` (12) above the highest support
  under its whole footprint and rises over anything taller.
- The figurine stays inside the walls (the pack's `keepIn` rule).
- Food may go anywhere: over a wall it rises over the rim; outside the box it
  lands where released, on the flap or the table; it is kept inside the
  visible area so it cannot be lost off-screen.

### Resting

- A body that is not held never changes x or y.
- Each frame its z follows the support under its footprint (floor, flaps,
  table, books, other bodies, cloth). When the support drops away it falls
  with the clothes' gravity (−2400) to the next surface and stays level.

### The clothes

- Each body is an oriented-box collider like the books, rebuilt whenever the
  body moves; round items use a slightly inset box.
- Cloth resting on a body that moves away is woken and falls. Cloth never
  pushes a body.

### The booklet and the keyboard

- `bookCoverage` also counts rigid bodies over the cover, so food dropped on
  the booklet keeps it closed. The owner's `isBookUncovered` rule is unchanged.
- A body lying over the booklet gets a keyboard button ("Move the bowl aside")
  that returns it to its starting place. This also covers the deferred minor
  "a pack laid over the booklet cannot be moved with the keyboard".

## 3. Drawing (`js/rigid/render.js`)

- Each body is a heightfield mesh: a grid over its footprint (about 2 units
  apart), raised by its relief × its height, built once in body space and
  moved by one matrix per frame.
- The same light as the garments, with gloss: moderate for the figurine's
  painted resin, faint for food. Bodies cast into and receive the shadow map.
  A soft contact shadow lies under each body: tight and dark at rest, wider and
  fainter as it is lifted.
- The wrap is its own heightfield just above the figurine, drawn in the film
  pass (blended last, no depth writes): the figure shows through it, a
  garment on top hides it, and its crinkles catch the light with the film's
  gloss. It shares the figurine's matrix.
- Shared GLSL (lighting, shadow sampling) moves to a module both renderers
  import; no file passes 800 lines.
- Without WebGL, the figurine and food show as still CSS images at their
  starting places; the CSS versions return if the context is lost.

## 4. Camera and books

- `VIEWS.overhead.tilt` becomes 14° (tuned between 12° and 16° on
  screenshots); `frameFor` keeps the box fitted on desktop and phone.
- Real proportions: the dictionary 28 thick (was 20), *One Hundred Years of
  Solitude* 13 (was 10); *Hunter × Hunter* and *Siddhartha* stay 7 and 8.
- Each book gets a cast shadow offset along the scene's light by its height,
  softened with distance, and a tight contact shadow at its base; page-edge
  faces get paper lines and darken away from the light; spines get the board
  colour with a rounded highlight; the cover's edges catch the light on the
  upper-left and darken on the lower-right.
- Measured acceptance (unit test from `projection.js` and `LIGHT_DIR`): on the
  desktop overhead frame every book's cast shadow shows at least 6 px beyond
  its edge and its front page edge at least 1.5 px (the dictionary at least
  4 px); on the phone frame (390 × 844) every cast shadow at least 2.5 px.

## 5. Testing

- **Unit (node --test):**
  - bodies: start layout without overlaps;
  - hold: translation only, figurine kept in, food over the rim and on the
    table, screen clamp;
  - resting: x and y never change, falls to the next surface when a garment
    is pulled away, level;
  - colliders rebuilt on move; cloth over a moved body wakes;
  - coverage counts bodies; keyboard buttons for bodies over the booklet;
  - the book acceptance numbers above.
- **Python (pytest):** cut-outs leave no background colour at the edges; the
  brand regions are plain; reliefs line up with their pictures; sizes match
  `food.json`; the budget holds.
- **E2E (Playwright, desktop and phone):**
  - each food item dragged alone moves only itself (every other body and the
    figurine stay put);
  - food dropped on the clothes rests above them, and dropped outside the box
    lands on the table;
  - the figurine dragged keeps every point of figure and wrap at the same
    offsets (rigid) and stays inside the box;
  - a garment pulled from under food lets it settle in place;
  - no-WebGL fallback shows the still images;
  - the booklet still unlocks; keyboard move-aside works for a body on the
    booklet;
  - screenshots for the owner's review.
- Run Playwright with one worker, one spec file at a time (low memory).

## Global constraints

- No brand names, logos or packaging text on food or garments; book titles as
  the owner wrote them, no publisher art.
- Never invent the owner's biography; alt texts are drafts for the owner.
- The owner's photo, candidates and API key stay outside the repo; no secret
  in code, docs or logs.
- Immutability; files under 800 lines; TDD; `/verify` before code commits.
- Don't restart the owner's preview server (127.0.0.1:4173).
- Publishing (push to `main`) only with the owner's explicit yes.

## Out of scope

- True 3D models of the figure or food; bodies that turn or tip; physics
  between rigid bodies beyond resting on one another.
