# Clothes Pile, Photo, Desiccant and IKEA-style Booklet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the owner's photo print, a brand-free desiccant packet and a draggable, simulated pile of clothes into the parcel, with an IKEA-style booklet that can only be opened once the clothes are moved off it.

**Architecture:**
- The CSS-3D box stays as it is. Clothes are drawn on a WebGL2 canvas inside `.stage`, above the 3D scene.
- Its camera matrix reproduces the CSS camera, so the two layers line up. The box parts are drawn depth-only, so they hide clothes behind them, and they also receive the clothes' shadows.
- Garments are XPBD cloth sheets (ported from Ten Minute Physics, MIT). A Node tool settles the starting pile ahead of time.

**Tech stack:**
- Vanilla ES modules, no build step; WebGL2.
- `node --test` for unit tests, Playwright (installed Chrome) for e2e.
- Python 3 + Pillow for the art.

**Spec:** `docs/superpowers/specs/2026-10-11-clothes-pile-design.md`

## Global Constraints

- Static site on GitHub Pages: relative paths only, no leading `/`, no bundler. Every new file must be served as-is.
- Never invent biography. The book text stays in clearly marked `[Placeholder — …]` slots, and the photo's alt text is flagged as a draft.
- No brand logos or names on the clothes. No IKEA name or logo, and no IKEA fonts.
- The desiccant packet is redrawn without "DDC" or "ddc.nl".
- Never commit `.omc/` or `__pycache__/`.
- Commits use conventional types and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Run `/verify` before code commits (not for docs-only or test-only commits).
- Immutability where practical. Exception: the simulation's hot loops mutate typed arrays that the solver owns, which is documented in `solver.js`.
- Files stay under 400 lines where possible (800 max), and functions under 50 lines.
- Pure modules (`projection`, `geometry`, `cloth/mesh|hash|solver|pick|coverage`) never touch the DOM, so they run in Node.
- Unit coverage stays at 80 %+ lines.
- Parcel units: x 0…420 (left → right), y 0…300 (back → front), z up. The floor and the table are both z = 0, and the walls are 220 high.

## Review Focus

1. **A garment flung hard** at a wall or off screen must not tunnel through the walls or vanish forever. It lands on the flaps or the table, inside the world bounds. → solver test "fast particle does not pass through a wall slab" + "world bounds clamp" (Task 7).
2. **Pointer lost mid-drag** (`pointercancel`, leaving the window, a second finger) must release the garment cleanly, with no stuck grip. → e2e "pointercancel releases the garment" + "a second pointer is ignored" (Task 14).
3. **Restart while a garment is held or still falling** must give a sealed parcel, the packed pile and no errors. → e2e "restart mid-drag" (Task 14).
4. **A resize or rotation mid-drag** must keep the grip following the finger. → e2e "resize during a drag" (Task 14).
5. **A long pause** (hidden tab, a debugger stop) must not make the cloth explode when it resumes. → solver test "huge dt is clamped" (Task 7).

---

## File map

| File | Status | Responsibility |
|------|--------|----------------|
| `tools/prepare_photo.py` | new | Crop `CXY.png` to the plastic sheet → `assets/photo/vacuum-collage.webp` |
| `tools/generate_props.py` | new | Desiccant packet → `assets/art/desiccant.webp` |
| `tools/generate_clothes.py` | new | Garment textures `assets/clothes/*.webp` + `assets/clothes/garments.json` |
| `tools/build-pile.mjs` | new | Settle the pile in Node → `assets/clothes/pile.json` |
| `assets/manual/*.svg` | new | Line drawings for the booklet |
| `assets/art/manual-cover.svg`, `manual-endpaper.svg` | new | Booklet cover and inside cover |
| `assets/ui/hand-open.svg/.png`, `hand-closed.svg/.png` | new | Grab cursors |
| `assets/fonts/noto-sans-latin-{400,700}-normal.woff2`, `OFL-NotoSans.txt` | new | Booklet typeface |
| `js/scene/geometry.js` | modify | Layout (`CONTENTS`), open-flap angles, `flapCorners()`, `boxColliders()`, `occluderQuads()` |
| `js/scene/projection.js` | new | `cameraMatrix()`, `projectPoint()`, `screenRay()` |
| `js/scene/camera.js` | modify | `frame()` getter, `onChange(fn)` |
| `js/scene/parcel.js` | modify | Print card, desiccant, flap probes, CSS vars for the open angles, thin booklet |
| `js/cloth/mesh.js` | new | `buildMesh(garment, spacing)` |
| `js/cloth/hash.js` | new | `createHash(spacing, maxCount)` |
| `js/cloth/solver.js` | new | `createWorld()`, `step()`, grab API, sleeping |
| `js/cloth/pick.js` | new | `pick(world, meshes, ray, alphaAt)` |
| `js/cloth/coverage.js` | new | `bookCoverage()`, `isBookUncovered()` |
| `js/cloth/render.js` | new | WebGL2 programs and drawing |
| `js/cloth/layer.js` | new | Load data, own world + renderer + rAF loop; public `clothes` API |
| `js/cloth/interaction.js` | new | Pointer/touch drag, hover cursor, click suppression |
| `js/cloth/keyboard.js` | new | Per-garment buttons, scripted "move aside" |
| `js/book/markdown.js` | modify | Step numbering (`block.number`), quantity items |
| `js/book/book-render.js` | modify | Manual heading/note/list markup, parts endpaper |
| `js/flow.js`, `js/main.js` | modify | Wire clothes into reveal/open/restart/jump; hint; `__parcel.clothes()` |
| `css/scene.css`, `css/book.css`, `css/base.css`, `index.html` | modify | Print card, desiccant, canvas, cursors, hint, manual styles, fonts |
| `content/site.js`, `content/book.md` | modify | New paths/texts; manual outline |
| `tests/unit/*.test.js` | new/modify | See each task |
| `tests/e2e/clothes.spec.js` + existing specs | new/modify | See Task 14 |
| `README.md`, `docs/design.md` | modify | Make-it-yours + architecture |

---

### Task 1: Photo print, desiccant, floor layout

**Files:**
- Create: `tools/prepare_photo.py`, `tools/generate_props.py`, `assets/photo/vacuum-collage.webp`, `assets/art/desiccant.webp`
- Modify: `js/scene/geometry.js` (`CONTENTS`), `js/scene/parcel.js` (`buildPhoto`, new `buildDesiccant`), `css/scene.css` (print card, desiccant), `content/site.js` (`photo`, `art.desiccant`), `js/main.js` (`FALLBACK.desiccant`, preload, `src`)
- Test: `tests/unit/geometry.test.js`, `tests/e2e/assets.spec.js`

