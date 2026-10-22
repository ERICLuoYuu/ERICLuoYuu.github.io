# Figurine, Loose Food and Solid Books Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vacuum pack with a rigid figurine in a soft clear bag and five loose, freely draggable food items, and make the books read as thick physical objects in the default view, keeping the clothes pile and the booklet as they are.

**Architecture:** The figurine and the food become rigid bodies: immutable records (`js/rigid/body.js`) that only translate, rest level on whatever lies beneath (`rest.js`), and are carried by a translate-only hand (`hold.js`). A controller (`controller.js`) ties them to the cloth world. Each body is an oriented box the cloth collides with, rebuilt whenever the body moves, and the bodies count toward the booklet's coverage. They are drawn in the existing WebGL2 layer as heightfield meshes, one model matrix per body (`heightfield.js`, `render.js`), sharing the cloth's camera, light and shadow map; the bag is a second heightfield in the last, blended pass. The books stay CSS-3D: the overhead camera tilts 14°, the dictionary and *Solitude* get their real thickness, and each book gets a cast shadow along the scene's light plus a contact shadow and edge shading.

**Tech Stack:** Static HTML/CSS/ES modules (no build), WebGL2, `node --test`, Playwright 1.56 (Chrome), Python 3 with NumPy, SciPy, Pillow and onnxruntime (all installed; no OpenCV).

**Spec:** `docs/superpowers/specs/2026-10-21-figurine-food-books-design.md`

## Global Constraints

- No brand names, logos or packaging text on food or garments; book titles as the owner wrote them, no publisher art.
- Never invent the owner's biography; alt texts are drafts for the owner, marked "[Draft — check this]".
- The owner's photo (`F:\parcel-art\figure.jpg`), the candidates and the API key (`F:\parcel-art\.env`) stay outside the repo; no secret in code, docs or logs. Never print the key.
- Immutability for rigid body records (every move makes a new frozen record). The cloth solver's typed-array world stays a deliberately mutable struct, as `js/cloth/solver.js` documents.
- Files under 800 lines; TDD (watch each test fail before writing the code); run `/verify` before every code commit (not for docs- or test-only commits).
- Commits: conventional type (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `git add .omc/`.
- Don't restart the owner's preview server (127.0.0.1:4173); Playwright reuses it.
- Playwright: one spec file at a time, `--workers=1`, in the foreground (the machine is low on memory). Don't relaunch a run that was killed for memory.
- Publishing (push to `main`) only with the owner's explicit yes. Work happens on `feat/figurine-food-books`.

## Review Focus

1. Food let go over an open flap, which slopes: it rests level on the highest point of the flap beneath its footprint, never inside the flap and never hovering above that point. (Task 6)
2. Food stacked on other food, then the lower item dragged away: the upper item drops straight down onto whatever is now beneath it, with x and y unchanged. (Task 6)
3. Restart, either after bodies have moved or in the middle of dragging one: every body is back at its start, resting, and nothing is held. (Tasks 12 and 15)
4. The keyboard "Move the … aside" for a body whose starting place is now taken by another body: it lands level on top of that body, not inside it. (Task 12)
5. Reduced motion: the keyboard move puts the body home at once, with no animation, and its promise still resolves. (Task 12)

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `js/rigid/body.js` | new | Immutable rigid body records; footprints, colliders, overlap |
| `js/rigid/rest.js` | new | Support under a body, falling and landing level, cloth resting on a body |
| `js/rigid/hold.js` | new | The translate-only hand for rigid bodies (pointer and keyboard carries) |
| `js/rigid/heightfield.js` | new | Heightfield mesh, model matrix, ray picking against a body |
| `js/rigid/controller.js` | new | The rigid scene: bodies, hand, resting, colliders on the world, pick, status |
| `js/rigid/load.js` | new | Loads the body pictures and builds alpha/relief samplers (DOM) |
| `js/rigid/render.js` | new | WebGL: bodies (lit, glossy, shadowed), contact shadows, the clear bag |
| `js/gl/common.js` | new | Shared GL helpers and GLSL (shadow sampling, relief normal), moved out of `js/cloth/render.js` |
| `js/scene/shadow.js` | new | Cast-shadow offset along `LIGHT_DIR`, and its hull for the CSS books |
| `js/scene/geometry.js` | modify | Overhead tilt 14° and tilt-aware fit; `FIGURINE`, `FOOD`; book thickness; drop `CONTENTS.pack` |
| `js/scene/parcel.js` | modify | Book shadows; CSS fallback pictures for the figurine and food; drop the pack |
| `js/cloth/layer.js` | modify | Wire the rigid controller into loading, picking, holding, stepping, drawing, coverage and status; drop film support |
| `js/cloth/render.js` | modify | Use `js/gl/common.js`; call the rigid renderer between passes; drop the film pass |
| `js/cloth/hand.js` | modify | Read colliders from the world; drop the pack's wide hold |
| `js/cloth/solver.js` | modify | `setColliders(world, colliders)` |
| `js/cloth/coverage.js` | modify | `coverageOf` and solids that cover the booklet |
| `js/cloth/keyboard.js` | modify | Buttons for bodies lying over the booklet |
| `js/main.js`, `js/flow.js`, `content/site.js`, `css/scene.css` | modify | Config, test hooks, copy, styles |
| `tools/solids/{__init__,cutout,relief,finish,wrap}.py` | new | Cut-out, relief, finishing, procedural bag |
| `tools/prepare_food.py`, `tools/prepare_figurine.py` | new | The two art tools |
| `tools/build-pile.mjs` | modify | Bodies as colliders; acceptance: the bodies stay uncovered |
| `tools/prepare_pack.py`, `tools/pack_body.py` (+ their tests, `assets/photo/vacuum-pack*.webp`) | delete | The pack is retired |

---

### Task 1: Figurine candidates for the owner to choose from

Nothing enters the repo in this task. It needs the owner's key in `F:\parcel-art\.env` (one line, `OPENROUTER_API_KEY=...`).

**Files:** none in the repo. Outputs go to `F:\parcel-art\candidates\`.

**Interfaces:**
- Produces: `F:\parcel-art\candidates\candidate-{1..6}.png` and, once the owner picks one, the path of the chosen file (recorded in the ledger as `Task 1: chosen <path>`). Task 10 consumes it.

- [ ] **Step 1: Check for the key without printing it**

Run: `[ -f /f/parcel-art/.env ] && grep -c '^OPENROUTER_API_KEY=.' /f/parcel-art/.env || echo "no key"`
Expected: `1`. If it prints `no key`, ask the owner to add the file (never in chat). Carry on with Task 2 and come back to this task when they say it is there.

- [ ] **Step 2: Make a smaller copy of the photo for upload**

Run: `cd /f/parcel-art && mkdir -p candidates && python -c "from PIL import Image, ImageOps; im = ImageOps.exif_transpose(Image.open('figure.jpg')); im.thumbnail((1600, 1600)); im.convert('RGB').save('candidates/figure-1600.jpg', quality=92)"`
Expected: `F:\parcel-art\candidates\figure-1600.jpg`, long side 1600 px.

- [ ] **Step 3: Generate six candidates from `F:\parcel-art`, so the tool finds `.env` there**

Use this exact prompt for every call:

```text
A studio product photograph of a real, hand-painted resin collectible figure of the person in this photo: the same face, glasses, hair, red top, blue floral skirt and white sandals, in the same pose (leaning back on the hands, legs stretched out, head turned). The figure lies on its back on a plain light grey surface and is photographed from straight above, the whole figure in frame with space around it. One soft light from the upper left, soft natural shadows. Matte acrylic paint with slightly uneven brush edges, faint mould seams and tiny imperfections; no skin retouching, no glossy plastic sheen, no shallow depth of field, no perfect symmetry, no text, no logo, no packaging.
```

Run three with the default model (`-o candidates/candidate-1.png`, `-2`, `-3`) and three with `--model black-forest-labs/flux.2-pro` (`-4`, `-5`, `-6`):
`cd /f/parcel-art && python ~/.claude/skills/generate-image/scripts/generate_image.py "<prompt>" -i candidates/figure-1600.jpg -o candidates/candidate-1.png`
Expected: six PNG files. If a call fails, retry it once and report what failed; never echo the key.

- [ ] **Step 4: Ask the owner to choose**

Tell the owner the six files are in `F:\parcel-art\candidates\`, and ask which one looks most like a real painted figure of them (or whether to try again with a change). Don't wait for the answer: continue with Task 2. Record their pick in the ledger when it arrives.

---

### Task 2: The overhead camera tilts 14° and keeps the box framed

**Files:**
- Modify: `js/scene/geometry.js` (`VIEWS.overhead`, `frameFor`)
- Test: `tests/unit/geometry.test.js`, `tests/unit/projection.test.js`

**Interfaces:**
- Produces: `VIEWS.overhead = { tilt: 14, spin: -3, light: 1 }`; `frameFor('overhead', vw, vh)` returns the same keys as before, with `panX` and `panY` that centre the rim.

- [ ] **Step 1: Write the failing tests** (replace the rim test that uses `rimMagnification` but keep that function, which another test uses; add `VIEWS` to the geometry import)

```js
import { projectPoint } from '../../js/scene/projection.js';

test('the overhead view looks down at a slight tilt', () => {
  assert.equal(VIEWS.overhead.tilt, 14);
});

test('tilted, the overhead view keeps the whole rim on screen and centred', () => {
  const rim = [[0, 0], [BOX.width, 0], [BOX.width, BOX.depth], [0, BOX.depth]];
  for (const s of screens) {
    const f = frameFor('overhead', s.width, s.height);
    const points = rim.map(([x, y]) => projectPoint(f, s, [x, y, BOX.height]));
    points.forEach(({ x, y }) => {
      assert.ok(x >= 0 && x <= s.width, `x ${x.toFixed(0)} on ${s.width}x${s.height}`);
      assert.ok(y >= 48 && y <= s.height - 48, `y ${y.toFixed(0)} on ${s.width}x${s.height}`);
    });
    const ys = points.map((p) => p.y);
    assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - s.height / 2) <= 2, `centred on ${s.width}x${s.height}`);
  }
});
```

In `tests/unit/projection.test.js`, 'the overhead eye sits above the box, looking down': change `dir[2] < -0.99` to `dir[2] < -0.96` (cos 14° ≈ 0.970).

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/unit/geometry.test.js`
Expected: FAIL. Tilt is 0, and once it is 14 the rim runs off the top (about −26 px on 1280 × 800).

- [ ] **Step 3: Implement in `js/scene/geometry.js`**

- Set `VIEWS.overhead.tilt` to 14.
- Make the overhead branch of `frameFor` fit the projected rim rather than `BOX × magnification`. Projected offsets scale linearly with zoom, because `perspective = 4.4 × H × zoom`. So:
  1. Project the four rim corners with zoom 1 and pan 0.
  2. Set zoom = `clamp(min(vw·0.94 / spanX, (vh − 96)·0.92 / spanY), 0.4, 3)`.
  3. Find `panX` and `panY` that centre the rim's projected box on the viewport. Pan sits inside the perspective divide, so iterate three times: subtract the centre's miss, divided by the rim's magnification, from the pan.
- `projection.js` imports `geometry.js`, so do the projection maths in a small local helper inside `geometry.js`. Don't import `projection.js`: that would make the imports circular.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/unit/geometry.test.js tests/unit/projection.test.js && npm test`
Expected: PASS, the whole unit suite green.

- [ ] **Step 5: Check the CSS against the maths**

Run: `npx playwright test tests/e2e/projection.spec.js --workers=1`
Expected: PASS for desktop and phone; the overhead flaps are where the maths puts them, within 1 px.

- [ ] **Step 6: Commit** (run `/verify` first)

```bash
git add js/scene/geometry.js tests/unit/geometry.test.js tests/unit/projection.test.js
git commit -m "feat: tilt the overhead view 14° and keep the box framed"
```

---

### Task 3: Books with real thickness, cast shadows, contact shadows and shaded edges

**Files:**
- Create: `js/scene/shadow.js`, `tests/unit/book-depth.test.js`
- Modify: `js/scene/geometry.js` (`BOOKS`: dictionary 28, solitude 13), `js/scene/parcel.js` (`buildTome`), `css/scene.css` (`.tome …`)

**Interfaces:**
- Consumes: `LIGHT_DIR` from `js/cloth/shading.js`; `frameFor` (Task 2).
- Produces (used again in Task 13 for the CSS fallback):
  - `castShadow(height: number, dir = LIGHT_DIR) → [dx, dy]`: the parcel-space offset of a shadow cast by something `height` tall, equal to `−(dir.x, dir.y) / dir.z × height`.
  - `localOffset([dx, dy], rotateDeg) → [lx, ly]`: the same offset in an item's own turned frame.
  - `shadowHull(width, height, [lx, ly]) → [[x, y], …]`: the clockwise convex hull of the rectangle `(0,0)–(width,height)` and its copy moved by `(lx, ly)`.

