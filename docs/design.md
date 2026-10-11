# Parcel site — design

A static, hand-made "parcel" personal site for GitHub Pages. Visitors cut the
tape on a box, peer into the dark, look down into it, move a pile of clothes
aside, and read the small instruction booklet underneath.

The clothes pile, the photo print, the desiccant packet and the manual-style
booklet are specified in
`docs/superpowers/specs/2026-10-11-clothes-pile-design.md`.

## Understanding (from the brief)

- **Owner supplies:** artwork / artwork layers, a portrait photo, handwriting
  elements, and the introduction text. Nothing biographical is invented; every
  missing asset falls back to a clearly labelled placeholder. (The owner later
  kept the generated cardboard box as the finished box art, in `assets/art/`.)
- **Mood:** warm, playful, curious; paper textures, imperfect edges, soft
  shadows. No pixel art.
- **Hosting:** static files only, relative paths (works at `user.github.io/`
  and at `user.github.io/repo/`).

## Experience states

```
loading ─LOADED→ sealed ─CUT_START→ cutting ─CUT_DONE→ opening ─OPENED→ dark
dark ─REVEAL→ revealing ─REVEALED→ overhead ─OPEN_BOOK→ lifting ─BOOK_OPENED→ reading
reading ─CLOSE_BOOK→ closing ─BOOK_CLOSED→ overhead
(sealed|cutting|dark|overhead|reading) ─RESTART→ sealed
```

`opening`, `revealing`, `lifting` and `closing` are *busy* states: user events
are ignored while they run, which prevents overlapping transitions and double
activation. Moving clothes needs no states of its own: in `overhead` the
booklet is simply locked (`OPEN_BOOK` is not sent) until enough of it is
uncovered. The current state is mirrored to `<body data-state>` so CSS can
style each stage.

## Architecture

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `content/site.js` | Owner-editable config: asset paths, sounds, labels, book title | — |
| `content/book.md` | Owner-editable book text (Markdown-lite) | — |
| `js/core/state-machine.js` | Pure transition table + busy lock + listeners | — |
| `js/core/tween.js` | rAF tweens + easing, reduced-motion aware | — |
| `js/core/env.js` | Reduced motion, fine pointer, storage helpers | — |
| `js/geometry/homography.js` | Pure 4-point perspective solve (screen → tape) | — |
| `js/tape/cut-tracker.js` | Pure, immutable cut progress (unique length bins) | — |
| `js/tape/tape-view.js` | SVG rendering of tape halves + traced slit | cut-tracker |
| `js/tape/cutting.js` | Pointer/touch/keyboard cutting controller + sound | homography, cut-tracker, audio |
| `js/scene/parcel.js` | Builds the CSS-3D box, flaps, interior, contents | site config |
| `js/scene/camera.js` | Camera (tilt/spin/zoom) + interior light tweens | tween |
| `js/audio/sound.js` | Web Audio: unlock on first gesture, mute, loops | — |
| `js/loader/preload.js` | Preload images/fonts/sounds with progress + fallbacks | site config |
| `js/book/markdown.js` | Pure Markdown-lite → block list (escaped, safe links) | — |
| `js/book/paginate.js` | Pure pagination with an injected `fits()` measure | — |
| `js/book/layout.js` | Pure viewport → spread/single page size + font size | — |
| `js/book/book-view.js` | StPageFlip integration, controls, keys, indicator | page-flip, paginate |
| `js/book/flyer.js` | Lift-from-box / zoom / cover open & close animations | — |
| `js/scene/projection.js` | Pure: the CSS camera as matrices, screen rays | geometry |
| `js/scene/solids.js` | Pure: walls, open flaps and floor props as colliders and occluders | geometry |
| `js/cloth/mesh.js` | Pure: a garment's particles, stretch and bend constraints from its coverage grid | — |
| `js/cloth/hash.js` | Pure: spatial hash for nearby particles (Ten Minute Physics, MIT) | — |
| `js/cloth/collide.js` | Pure: plane, box and particle-pair contacts with Coulomb friction | — |
| `js/cloth/solver.js` | Pure: XPBD steps, grips, sleeping and waking | mesh, hash, collide |
| `js/cloth/pick.js` | Pure: which garment is under the pointer | projection |
| `js/cloth/grip.js` | Pure: where a hand holds cloth, and how high it must ride | solver |
| `js/cloth/hand.js` | The hand: carries a garment under the pointer or along a scripted path | solver, grip |
| `js/cloth/coverage.js` | Pure: share of the booklet under cloth; the unlock rule | — |
| `js/cloth/shading.js` | Pure: light, normals, crease shading | — |
| `js/cloth/render.js` | WebGL2: shadow map, occluders, cloth | shading |
| `js/cloth/layer.js` | The clothes layer: loading, stepping on demand, status | all of `js/cloth`, projection, solids |
| `js/cloth/interaction.js` | Mouse/touch: hover, grab, drag, release | layer |
| `js/cloth/keyboard.js` | One "Move the … aside" button per garment | layer |
| `js/ui/controls.js` | Mute + restart controls | sound, machine |
| `js/main.js` | Wiring | all |