**Interfaces:**
- Produces: `CONTENTS.photo = {x:22,y:34,width:152,height:230,rotate:-6}`, `CONTENTS.book = {x:190,y:28,width:164,height:228,thickness:8,rotate:4}`, `CONTENTS.desiccant = {x:368,y:232,width:42,height:60,thickness:3,rotate:-12}`; `scene.desiccant` (img element).

- [ ] **Step 1: Failing test** — append to `tests/unit/geometry.test.js`:

```js
import { CONTENTS, BOX } from '../../js/scene/geometry.js';

const footprint = ({ x, y, width, height, rotate }) => {
  const a = (rotate * Math.PI) / 180;
  const hx = Math.abs(width / 2 * Math.cos(a)) + Math.abs(height / 2 * Math.sin(a));
  const hy = Math.abs(width / 2 * Math.sin(a)) + Math.abs(height / 2 * Math.cos(a));
  const cx = x + width / 2;
  const cy = y + height / 2;
  return { left: cx - hx, right: cx + hx, top: cy - hy, bottom: cy + hy };
};

test('photo, booklet and desiccant lie inside the walls without overlapping', () => {
  const inner = { left: 2, right: BOX.width - 2, top: 2, bottom: BOX.depth - 2 };
  const boxes = ['photo', 'book', 'desiccant'].map((k) => footprint(CONTENTS[k]));
  boxes.forEach((b) => {
    assert.ok(b.left >= inner.left && b.right <= inner.right && b.top >= inner.top && b.bottom <= inner.bottom);
  });
  const [photo, book] = boxes;
  assert.ok(photo.right < book.left, 'the photo stays clear of the booklet');
  assert.ok(CONTENTS.photo.x + CONTENTS.photo.width / 2 < BOX.width / 2, 'the photo is on the left');
});
```

- [ ] **Step 2:** `npm test` → FAIL (`CONTENTS.desiccant` undefined).
- [ ] **Step 3:** Update `CONTENTS` in `geometry.js` with the values above.
- [ ] **Step 4: Prepare the photo.** Write `tools/prepare_photo.py`:
  - find the bounding box of pixels with any channel below 245;
  - pad by 8 px and crop;
  - resize to 900 px tall (LANCZOS) and save WebP at quality 84.
  - Run: `python tools/prepare_photo.py "F:/CXY.png" assets/photo/vacuum-collage.webp`. Expect a portrait image with a 0.6–0.7 aspect ratio.
- [ ] **Step 5: Desiccant.** Write `tools/generate_props.py`. It draws at 4 px/unit (168 × 240 px):
  - an off-white packet (`#f4f4f1`) with slightly pinched long sides;
  - crimped seal bands (embossed square grid) at the top and bottom 14 %;
  - black Arial text, horizontally centred and repeated: `SILICA GEL`, `"DO NOT EAT"`, `THROW AWAY`, `DESICCANT`;
  - soft vertical paper-crease shading;
  - an alpha edge, saved as WebP with alpha. No logo, no URL.
- [ ] **Step 6: Wire it up.**
  - `parcel.js`: `buildPhoto` adds the class `photo-card print`; new `buildDesiccant()` returns `<img class="desiccant" alt="" draggable="false">`, positioned with `left/top/width/height` and `--rot`.
  - `scene.css`:
    - `.photo-card.print .photo-frame { padding: 5px; }`;
    - `.photo-card.print .photo-img { filter: none; }`;
    - `.desiccant { position:absolute; transform: translateZ(1.2px) rotate(var(--rot)); filter: drop-shadow(1px 2px 2px rgba(30,18,8,.35)); }`.
  - `site.js`: `photo.src = 'assets/photo/vacuum-collage.webp'`; the alt text is `'[Draft — check this] A collage: a person in a red top and blue floral skirt lies under crinkled clear plastic, as if vacuum-packed, surrounded by sushi, fries, strawberries, a fruit-and-yogurt bowl and dumplings.'`; `art.desiccant = 'assets/art/desiccant.webp'`.
  - `main.js`: `FALLBACK.desiccant = 'assets/art/desiccant.webp'`, preloaded through `imagePlan`, and `scene.desiccant.src = resolved.desiccant`.
  - `reportPlaceholders` treats an alt that starts with `[` as pending (it already does).
- [ ] **Step 7:** Add an e2e assertion to `tests/e2e/assets.spec.js`: on `?jump=overhead`, `.photo-img` has loaded `vacuum-collage.webp` (`naturalWidth > 0`) and `.desiccant` has loaded.
- [ ] **Step 8:** `npm test` passes. Take an overhead screenshot (scratchpad `shoot.mjs`) and look at it.
- [ ] **Step 9:** `/verify`, then commit `feat: photo print and desiccant packet on the box floor`.

### Task 2: IKEA-style booklet

**Files:**
- Create: `assets/fonts/noto-sans-latin-400-normal.woff2`, `noto-sans-latin-700-normal.woff2`, `OFL-NotoSans.txt` (from `npm pack @fontsource/noto-sans`); `assets/art/manual-cover.svg` (360 × 500); `assets/art/manual-endpaper.svg` (360 × 500); `assets/manual/{figure-wave,figure-read,figure-think,figure-phone,two-people,parts,check,cross}.svg`
- Modify: `js/book/markdown.js`, `js/book/book-render.js`, `css/book.css`, `css/base.css` (`@font-face`, `--font-manual`), `css/scene.css` (thin white booklet), `index.html` (font preloads), `content/book.md`, `content/site.js` (`bookCover`, `endpaper`), `js/main.js` (`FALLBACK`, `fontsTask`)
- Test: `tests/unit/markdown.test.js`, `tests/unit/book-art.test.js` (new)

**Interfaces:**
- Produces:
  - heading blocks gain `number` for level 2: `{type:'heading', level:2, html, number}`, counted across the whole book;
  - list items stay HTML strings, and the renderer detects a leading `N×`.

- [ ] **Step 1: Failing tests** in `tests/unit/markdown.test.js`:

```js
test('## headings are numbered as manual steps across pages', () => {
  const { sections } = parseBook('# Parts\n\n## Unpack\n\n---\n\n## Read\n\n### Aside');
  const headings = sections.flat().filter((b) => b.type === 'heading');
  assert.deepEqual(headings.map((h) => [h.level, h.number ?? null]), [[1, null], [2, 1], [2, 2], [3, null]]);
});
```

And in `tests/unit/book-art.test.js`: the cover and endpaper configured in `site.js` exist, are SVGs with a 360:500 viewBox, contain no "IKEA" (case-insensitive) and no "placeholder" text, and every `assets/manual/*.svg` referenced in `content/book.md` exists.

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3: Numbering.** In `parseBook`, number level-2 headings with a running counter across sections, without mutating blocks:

```js
let step = 0;
const sections = raw.map((blocks) => blocks.map((b) => (
  b.type === 'heading' && b.level === 2 ? { ...b, number: (step += 1) } : b)));
```

- [ ] **Step 4: Renderer.**
  - Headings: `h${level}` with class `manual-heading`. Level 2 renders `<span class="step-number">${number}</span><span class="step-title">…</span>`.
  - Notes: `p.note` with an `aria-hidden` `<span class="note-icon">!</span>`.
  - List items whose HTML matches `/^(\d+)\s*[×x]\s+/` render `<span class="qty">N×</span>` plus the rest.
  - `buildEndpaper` renders `.parts-label` (owner line + name).
  - The `hand` classes are removed from book markup, except for `==inline==` spans, which the CSS styles as bold sans.
- [ ] **Step 5: Styles.**
  - `book.css`: white paper (`#fcfcfa`), ink `#141414`, `font-family: var(--font-manual)`.
  - Step number: 2.6em, weight 700. Step title: 1.05em.
  - Note: 1.5 px border with a circled "!". Lists: square bullets. Quantity badge: bold.
  - Figure: 1.5 px border, 6 px padding. Folio: small sans.
  - `scene.css`:
    - `.book-top` background `#fafaf8`, with the cover art;
    - `.book-edge.pages` light grey lines;
    - `.book-edge.spine` `#e9e9e5`;
    - `.book-title` and `.flyer-title` black Noto Sans 700, no rotation, left aligned.
- [ ] **Step 6: Art.** Hand-author the SVGs: black 2.5 px round-cap strokes, no fills except white.
  - Cover:
    - a figure kneeling by an open parcel holding a booklet;
    - a "1 person" pictogram;
    - a code line `AA-000001-1`.
  - Endpaper:
    - an ✗ panel: a lone puzzled figure with a box;
    - a ✓ panel: two figures handing over a booklet.
  - Manual figures: the generic round-head person.
- [ ] **Step 7: `book.md`.** A manual outline:
  - `# [Placeholder — your name]` with a hello note and `two-people.svg`;
  - `# Parts` with `1× [Placeholder — …]` items;
  - five `## [Placeholder — step …]` steps, each with a figure;
  - `# Need help?` with `figure-phone.svg` and a placeholder mailto.

  Keep the comment header that explains the syntax, updated for steps and `2×` items.
- [ ] **Step 8:** `npm test` passes. e2e `journey` still shows `1 / N`; update the expected page counts in `journey.spec.js` to match the new outline.
- [ ] **Step 9:** Screenshot the cover, a spread and the single-page phone view, and fix anything that clips.
- [ ] **Step 10:** `/verify`, then commit `feat: IKEA-style instruction booklet`.

### Task 3: Camera projection

**Files:**
- Create: `js/scene/projection.js`
- Modify: `js/scene/camera.js` (add `frame()` and `onChange`)
- Test: `tests/unit/projection.test.js`, an e2e check in Task 14

**Interfaces:**
- Produces:
  - `cameraMatrix(frame, viewport) → Float32Array(16)`, column-major, mapping parcel coordinates to clip space;
  - `projectPoint(frame, viewport, [x,y,z]) → {x, y, depth}` in CSS pixels;
  - `screenRay(frame, viewport, sx, sy) → {origin:[x,y,z], dir:[x,y,z]}` with `dir` normalised;
  - `frame = {tilt, spin, zoom, panX, panY, perspective}`, `viewport = {width, height}`.
- Math (it mirrors the CSS chain):
  1. `local = (x−W/2, y−D/2, z)`;
  2. `Rz(spin)`, where x' = x cos − y sin and y' = x sin + y cos;
  3. `Rx(tilt)`, where y' = y cos − z sin and z' = y sin + z cos;
  4. multiply by `zoom`, add `(panX, panY, 0)`;
  5. screen = centre + (t.x, t.y) · P / (P − t.z).
- Clip space:
  - `w = (P − t.z)/P`, `x_c = 2 t.x / vw`, `y_c = −2 t.y / vh`;
  - `z_c = (A (P − t.z) − B) / P`, with `A = (f+n)/(f−n)`, `B = 2fn/(f−n)`, `n = max(P·0.02, P − 900·zoom)`, `f = P + 1200·zoom`.

- [ ] **Step 1: Failing tests:**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraMatrix, projectPoint, screenRay } from '../../js/scene/projection.js';
import { BOX } from '../../js/scene/geometry.js';