- [ ] **Step 1: Write the failing tests** (`tests/unit/book-depth.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOOKS, baseOf, frameFor, rotateZ } from '../../js/scene/geometry.js';
import { projectPoint } from '../../js/scene/projection.js';
import { castShadow, localOffset, shadowHull } from '../../js/scene/shadow.js';

const close = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

/** Screen px a book's cast shadow reaches past its top face: the most over its three corners nearest the shadow. */
function shadowBeyond(frame, view, book) {
  const [dx, dy] = castShadow(book.thickness);
  const base = baseOf(book);
  const cx = book.x + book.width / 2;
  const cy = book.y + book.height / 2;
  return Math.max(...[[1, 1], [1, -1], [-1, 1]].map(([sx, sy]) => {
    const [ox, oy] = rotateZ([(sx * book.width) / 2, (sy * book.height) / 2, 0], book.rotate);
    const top = projectPoint(frame, view, [cx + ox, cy + oy, base + book.thickness]);
    const shadow = projectPoint(frame, view, [cx + ox + dx, cy + oy + dy, base]);
    return Math.hypot(shadow.x - top.x, shadow.y - top.y);
  }));
}

/** Screen px of the front page edge's height, at the middle of the front edge. */
function frontEdge(frame, view, book) {
  const [ox, oy] = rotateZ([0, book.height / 2, 0], book.rotate);
  const at = [book.x + book.width / 2 + ox, book.y + book.height / 2 + oy];
  const low = projectPoint(frame, view, [...at, baseOf(book)]);
  const high = projectPoint(frame, view, [...at, baseOf(book) + book.thickness]);
  return low.y - high.y;
}

test('a cast shadow falls down-right, 0.57 × the height, along the light', () => {
  const [dx, dy] = castShadow(10);
  assert.ok(close(dx, 3.5) && close(dy, 4.5), `${dx}, ${dy}`);
});

test('turned with its book, the offset still points the same way in the box', () => {
  const [lx, ly] = localOffset([3.5, 4.5], 90);
  const [bx, by] = rotateZ([lx, ly, 0], 90);
  assert.ok(close(bx, 3.5) && close(by, 4.5));
});

test('the shadow hull joins the book and its shifted copy', () => {
  assert.deepEqual(shadowHull(100, 50, [10, 20]), [[0, 0], [100, 0], [110, 20], [110, 70], [10, 70], [0, 50]]);
  assert.equal(shadowHull(100, 50, [-10, 20]).length, 6);
});

test('the thick books keep their real proportions', () => {
  const t = Object.fromEntries(BOOKS.map((b) => [b.id, b.thickness]));
  assert.deepEqual(t, { dictionary: 28, 'hunter-x-hunter': 7, solitude: 13, siddhartha: 8 });
});

test('on the desktop every book shows its shadow and its page edge', () => {
  const view = { width: 1280, height: 800 };
  const frame = frameFor('overhead', view.width, view.height);
  BOOKS.forEach((b) => {
    assert.ok(shadowBeyond(frame, view, b) >= 6, `${b.id}: shadow ${shadowBeyond(frame, view, b).toFixed(1)} px`);
    const min = b.id === 'dictionary' ? 4 : 1.5;
    assert.ok(frontEdge(frame, view, b) >= min, `${b.id}: front edge ${frontEdge(frame, view, b).toFixed(1)} px`);
  });
});

test('on a phone every book still casts a visible shadow', () => {
  const view = { width: 390, height: 844 };
  const frame = frameFor('overhead', view.width, view.height);
  BOOKS.forEach((b) => assert.ok(shadowBeyond(frame, view, b) >= 2.5, `${b.id}: ${shadowBeyond(frame, view, b).toFixed(1)} px`));
});
```

These were measured before Task 2's fit at a 14° tilt: shadows were 8.6–33.8 px on desktop and 3.5–13.7 px on phone; front edges were 1.6–5.6 px. *Hunter × Hunter*'s 1.6 px front edge is the tightest margin. If Task 2's zoom pushes it below 1.5 px, tune the tilt within 12°–16° (spec §4) and ledger the ruling.

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/unit/book-depth.test.js`
Expected: FAIL with "Cannot find module …/js/scene/shadow.js".

- [ ] **Step 3: Implement**

- Write `js/scene/shadow.js` with the three functions above.
- Update `BOOKS` thicknesses.
- In `buildTome`:
  - set `--sx`, `--sy` (the local offset in px), a `--hull` `clip-path` polygon (from `shadowHull`, in px) and `--sblur` = `(1 + 0.12 × thickness)` px;
  - append a `.book-contact` element before the edges.
- In `css/scene.css`, for `.tome` only (the booklet's look stays as it is):
  - `.tome .book-shadow` fills the hull's bounding box. Its child `.book-shadow-shape` carries the `clip-path`; the blur sits on the parent, so the clipped edge is softened.
  - `.book-contact`: inset −1px, `translateZ(.1px)`, `rgba(30, 18, 8, .5)`, `blur(1.2px)`.
  - `.book-edge.front` and `.book-edge.right` (facing away from the light): `filter: brightness(.8)`.
  - The spine gets a rounded highlight across its thickness, laid over the board colour.
  - `.tome-top` gets a bevel: `inset 1px 1px 0 rgba(255,255,255,.28), inset -1px -1px 0 rgba(0,0,0,.22)`, plus the existing inner shadow.
- Update any `tests/unit/geometry.test.js` or `solids.test.js` expectation that pins the old thicknesses.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/unit/book-depth.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Look at it**

Run: `node tools/shots.mjs http://127.0.0.1:4173/ shots`, then open `shots/desktop-overhead.png` and `shots/phone-overhead.png`.
Expected: each book has a visible thickness, a shadow falling down-right like the clothes' shadows, and a dark line where it meets the floor.

- [ ] **Step 6: Commit** (run `/verify` first)

```bash
git add js/scene/shadow.js js/scene/geometry.js js/scene/parcel.js css/scene.css tests/unit/book-depth.test.js tests/unit/geometry.test.js tests/unit/solids.test.js
git commit -m "feat: books with real thickness, cast and contact shadows, shaded edges"
```

---

### Task 4: Retire the vacuum pack

**Files:**
- Delete:
  - `tools/prepare_pack.py`, `tools/pack_body.py`
  - `tools/tests/test_prepare_pack.py`, `tools/tests/test_pack_body.py`
  - `assets/photo/vacuum-pack.webp`, `assets/photo/vacuum-pack-shade.webp`, `assets/photo/vacuum-pack-relief.webp`
- Modify:
  - Tools and data: `tools/generate_clothes.py` (no `pack_record`; docstring); `assets/clothes/garments.json` and `assets/clothes/pile.json` (drop the `pack` entries); `tools/build-pile.mjs` (no film body; acceptance is booklet and signatures until Task 8); `tools/shots.mjs` (no pack close-up).
  - Cloth: `js/cloth/layer.js` (no film kind, `FILM_PICK`, `isFilm` or film shift); `js/cloth/render.js` (no film pass or `uFilm`); `js/cloth/hand.js` (no `holds`, `patch`, `keepIn` or `AIR`; the `asideTarget` comment now says the figurine lies left).
  - Scene and page: `js/scene/geometry.js` (no `CONTENTS.pack`); `js/scene/solids.js` (comment); `js/scene/parcel.js` (no `buildPack`); `css/scene.css` (no `.pack*` rules); `js/main.js` (no `photo` image, CSS pack or `photo.alt` report); `content/site.js` (no `photo`).
  - Tests: `tests/unit/{cloth-hand,cloth-solver,clothes-data,geometry}.test.js`, `tests/e2e/{clothes,assets,journey}.spec.js`, `tests/e2e/clothes-helpers.js` (no `filmPoints`).

**Interfaces:**
- Produces: `createHand({ world, colliders, ray })`, with no `holds`. `garments.json` and `pile.json` list the 8 garments only.

- [ ] **Step 1: Delete the pack's tests and turn the remaining ones toward the new world**

- Delete these tests:
  - `cloth-hand.test.js`: the pack scene and its four tests;
  - `cloth-solver.test.js`: `packRecord`, `packWorld`, 'cloth dropped on the vacuum pack …' and 'the pack laid over the booklet …';
  - `clothes-data.test.js`: 'the pack is the last body …', plus the pile test's `CONTENTS.pack` assertion;
  - `geometry.test.js`: the pack layout tests (Task 5 adds the figurine's);
  - `clothes.spec.js`: the pack tests;
  - `assets.spec.js`: the pack tests;
  - `journey.spec.js`: the `pointOn(page, 'pack')` line.
- Add this test to `tests/unit/clothes-data.test.js`:

```js
test('the clothes data hold garments only: the pack is gone', async () => {
  const data = await readJson('assets/clothes/garments.json');
  const pile = await readJson('assets/clothes/pile.json');
  assert.deepEqual(data.garments.map((g) => g.id), EXPECTED);
  assert.ok(data.garments.every((g) => g.kind === undefined && g.hold === undefined));
  assert.deepEqual(pile.garments.map((g) => g.id), EXPECTED);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --test tests/unit/clothes-data.test.js`
Expected: FAIL. The data still list `pack`.

- [ ] **Step 3: Remove the pack**

- Strip the data: `node -e "const fs=require('fs');for(const f of ['assets/clothes/garments.json','assets/clothes/pile.json']){const j=JSON.parse(fs.readFileSync(f,'utf8'));j.garments=j.garments.filter(g=>g.id!=='pack');fs.writeFileSync(f,f.endsWith('pile.json')?JSON.stringify(j)+'\n':JSON.stringify(j,null,1)+'\n')}"`
- `git rm` the deleted files.
- Make the code edits listed under Files.
- Keep `material.mass` in the solver: it is generic.

- [ ] **Step 4: Run every suite**

Run: `npm test && npm run test:py`
Expected: PASS.
Then run: `npx playwright test tests/e2e/clothes.spec.js --workers=1`, followed by `assets.spec.js` and `journey.spec.js`, each on its own.
Expected: PASS. The site shows no pack and nothing else changes; the garments that lay on the pack drop 4.5 units when woken, and Task 8 rebuilds the pile.

- [ ] **Step 5: Commit** (run `/verify` first)

```bash
git add -A tools js css content assets/clothes tests
git status --short   # check: no .omc/, no assets/photo except README.txt
git commit -m "refactor: retire the vacuum pack"
```

---

### Task 5: Rigid body records and the starting layout

**Files:**
- Create: `js/rigid/body.js`, `tests/unit/rigid-body.test.js`
- Modify: `js/scene/geometry.js` (add `FIGURINE`, `FOOD`)

**Interfaces:**
- Produces, in `geometry.js` (`start` is the footprint's centre; `footprint` is `[width along x, depth along y]` before `rotate`):

```js
export const FIGURINE = Object.freeze({ id: 'figurine', label: 'figurine', footprint: [125, 290], height: 30, start: [68.5, 150], rotate: 0, inset: 0.04, keepIn: true });
export const FOOD = Object.freeze([
  Object.freeze({ id: 'sushi', label: 'sushi', footprint: [52, 68], height: 12, start: [170, 56], rotate: 0, inset: 0, keepIn: false }),
  Object.freeze({ id: 'fries', label: 'fries', footprint: [32, 40], height: 22, start: [170, 115], rotate: 0, inset: 0.05, keepIn: false }),
  Object.freeze({ id: 'strawberries', label: 'strawberries', footprint: [44, 44], height: 16, start: [170, 162], rotate: 0, inset: 0.05, keepIn: false }),
  Object.freeze({ id: 'bowl', label: 'fruit bowl', footprint: [42, 42], height: 18, start: [170, 210], rotate: 0, inset: 0.15, keepIn: false }),
  Object.freeze({ id: 'dumplings', label: 'dumplings', footprint: [40, 40], height: 10, start: [170, 256], rotate: 0, inset: 0.15, keepIn: false }),
]);
```

- Produces, in `js/rigid/body.js`. A `Body` is a frozen `{ ...def, position: [x, y, z], vz }`, where `position` is the footprint centre and the base height.
  - `createBody(def) → Body`: at `[...start, 0]`, with `vz` 0.
  - `withPosition(body, [x, y, z], vz = 0) → Body`
  - `fromRect({ id, x, y, width, height, thickness = 0, rotate = 0 }, base = 0) → Body`: a `CONTENTS`- or `BOOKS`-style rectangle as a body.
  - `areaOf(body) → { x, y, width, height, rotate }`: its rectangle for coverage, without the inset.
  - `footprintCorners(body, { inset = body.inset } = {}) → [[x, y] × 4]`
  - `footprintPoints(body, spacing = 8) → [[x, y], …]`: a grid over the inset footprint, edges and corners included.
  - `bodyCollider(body) → { kind: 'obb', name: 'body:<id>', center, axes, half }`: half sizes `w/2·(1−inset)`, `d/2·(1−inset)`, `height/2`; centre `z + height/2`.
  - `overlapXY(a, b, { inset } = {}) → boolean`: separating-axis test on the turned footprints; `inset` overrides both bodies' own.
  - `containsXY(body, [x, y]) → boolean`: inside the inset footprint, edges included.

- [ ] **Step 1: Write the failing tests** (`tests/unit/rigid-body.test.js`)

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOX, CONTENTS, BOOKS, FIGURINE, FOOD } from '../../js/scene/geometry.js';
import {
  createBody, withPosition, fromRect, footprintCorners, footprintPoints, bodyCollider, overlapXY, containsXY,
} from '../../js/rigid/body.js';

test('a body starts on the floor at its place; moving it makes a new record', () => {
  const sushi = createBody(FOOD[0]);
  assert.deepEqual(sushi.position, [170, 56, 0]);
  assert.ok(Object.isFrozen(sushi));
  const moved = withPosition(sushi, [10, 20, 5]);
  assert.deepEqual(moved.position, [10, 20, 5]);
  assert.deepEqual(sushi.position, [170, 56, 0], 'the original is unchanged');
});

test("a body's collider is its inset footprint, as tall as the body", () => {
  const bowl = withPosition(createBody(FOOD[3]), [100, 100, 9]);
  const c = bodyCollider(bowl);
  assert.equal(c.name, 'body:bowl');
  assert.deepEqual(c.center, [100, 100, 18]);
  assert.ok(Math.abs(c.half[0] - 21 * 0.85) < 1e-9);
  assert.equal(c.half[2], 9);
});

test('turned a quarter, a footprint swaps its width and depth', () => {
  const b = withPosition(createBody({ id: 't', label: 't', footprint: [40, 20], height: 5, start: [0, 0], rotate: 90, inset: 0 }), [100, 50, 0]);
  const xs = footprintPoints(b, 8).map(([x]) => x);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 20) < 1e-6);
  assert.ok(footprintPoints(b, 8).every((p) => containsXY(b, p)));
  assert.ok(containsXY(b, [100, 50 + 19]) && !containsXY(b, [100 + 11, 50]));
});