### Viewpoint change

The parcel is one CSS-3D object (`preserve-3d`) seen through a perspective
camera. The three-quarter view is `rotateX(58deg) rotateZ(-34deg)`; the
overhead view is `rotateX(0) rotateZ(-3deg)` plus zoom. A single tween drives
`--tilt`, `--spin`, `--zoom` and the interior `--light` together, so the camera
move and the brightening are one continuous motion. Owner artwork is applied as
face textures, so one set of layers serves every angle.

### Tape cutting

The tape's four corners are tracked with zero-size probe elements; their
projected screen positions give a homography that maps the pointer into tape
space. The tape length is split into 48 bins; a bin is cut only when a
pressed pointer *moves* across it while on the tape. Re-tracing the same bins
adds nothing. 85 % of bins opens the box. Leaving the tape or releasing pauses
cutting and silences the loop; progress is kept. Keyboard: the tape is a
focusable `role="slider"`; holding → / Enter / Space advances the knife.

### Clothes layer

A transparent WebGL2 canvas lies over the CSS-3D parcel. It builds its view
and projection from the same camera values `camera.js` applies to the CSS
(`projection.js`), so cloth and cardboard line up at every angle and size.
The walls, open flaps, photo, desiccant and booklet are drawn into it
depth-only (they occlude the cloth and catch its shadow tint, but show no
colour), so the CSS stays the visible box.

Each garment is a particle grid built from its picture's coverage (spacing
10, thickness 7.5), solved with XPBD after Ten Minute Physics: stretch and
bend constraints, particle-pair contacts via a spatial hash, and the box as
oriented slabs. Friction is Coulomb (stick, then slide), except for the
garment in the hand, which only smears over the cloth below so it cannot
be pinned in the hollows between particles and pushed through. A garment
that has barely moved for 0.4 s falls asleep and becomes solid ground; it
wakes only when moving cloth pushes into it side-on or moves out from under
it, so dragging over the pile disturbs nothing below.

The pile is settled once, offline, by `tools/build-pile.mjs` with the same
solver, and loads asleep: nothing is simulated (or drawn) until a visitor
touches a garment. Rendering is on demand, with a 2048² shadow map redrawn
only while cloth moves. Without WebGL2 or the data, the layer is a no-op and
the booklet opens straight away.

The hand holds a garment 45 units above what lies beneath and rises over the
rim at once. Let go beyond the rim, the hand carries on past the open flap,
so the garment lands on the table instead of sliding back into the box.
Keyboard moves follow the same path to beyond the nearer of the right and
front flaps (never over the photo or up the steep back flap).

**Booklet lock.** Each time the cloth comes to rest, `bookCoverage` samples
the booklet's top and `isBookUncovered` decides (with hysteresis) whether it
may open. Locked, it has no tab stop, no hover lift, ignores clicks, and a
hint asks visitors to move the clothes; unlocking is announced.

### Book

The booklet is styled as a black-and-white assembly manual. Markdown-lite
(`#` page titles, `##` numbered steps, `>` "!" notes, lists with `2×`
parts-list quantities, images, `---` page breaks) is parsed into blocks, then paginated into pages that fit the current
page size (measured in a hidden page). Small screens get a single-page view
with ≥ 16 px text instead of a shrunken spread. StPageFlip (MIT, vendored)
provides the paper fold, moving shadows, corner drag with natural
complete/cancel, and swipe. A separate "flyer" book handles lift, zoom and the
hard-cover opening, then hands over to the flipbook at identical geometry.

## Accessibility & motion

- Keyboard path through every stage; visible focus; labelled controls;
  `aria-live` status messages.
- Custom cursors only under `(hover: hover) and (pointer: fine)`.
- `prefers-reduced-motion`: camera and zoom become cross-fades, page buttons
  jump instead of animating, idle wobble stops, and garments moved with the
  keyboard are put down beyond the flap without a carrying arc. Every stage
  is still reachable.
- Clothes: one visually hidden "Move the … aside" button per garment,
  topmost first, laid over the garment so its focus ring outlines it. Each
  move is announced and focus moves on to the next garment; once the
  booklet is uncovered that is announced too, and it joins the tab order.

## Testing

- Unit (`node --test`): state machine, homography, cut tracker, markdown,
  paginate, layout, tween easing; camera projection, box solids; cloth mesh,
  hash, solver (falling, stacking, sleeping and waking, friction on slopes
  and heaps), picking, grips, the hand, coverage, shading; the pile data.
- E2E (Playwright, installed Chrome): full sequence with mouse, touch and
  keyboard, moving the clothes by hand; the booklet lock; cursors; cancelled
  and second pointers; restart and resize mid-drag; no WebGL; mute/restart;
  page turns (click, drag, keys); reduced motion; asset loading with a
  missing asset.