const vp = { width: 1000, height: 800 };
const flat = { tilt: 0, spin: 0, zoom: 1, panX: 0, panY: 0, perspective: 1000 };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('the floor centre lands on the screen centre', () => {
  const p = projectPoint(flat, vp, [BOX.width / 2, BOX.depth / 2, 0]);
  near(p.x, 500); near(p.y, 400);
});
test('height magnifies like CSS perspective', () => {
  const p = projectPoint(flat, vp, [BOX.width / 2 + 100, BOX.depth / 2, 500]);
  near(p.x, 500 + 200); // P / (P − z) = 2
});
test('tilt lifts high points up the screen and spin turns clockwise', () => {
  const tilted = { ...flat, tilt: 54 };
  const top = projectPoint(tilted, vp, [BOX.width / 2, BOX.depth / 2, 100]);
  assert.ok(top.y < 400);
  const spun = projectPoint({ ...flat, spin: 90 }, vp, [BOX.width / 2 + 50, BOX.depth / 2, 0]);
  near(spun.x, 500, 1e-6); near(spun.y, 450, 1e-6);
});
test('the matrix agrees with projectPoint, and screenRay passes back through the point', () => {
  const frame = { tilt: 31, spin: -17, zoom: 1.4, panX: 12, panY: -30, perspective: 1300 };
  const m = cameraMatrix(frame, vp);
  const pt = [80, 260, 140];
  const c = [0, 1, 2, 3].map((r) => m[r] * pt[0] + m[4 + r] * pt[1] + m[8 + r] * pt[2] + m[12 + r]);
  const sx = (c[0] / c[3] + 1) / 2 * vp.width;
  const sy = (1 - c[1] / c[3]) / 2 * vp.height;
  const p = projectPoint(frame, vp, pt);
  near(sx, p.x, 1e-3); near(sy, p.y, 1e-3);
  assert.ok(c[2] / c[3] > -1 && c[2] / c[3] < 1);
  const { origin, dir } = screenRay(frame, vp, p.x, p.y);
  const v = pt.map((x, i) => x - origin[i]);
  const len = Math.hypot(...v);
  v.forEach((x, i) => near(x / len, dir[i], 1e-6));
});
test('nearer points get smaller depth', () => {
  const m = cameraMatrix(flat, vp);
  const depth = (z) => { const zc = m[2] * 0 + m[10] * z + m[14]; const w = m[11] * z + m[15]; return zc / w; };
  assert.ok(depth(200) < depth(0));
});
```

- [ ] **Step 2:** `npm test` → FAIL (module missing).
- [ ] **Step 3:** Implement `projection.js`, with small helpers `rotZ`, `rotX` and `toLocal`.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** `camera.js`: keep `current`; `apply()` calls listeners with `current`. Export `frame: () => current` and `onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }`.
- [ ] **Step 6:** Commit `feat: camera projection that mirrors the CSS camera`.

### Task 4: Box colliders and occluders

**Files:**
- Modify: `js/scene/geometry.js`, `js/scene/parcel.js` (set `--open-front|back|left|right` from `FLAP_OPEN`; add 4 probes in every flap at the corners of its outer face), `css/scene.css` (`.parcel.is-open .flap.front { --a: var(--open-front) }` etc.)
- Test: `tests/unit/geometry.test.js`

**Interfaces:**
- Produces:
  - `FLAP_OPEN = {front:-156, back:-116, left:-134, right:-147}`;
  - `flapCorners(side, angleDeg) → [[x,y,z]×4]` in the order: hinge-left, hinge-right, tip-right, tip-left (matching the probe order `[0,F]`, `[w,F]`, `[w,0]`, `[0,0]` in flap-element pixels);
  - `boxColliders() → [{kind:'obb', center:[3], axes:[[3],[3],[3]], half:[3]}]` for the 4 walls (2 thick, height H+1.6), the 4 open flaps (1 thick), the book and the desiccant;
  - `occluderQuads() → [[[x,y,z]×4]]` for the table/floor plane (−900…1320 × −900…1200 at z 0), both faces of each wall, each open flap (both faces), the book top and the desiccant top.
- Flap math, from the CSS:
  1. origin `O = (W/2, D/2, 0)`;
  2. element point `(u, v)` with u ∈ [0, len] and v ∈ [0, F] → local `(u − len/2, v − F, 0)`;
  3. `Rx(a)`, then add `(0, half, lift)`, then `Rz(side)`, then add `O`.
  - Side values:

    | side | `Rz` | `half` | `len` | `lift` |
    |------|------|--------|-------|--------|
    | front | 0 | D/2 | W | H+1.6 |
    | back | 180 | D/2 | W | H+1.6 |
    | left | 90 | W/2 | D | H+0.6 |
    | right | −90 | W/2 | D | H+0.6 |

- [ ] **Step 1: Failing tests:**

```js
import { FLAP_OPEN, flapCorners, boxColliders, occluderQuads } from '../../js/scene/geometry.js';

test('a closed front flap lies on the rim, an open one leans out and up', () => {
  const closed = flapCorners('front', 0);
  closed.forEach(([, , z]) => assert.ok(Math.abs(z - (BOX.height + 1.6)) < 1e-9));
  const [hl, , , tl] = flapCorners('front', FLAP_OPEN.front);
  assert.ok(Math.abs(hl[1] - BOX.depth) < 1e-9, 'hinge on the front edge');
  assert.ok(tl[1] > BOX.depth && tl[2] > hl[2], 'tip is outside and higher');
});
test('the left flap hinges on x = 0', () => {
  const [hl, hr] = flapCorners('left', FLAP_OPEN.left);
  assert.ok(Math.abs(hl[0]) < 1e-9 && Math.abs(hr[0]) < 1e-9);
});
test('colliders: 4 walls, 4 flaps, book and desiccant, with orthonormal axes', () => {
  const c = boxColliders();
  assert.equal(c.length, 10);
  c.forEach(({ axes }) => axes.forEach((a, i) => axes.forEach((b, j) => {
    const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    assert.ok(Math.abs(dot - (i === j ? 1 : 0)) < 1e-9);
  })));
});
test('occluders include the table plane and every wall and flap face', () => {
  assert.ok(occluderQuads().length >= 1 + 8 + 8 + 2);
});
```

- [ ] **Step 2:** FAIL. **Step 3:** Implement it (pure; reuse `rotX`/`rotZ` from `projection.js` by exporting them). **Step 4:** PASS.
- [ ] **Step 5:** Move the open angles to CSS variables set by `parcel.js` (one source of truth). Check by eye that the opening animation is unchanged.
- [ ] **Step 6:** Commit `feat: box colliders and occluders that match the CSS flaps`.

### Task 5: Cloth mesh

**Files:** Create `js/cloth/mesh.js`; Test: `tests/unit/cloth-mesh.test.js`

**Interfaces:**
- Consumes: a garment record `{id, size:[w,h], grid:{cols, rows, cells:string}}`. `cells` has one `'1'`/`'0'` per cell, row-major (rows × cols).
- Produces: `buildMesh(garment, spacing) → {count, rest:Float32Array(3n), uv:Float32Array(2n), tris:Uint32Array, stretch:{a,b,rest}[], bend:{a,b,rest}[]}`.
  - The vertices sit on the corners of the covered cells, at `(i·sw, j·sh, 0)` with `sw = w/cols`, `sh = h/rows`. UV = `(x/w, y/h)`.
  - Each covered cell gives 2 triangles, split along alternating diagonals so the cloth has no bias.
  - Stretch constraints are the unique triangle edges.
  - Bend constraints join the two opposite vertices of every edge shared by two triangles.

- [ ] **Step 1: Failing tests:**

```js
import { buildMesh } from '../../js/cloth/mesh.js';
const g = (cells, cols, rows) => ({ id: 't', size: [cols * 10, rows * 10], grid: { cols, rows, cells } });