test('overlap is decided on turned footprints', () => {
  const a = withPosition(createBody({ ...FOOD[1], rotate: 45 }), [100, 100, 0]);
  assert.ok(overlapXY(a, withPosition(a, [120, 100, 0])));
  assert.ok(!overlapXY(a, withPosition(a, [160, 100, 0])));
});

test('the figurine lies along the left wall, the full depth, and stays inside', () => {
  footprintCorners(createBody(FIGURINE), { inset: 0 }).forEach(([x, y]) => {
    assert.ok(x >= 4 && x <= 135 && y >= 4 && y <= BOX.depth - 4, `${x}, ${y}`);
  });
  assert.equal(FIGURINE.keepIn, true);
});

test('the food stands in a column beside it, sushi at the back, dumplings at the front', () => {
  assert.deepEqual(FOOD.map((f) => f.id), ['sushi', 'fries', 'strawberries', 'bowl', 'dumplings']);
  const ys = FOOD.map((f) => f.start[1]);
  assert.deepEqual([...ys].sort((p, q) => p - q), ys);
  FOOD.map(createBody).forEach((b) => footprintCorners(b, { inset: 0 }).forEach(([x, y]) => {
    assert.ok(x >= 140 && x <= 200, `${b.id} x ${x}`);
    assert.ok(y >= 4 && y <= BOX.depth - 4, `${b.id} y ${y}`);
  }));
  FOOD.forEach((f) => assert.ok(f.height > 0 && f.inset >= 0 && f.inset <= 0.2 && f.label));
});