test('one cell → 4 vertices, 2 triangles, 5 edges, 1 bend', () => {
  const m = buildMesh(g('1', 1, 1));
  assert.equal(m.count, 4); assert.equal(m.tris.length, 6);
  assert.equal(m.stretch.length, 5); assert.equal(m.bend.length, 1);
});
test('uncovered cells add nothing, and vertices are shared', () => {
  const m = buildMesh(g('110' + '010', 3, 2));
  assert.equal(m.tris.length / 3, 6);
  assert.equal(m.count, 8);
});
test('rest lengths match positions and UVs span 0..1', () => {
  const m = buildMesh(g('1111', 2, 2));
  for (const { a, b, rest } of m.stretch) {
    const d = Math.hypot(m.rest[3 * a] - m.rest[3 * b], m.rest[3 * a + 1] - m.rest[3 * b + 1]);
    assert.ok(Math.abs(d - rest) < 1e-6);
  }
  assert.equal(Math.max(...m.uv), 1); assert.equal(Math.min(...m.uv), 0);
});
test('a malformed grid is rejected with a clear message', () => {
  assert.throws(() => buildMesh(g('11', 2, 2)), /grid/);
});
```

- [ ] **Step 2:** FAIL. **Step 3:** Implement: a vertex index map keyed `j*(cols+1)+i`, an edge map keyed `min,max` that tracks the opposite vertices. **Step 4:** PASS. **Step 5:** Commit `feat: cloth mesh from a garment coverage grid`.

### Task 6: Spatial hash (port of Ten Minute Physics `Hash`, MIT)

**Files:** Create `js/cloth/hash.js` (keeps the MIT notice); Test: `tests/unit/cloth-hash.test.js`

**Interfaces:**
- Produces: `createHash(spacing, maxNumObjects)` → `{create(pos), query(pos, i, maxDist) → count (results in .queryIds), querySize, queryIds}`, the same semantics as Müller's dense hash (`tableSize = 2·maxNumObjects`, `hashCoords = abs((xi·92837111) ^ (yi·689287499) ^ (zi·283923481)) % tableSize`).

- [ ] **Step 1: Failing test:** 200 random points; for 20 of them, `query` with `maxDist = 15` returns a superset of the brute-force neighbours within 15.
- [ ] **Step 2:** FAIL. **Step 3:** Port it. **Step 4:** PASS. **Step 5:** Commit `feat: spatial hash for cloth collisions`.

### Task 7: XPBD solver

**Files:** Create `js/cloth/solver.js`; Test: `tests/unit/cloth-solver.test.js`

**Interfaces:**
- Consumes: `buildMesh`, `createHash`, `boxColliders()`.
- Produces:
  - `createWorld({meshes:[{mesh, material:{bend, stretch, friction, thickness}}], colliders, bounds})` → world, with the fields:
    - `pos`, `prev`, `vel`, `invMass` (Float32Array);
    - `garmentOf` (Uint16Array);
    - `offsets[g]`, `counts[g]`;
    - `awake` (Uint8Array per garment);
    - `grip` (`null | {garment, ids:number[], local:[[3]], target:[3]}`).
  - `setPositions(world, g, Float32Array)`.
  - `step(world, dt, {substeps=10, gravity=-980})`. `dt` is clamped to ≤ 1/30.
  - `grab(world, g, ids, target)`, `moveGrip(world, target)`, `release(world)`.
  - `isSettled(world)`, `centroid(world, g)`.
- Behaviour:
  - Only awake garments integrate. Sleeping particles are obstacles with `invMass` 0 in contacts.
  - Contacts are within `thickness`. Particles of the same garment whose rest distance is under `thickness` are skipped (Müller 15).
  - A contact between an awake particle with speed > 25 units/s and a sleeping one wakes the sleeping garment.
  - Plane z ≥ thickness/2.
  - OBBs: push out along the axis of least penetration, using an expanded half-extent (+thickness/2).
  - Friction: tangential displacement × (1 − friction) on contact.
  - Damping: `vel *= 0.995` per step.
  - World bounds clamp.
  - Sleep: a garment that isn't held, whose max particle speed stays < 6 units/s for 0.4 s, goes to sleep (vel = 0).

- [ ] **Step 1: Failing tests:**

```js
import { buildMesh } from '../../js/cloth/mesh.js';
import { createWorld, setPositions, step, grab, moveGrip, release, isSettled, centroid } from '../../js/cloth/solver.js';

const sheet = (cols = 6, rows = 6) => buildMesh({ id: 's', size: [cols * 10, rows * 10], grid: { cols, rows, cells: '1'.repeat(cols * rows) } });
const material = { bend: 0.5, stretch: 0, friction: 0.5, thickness: 3 };
const world = (colliders = []) => createWorld({ meshes: [{ mesh: sheet(), material }], colliders, bounds: { min: [-500, -500, 0], max: [900, 900, 900] } });
const lift = (w, dz) => { const p = w.pos.slice(); for (let i = 2; i < p.length; i += 3) p[i] += dz; setPositions(w, 0, p); };
const run = (w, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) step(w, 1 / 60); };

test('cloth falls under gravity and rests on the floor', () => {
  const w = world(); lift(w, 100); run(w, 2);
  for (let i = 2; i < w.pos.length; i += 3) assert.ok(w.pos[i] >= 1.4 && w.pos[i] < 4);
});
test('stretch constraints keep edges near rest length while hanging', () => {
  const w = world(); lift(w, 200);
  grab(w, 0, [0], [0, 0, 200]); run(w, 1.5);
  const m = sheet();
  const worst = Math.max(...m.stretch.map(({ a, b, rest }) => {
    const d = Math.hypot(w.pos[3 * a] - w.pos[3 * b], w.pos[3 * a + 1] - w.pos[3 * b + 1], w.pos[3 * a + 2] - w.pos[3 * b + 2]);
    return Math.abs(d - rest) / rest;
  }));
  assert.ok(worst < 0.08, `worst strain ${worst}`);
});
test('a held corner follows the grip and the cloth hangs below it', () => {
  const w = world(); grab(w, 0, [0], [0, 0, 150]); moveGrip(w, [100, 50, 150]); run(w, 1);
  assert.ok(Math.hypot(w.pos[0] - 100, w.pos[1] - 50, w.pos[2] - 150) < 1);
  const c = centroid(w, 0); assert.ok(c[2] < 150);
});
test('released cloth settles and falls asleep', () => {
  const w = world(); grab(w, 0, [0], [0, 0, 80]); run(w, 0.5); release(w); run(w, 3);
  assert.ok(isSettled(w)); assert.equal(w.awake[0], 0);
});
test('fast particle does not pass through a wall slab', () => {
  const wall = { kind: 'obb', center: [100, 30, 110], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], half: [1, 200, 110] };
  const w = world([wall]); lift(w, 50);
  for (let i = 0; i < w.vel.length; i += 3) w.vel[i] = 3000;
  run(w, 0.3);
  for (let i = 0; i < w.pos.length; i += 3) assert.ok(w.pos[i] < 100, 'stays on its side');
});
test('world bounds clamp and huge dt is clamped', () => {
  const w = world(); for (let i = 0; i < w.vel.length; i += 3) w.vel[i + 1] = 1e6;
  step(w, 5);
  for (let i = 0; i < w.pos.length; i += 1) assert.ok(Number.isFinite(w.pos[i]));
  for (let i = 1; i < w.pos.length; i += 3) assert.ok(w.pos[i] <= 900);
});
test('a moving garment wakes a sleeping one it lands on', () => {
  const m = sheet();
  const w = createWorld({ meshes: [{ mesh: m, material }, { mesh: m, material }], colliders: [], bounds: { min: [-500, -500, 0], max: [900, 900, 900] } });
  const top = w.pos.slice(w.offsets[1] * 3, (w.offsets[1] + w.counts[1]) * 3);
  for (let i = 2; i < top.length; i += 3) top[i] += 60;
  setPositions(w, 1, top);
  run(w, 3);
  assert.equal(w.awake[0] + w.awake[1], 0);
  assert.ok(centroid(w, 1)[2] > centroid(w, 0)[2], 'the second sheet rests on the first');
});
```

- [ ] **Step 2:** FAIL. **Step 3:** Implement it, with these fixes for tunnelling:
  - per-substep displacement is capped at `thickness` (velocity clamp `thickness/sdt`);
  - the OBB is resolved toward the side of the previous position (when `prev` was outside the expanded box, push back across the face it entered through).
- [ ] **Step 4:** PASS. Run `npm run test:coverage` and keep `solver.js` ≥ 80 %.
- [ ] **Step 5:** Commit `feat: XPBD cloth solver with collisions and sleeping`.

### Task 8: Picking

**Files:** Create `js/cloth/pick.js`; Test: `tests/unit/cloth-pick.test.js`

**Interfaces:**
- Produces: `pick(world, meshes, ray, alphaAt) → null | {garment, ids:[a,b,c], point:[3], t}`.
  - It finds the nearest ray–triangle hit (Möller–Trumbore, two-sided) over all garments.
  - A hit is accepted only if `alphaAt(garment, u, v) ≥ 0.5`, at the interpolated UV.
  - `alphaAt` is injected; the browser version samples a downscaled alpha mask.

- [ ] **Step 1: Failing tests:**
  - A ray straight down onto a flat sheet hits it, at the right garment and point.
  - When two sheets are stacked, the upper one wins.
  - `alphaAt` returning 0 → null.
  - A ray that misses → null.
- [ ] **Step 2:** FAIL. **Step 3:** Implement it. **Step 4:** PASS. **Step 5:** Commit `feat: pick garments under the pointer`.

### Task 9: Booklet coverage (+ owner contribution)

**Files:** Create `js/cloth/coverage.js`; Test: `tests/unit/cloth-coverage.test.js`

**Interfaces:**
- Produces:
  - `bookCoverage(world, book, {cols=8, rows=11, radius=9}) → number` between 0 and 1. It is the share of sample points on the booklet's top (rotated rect `book = CONTENTS.book` plus thickness) with at least one particle within `radius` horizontally whose z > `thickness + 0.5`.
  - `isBookUncovered(coverage, wasUncovered) → boolean`, the owner's rule.

- [ ] **Step 1: Failing tests:**
  - `bookCoverage` is 0 with no cloth.
  - It is about 1 with a sheet lying over the whole booklet.
  - It is about 0.5 when the sheet covers half.
  - The rule tests pin only the extremes: covered at 1, uncovered at 0.
- [ ] **Step 2:** FAIL. **Step 3:** Implement `bookCoverage`. Prepare `isBookUncovered` with a `TODO(owner)` comment that explains the trade-off (threshold + hysteresis), plus a provisional `return coverage < 0.35` marked as provisional.
- [ ] **Step 4:** PASS. **Step 5:** Commit `feat: measure how much of the booklet is covered`.

### Task 10: Garment art + `garments.json`

**Files:** Create `tools/generate_clothes.py`, `assets/clothes/{qipao,blouse,mamianqun,tee-white,tee-breton,slip-skirt,ruched-top,floral-skirt}.webp`, `assets/clothes/garments.json`; Test: `tests/unit/clothes-data.test.js`

**Interfaces:**
- Produces: `garments.json`:

```json
{
  "spacing": 10,
  "pxPerUnit": 2.4,
  "garments": [
    { "id": "qipao", "label": "qipao", "texture": "assets/clothes/qipao.webp", "size": [190, 400],
      "grid": { "cols": 19, "rows": 40, "cells": "0011…" },
      "material": { "bend": 0.9, "stretch": 0, "friction": 0.45, "thickness": 3, "sheen": 0.7, "shininess": 40 } }
  ]
}
```

- Garment table (world sizes and materials):

  | id | size | bend | sheen |
  |----|------|------|-------|
  | qipao | 190×400 | 0.9 | 0.7 |
  | blouse | 300×230 | 0.8 | 0.45 |
  | mamianqun | 280×260 | 0.35 | 0.3 |
  | tee-white | 290×250 | 0.6 | 0.05 |
  | tee-breton | 300×260 | 0.6 | 0.05 |
  | slip-skirt | 200×270 | 1.0 | 0.8 |
  | ruched-top | 220×190 | 0.8 | 0.15 |
  | floral-skirt | 230×300 | 1.2 | 0.1 |

  "bend" is compliance: higher means softer.

- [ ] **Step 1: Failing test:** for every garment:
  - the texture exists;
  - `cells.length === cols*rows`;
  - `cols === Math.ceil(size[0]/spacing)`;
  - at least 40 % of cells are covered;
  - the id is unique;
  - the label contains no brand name (`/zara|h&m|mango|ikea/i`).
- [ ] **Step 2:** FAIL. **Step 3:** Write the generator:
  - supersampled PIL drawing (2×, then downsample);
  - a silhouette polygon per garment from the spec's shapes;
  - fabric noise, plus the pattern layer: brocade motifs, stripes, ditsy flowers or pleats;
  - seams and hem stitching, collars, pankou knots, piping, edge darkening;
  - WebP quality 82 with alpha;
  - the coverage grid uses alpha mean ≥ 0.3 per cell.
- [ ] **Step 4:** Run `python tools/generate_clothes.py`. Check the textures on a contact sheet.
- [ ] **Step 5:** PASS. Commit `feat: garment artwork and cloth data`.

### Task 11: Pre-settled pile

**Files:** Create `tools/build-pile.mjs`, `assets/clothes/pile.json`; Modify `package.json` (`"clothes": "python tools/generate_clothes.py && node tools/build-pile.mjs"`); Test: `tests/unit/clothes-data.test.js`

**Interfaces:**
- Produces: `pile.json = {version:1, garments:[{id, positions:number[] /* rounded 0.1 */}]}`, in the same order as `garments.json`, with `positions.length === 3·mesh.count`.
- Placement script: a seeded PRNG (mulberry32, seed 11). For each garment, in bottom-to-top order:
  1. rotate it in the plane;
  2. optionally fold it, by reflecting the vertices beyond a fold line on top (z + 2·thickness);
  3. centre it near the booklet: (272 ± 50, 150 ± 45);
  4. drop it from z = 30 + 18·i;
  5. step until settled (max 8 s of simulated time).

  After all eight are down, they must cover ≥ 85 % of the booklet and ≤ 15 % of the photo.

- [ ] **Step 1: Failing test:**
  - `pile.json` matches `garments.json` (ids, order, lengths);
  - every z ≥ 0;
  - every point lies within x −50…470 and y −50…350;
  - `bookCoverage` on a world loaded from the pile is ≥ 0.85.
- [ ] **Step 2:** FAIL. **Step 3:** Write the tool. It retries with the next seed if the coverage rules fail, and prints the coverage numbers.
- [ ] **Step 4:** `npm run clothes`, then PASS. Commit `feat: pre-settled clothes pile`.

### Task 12: WebGL layer

**Files:** Create `js/cloth/render.js`, `js/cloth/layer.js`; Modify `index.html` (`<canvas class="clothes-layer" id="clothes" aria-hidden="true">` inside `.stage` after `#camera`), `css/scene.css`