test('at the start nothing on the floor overlaps anything else', () => {
  const things = [
    createBody(FIGURINE), ...FOOD.map(createBody),
    fromRect({ ...CONTENTS.book, id: 'booklet' }), fromRect({ ...CONTENTS.desiccant, id: 'desiccant' }),
    ...BOOKS.filter((b) => !b.on).map((b) => fromRect(b)),
  ];
  things.forEach((a, i) => things.slice(i + 1).forEach((b) => assert.ok(!overlapXY(a, b, { inset: 0 }), `${a.id} / ${b.id}`)));
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/unit/rigid-body.test.js`
Expected: FAIL with "Cannot find module …/js/rigid/body.js".

- [ ] **Step 3: Implement** `js/rigid/body.js` and the two `geometry.js` exports. The axes for a body turned by `rotate` are the same as in `solids.js` `floorItemCollider`.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/unit/rigid-body.test.js && npm test`
Expected: PASS. If the dictionary (min x ≈ 197) and a food item overlap, move the food column, keeping its x range inside 140–200, and ledger the ruling.

- [ ] **Step 5: Commit** (run `/verify` first)

```bash
git add js/rigid/body.js js/scene/geometry.js tests/unit/rigid-body.test.js
git commit -m "feat: rigid body records and the figurine and food layout"
```

---

### Task 6: Resting, falling and landing level

**Files:**
- Create: `js/rigid/rest.js`, `tests/unit/rigid-rest.test.js`

**Interfaces:**
- Consumes: `supportUnder(world, colliders, points, { reach, skip, moving })` from `js/cloth/grip.js`; `DEFAULTS.gravity` from `js/cloth/solver.js` (−2400); `footprintPoints`, `withPosition` and `bodyCollider` (Task 5).
- Produces:
  - `supportOf(body, [x, y], { world, colliders, moving = true }) → number`: the highest support under the body's inset footprint centred at (x, y). It counts colliders other than `body:<own id>` and cloth tops (`supportUnder` with `reach` 1 and `skip` −1). The floor and the table are 0.
  - `settle(body, support, dt) → Body`. x and y never change. Above the support, the body falls: `vz += gravity·dt`, `z = max(support, z + vz·dt)`, and it lands with `vz` 0. At or below the support, `z = support` and `vz = 0`.
  - `isResting(body, support) → boolean`: `|z − support| < 0.01 && vz === 0`.

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMesh } from '../../js/cloth/mesh.js';
import { createWorld, setPositions, sleepAll } from '../../js/cloth/solver.js';
import { supportUnder } from '../../js/cloth/grip.js';
import { boxColliders, flapCorners } from '../../js/scene/solids.js';
import { BOOKS, FOOD, baseOf } from '../../js/scene/geometry.js';
import { createBody, withPosition, bodyCollider, footprintPoints } from '../../js/rigid/body.js';
import { supportOf, settle, isResting } from '../../js/rigid/rest.js';

const THICKNESS = 4.5;
/** A 60 × 60 sheet asleep with its middle at (x, y) on the floor (far away by default). */
function sheetWorld(x = -2000, y = 0) {
  const mesh = buildMesh({ id: 'sheet', size: [60, 60], grid: { cols: 10, rows: 10, cells: '1'.repeat(100) } });
  const world = createWorld({ garments: [{ mesh, material: { stretchCompliance: 0, bendCompliance: 2e-4, friction: 0.5 } }], bounds: { min: [-3000, -900, 0], max: [1300, 1300, 900] }, thickness: THICKNESS });
  setPositions(world, 0, Float32Array.from(mesh.rest, (v, i) => v + [x - 30, y - 30, THICKNESS / 2][i % 3]));
  sleepAll(world);
  return world;
}
const fall = (body, support, frames = 120) => Array.from({ length: frames }).reduce((b) => settle(b, support, 1 / 60), body);

test('a body in the air falls and lands level; x and y never change', () => {
  const b = fall(withPosition(createBody(FOOD[1]), [170, 115, 50]), 0);
  assert.deepEqual(b.position, [170, 115, 0]);
  assert.equal(b.vz, 0);
});

test('a support that appears under a resting body lifts it straight up', () => {
  const b = settle(createBody(FOOD[1]), 8, 1 / 60);
  assert.deepEqual(b.position, [170, 115, 8]);
  assert.ok(isResting(b, 8));
});

test('it rests on the highest thing under any part of it: half on the dictionary, it lies on the dictionary', () => {
  const dict = BOOKS.find((b) => b.id === 'dictionary');
  // a 10 × 10 block across the dictionary's left edge, clear of Hunter × Hunter lying on it (left edge ≈ x 212)
  const block = createBody({ id: 'block', label: 'block', footprint: [10, 10], height: 5, start: [0, 0], rotate: 0, inset: 0, keepIn: false });
  const s = supportOf(block, [dict.x + 2, dict.y + 48], { world: sheetWorld(), colliders: boxColliders() });
  assert.ok(Math.abs(s - (baseOf(dict) + dict.thickness)) < 0.5, `support ${s}`);
});

test('let go over a sloping open flap, food rests level on its highest point beneath it', () => {
  const colliders = boxColliders();
  const flap = colliders.find((c) => c.name === 'flap-front');
  const [hingeLeft, , tipRight] = flapCorners('front');
  const at = [(hingeLeft[0] + tipRight[0]) / 2, (hingeLeft[1] + tipRight[1]) / 2];
  const world = sheetWorld();
  const bowl = createBody(FOOD[3]);
  const s = supportOf(bowl, at, { world, colliders });
  const tops = footprintPoints(withPosition(bowl, [...at, 0])).map((p) => supportUnder(world, [flap], [p], { reach: 1 }));
  assert.ok(Math.abs(s - Math.max(...tops)) < 1, `rests at ${s}, flap top ${Math.max(...tops)}`);
  assert.ok(Math.max(...tops) > Math.min(...tops) + 2, 'the flap slopes under it');
});

test('stacked food drops straight down when the one beneath is dragged away', () => {
  const lower = withPosition(createBody(FOOD[3]), [300, 200, 0]);
  const world = sheetWorld();
  let upper = withPosition(createBody(FOOD[4]), [300, 200, 0]);
  upper = settle(upper, supportOf(upper, [300, 200], { world, colliders: [bodyCollider(lower)] }), 1 / 60);
  assert.equal(upper.position[2], lower.height);
  for (let f = 0; f < 60; f += 1) upper = settle(upper, supportOf(upper, [300, 200], { world, colliders: [] }), 1 / 60);
  assert.deepEqual(upper.position, [300, 200, 0]);
});

test('it rests on cloth, and when the cloth is pulled away it settles to the floor', () => {
  const world = sheetWorld(300, 200);
  const fries = createBody(FOOD[1]);
  const onCloth = supportOf(fries, [300, 200], { world, colliders: [] });
  assert.ok(onCloth >= THICKNESS && onCloth <= 2 * THICKNESS, `on cloth at ${onCloth}`);
  setPositions(world, 0, world.pos.map((v, i) => (i % 3 === 0 ? v - 3000 : v)));
  assert.equal(supportOf(fries, [300, 200], { world, colliders: [] }), 0);
});

test('a body is never its own support', () => {
  const sushi = createBody(FOOD[0]);
  assert.equal(supportOf(sushi, [170, 56], { world: sheetWorld(), colliders: [bodyCollider(sushi)] }), 0);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/unit/rigid-rest.test.js`
Expected: FAIL with "Cannot find module …/js/rigid/rest.js".

- [ ] **Step 3: Implement `js/rigid/rest.js`**

- [ ] **Step 4: Run the tests**

Run: `node --test tests/unit/rigid-rest.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit** (run `/verify` first)

```bash
git add js/rigid/rest.js tests/unit/rigid-rest.test.js
git commit -m "feat: rigid bodies rest level and fall straight down"
```

---

### Task 7: Holding a rigid body

**Files:**
- Create: `js/rigid/hold.js`, `tests/unit/rigid-hold.test.js`

**Interfaces:**
- Consumes: `onPlane` from `js/cloth/grip.js`; `BOX` from geometry; `WALL` from solids; `withPosition` and `footprintCorners` (Task 5).
- Produces:
  - Constants: `LIFT = 12`, `SCREEN_MARGIN = 24` (px), `LOWER_RATE = 5` (per s), `AIR = 0.5`, `REACH = { min: [-600, -500], max: [1100, 900] }`.
  - `keepInside(body, [x, y]) → [x, y]`: clamps a centre so that the footprint corners (no inset) stay `WALL + AIR` inside the walls.
  - `createRigidHand({ ray, viewport, supportAt }) → hand`:
    - `ray(sx, sy) → { origin, dir }`; `viewport() → { width, height }`; `supportAt(body, [x, y]) → number`, which the controller passes as `supportOf(…, { moving: false })`.
    - `get id`: the held body's id, or `null`.
    - `grab(body, point, sx, sy)`: `point` is the parcel point picked on the body. The hand keeps the offset `point − position` and its current height.
    - `dragTo(sx, sy)`: the screen point is clamped to the viewport inset by `SCREEN_MARGIN`; ignored during a carry.
    - `release()`: lets go where it is.
    - `drop()`: lets go at once and resolves a carry.
    - `carry(body, [x, y], { duration }) → Promise<void>`: a smooth straight-line keyboard move at the held height; it lets go at the end.
    - `advance(elapsed)`: sinks back towards `support + LIFT` at `LOWER_RATE`; re-aims for a still pointer; moves a carry on.
    - `place(body) → Body`: the held body at the hand's current place (centre = where the sight meets the grab point's height, minus the offset; `keepInside` when `body.keepIn`; clamped to `REACH`; z = the hand's height). Any other body is returned unchanged.
  - The height rule matches the cloth hand: `want = supportAt + LIFT`. The hand rises at once when `want` is higher, then re-aims on the higher plane.

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOX, FIGURINE, FOOD } from '../../js/scene/geometry.js';
import { boxColliders, WALL } from '../../js/scene/solids.js';
import { createBody, footprintCorners } from '../../js/rigid/body.js';
import { createRigidHand, LIFT, SCREEN_MARGIN } from '../../js/rigid/hold.js';

const ray = (sx, sy) => ({ origin: [sx, sy, 3000], dir: [0, 0, -1] }); // looking straight down: screen = parcel
const viewport = () => ({ width: 1280, height: 800 });
const RIM = BOX.height + BOX.longFlapLift;
const wallsUnder = (body, [x, y]) => (x > BOX.width - 4 && x < BOX.width + 30 ? RIM : 0); // a wall around x = 420
const frames = (hand, body, n) => Array.from({ length: n }).reduce((b) => { hand.advance(1 / 60); return hand.place(b); }, body);
const top = (b) => [b.position[0] + 5, b.position[1] - 3, b.height];

test('grabbed food follows the pointer LIFT above what lies beneath, and only moves', () => {
  const fries = createBody(FOOD[1]);
  const hand = createRigidHand({ ray, viewport, supportAt: () => 0 });
  const p = top(fries);
  hand.grab(fries, p, p[0], p[1]);
  assert.equal(hand.id, 'fries');
  hand.dragTo(p[0] + 100, p[1] + 40);
  const moved = hand.place(fries);
  assert.deepEqual(moved.position.slice(0, 2).map(Math.round), [270, 155]);
  assert.equal(moved.position[2], LIFT);
  assert.deepEqual([moved.footprint, moved.rotate, moved.height], [fries.footprint, fries.rotate, fries.height]);
});

test('it rises at once over a wall and sinks back once past it', () => {
  const sushi = createBody(FOOD[0]);
  const hand = createRigidHand({ ray, viewport, supportAt: wallsUnder });
  hand.grab(sushi, top(sushi), ...top(sushi).slice(0, 2));
  hand.dragTo(BOX.width + 10, 56);
  assert.ok(hand.place(sushi).position[2] >= RIM + LIFT);
  hand.dragTo(BOX.width + 200, 56);
  assert.ok(frames(hand, sushi, 120).position[2] < LIFT + 1, 'sunk back over the table');
});

test('the figurine stays inside the walls however far it is pulled', () => {
  const fig = createBody(FIGURINE);
  const hand = createRigidHand({ ray, viewport, supportAt: () => 0 });
  hand.grab(fig, top(fig), ...top(fig).slice(0, 2));
  hand.dragTo(900, -300);
  footprintCorners(hand.place(fig), { inset: 0 }).forEach(([x, y]) => {
    assert.ok(x >= WALL && x <= BOX.width - WALL && y >= WALL && y <= BOX.depth - WALL, `${x}, ${y}`);
  });
});

test('food may go anywhere, but its grab point never leaves the screen', () => {
  const bowl = createBody(FOOD[3]);
  const hand = createRigidHand({ ray, viewport, supportAt: () => 0 });
  const p = top(bowl);
  hand.grab(bowl, p, p[0], p[1]);
  hand.dragTo(-500, 2000);
  const moved = hand.place(bowl);
  const grip = [moved.position[0] + (p[0] - bowl.position[0]), moved.position[1] + (p[1] - bowl.position[1])];
  assert.ok(grip[0] >= SCREEN_MARGIN - 0.5 && grip[1] <= 800 - SCREEN_MARGIN + 0.5, `grip at ${grip}`);
});

test('released, the hand lets go and the body stays where it was put', () => {
  const fries = createBody(FOOD[1]);
  const hand = createRigidHand({ ray, viewport, supportAt: () => 0 });
  hand.grab(fries, top(fries), ...top(fries).slice(0, 2));
  hand.dragTo(700, 150);
  const moved = hand.place(fries);
  hand.release();
  assert.equal(hand.id, null);
  assert.deepEqual(hand.place(moved), moved);
});

test('a keyboard carry lifts the body, takes it to the target and lets go', async () => {
  const bowl = createBody(FOOD[3]);
  const hand = createRigidHand({ ray, viewport, supportAt: () => 0 });
  let done = false;
  const moved = hand.carry(bowl, [300, 60], { duration: 0.5 }).then(() => { done = true; });
  const end = frames(hand, bowl, 60);
  await moved;
  assert.ok(done);
  assert.deepEqual(end.position.slice(0, 2).map(Math.round), [300, 60]);
  assert.equal(hand.id, null);
});

test('drop() ends a carry at once', async () => {
  const bowl = createBody(FOOD[3]);
  const hand = createRigidHand({ ray, viewport, supportAt: () => 0 });
  const moved = hand.carry(bowl, [300, 60], { duration: 2 });
  hand.drop();
  await moved;
  assert.equal(hand.id, null);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/unit/rigid-hold.test.js`
Expected: FAIL with "Cannot find module …/js/rigid/hold.js".

- [ ] **Step 3: Implement `js/rigid/hold.js`**

Follow the shape of `js/cloth/hand.js`: the `aim` and `place` split, the `smooth` easing for carries, and the dwell at the end of a carry. A carry needs no dwell, since nothing swings in beneath a rigid body.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/unit/rigid-hold.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit** (run `/verify` first)

```bash
git add js/rigid/hold.js tests/unit/rigid-hold.test.js
git commit -m "feat: a translate-only hand for the figurine and the food"
```

---

### Task 8: Bodies among the clothes, and the pile rebuilt around them

**Files:**
- Modify:
  - `js/cloth/solver.js` (`setColliders`), `js/cloth/hand.js` (colliders read from the world), `js/cloth/layer.js` (the `dropAt` call), `js/cloth/coverage.js` (`coverageOf`, solids), `js/rigid/rest.js` (`clothOn`)
  - `tools/build-pile.mjs`, `assets/clothes/pile.json` (regenerated)
- Test: `tests/unit/{cloth-solver,cloth-hand,cloth-coverage,rigid-rest,clothes-data}.test.js`

**Interfaces:**
- Produces:
  - `setColliders(world, colliders)`: replaces `world.colliders` with `colliders.map(prepareCollider)`. Mutating the world is allowed here, as with the rest of the solver API.
  - `createHand({ world, ray })` and `dropAt(world, g, [x, y])`, without the `colliders` parameters. Both read `world.colliders`; prepared colliders still carry `center`, `axes` and `half`.
  - `clothOn(world, body) → number[]`: the garments with a core particle above the body's inset footprint and higher than `z + height − thickness`, i.e. resting on it.
  - `coverageOf(world, area, top, { cols = 8, rows = 11, radius = 9, solids = [] } = {}) → number`:
    - `area` is `{ x, y, width, height, rotate }`;
    - a sample point is covered by a core cloth particle above `top` within `radius`, or by a solid collider whose footprint contains it and whose top (`center[2] + half[2]`) is above `top`.
  - `bookCoverage(world, book, options)` = `coverageOf(world, book, 0.6 + book.thickness + 0.5, options)`.
- Consumes: `FIGURINE`, `FOOD`, `createBody`, `bodyCollider` and `areaOf` (Task 5).

- [ ] **Step 1: Write the failing tests**

```js
// cloth-solver.test.js (imports setColliders)
test('colliders can be replaced: cloth then rests on a box that appeared beneath it', () => {
  const mesh = buildMesh({ id: 'sheet', size: [60, 60], grid: { cols: 10, rows: 10, cells: '1'.repeat(100) } });
  const world = createWorld({ garments: [{ mesh, material: { stretchCompliance: 0, bendCompliance: 2e-4, friction: 0.5 } }], bounds: { min: [-700, -600, 0], max: [1200, 1000, 700] }, thickness: 4.5 });
  setPositions(world, 0, Float32Array.from(mesh.rest, (v, i) => v + [270, 120, 30][i % 3]));
  setColliders(world, [{ kind: 'obb', name: 'box', center: [300, 150, 10], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], half: [40, 40, 10] }]);
  for (let f = 0; f < 180; f += 1) step(world, 1 / 60);
  assert.equal(world.colliders[0].name, 'box');
  for (let i = 0; i < world.count; i += 1) assert.ok(world.pos[3 * i + 2] >= 20 + 2.25 - 0.3, `particle ${i} at ${world.pos[3 * i + 2]}`);
});

// cloth-hand.test.js: every createHand({ world, colliders: X, ray }) becomes createHand({ world, ray }), with the world built with X
test("the hand rises over a body's collider on the world", () => {
  const { world, hand } = scene();
  setColliders(world, [...walls(), bodyCollider(withPosition(createBody(FOOD[1]), [150, 150, 0]))]);
  const i = topParticle(world, 0);
  hand.grab(hitAt(world, i), world.pos[3 * i], world.pos[3 * i + 1]);
  hand.dragTo(150, 150);
  assert.ok(world.grip.to[2] >= FOOD[1].height + 12, `hand at ${world.grip.to[2]}`);
});

// rigid-rest.test.js (imports clothOn)
test('cloth lying on a body is found; cloth beside it is not', () => {
  const sushi = withPosition(createBody(FOOD[0]), [300, 200, 0]);
  const on = sheetWorld(300, 200);
  setPositions(on, 0, on.pos.map((v, i) => (i % 3 === 2 ? v + sushi.height : v)));
  assert.deepEqual(clothOn(on, sushi), [0]);
  assert.deepEqual(clothOn(sheetWorld(500, 200), sushi), []);
});

// cloth-coverage.test.js
/** A world whose only cloth lies far away. */
function parkedWorld() {
  const mesh = buildMesh({ id: 'sheet', size: [60, 60], grid: { cols: 10, rows: 10, cells: '1'.repeat(100) } });
  const world = createWorld({ garments: [{ mesh, material: { stretchCompliance: 0, bendCompliance: 2e-4, friction: 0.5 } }], bounds: { min: [-3000, -900, 0], max: [1300, 1300, 900] }, thickness: 4.5 });
  setPositions(world, 0, Float32Array.from(mesh.rest, (v, i) => v + [-2000, 0, 2.25][i % 3]));
  return world;
}

test('food lying over the booklet covers it as cloth does', () => {
  const world = parkedWorld();
  const top = 0.6 + CONTENTS.book.thickness;
  const bowl = withPosition(createBody(FOOD[3]), [CONTENTS.book.x + 48, CONTENTS.book.y + 67, top]);
  assert.equal(bookCoverage(world, CONTENTS.book), 0);
  const share = bookCoverage(world, CONTENTS.book, { solids: [bodyCollider(bowl)] });
  assert.ok(share > 0.05 && share < 0.3, `covered ${share}`);
});

test('a body beside the booklet, lower than its cover, covers nothing', () => {
  const bowl = withPosition(createBody(FOOD[3]), [230, 80, 0]);
  assert.equal(bookCoverage(parkedWorld(), CONTENTS.book, { solids: [bodyCollider(bowl)] }), 0);
});

// clothes-data.test.js: the pile test imports FIGURINE, FOOD, createBody, areaOf, bodyCollider and coverageOf, and ends with
const bodies = [FIGURINE, ...FOOD].map(createBody);
bodies.forEach((b) => assert.ok(coverageOf(world, areaOf(b), b.height) <= 0.08, `${b.id} stays uncovered`));
bodies.map(bodyCollider).forEach((c) => {
  for (let i = 0; i < world.count; i += 1) {
    const p = world.pos.subarray(3 * i, 3 * i + 3);
    const inside = c.axes.every((a, k) => Math.abs((p[0] - c.center[0]) * a[0] + (p[1] - c.center[1]) * a[1] + (p[2] - c.center[2]) * a[2]) < c.half[k] - 0.5);
    assert.ok(!inside, `particle ${i} lies inside ${c.name}`);
  }
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/unit/cloth-solver.test.js tests/unit/cloth-hand.test.js tests/unit/cloth-coverage.test.js tests/unit/rigid-rest.test.js tests/unit/clothes-data.test.js`
Expected: FAIL. `setColliders`, `clothOn` and `coverageOf` are not exported, the hand still wants `colliders`, and the old pile has cloth inside the food.

- [ ] **Step 3: Implement the code changes** (solver, hand, layer call, coverage, `clothOn`)

- [ ] **Step 4: Teach the pile builder about the bodies, then rebuild**

In `tools/build-pile.mjs`:
- colliders are `[...boxColliders(), ...[FIGURINE, ...FOOD].map(createBody).map(bodyCollider)]`;
- `TARGETS = { book: 0.88, bodies: 0.05, signatures: 6 }`, with `bodies` = the largest `coverageOf(world, areaOf(b), b.height)` over the bodies;
- the log line reports it, and the docstring says so.

Run: `node tools/build-pile.mjs`
Expected: a line per seed tried, ending in `wrote assets/clothes/pile.json (seed N)`. The spec hoped for seed 11; record N in the ledger. If no seed in 11–30 passes, move the `PLAN` centres of the two garments nearest the food column 10 units right, ledger it, and rerun.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS, including the pile test: booklet ≥ 0.85, ≥ 6 signatures in view, bodies uncovered, no cloth inside a body.

- [ ] **Step 6: Commit** (run `/verify` first)

```bash
git add js/cloth/solver.js js/cloth/hand.js js/cloth/layer.js js/cloth/coverage.js js/rigid/rest.js tools/build-pile.mjs assets/clothes/pile.json tests/unit
git commit -m "feat: the clothes collide with the figurine and food, and the pile settles around them"
```

---

### Task 9: The food, cut out and plain

**Files:**
- Create: `tools/solids/__init__.py`, `tools/solids/cutout.py`, `tools/solids/relief.py`, `tools/solids/finish.py`, `tools/prepare_food.py`, `tools/tests/test_solids.py`, `tools/tests/test_prepare_food.py`
- Create (generated): `assets/food/{sushi,fries,strawberries,bowl,dumplings}.webp`, `assets/food/<id>-relief.webp`, `assets/food/food.json`
- Test: `tests/unit/rigid-assets.test.js` (new: the JS side agrees with `food.json`)

**Interfaces:**
- Produces in Python. Every function returns new arrays; inputs are never changed.
  - `cutout.border_colour(rgb) → np.ndarray[3]`: the median of the 1-px border.
  - `cutout.key_matte(rgb, background=None, tolerance=28.0, softness=10.0) → alpha [0, 1]`. Background-coloured pixels connected to the border are cut away, ramping over `softness` levels of colour distance. Background-coloured holes inside the object stay.
  - `cutout.u2net_matte(rgb, model: Path) → alpha [0, 1]`: onnxruntime, 320 × 320 input, ImageNet normalisation, min-max of the first output, resized back.
  - `cutout.unmix(rgb, alpha, background) → rgb`: `(rgb − (1 − a)·bg) / a`, clipped, so no fringe of the background remains.
  - `relief.relief(alpha, rgb, radius_px, detail=0.15) → uint8`: 0 outside, 255 at the highest point. A dome (sqrt of the distance transform over `radius_px`) plus a high-pass of luminance × `detail`.
  - `finish.match_light(rgb, alpha) → rgb`: the warm tint `LIGHT = (1.0, 0.975, 0.93)` and a contrast of 0.94 about the mean.
  - `finish.add_grain(rgb, alpha, grain, strength=6.0) → rgb`: tiles `assets/textures/grain.png` luminance noise over the opaque part.
  - `finish.fit_canvas(rgba, size_px) → rgba`: scales to fit without distortion and centres on a transparent canvas of exactly `size_px`.
  - `finish.remove_marks(rgb, boxes, feather=3) → rgb`: fills each `(x0, y0, x1, y1)` box from the median of a 6-px ring around it, plus noise matched to the ring's standard deviation, with feathered edges.
  - `prepare_food.ITEMS`: id → `Item(file, key, size, height, label, marks)`. `key` is one of `'alpha'`, `'auto'` or `'u2net'`; `size` and `height` are the units in `FOOD`; `marks` are boxes in source pixels.
  - `prepare_food.PX = 4` px per unit.
- Produces on disk: `food.json = { "pxPerUnit": 4, "items": [{ id, label, size, height, texture, relief, cleaned }] }`, where `cleaned` holds the brand boxes mapped to output pixels.
- CLI: `python tools/prepare_food.py F:/parcel-art assets/food [--u2net F:/portrait-collage/models/u2netp.onnx]`

- [ ] **Step 1: Write the failing tests** (synthetic images, so CI never needs the owner's files)

```python
# tools/tests/test_solids.py
import numpy as np
from solids.cutout import border_colour, key_matte, unmix
from solids.relief import relief
from solids.finish import fit_canvas, remove_marks

def disc(size, colour, background):
    yy, xx = np.mgrid[0:size, 0:size]
    cover = np.clip(size * 0.3 - np.hypot(xx - size / 2, yy - size / 2) + 0.5, 0, 1)[..., None]
    return np.array(colour) * cover + np.array(background) * (1 - cover)

def test_a_disc_is_cut_off_black_with_no_dark_fringe():
    rgb = disc(200, (220, 40, 30), (0, 0, 0))
    alpha = key_matte(rgb)
    assert alpha[0, 0] == 0 and alpha[100, 100] == 1
    edge = (alpha > 0.1) & (alpha < 0.9)
    assert edge.any()
    assert unmix(rgb, alpha, border_colour(rgb))[edge][:, 0].mean() > 190

def test_a_background_coloured_hole_inside_stays():
    rgb = disc(200, (220, 40, 30), (255, 255, 255))
    rgb[95:105, 95:105] = 255
    assert key_matte(rgb)[100, 100] == 1

def test_relief_is_zero_outside_and_peaks_inside():
    rgb = disc(200, (220, 40, 30), (0, 0, 0))
    level = relief(key_matte(rgb), rgb, radius_px=30)
    assert level[0, 0] == 0 and level.max() == 255 and level[100, 100] > 200

def test_a_mark_is_painted_over_in_the_surrounding_colour():
    rgb = np.full((80, 80, 3), (200, 30, 30), float)
    rgb[30:50, 30:50] = (250, 200, 40)  # a yellow logo on red
    out = remove_marks(rgb, [(28, 28, 52, 52)])
    patch = out[30:50, 30:50]
    assert np.abs(patch - (200, 30, 30)).max() < 25
    assert rgb[40, 40, 1] == 200, "the input is not changed"

def test_fit_canvas_keeps_proportions_and_centres():
    rgba = np.zeros((100, 50, 4), np.uint8); rgba[..., 3] = 255
    out = fit_canvas(rgba, (80, 80))
    cols = np.nonzero(out[..., 3].max(axis=0))[0]
    assert out.shape[:2] == (80, 80) and cols.min() == 20 and cols.max() == 59
```

```python
# tools/tests/test_prepare_food.py
import json
from pathlib import Path
import numpy as np
from PIL import Image
import prepare_food

ROOT = Path(__file__).resolve().parents[2]
FOOD = ROOT / "assets" / "food"

def test_food_json_matches_the_tool_and_every_picture_lines_up():
    data = json.loads((FOOD / "food.json").read_text(encoding="utf-8"))
    assert data["pxPerUnit"] == prepare_food.PX
    assert [i["id"] for i in data["items"]] == list(prepare_food.ITEMS)
    for item in data["items"]:
        spec = prepare_food.ITEMS[item["id"]]
        assert tuple(item["size"]) == spec.size and item["height"] == spec.height
        colour, level = Image.open(ROOT / item["texture"]), Image.open(ROOT / item["relief"])
        assert colour.size == level.size == (spec.size[0] * data["pxPerUnit"], spec.size[1] * data["pxPerUnit"])

def test_every_item_is_cut_out():
    for path in FOOD.glob("*.webp"):
        if path.stem.endswith("-relief"):
            continue
        alpha = np.asarray(Image.open(path).getchannel("A"))
        share = (alpha > 127).mean()
        assert alpha.min() == 0 and 0.35 < share < 0.98, f"{path.name}: {share:.2f} opaque"

def test_the_brands_are_gone():
    data = json.loads((FOOD / "food.json").read_text(encoding="utf-8"))
    items = {i["id"]: i for i in data["items"]}
    assert items["fries"]["cleaned"] and items["strawberries"]["cleaned"]
    for item in items.values():
        rgb = np.asarray(Image.open(ROOT / item["texture"]).convert("RGB"), float)
        for x0, y0, x1, y1 in item["cleaned"]:
            r, g, b = np.moveaxis(rgb[y0:y1, x0:x1], 2, 0)
            yellow = ((r > 170) & (g > 130) & (b < 110) & (r - b > 90)).mean()  # the "M"
            assert yellow < 0.01, f"{item['id']}: {yellow:.3f} yellow"
            if item["id"] == "strawberries":  # a blank paper label: no dark print left (the fries' red would count as dark)
                assert ((0.299 * r + 0.587 * g + 0.114 * b) < 90).mean() < 0.01
```

```js
// tests/unit/rigid-assets.test.js
test('the food in the box is the size and height prepare_food.py drew it', async () => {
  const data = JSON.parse(await readFile(new URL('../../assets/food/food.json', import.meta.url), 'utf8'));
  assert.deepEqual(data.items.map((i) => i.id), FOOD.map((f) => f.id));
  data.items.forEach((i, k) => assert.deepEqual([i.size, i.height], [FOOD[k].footprint, FOOD[k].height]));
});
```

- [ ] **Step 2: Run to see them fail**

Run: `python -m pytest tools/tests/test_solids.py tools/tests/test_prepare_food.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'solids'`.

- [ ] **Step 3: Implement the `tools/solids` modules**, then run `python -m pytest tools/tests/test_solids.py -q` until it passes.

- [ ] **Step 4: Find the brand marks and fill in `ITEMS`**

View each photo in `F:\parcel-art` and its background (black, white or grey for `'auto'`; `food-dumplings.png` is `'alpha'`; the sushi tray's dark edges sit on black, so `'u2net'`). Record the fries' "M" box and the strawberry label's box in source pixels in `ITEMS[...].marks`. The tool paints the marks over before cutting out, then maps the boxes to output pixels for `cleaned`.

- [ ] **Step 5: Implement `tools/prepare_food.py` and run it**

Run: `python tools/prepare_food.py F:/parcel-art assets/food`
Expected: five lines like `sushi 208x272 px, 41 + 9 KB`, then `wrote assets/food/food.json`.

Then make a contact sheet in the scratchpad and look at it. Check four things: the edges are clean, the fries packet is plain red, the strawberry label is blank paper, and nothing is distorted. Fix and rerun as needed.

- [ ] **Step 6: Run the tests**

Run: `python -m pytest tools/tests -q && node --test tests/unit/rigid-assets.test.js`
Expected: PASS.

- [ ] **Step 7: Commit** (run `/verify` first)

```bash
git add tools/solids tools/prepare_food.py tools/tests/test_solids.py tools/tests/test_prepare_food.py assets/food tests/unit/rigid-assets.test.js
git commit -m "feat: the food cut out from the owner's photos, without brands"
```

---

### Task 10: The figurine and its clear bag

Needs the owner's pick from Task 1. If they have not picked yet, do Tasks 11 and 12 first (they don't need the picture), then come back.

**Files:**
- Create: `tools/solids/wrap.py`, `tools/prepare_figurine.py`, `tools/tests/test_prepare_figurine.py`
- Create (generated): `assets/figurine/figurine.webp`, `figurine-relief.webp`, `wrap.webp`, `wrap-relief.webp` (each 500 × 1160 px)
- Modify: `tools/clothes/fit.py` (docstring: "the figure in the owner's figurine"), `tests/unit/rigid-assets.test.js`

**Interfaces:**
- Consumes: Task 9's `cutout`, `relief` and `finish` modules.
- Produces:
  - Constants in `prepare_figurine`: `SIZE = (125, 290)` units (= `FIGURINE.footprint`), `PX = 4`, `HEIGHT = 30` (= `FIGURINE.height`), `CLEARANCE = 2` (the bag lies this far over the figure), `FIGURE_LENGTH = 248` (head to sole, as `clothes/fit.py` measures the figure), `MARGIN = (8, 16)` units (sides, ends with seals).
  - `wrap.bag(size_px, figure_alpha, figure_level, seed="wrap") → (rgba uint8, level float [0, 1])`:
    - a pillow outline whose sides bow out 3 units at the middle;
    - crimped seals 10 units deep at both ends (alpha 0.5, a saw-tooth crimp);
    - clear film inside (alpha 0.08–0.14), denser along the edges (0.35) and seeded creases (0.18–0.4);
    - colour `(240, 244, 246)`.
    - Its height, scaled to `HEIGHT + CLEARANCE`, lies at least 0.5 units over the figure's everywhere, with crease ridges on top.
  - CLI: `python tools/prepare_figurine.py <chosen.png> assets/figurine [--turn auto|0|90|-90|180] [--u2net PATH]`. The steps:
    1. Matte: `key_matte` on the border colour, or `u2net_matte` when the border is not plain (std > 12).
    2. `unmix`, then crop.
    3. Turn the long side upright.
    4. Scale the long side to `FIGURE_LENGTH × PX`, or smaller if needed to fit inside the margins.
    5. `match_light`, then `add_grain`; no sharpening.
    6. Centre on the 500 × 1160 canvas.
    7. Relief: radius 12 units, detail 0.15.
    8. The bag.

- [ ] **Step 1: Write the failing tests** (a synthetic wide "figure" on grey, so the owner's image is not needed)

```python
# tools/tests/test_prepare_figurine.py
import numpy as np
from PIL import Image
import prepare_figurine as pf

def figure_png(tmp_path):
    yy, xx = np.mgrid[0:400, 0:900]
    inside = ((xx - 450) / 400) ** 2 + ((yy - 200) / 120) ** 2 <= 1
    rgb = np.where(inside[..., None], (180, 40, 40), (200, 200, 200)).astype(np.uint8)
    path = tmp_path / "chosen.png"
    Image.fromarray(rgb).save(path)
    return path

def run(tmp_path):
    out = tmp_path / "out"
    assert pf.main([str(figure_png(tmp_path)), str(out)]) == 0
    load = lambda name: np.asarray(Image.open(out / name))
    return load("figurine.webp"), load("figurine-relief.webp"), load("wrap.webp"), load("wrap-relief.webp")

def test_a_wide_figure_is_turned_upright_and_sized_to_the_figure_the_clothes_fit(tmp_path):
    figure, *_ = run(tmp_path)
    assert figure.shape[:2] == (1160, 500)
    ys, xs = np.nonzero(figure[..., 3] > 127)
    assert ys.max() - ys.min() > xs.max() - xs.min()
    assert abs((ys.max() - ys.min()) - pf.FIGURE_LENGTH * pf.PX) <= 8

def test_the_figure_lies_inside_the_bag_with_room_for_the_seals(tmp_path):
    figure, *_ = run(tmp_path)
    ys, xs = np.nonzero(figure[..., 3] > 12)
    side, end = (m * pf.PX for m in pf.MARGIN)
    assert xs.min() >= side - 1 and xs.max() <= 500 - side and ys.min() >= end - 1 and ys.max() <= 1160 - end

def test_the_bag_is_clear_film_inside_its_outline_and_denser_at_the_seals(tmp_path):
    _, _, wrap, _ = run(tmp_path)
    alpha = wrap[..., 3] / 255
    assert alpha[0, 0] == 0 and alpha[580, 30] > 0.04 and alpha[580, 250] < 0.5
    assert alpha[: 10 * pf.PX, 60:440].mean() > 1.5 * alpha[500:660, 60:440].mean()

def test_the_bag_lies_over_the_figure_everywhere(tmp_path):
    figure, level, _, wrap_level = run(tmp_path)
    on = figure[..., 3] > 127
    fig_h = level[on] / 255 * pf.HEIGHT
    bag_h = wrap_level[on] / 255 * (pf.HEIGHT + pf.CLEARANCE)
    assert (bag_h >= fig_h + 0.5).all()
```

```js
// tests/unit/rigid-assets.test.js (add)
test("the figurine's pictures are its footprint at 4 px a unit", async () => {
  for (const name of ['figurine', 'figurine-relief', 'wrap', 'wrap-relief']) {
    assert.deepEqual(webpSize(await readFile(new URL(`../../assets/figurine/${name}.webp`, import.meta.url))), FIGURINE.footprint.map((u) => u * 4));
  }
  assert.equal(FIGURINE.height, 30, 'prepare_figurine.HEIGHT');
});
```

```js
// tests/unit/rigid-assets.test.js (add): spec §1 Budget. The garments keep their own 3 MB test.
// BODY_BUDGET is the measured total after this task, rounded up to the next 0.25 MB, and no more than 1.5 MB.
// Write the number into the test with that comment; if the files come out larger, lower the WebP quality instead.
test('the figurine and food pictures together stay within their budget', async () => {
  const data = JSON.parse(await readFile(new URL('../../assets/food/food.json', import.meta.url), 'utf8'));
  const paths = [
    ...data.items.flatMap((i) => [i.texture, i.relief]),
    ...['figurine', 'figurine-relief', 'wrap', 'wrap-relief'].map((n) => `assets/figurine/${n}.webp`),
  ];
  const sizes = await Promise.all(paths.map(async (p) => (await stat(new URL(`../../${p}`, import.meta.url))).size));
  const total = sizes.reduce((a, b) => a + b, 0);
  assert.ok(total <= BODY_BUDGET, `${(total / 2 ** 20).toFixed(2)} MB`);
});
```

(Move `webpSize` out of `clothes-data.test.js` into `tests/unit/webp.js` and import it from both files.)

- [ ] **Step 2: Run to see them fail**

Run: `python -m pytest tools/tests/test_prepare_figurine.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'prepare_figurine'`.

- [ ] **Step 3: Implement `tools/solids/wrap.py` and `tools/prepare_figurine.py`**, then run the Python tests until they pass.

- [ ] **Step 4: Run it on the owner's pick**

Run: `python tools/prepare_figurine.py "<chosen path from the ledger>" assets/figurine`
Expected: four files, each 500 × 1160 px.

Compare a composite (figure, then bag, over the box floor colour) with `F:\parcel-art\option-a.png`: the film should be thin, clear and crinkled, with glossy creases and crimped seals. Tune the bag constants if needed, then rerun the tests.

- [ ] **Step 5: Run the tests**

Run: `python -m pytest tools/tests -q && npm test`
Expected: PASS.

- [ ] **Step 6: Commit** (run `/verify` first)

```bash
git add tools/solids/wrap.py tools/prepare_figurine.py tools/tests/test_prepare_figurine.py tools/clothes/fit.py assets/figurine tests/unit
git commit -m "feat: the owner's figurine in a crinkled clear bag"
```

---

### Task 11: Heightfield meshes and picking a body

**Files:**
- Create: `js/rigid/heightfield.js`, `tests/unit/rigid-heightfield.test.js`

**Interfaces:**
- Produces:
  - `SPACING = 2`.
  - `heightfieldMesh({ footprint: [w, d], height }, sample, spacing = SPACING) → { positions, normals, uv, indices, count }`, in body space:
    - x from −w/2 to w/2 and y from −d/2 to d/2; `cols = ceil(w / spacing) + 1`, and rows likewise;
    - z = `height × sample(u, v)`, with `u = x/w + 0.5` and `v = y/d + 0.5` (v 0 is the back);
    - normals by central differences;
    - `indices` is a `Uint16Array`; throw if `count > 65535`.
  - `modelMatrix(body) → Float32Array(16)`: column-major; turns by `rotate` about z, then moves to `position`.
  - `pickBody({ origin, dir }, body, { alpha, relief }, { steps = 48 } = {}) → { t, point, uv, opacity } | null`. It marches from where the ray enters `z + height` down to `z`. The first sample is inside the footprint, at or under the relief surface, with `alpha(u, v) ≥ 0.5`.

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIGURINE } from '../../js/scene/geometry.js';
import { createBody, withPosition } from '../../js/rigid/body.js';
import { heightfieldMesh, modelMatrix, pickBody } from '../../js/rigid/heightfield.js';

const apply = (m, [x, y, z]) => [0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);

test('a heightfield spans the footprint at its spacing, raised by the relief', () => {
  const mesh = heightfieldMesh({ footprint: [10, 6], height: 4 }, () => 0.5, 2);
  assert.equal(mesh.count, 6 * 4);
  const xs = mesh.positions.filter((_, i) => i % 3 === 0);
  assert.deepEqual([Math.min(...xs), Math.max(...xs)], [-5, 5]);
  assert.ok(mesh.positions.filter((_, i) => i % 3 === 2).every((z) => z === 2));
  assert.equal(mesh.indices.length, 5 * 3 * 6);
});

test('normals point up on flat ground and lean away from a slope', () => {
  const flat = heightfieldMesh({ footprint: [10, 10], height: 4 }, () => 0.5, 2);
  assert.deepEqual([...flat.normals.slice(0, 3)].map((v) => Math.round(v * 1000) / 1000), [0, 0, 1]);
  const ramp = heightfieldMesh({ footprint: [10, 10], height: 4 }, (u) => u, 2);
  assert.ok(ramp.normals[3 * 8] < -0.1, 'rising to the right, the surface faces left');
});

test('the model matrix turns about the centre, then moves the body into place', () => {
  const body = withPosition(createBody({ ...FIGURINE, rotate: 90 }), [10, 20, 3]);
  assert.deepEqual(apply(modelMatrix(body), [1, 0, 0]).map((v) => Math.round(v * 1e6) / 1e6), [10, 21, 3]);
});

test('picking hits the top of an opaque body and misses its clear part', () => {
  const body = withPosition(createBody({ ...FIGURINE, footprint: [40, 40], height: 10, rotate: 0 }), [100, 100, 0]);
  const look = { alpha: (u) => (u < 0.5 ? 0 : 1), relief: () => 1 };
  const down = (x, y) => ({ origin: [x, y, 3000], dir: [0, 0, -1] });
  const hit = pickBody(down(110, 100), body, look);
  assert.ok(hit && Math.abs(hit.point[2] - 10) < 0.5 && Math.abs(hit.t - 2990) < 0.5);
  assert.ok(Math.abs(hit.uv[0] - 0.75) < 0.02);
  assert.equal(pickBody(down(90, 100), body, look), null);
  assert.equal(pickBody(down(200, 100), body, look), null);
});

test("the figurine's meshes fit 16-bit indices", () => {
  assert.ok(heightfieldMesh(FIGURINE, () => 0).count <= 65535);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/unit/rigid-heightfield.test.js`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `js/rigid/heightfield.js`**

- [ ] **Step 4: Run the tests**

Run: `node --test tests/unit/rigid-heightfield.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit** (run `/verify` first)

```bash
git add js/rigid/heightfield.js tests/unit/rigid-heightfield.test.js
git commit -m "feat: heightfield meshes and picking for rigid bodies"
```

---

### Task 12: The rigid controller

**Files:**
- Create: `js/rigid/controller.js`, `tests/unit/rigid-controller.test.js`

**Interfaces:**
- Consumes: Tasks 5–8 and 11 (`createBody`, `withPosition`, `bodyCollider`, `supportOf`, `settle`, `isResting`, `clothOn`, `createRigidHand`, `pickBody`, `setColliders`, `wake`).
- Produces `createRigid({ defs, samplers, world, staticColliders, ray, viewport }) → rigid`:
  - `samplers[i]` is `{ alpha(u, v), relief(u, v) }` in body uv. For the figurine, the bag counts: alpha is 1 wherever the wrap's alpha is over 0.02, and relief is the wrap's relief scaled to `(height + 2) / height`.
  - Getters:
    - `get bodies → Body[]`: the current frozen records;
    - `get supports → number[]`: the support under each body this frame, for the contact shadows;
    - `get heldId → string | null`.
  - Hand:
    - `pick(sight) → { kind: 'rigid', index, id, point, t, uv, opacity } | null`: the nearest body hit;
    - `grab(hit, sx, sy)`, `dragTo(sx, sy)`, `release()`, `drop()`;
    - `carryHome(index, { duration, instant = false }) → Promise<void>`: back to `start`; `instant` puts it there at once.
  - Each frame: `advance(elapsed) → boolean` returns whether any body moved. The held body follows the hand, the rest settle, and `setColliders(world, [...staticColliders, ...colliders()])` runs whenever a body moved. Cloth found by `clothOn` for a body's previous place is woken.
  - Also:
    - `active() → boolean`: something held, carried, falling or disturbed;
    - `disturb()`: something beneath may have changed (cloth moved, or was put somewhere else at once), so the next `advance` re-checks every body's support. The layer calls it whenever the cloth stepped and after `reset` or `clearAside`; otherwise a body whose support vanished while nothing else moved would hang in the air;
    - `reset()`: every body back at its start, resting; drops anything held;
    - `colliders() → object[]`: one `bodyCollider` per body;
    - `status() → [{ id, centre: [x, y, z] (z = base + height/2, rounded), base (z, to 0.1), resting }]`.
  - At creation, the world's colliders become `static + bodies`.

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMesh } from '../../js/cloth/mesh.js';
import { createWorld, setPositions, sleepAll } from '../../js/cloth/solver.js';
import { boxColliders } from '../../js/scene/solids.js';
import { FIGURINE, FOOD, CONTENTS } from '../../js/scene/geometry.js';
import { createRigid } from '../../js/rigid/controller.js';

const ray = (sx, sy) => ({ origin: [sx, sy, 3000], dir: [0, 0, -1] });
const viewport = () => ({ width: 1280, height: 800 });
const DEFS = [FIGURINE, ...FOOD];
const solid = { alpha: () => 1, relief: () => 1 };

function scene({ sheetAt = [-2000, 0, 2.25] } = {}) {
  const mesh = buildMesh({ id: 'sheet', size: [60, 60], grid: { cols: 10, rows: 10, cells: '1'.repeat(100) } });
  const world = createWorld({ garments: [{ mesh, material: { stretchCompliance: 0, bendCompliance: 2e-4, friction: 0.5 } }], bounds: { min: [-3000, -900, 0], max: [1300, 1300, 900] }, thickness: 4.5 });
  setPositions(world, 0, Float32Array.from(mesh.rest, (v, i) => v + [sheetAt[0] - 30, sheetAt[1] - 30, sheetAt[2]][i % 3]));
  sleepAll(world);
  const rigid = createRigid({ defs: DEFS, samplers: DEFS.map(() => solid), world, staticColliders: boxColliders(), ray, viewport });
  return { world, rigid };
}
const run = (rigid, seconds = 2) => { for (let t = 0; t < seconds; t += 1 / 60) rigid.advance(1 / 60); };
const drag = (rigid, id, to) => {
  const at = rigid.bodies.find((b) => b.id === id).position;
  const hit = rigid.pick(ray(at[0], at[1]));
  rigid.grab(hit, at[0], at[1]);
  rigid.dragTo(...to);
  run(rigid, 0.2);
  rigid.release();
  run(rigid);
};

test('at the start every body rests in its place and the cloth world knows its collider', () => {
  const { world, rigid } = scene();
  rigid.bodies.forEach((b, i) => assert.deepEqual(b.position, [...DEFS[i].start, 0]));
  assert.ok(world.colliders.some((c) => c.name === 'body:sushi'));
  assert.equal(rigid.active(), false);
});

test('the pointer picks the food beneath it', () => {
  const { rigid } = scene();
  assert.equal(rigid.pick(ray(170, 56))?.id, 'sushi');
  assert.equal(rigid.pick(ray(300, 56)), null);
});

test('dragging one food item moves it alone, out over the rim onto the table', () => {
  const { rigid } = scene();
  const before = rigid.bodies;
  drag(rigid, 'fries', [720, 150]); // beyond the right flap's tip (x ≤ 557): the table
  rigid.bodies.forEach((b, i) => {
    if (b.id === 'fries') assert.deepEqual(b.position.map(Math.round), [720, 150, 0]);
    else assert.equal(b, before[i], `${b.id} is the very same record`);
  });
});

test('when the cloth beneath is taken away at once, a disturbed body settles straight down', () => {
  const { world, rigid } = scene({ sheetAt: [720, 150, 2.25] }); // on the table, clear of every book and flap
  drag(rigid, 'fries', [720, 150]);
  const onCloth = rigid.bodies.find((b) => b.id === 'fries').position;
  assert.ok(onCloth[2] > 4, `on the cloth at ${onCloth[2]}`);
  setPositions(world, 0, world.pos.map((v, i) => (i % 3 === 0 ? v - 3000 : v)));
  sleepAll(world);
  rigid.disturb();
  assert.equal(rigid.active(), true);
  run(rigid);
  assert.deepEqual(rigid.bodies.find((b) => b.id === 'fries').position, [onCloth[0], onCloth[1], 0]);
  assert.equal(rigid.active(), false);
});

test('let go over another item, food comes to rest on top of it, level', () => {
  const { rigid } = scene();
  drag(rigid, 'dumplings', [170, 210]);
  const d = rigid.bodies.find((b) => b.id === 'dumplings');
  assert.deepEqual(d.position.map(Math.round), [170, 210, FOOD[3].height]);
});

test('restart puts every body back, resting, with nothing held', () => {
  const { rigid } = scene();
  drag(rigid, 'bowl', [320, 80]);
  const hit = rigid.pick(ray(170, 56));
  rigid.grab(hit, 170, 56);
  rigid.dragTo(250, 250);
  rigid.reset();
  assert.equal(rigid.heldId, null);
  rigid.bodies.forEach((b, i) => assert.deepEqual(b.position, [...DEFS[i].start, 0]));
  assert.equal(rigid.active(), false);
});

test('the keyboard brings a body home, onto whatever now lies there', async () => {
  const { rigid } = scene();
  const book = [CONTENTS.book.x + 48, CONTENTS.book.y + 67];
  drag(rigid, 'bowl', book);
  drag(rigid, 'dumplings', [170, 210]);
  const home = rigid.carryHome(DEFS.findIndex((d) => d.id === 'bowl'), { duration: 0.8 });
  run(rigid, 3);
  await home;
  const bowl = rigid.bodies.find((b) => b.id === 'bowl');
  assert.deepEqual(bowl.position.map(Math.round), [170, 210, FOOD[4].height]);
});

test('with reduced motion the move home happens at once and still resolves', async () => {
  const { rigid } = scene();
  drag(rigid, 'bowl', [320, 80]);
  await rigid.carryHome(DEFS.findIndex((d) => d.id === 'bowl'), { instant: true });
  assert.deepEqual(rigid.bodies.find((b) => b.id === 'bowl').position.slice(0, 2), FOOD[3].start);
});

test('cloth lying on a body that is carried away wakes', () => {
  const { world, rigid } = scene({ sheetAt: [170, 56, 12 + 2.25] });
  assert.equal(world.awake[0], 0);
  drag(rigid, 'sushi', [320, 80]);
  assert.equal(world.awake[0], 1, 'the sheet woke (the layer, not the controller, steps the cloth)');
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test tests/unit/rigid-controller.test.js`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `js/rigid/controller.js`**

- [ ] **Step 4: Run the tests**

Run: `node --test tests/unit/rigid-controller.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Commit** (run `/verify` first)

```bash
git add js/rigid/controller.js tests/unit/rigid-controller.test.js
git commit -m "feat: the rigid controller ties the bodies to the hand, the floor and the clothes"
```

---

### Task 13: Drawing the bodies, and wiring them into the site

**Files:**
- Create: `js/gl/common.js`, `js/rigid/render.js`, `js/rigid/load.js`, `tests/e2e/solids.spec.js`
- Modify:
  - `js/cloth/render.js` (import from `js/gl/common.js`; call the rigid renderer; `invalidateShadow`), `js/cloth/layer.js`
  - `js/main.js`, `content/site.js`, `js/scene/parcel.js`, `css/scene.css`, `js/flow.js` (copy)
  - `tests/unit/cloth-render.test.js` (imports)

**Interfaces:**
- `js/gl/common.js` exports what moves out of `js/cloth/render.js` unchanged: `SHADOW_SIZE`, `SHADOW_BIAS`, `DARK`, `PCF` (GLSL), `RELIEF_NORMAL` (the GLSL `relief(n)` function and its uniforms), `compile`, `createProgram`, `createTexture`, `createReliefTexture`, `vertexBuffer`.
- `createRigidRenderer(gl, { parts }) → { setPlacements(bodies, supports), castShadow(light), drawContact(frame), drawSolid(frame), drawWrap(frame) }`:
  - `parts[i]` = `{ mesh, image, relief, reliefTexel, sheen, power, wrap?: { mesh, image, relief, reliefTexel } }`.
  - `frame` = `{ view, light, eye, level }`, with the shadow map bound on texture unit 1.
  - Gloss: the figurine `sheen 0.45, power 40`; food `0.12, 24`; the wrap, like the old film, `0.9, 80`.
  - Contact shadow: a quad over the footprint grown by `1.5 + 0.25 × lift` units, at `support + 0.15`, with alpha `0.55 / (1 + lift / 15)` and a soft rounded-rectangle falloff. Here `lift = z − support`.
- `createRenderer(gl, { meshes, looks, occluders, rigid = null })` keeps `update` and `draw`, and adds `invalidateShadow()`. The draw order is: shadow map (cloth, then `rigid.castShadow`), occluders, `rigid.drawContact`, cloth, `rigid.drawSolid`, `rigid.drawWrap`. The wrap pass is blended with no depth writes.
- `loadSolids({ figurine, food }) → Promise<{ defs, images, reliefs, wraps, samplers }>`: `defs` in the order `FIGURINE, ...FOOD`, with the ids checked against the config. It throws a clear `Error` naming the first missing or unloadable file.
- `createClothes({ canvas, camera, reducedMotion, solids })`, where `solids = { figurine: config.figurine, food: config.food }`. The layer adds:
  - Bodies:
    - `rigidEnabled: boolean`: false, with a `console.warn`, when the rigid assets fail; the clothes still work.
    - `solids: [{ id, label }]`
    - `bodies: [{ id, label, kind: 'garment'|'figurine'|'food' }]`: garments first, then the rigid bodies.
  - Hand:
    - `pickAt(sx, sy) → { kind: 'cloth'|'rigid', index, id, point, t, uv, opacity } | null`: the nearer of the cloth and rigid hits;
    - `grab(hit)`: dispatches on `kind`.
  - Also:
    - `moveBodyHome(index) → Promise<void>`: honours `reducedMotion()`;
    - `screenBox(i)` and `bodyScreen(id, [u, v])`: `i` indexes `bodies`. `bodyScreen` projects the body's top at (u, v), using the same relief that picking uses;
    - `status().rigid: [{ id, centre, base, resting, overBook }]` and `status().heldBody`;
    - `onLost(fn)`: `fn(true | false)` when the context is lost or restored.
  - Wiring rules inside the layer:
    - `active()` includes `rigid.active()`, and the tick calls `rigid.advance(elapsed)` before the cloth steps;
    - `rigid.disturb()` runs after every tick in which the cloth stepped, and in `place()`;
    - `reset()` also calls `rigid.reset()`; after a body moves, `renderer.invalidateShadow()`;
    - rigid textures upload at `textureScale(4, need)`, like the garments.
- `content/site.js`: `photo` is replaced by the following.

```js
  /** You as a small painted figurine in a clear bag, along the left wall (tools/prepare_figurine.py makes these files). */
  figurine: {
    src: 'assets/figurine/figurine.webp',
    relief: 'assets/figurine/figurine-relief.webp',
    wrap: 'assets/figurine/wrap.webp',
    wrapRelief: 'assets/figurine/wrap-relief.webp',
    // A plain description of what is visible. Reword it in your own voice, then remove "[Draft — check this]".
    alt: '[Draft — check this] A small painted figure of a person in a red top and blue floral skirt, leaning back on their hands, sealed in a crinkled clear plastic bag.',
  },
  /** Food beside the figurine, each piece loose (tools/prepare_food.py). Ids match FOOD in js/scene/geometry.js. */
  food: [
    { id: 'sushi', src: 'assets/food/sushi.webp', relief: 'assets/food/sushi-relief.webp', alt: '[Draft — check this] A tray of sushi.' },
    { id: 'fries', src: 'assets/food/fries.webp', relief: 'assets/food/fries-relief.webp', alt: '[Draft — check this] A red packet of fries.' },
    { id: 'strawberries', src: 'assets/food/strawberries.webp', relief: 'assets/food/strawberries-relief.webp', alt: '[Draft — check this] A punnet of strawberries.' },
    { id: 'bowl', src: 'assets/food/bowl.webp', relief: 'assets/food/bowl-relief.webp', alt: '[Draft — check this] A bowl of yogurt with fruit.' },
    { id: 'dumplings', src: 'assets/food/dumplings.webp', relief: 'assets/food/dumplings-relief.webp', alt: '[Draft — check this] A plate of dumplings.' },
  ],
```

Check each draft alt against the actual picture before committing.

- `parcel.js` `buildSolids() → { figurine: { el, img, wrap }, food: { [id]: { el, img } } }`: `.solid[data-id="<id>"]` elements holding a `.solid-img` (and, for the figurine, a `.solid-wrap`), at the start places, with a `drop-shadow` along `castShadow(height)` and darkened with `--light` like the old pack.
- `main.js`:
  - sets their `src` and `alt`;
  - toggles `.is-handed-over` on them while `clothes.rigidEnabled && visible && !lost`;
  - `reportPlaceholders` checks `figurine.alt` and every `food[].alt`;
  - `__parcel.pick` and `hit` use `hit.id`; `garmentBox(id)` works for every body; `bodyScreen(id, uv)` and `clearAside()` are new test hooks.
- `flow.js`, when looking down into the box:
  - with clothes: 'Looking down into the box: a figurine in a plastic bag, some food, a pile of clothes, some books, and something underneath.'
  - without: 'Looking down into the box: a figurine in a plastic bag, some food, a few books and a little booklet.'

- [ ] **Step 1: Write the failing e2e tests** (`tests/e2e/solids.spec.js`)

```js
import { test, expect } from '@playwright/test';
import { openSite, waitForState } from './helpers.js';
import { waitForSettled, pointOn, pixelAt } from './clothes-helpers.js';

const IDS = ['figurine', 'sushi', 'fries', 'strawberries', 'bowl', 'dumplings'];

test('the figurine and every food item are drawn and can be picked up', async ({ page }) => {
  await openSite(page, '?jump=overhead');
  await waitForState(page, 'overhead');
  await waitForSettled(page);
  for (const id of IDS) {
    const p = await pointOn(page, id);
    expect(p, `${id} can be picked`).not.toBeNull();
    const [, , , a] = await pixelAt(page, p.x, p.y);
    expect(a, `${id} is drawn`).toBeGreaterThan(200);
  }
});

test('without WebGL2 the figurine and the food lie still as pictures, fully visible', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : original.call(this, type, ...rest); };
  });
  await openSite(page, '?jump=overhead');
  await waitForState(page, 'overhead');
  for (const id of IDS) {
    const img = page.locator(`.solid[data-id="${id}"] .solid-img`);
    await expect(img).toHaveCount(1);
    expect(await img.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);
    expect(await img.evaluate((el) => getComputedStyle(el.closest('.solid')).opacity)).toBe('1');
    expect(await img.getAttribute('alt')).not.toBe('');
  }
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx playwright test tests/e2e/solids.spec.js --workers=1`
Expected: FAIL. No body `figurine` can be picked, and there is no `.solid` element.

- [ ] **Step 3: Extract `js/gl/common.js`, a pure move**

Run: `npm test && npx playwright test tests/e2e/clothes.spec.js --workers=1 --project=desktop`
Expected: PASS, with nothing drawn differently.

- [ ] **Step 4: Implement** `js/rigid/load.js`, `js/rigid/render.js`, the `js/cloth/render.js` hooks, the `js/cloth/layer.js` wiring (keep it under 800 lines; anything that pushes it over goes into a `js/rigid/` helper), `main.js`, `site.js`, `parcel.js`, `scene.css` and `flow.js`.

- [ ] **Step 5: Run the tests**

Run: `npm test`, then `npx playwright test tests/e2e/solids.spec.js --workers=1`, then `npx playwright test tests/e2e/clothes.spec.js --workers=1`.
Expected: PASS for both projects.

- [ ] **Step 6: Look at it**

Run: `node tools/shots.mjs http://127.0.0.1:4173/ shots` and open the overhead shots. Check four things:
- the figurine reads as a solid painted figure, shaded and glossy, under thin crinkled film;
- the food is unwrapped, with soft contact shadows;
- everything is lit from the upper left, like the clothes;
- nothing floats or sinks.

- [ ] **Step 7: Commit** (run `/verify` first)

```bash
git add js css content tests/e2e/solids.spec.js tests/unit/cloth-render.test.js
git commit -m "feat: draw the figurine in its bag and the loose food in the WebGL layer"
```

---

### Task 14: The keyboard and the booklet

**Files:**
- Modify: `js/cloth/keyboard.js`, `js/cloth/layer.js` (`coverage()` counts the bodies; `overBook`)
- Test: `tests/e2e/solids.spec.js`

**Interfaces:**
- Consumes: `clothes.solids`, `clothes.moveBodyHome(index)`, `status().rigid[k].overBook` (Task 13), and `bookCoverage(world, CONTENTS.book, { solids })` (Task 8).
- Produces:
  - `createClothesKeys` also makes one button per rigid body, labelled with `text.moveAside` (for example "Move the fruit bowl aside"). A rigid body's button shows only while `overBook`. Pressing it calls `clothes.moveBodyHome(k)` and announces `text.movedAside`.
  - All shown buttons are in tab order from the top of the pile down: garment centre z, or a body's centre z.
- `overBook`: the body's footprint overlaps the booklet's (`fromRect({ ...CONTENTS.book, id: 'booklet' }, 0.6)`), and its base is at or above the cover top minus 1.

- [ ] **Step 1: Write the failing e2e tests** (add to `solids.spec.js`)

A single food item covers only about 10 % of the cover, under the provisional 35 % unlock rule. The figurine, pressed against the right wall, covers about 58 %.

```js
test('the figurine laid over the booklet keeps it locked; its keyboard button takes it home', async ({ page }) => {
  await openSite(page, '?jump=clear');
  await waitForState(page, 'overhead');
  await waitForSettled(page);
  expect((await clothesOf(page)).reachable).toBe(true);
  const figurine = await pointOn(page, 'figurine');
  const book = await page.locator('.book-top').boundingBox();
  await dragMouse(page, figurine, { x: book.x + book.width, y: figurine.y });
  await waitForSettled(page);
  expect((await clothesOf(page)).reachable, 'the figurine covers the booklet').toBe(false);
  const key = page.getByRole('button', { name: 'Move the figurine aside' });
  await key.focus();
  await page.keyboard.press('Enter');
  await waitForSettled(page);
  const status = await clothesOf(page);
  const [x, y] = status.rigid.find((b) => b.id === 'figurine').centre;
  expect(Math.abs(x - 68.5)).toBeLessThanOrEqual(1);
  expect(Math.abs(y - 150)).toBeLessThanOrEqual(1);
  expect(status.reachable).toBe(true);
});

test('a food item over the booklet gets its own keyboard button', async ({ page }) => {
  await openSite(page, '?jump=clear');
  await waitForState(page, 'overhead');
  await waitForSettled(page);
  await expect(page.getByRole('button', { name: 'Move the fruit bowl aside' })).toBeHidden();
  const book = await page.locator('.book-top').boundingBox();
  await dragMouse(page, await pointOn(page, 'bowl'), { x: book.x + book.width / 2, y: book.y + book.height / 2 });
  await waitForSettled(page);
  await expect(page.getByRole('button', { name: 'Move the fruit bowl aside' })).toHaveCount(1);
});
```

(Change the imports to `clothesOf, waitForSettled, pointOn, dragMouse, pixelAt`.)

- [ ] **Step 2: Run to see it fail**

Run: `npx playwright test tests/e2e/solids.spec.js --workers=1 -g "keyboard"`
Expected: FAIL. The booklet stays reachable under the bowl, and there is no such button.

- [ ] **Step 3: Implement** the coverage solids in the layer and the rigid buttons in `keyboard.js`.

- [ ] **Step 4: Run the tests**

Run: `npx playwright test tests/e2e/solids.spec.js --workers=1`, then `npx playwright test tests/e2e/access.spec.js --workers=1`.
Expected: PASS.

- [ ] **Step 5: Commit** (run `/verify` first)

```bash
git add js/cloth/keyboard.js js/cloth/layer.js tests/e2e/solids.spec.js
git commit -m "feat: food on the booklet keeps it closed, and the keyboard can move it home"
```

---

### Task 15: Acceptance checks and screenshots for the owner

**Files:**
- Modify: `tests/e2e/solids.spec.js`, `tests/e2e/clothes.spec.js` (restart covers the bodies), `tests/e2e/assets.spec.js` (food and figurine files load), `tests/e2e/journey.spec.js` (figurine in the box), `tools/shots.mjs`

**Interfaces:**
- Consumes: the `__parcel` hooks from Task 13 (`pick`, `hit`, `garmentBox`, `bodyScreen`, `clearAside`, `clothes().rigid`).

- [ ] **Step 1: Write the acceptance tests** (each must fail first if its behaviour is broken; check one by breaking the code temporarily, e.g. by not skipping the held body in the resting step)

```js
const FOODS = ['sushi', 'fries', 'strawberries', 'bowl', 'dumplings'];
const rigidOf = (status, id) => status.rigid.find((b) => b.id === id);
async function overhead(page, jump = 'overhead') {
  await openSite(page, `?jump=${jump}`);
  await waitForState(page, 'overhead');
  await waitForSettled(page);
}
async function bookletMiddle(page) {
  const book = await page.locator('.book-top').boundingBox();
  return { x: book.x + book.width / 2, y: book.y + book.height / 2 };
}

test('each food item dragged alone moves only itself', async ({ page }) => {
  await overhead(page);
  for (const id of FOODS) {
    const before = await clothesOf(page);
    const from = await pointOn(page, id);
    await dragMouse(page, from, { x: from.x + 60, y: from.y });
    await waitForSettled(page);
    const after = await clothesOf(page);
    expect(rigidOf(after, id).centre, `${id} moved`).not.toEqual(rigidOf(before, id).centre);
    after.rigid.filter((b) => b.id !== id).forEach((b) => expect(b.centre, `${b.id} stayed`).toEqual(rigidOf(before, b.id).centre));
    after.garments.forEach((g, k) => expect(g.centre, `${g.id} stayed`).toEqual(before.garments[k].centre));
  }
});

test('food dropped on the clothes rests on them; dropped past the front wall it lies outside the box', async ({ page }) => {
  await overhead(page);
  const middle = await bookletMiddle(page);
  await dragMouse(page, await pointOn(page, 'strawberries'), middle);
  await waitForSettled(page);
  expect(rigidOf(await clothesOf(page), 'strawberries').base, 'above the cover and a layer of cloth').toBeGreaterThan(0.6 + 8 + 4.5);
  expect(await page.evaluate(([x, y]) => window.__parcel.pick(x, y), [middle.x, middle.y])).toBe('strawberries');

  // past the front wall: on the open front flap, or on the table where the screen shows it (phone)
  const viewport = page.viewportSize();
  const out = await page.evaluate(() => window.__parcel.project([210, 380, 0]));
  await dragMouse(page, await pointOn(page, 'dumplings'), { x: out.x, y: Math.min(out.y, viewport.height - 30) });
  await waitForSettled(page);
  const dumplings = rigidOf(await clothesOf(page), 'dumplings');
  expect(dumplings.centre[1], 'outside the box').toBeGreaterThan(300);
  expect(dumplings.resting).toBe(true);
});

test('the figurine moves as one rigid piece and stays inside the box', async ({ page }) => {
  await overhead(page, 'clear');
  const box = await page.evaluate(() => window.__parcel.garmentBox('figurine'));
  const probes = [[0.5, 0.3], [0.5, 0.5], [0.4, 0.7]].map(([u, v]) => ({ x: box.left + box.width * u, y: box.top + box.height * v }));
  const before = await Promise.all(probes.map((p) => page.evaluate(([x, y]) => window.__parcel.hit(x, y), [p.x, p.y])));
  before.forEach((h) => expect(h?.id).toBe('figurine'));
  await dragMouse(page, probes[1], { x: probes[1].x + 100, y: probes[1].y });
  await waitForSettled(page);
  for (const h of before) {
    const at = await page.evaluate((uv) => window.__parcel.bodyScreen('figurine', uv), h.uv);
    const again = await page.evaluate(([x, y]) => window.__parcel.hit(x, y), [at.x, at.y]);
    expect(again?.id).toBe('figurine');
    again.uv.forEach((c, k) => expect(Math.abs(c - h.uv[k]), 'the same spot on the figure').toBeLessThan(0.02));
  }
  const [x] = rigidOf(await clothesOf(page), 'figurine').centre;
  expect(x).toBeGreaterThan(75);
  expect(x + 62.5).toBeLessThanOrEqual(418);
});

test('pulled out from under food, the clothes let it settle straight down', async ({ page }) => {
  await overhead(page);
  await dragMouse(page, await pointOn(page, 'sushi'), await bookletMiddle(page));
  await waitForSettled(page);
  const onPile = rigidOf(await clothesOf(page), 'sushi');
  await page.evaluate(() => window.__parcel.clearAside());
  await waitForSettled(page);
  const after = rigidOf(await clothesOf(page), 'sushi');
  expect(after.base).toBeLessThan(onPile.base - 2);
  expect(after.centre.slice(0, 2)).toEqual(onPile.centre.slice(0, 2));
  expect(after.resting).toBe(true);
});

test('restarting mid-drag puts every body back where it started', async ({ page }) => {
  await overhead(page);
  const start = Object.fromEntries((await clothesOf(page)).rigid.map((b) => [b.id, b.centre]));
  const bowl = await pointOn(page, 'bowl');
  await dragMouse(page, bowl, { x: bowl.x + 50, y: bowl.y - 40 });
  await waitForSettled(page);
  const fries = await pointOn(page, 'fries');
  await dragMouse(page, fries, { x: fries.x + 40, y: fries.y + 30 }, { release: false });
  expect((await clothesOf(page)).heldBody).toBe('fries');
  await page.locator('#restart').dispatchEvent('click'); // the mouse stays down on the fries
  await waitForState(page, 'sealed');
  const status = await clothesOf(page);
  expect(status.heldBody).toBeNull();
  status.rigid.forEach((b) => expect(b.centre, b.id).toEqual(start[b.id]));
});
```

Update the imports to `openSite, waitForState` and `clothesOf, waitForSettled, pointOn, dragMouse, pixelAt`.

- [ ] **Step 2: Run each spec on its own**

Run, one at a time: `npx playwright test tests/e2e/<spec> --workers=1` for `solids.spec.js`, `clothes.spec.js`, `assets.spec.js`, `journey.spec.js`, `access.spec.js`, `cutting.spec.js`, `projection.spec.js`.
Expected: all PASS on desktop and phone. A failure here is a defect in the code: use systematic debugging and don't loosen the test.

- [ ] **Step 3: Screenshots**

Update `tools/shots.mjs` so that it saves, per view:
- `<view>-overhead.png`;
- `<view>-figurine.png`, a close-up clipped to `garmentBox('figurine')`;
- `<view>-books.png`, clipped to the four books;
- on desktop, `desktop-food-held.png`, with the bowl held mid-drag over the clothes.

Run: `node tools/shots.mjs http://127.0.0.1:4173/ shots`
Expected: seven PNGs in `shots/`, which is git-ignored.

- [ ] **Step 4: Commit** (test-only and tool changes; `/verify` is not needed for the test files, but run it because `tools/shots.mjs` changed)

```bash
git add tests/e2e tools/shots.mjs
git commit -m "test: drag, rest and rigid checks for the figurine and the food"
```

- [ ] **Step 5: Show the owner**

Tell the owner where the screenshots are, and ask about four things:
- whether the figurine looks like a real painted collectible;
- whether the bag reads like option A;
- whether the books look thick;
- whether the draft alt texts and the food labels ("fruit bowl") suit them.

---

### Task 16: Documentation

**Files:**
- Modify: `README.md`, `assets/photo/README.txt` (or delete it if `assets/photo/` is now empty apart from it), `docs/superpowers/specs/2026-10-21-figurine-food-books-design.md` (status line)

- [ ] **Step 1: Update the README**

- Replace section 4 "Your vacuum pack" with "Your figurine and the food", covering:
  - the `.env` key, kept outside the repo and never committed;
  - the Task 1 prompt and the candidate step;
  - `python tools/prepare_figurine.py <chosen.png> assets/figurine` and `python tools/prepare_food.py <folder> assets/food`, and what each writes;
  - how the marks are painted out;
  - the draft alt texts in `content/site.js`.
- `npm run clothes`: the pile now settles around the figurine and the food.
- Checklist: reword the figurine and food alts.
- The tech table: rigid bodies drawn as heightfields; the 14° overhead view; book shadows.
- Credits: the figurine is generated from the owner's photo with an image model and finished by `tools/prepare_figurine.py`; the food comes from the owner's photos.
- Remove every mention of `prepare_pack.py`, `pack_body.py` and `CONTENTS.pack`.

- [ ] **Step 2: Mark the spec implemented**

Change its status line to `Status: approved and implemented (plan docs/superpowers/plans/2026-10-22-figurine-food-books.md)`.

- [ ] **Step 3: Check that no secret or private path slipped in**

Run: `git grep -n -i "sk-or-\|OPENROUTER_API_KEY=" -- . ':!docs/superpowers' ; git grep -n "figure.jpg" -- assets js css content`
Expected: no output. The README may name `.env` and `OPENROUTER_API_KEY` as the variable, but never a value.

- [ ] **Step 4: Commit**

```bash
git add README.md assets/photo docs/superpowers/specs/2026-10-21-figurine-food-books-design.md
git commit -m "docs: the figurine, the food and the books"
```

After the last task, the branch gets its final whole-branch review and then goes to finishing-a-development-branch. Pushing to `main` needs the owner's explicit yes.