**Interfaces:**
- Consumes: `cameraMatrix`, `occluderQuads`, `boxColliders`, `buildMesh`, the solver, `bookCoverage`, `camera.frame()/onChange`.
- Produces: `createClothes({canvas, camera, config, reducedMotion}) → Promise<clothes>`, where `clothes` provides:
  - `enabled`;
  - `show(visible)`;
  - `reset()`;
  - `clearAside()`;
  - `pickAt(sx, sy)` → hit | null;
  - `grab(hit)`, `dragTo(sx, sy)`, `release()`;
  - `moveAside(garmentIndex) → Promise`;
  - `screenBox(g) → {left, top, width, height}`;
  - `coverage()`;
  - `onSettle(fn)`;
  - `status()`, `project(p)`;
  - `garments` (`[{id, label}]`).

  When WebGL2 or the data is missing, it resolves `{enabled:false}` plus no-op methods.
- Rendering:
  1. A shadow pass into a 2048² depth texture: orthographic light along L = normalize(−0.35, −0.45, 1) over x −200…620, y −200…500.
  2. The occluder pass: depth write, output premultiplied `(0, 0, 0, shadow · 0.38 · light)` with 9-tap PCF.
  3. The cloth pass:
     - texture with alpha-to-coverage (MSAA, `antialias:true`);
     - wrap diffuse, `max(0, N·L)·0.6 + 0.4`;
     - Blinn sheen toward the eye;
     - back faces × 0.78;
     - the PCF shadow, and a per-vertex cavity term (CPU: z versus the neighbour average);
     - finally `mix(color, #140d07, (1 − light)·0.95)`.
  - Render on demand: `dirty` is set on sim activity, `camera.onChange`, resize and `show`.
  - Pixel ratio = `min(devicePixelRatio, 2)`.
  - The rAF loop runs at most 2 fixed 1/60 steps per frame and pauses while `document.hidden`.

- [ ] **Step 1:** Implement `render.js`: shader compile/link with error messages, buffers per garment (positions/normals dynamic, UVs/indices static), the shadow framebuffer.
- [ ] **Step 2:** Implement `layer.js`:
  - load `garments.json`, `pile.json` and the textures (each image is decoded once; the alpha masks come from a 2D canvas at 1/4 size);
  - build the world; `reset()` copies the pile in and puts everything to sleep;
  - `clearAside()` moves each garment +700 in x (off the box, for previews/tests).
  - The grip ray: `screenRay` intersected with the plane z = h, where h = max(hitZ + 45, 60, support(xy) + 45). `support()` is the highest collider top within 20 units of xy (a flap height comes from its plane). The grip rises immediately and lowers smoothly.
- [ ] **Step 3:** A temporary manual check: `?jump=overhead` renders the pile aligned with the box. Screenshot it, and the 3/4 view mid-reveal.
- [ ] **Step 4:** Commit `feat: WebGL clothes layer with soft shadows`.

### Task 13: Pointer and touch interaction + cursors

**Files:** Create `js/cloth/interaction.js`, `assets/ui/hand-open.svg`, `hand-open.png`, `hand-closed.svg`, `hand-closed.png`; Modify `js/main.js` (`--cursor-grab`, `--cursor-grabbing`), `css/scene.css`, `content/site.js` (cursor paths)

**Interfaces:**
- Consumes: `clothes`, `machine`, `stage`.
- Produces: `createClothesInput({stage, clothes, canInteract, onDragEnd}) → {dispose}`.
- Rules:
  - On pointerdown (capture phase on the stage), when `canInteract()` and the pointer is primary, a hit → `preventDefault`, `stopPropagation`, `setPointerCapture`, `clothes.grab`, and the `is-grabbing` class.
  - Pointermove (same pointerId) → `dragTo`.
  - Pointerup, pointercancel or lostpointercapture → `release`. Set `suppressClick` for one click in the capture phase.
  - Hover (mouse, no buttons) is rAF-throttled: `pickAt` toggles `over-garment`.
  - CSS:
    - `.stage.over-garment, .stage.over-garment * { cursor: var(--cursor-grab, grab) !important }`;
    - `.stage.is-grabbing, .stage.is-grabbing * { cursor: var(--cursor-grabbing, grabbing) !important }`;
    - both only under `(hover:hover) and (pointer:fine)`.

- [ ] **Step 1:** Draw the cursors in the same style as `hand.svg` (32 px; hotspot at the palm centre, 16 16) and export PNG fallbacks (Pillow + cairosvg is unavailable, so draw the PNG directly in Pillow).
- [ ] **Step 2:** Implement and wire it in `main.js`. `canInteract = () => machine.state === 'overhead'`.
- [ ] **Step 3:** Check by hand: drag a garment over the rim and drop it on a flap. Screenshot it mid-drag.
- [ ] **Step 4:** Commit `feat: grab and drag clothes with mouse or touch`.

### Task 14: Keyboard, booklet lock, flow wiring, e2e

**Files:** Create `js/cloth/keyboard.js`, `tests/e2e/clothes.spec.js`, `tests/e2e/clothes-helpers.js`; Modify `js/flow.js`, `js/main.js`, `css/scene.css`, `css/base.css` (`#clothes-hint`, `#clothes-controls`), `index.html` (`<p class="clothes-hint hand" id="clothes-hint">`, `<div id="clothes-controls">`), `content/site.js` (texts), `tests/e2e/{journey,access,cutting,assets}.spec.js`

**Interfaces:**
- `createClothesKeys({host, clothes, text, announce}) → {enable(), disable(), first()}`. It creates one button per garment (`aria-label = text.moveAside.replace('{garment}', label)`), positioned over `clothes.screenBox(g)`.
- Texts in `site.js`:
  - `moveAside: 'Move the {garment} aside'`;
  - `clothesHint: 'Move the clothes aside to find what’s underneath.'`;
  - `bookUncovered: 'The little book is uncovered.'`;
  - `movedAside: 'The {garment} is out of the way.'`.
- Flow:
  - **Reveal:** `clothes.show(true)` 600 ms after REVEAL starts. On REVEALED, if `clothes.enabled`:
    - lock the booklet (`book.button.tabIndex = -1`, no `is-reachable`);
    - show the hint, enable the keys and focus the first key (keyboard users);
    - announce "Looking down into the box: a photo, a pile of clothes, and something underneath."
  - **Without clothes:** behaves as today, and the booklet gets `is-reachable`.
  - **`clothes.onSettle` → `updateBook()`:**
    1. `uncovered = isBookUncovered(coverage, wasUncovered)`;
    2. toggle `is-reachable`, `tabIndex` and the hint;
    3. announce the change.
  - **`openBook`:** returns early unless the booklet is reachable.
  - **`restart`:** `clothes.reset()`, `show(false)`, `keys.disable()`.
  - **`fastForward`:**
    - `clear` → overhead + `clearAside()`;
    - `book` → `clearAside()`, then open the booklet.
  - **`__parcel.clothes = () => clothes.status()`** returns `{enabled, garments:[{id, awake, centroid, grip:{x,y}}], coverage, reachable}`.
  - **`__parcel.project = (p) => clothes.project(p)`.**
- CSS:
  - `.book3d:not(.is-reachable) .book-top { pointer-events:none }`;
  - the hover lift applies only to `.stage:not(.over-garment) .book3d.is-reachable`.

- [ ] **Step 1: Failing e2e** `tests/e2e/clothes.spec.js` (desktop unless noted):
  - the WebGL projection of the tape corners matches the DOM probes within 1 px (overhead and 3/4);
  - flap probes match `flapCorners` through the same projection;
  - the booklet is locked under the pile: clicking its centre leaves the state at `overhead`;
  - hovering a garment shows the open-hand cursor;
  - a mouse drag moves a garment more than 80 units, and it is still there 1.5 s after settling;
  - pointercancel mid-drag releases (no grip, and the garment falls asleep);
  - a second pointer is ignored;
  - restart mid-drag → `sealed`, no page errors;
  - resize during a drag → the grip still lands under the pointer (projected grip within 6 px);
  - keyboard: Tab reaches "Move the … aside"; Enter on each garment (via the helper `clearWithKeyboard`) → `reachable` becomes true and the announcement appears; then Enter on the booklet opens it;
  - reduced motion: keyboard moves finish in under 1.5 s each;
  - no-WebGL fallback (`addInitScript` patches `HTMLCanvasElement.prototype.getContext` to return null for `webgl2`) → the booklet opens straight after the reveal, with no errors;
  - phone (Pixel 7): a touch drag moves a garment.
- [ ] **Step 2:** `npm run test:e2e -- clothes` → FAIL.
- [ ] **Step 3:** Implement `keyboard.js` and the flow/main wiring.
- [ ] **Step 4:** Update the existing specs:
  - the journey clears the clothes by dragging them with the mouse (`clearWithMouse` helper: drag each garment's grip point to just beyond the front flap);
  - access uses the keyboard path above;
  - `?jump=book` callers are unchanged.
- [ ] **Step 5:** `npm run test:e2e` → all pass on desktop and phone.
- [ ] **Step 6: Owner contribution:** ask the owner to write `isBookUncovered`.
- [ ] **Step 7:** `/verify`, then commit `feat: clothes hide the booklet until moved, with keyboard support`.

### Task 15: Docs, review, deploy

**Files:** Modify `README.md`, `docs/design.md`, `.gitignore` (if needed)

- [ ] **Step 1:** README:
  - "Make it yours": the photo, the desiccant, clothes (replace a texture → `npm run clothes`), the manual syntax (`##` steps, `2×` items, `assets/manual` drawings).
  - Credits: Ten Minute Physics (MIT), Noto Sans (OFL).
- [ ] **Step 2:** `docs/design.md`: add the clothes layer to the architecture table, plus a section "Clothes layer" (camera matching, depth-only occluders, XPBD, sleeping, booklet lock).
- [ ] **Step 3:** Code review with a code-reviewer agent over `git diff 186574a..HEAD`. Fix CRITICAL and HIGH findings.
- [ ] **Step 4:** `/verify` (unit + coverage + e2e). Commit `docs: …`.
- [ ] **Step 5:** Push `main`, wait for the Pages build, run `npm run test:live`, and spot-check the live page by screenshot.
