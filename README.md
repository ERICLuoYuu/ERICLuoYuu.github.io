# A parcel for you

A hand-made, interactive personal website. Visitors cut the tape on a parcel,
peer into the dark box, look down into it, move a pile of clothes aside, and
find a little instruction booklet about you underneath.
Plain HTML, CSS and JavaScript — no build step — hosted on GitHub Pages.

## Preview it on your computer

You need [Node.js](https://nodejs.org) (any recent version).

```bash
npm run serve        # then open http://127.0.0.1:4173
```

Jump straight to a stage while you work (handy when editing the book):

| URL | Shows |
| --- | --- |
| `http://127.0.0.1:4173/?jump=dark` | the opened, dark box |
| `http://127.0.0.1:4173/?jump=overhead` | the view down into the box, clothes and all |
| `http://127.0.0.1:4173/?jump=clear` | the same, with the clothes already moved off the booklet |
| `http://127.0.0.1:4173/?jump=book` | the open booklet |

The browser console (F12) lists every placeholder that is still in use.

## Make it yours

Everything you are meant to change lives in **`content/`** and **`assets/`**.

### 1. The introduction booklet — `content/book.md`

The booklet looks like a black-and-white assembly manual: numbered steps,
line drawings, a parts list, plain type. Every `[Placeholder — …]` in the file
is waiting for your own words. A quick reference sits at the top of the file:

```markdown
# Page title                   (not numbered)
## Step title                  numbered for you: 1, 2, 3… through the whole booklet
### Small heading
A paragraph. Leave an empty line between paragraphs.
> A note — shown in a box with a "!"
- A list item
- 2× socks                     a number and × make a parts-list line
**bold**  *italic*  ==highlighted words==  [a link](https://example.com)
![what the picture shows](assets/manual/figure-wave.svg "optional caption")
---                            ← three dashes start a new page
```

Ready-made line drawings live in `assets/manual/`: `figure-wave`,
`figure-read`, `figure-think`, `figure-phone`, `two-people`, `parts`, `check`
and `cross` (redraw them with `python tools/generate_manual.py`). Your own
drawings work too — black lines on white suit the style.

Long passages flow onto the next page by themselves, and phones show one page
at a time with the same comfortable text size, so you never count words.

### 2. On-screen words — `content/site.js` → `text`

The instruction ("Hold and drag to cut the tape."), the book title on the
cover, the "this little book belongs to" label, button labels and so on.

### 3. Artwork — `assets/art/` + `content/site.js` → `art`

Put your file in `assets/art/`, then change its path in `content/site.js`:

```js
boxFront: 'assets/art/box-front.png',
```

The six box layers already hold finished cardboard art (in `assets/art/`);
swap them only if you want your own box. The booklet's cover and inside cover
are finished manual-style drawings (`python tools/generate_manual.py` redraws
them); only the question mark is still a placeholder.

The box is built in 3D from flat layers, so **one set of layers serves every
viewpoint** — the three-quarter view, the camera move, and the overhead view.
Keep each layer's proportions (any size works; about 3× the listed size looks
crisp on high-density screens). SVG, PNG, JPG and WebP all work.

| Key | Proportions (px) | Where it appears | Notes |
| --- | --- | --- | --- |
| `boxFront` | 420 × 220 | front and back walls, outside | address label, stamps, doodles |
| `boxSide` | 300 × 220 | left and right walls, outside | the tape runs down the middle of the top 64 px |
| `flapLong` | 420 × 150 | the two long top flaps, outside | the tape runs along the 150 px edge |
| `flapShort` | 300 × 150 | the two short top flaps, outside | mostly hidden under the long flaps |
| `boxInside` | 420 × 220 | inner walls and the underside of every flap | seen in the dark and overhead views |
| `boxFloor` | 420 × 300 | the floor inside the box | the figurine, the food, the booklet and the books lie on it |
| `bookCover` | 360 × 500 | the booklet's cover (in the box and when it flies out) | leave the top ~30 % calm: the title is written there |
| `endpaper` | 360 × 500 | inside of the cover, first left page | the owner label sits at the bottom |
| `desiccant` | 24 × 34 | the silica-gel packet in the front-right corner of the floor | redrawn without any maker's name (`python tools/generate_props.py`) |
| `questionMark` | about 200 × 280 | the glowing question mark | **transparent background**; light colours glow best |
| `instruction` | any | optional image of your handwritten instruction | transparent background; replaces the typed text |

Layers that are **not** needed: separate drawings for the overhead view, the
open flaps or the book's sides — those come from the same layers (the page
edges and spine are drawn in CSS). If you would rather have hand-drawn page
edges or a spine, ask and they can become layers too.

If a path is wrong or a file is missing, the site falls back to the built-in
art for that layer and the console says which file it could not find.

### 4. Your figurine and the food — `assets/figurine/`, `assets/food/` + `content/site.js` → `figurine`, `food`

Along the left wall you lie as a small painted figurine, sealed in a
crinkled clear bag; beside it five loose pieces of food (sushi, fries,
strawberries, a fruit bowl and dumplings). Visitors can pick each one up and
move it. It only slides, never turns or tips, and it comes to rest level on
whatever lies beneath: the floor, a book, the clothes, another piece. The
figurine stays inside the box; the food may go anywhere, even out onto the
flaps or the table.

**The figurine.** It is made from your photo with an image model, then
finished by a tool:

1. Generate candidates from your photo (a 1600 px copy of it) with the prompt
   in `docs/superpowers/plans/2026-10-22-figurine-food-books.md`, Task 1: a
   real hand-painted resin figure of you on light grey, photographed from
   above. Any image model will do — the Gemini or ChatGPT app, or the
   OpenRouter tool with a key in `F:\parcel-art\.env` (outside the
   repository; never committed, printed or pasted anywhere). Save the
   candidates to `F:\parcel-art\candidates\` and pick the one that looks
   most like you: tall, the whole figure in frame, at least 1000 px long.
2. Make the four pictures from your pick:

       python tools/prepare_figurine.py <chosen.png> assets/figurine --u2net F:/portrait-collage/models/u2netp.onnx

   It cuts the figure off its plain background, taking the backdrop's
   shadows and uneven light with it. `--u2net PATH` holds that cut to the
   u2net model's outline of the figure, so that parts as grey as the backdrop
   (pale sandals, clear glasses) stay; without it the colour key works alone,
   and on a background that is not plain the model does. It stands it upright
   (`--turn auto|0|90|-90|180`), sizes it to the figure the clothes were
   fitted to (248 units from head to sole), matches it to the box's light and
   wraps it in a clear pillow bag with crimped seals. It writes
   `figurine.webp`, `figurine-relief.webp` (its height, for the 3D surface),
   `wrap.webp` and `wrap-relief.webp` (the bag), each 500 × 1160 px: the
   figurine's 125 × 290-unit footprint at 4 px a unit.

**The food.** It comes from your photos, cut out without brands:

    python tools/prepare_food.py <folder with the photos> assets/food

It writes `<id>.webp` and `<id>-relief.webp` for each piece, and
`food.json`. Brand marks are painted out first: each box in `ITEMS` (in
`tools/prepare_food.py`) is filled from the colours of a thin ring around it,
so the fries' "M" becomes the packet's own red, the strawberries' label
blank paper and the chopsticks' wrapper plain. The sizes and heights match
`FOOD` in `js/scene/geometry.js`.

`figurine.alt` and each `food[].alt` in `content/site.js` describe them for
screen-reader users. The current texts are drafts marked
"[Draft — check this]": reword them, then remove the mark. Without WebGL 2,
the figurine and the food lie still as pictures.

### 5. Your handwriting

Either point `handwriting.font` at a handwriting font made from your own
writing (for example with a free font-from-handwriting service), and every
handwritten line on screen — the instruction and the hints —
uses it, or keep the bundled Caveat font. (The booklet itself is typeset,
like a real manual.)
For single pieces (the instruction, the question mark) use images, above.

### 6. Sounds — `assets/sounds/` + `content/site.js` → `sounds`

The bundled sounds are simple synthesised stand-ins. Replace any of them with
WAV, MP3 or OGG files. `cut` must loop seamlessly — it plays only while the
knife is moving on the tape.

### 7. The clothes — `assets/clothes/`

A loose pile of clothes hides the booklet: a qipao, a mandarin-collar blouse,
a horse-face (mamianqun) skirt and five high-street basics, all without brand
names. Each garment is soft cloth in a small physics simulation, so visitors
can press, hold and drag one anywhere — even out of the box — and it bends
and drapes as it moves, then settles and stays where it lands. With a
keyboard, Tab reaches a "Move the … aside" button for each garment. The
booklet opens once most of its cover is uncovered; the rule is
`isBookUncovered` in `js/cloth/coverage.js`.

`npm run clothes` redraws the garments (`tools/generate_clothes.py`, with the
drawing code in `tools/clothes/`: `canvas.py`, `fabrics.py`, `details.py`,
`motifs.py`, `traditional.py`, `modern.py`, and `fit.py`, which sizes every
garment to the figure in your figurine) and settles the pile around the
figurine and the food (`tools/build-pile.mjs`). Each garment is a colour picture with no
painted shading plus a relief map (seams, hems, piping, closures, weave)
that the site lights with the box's lamp. `--only qipao,blouse` redraws just
those. The pile is kept only if it hides the booklet, leaves the figurine
and the food bare and shows at least six garments' signature features. `npm run test:py` tests the
Python tools; `node tools/shots.mjs` takes screenshots into `shots/`: the overhead view,
close-ups of the figurine and the books, and the fruit bowl held over the
clothes.
The Python tools need Pillow, NumPy and SciPy (and pytest for the tests).

The `label` in `assets/clothes/garments.json` is what screen
readers and the keyboard buttons call each garment.

Browsers without WebGL 2 skip the clothes; the booklet is then free to open.

### 8. Your books — `content/site.js` → `books`

Four books lie in the lower right: *Hunter × Hunter*, a German-Chinese
dictionary, *One Hundred Years of Solitude* (Gabriel García Márquez) and
*Siddhartha* (Hermann Hesse). `npm run books` (`tools/generate_books.py`)
draws their covers in the site's own fonts — titles only, no publisher
marks. Each book is as thick as the real one and casts a shadow along the
box's light. Their places and sizes are `BOOKS` in `js/scene/geometry.js`; each
book's `alt` text in `content/site.js` is what screen readers say.

### Still needed from you

- [ ] The booklet text in `content/book.md`, the cover title (`bookTitle`) and `ownerName`
- [ ] Check and reword the figurine's and the food's `alt` descriptions (`figurine.alt`, `food[].alt`)
- [ ] Artwork: `questionMark` (and optionally `instruction`) — the box, booklet, food, books and desiccant are done
- [ ] Your handwriting (font or images), if you want it instead of Caveat
- [ ] The site title and description (`meta` in `content/site.js`)

## How it works

| Part | File |
| --- | --- |
| stages and transitions (sealed → cutting → dark → overhead → book) | `js/core/state-machine.js`, `js/flow.js` |
| the 3D parcel and camera (looking down into the box, tilted 14°); the books' cast and contact shadows | `js/scene/*`, `css/scene.css` |
| the clothes: cloth physics, a smooth surface drawn finer than simulated, relief maps lit by the box's lamp, textures at the screen's resolution, shadows, dragging, keyboard moves, the booklet lock | `js/cloth/*` |
| the figurine and the food: rigid bodies that only slide and rest level on what lies beneath, drawn as heightfields from their relief maps in the same light and shadows, the bag a clear film over the figurine | `js/rigid/*`, `js/gl/common.js` |
| cutting (mouse, touch, keyboard) and the traced slit | `js/tape/*` |
| the book: pagination, page turning, the flying cover | `js/book/*`, `css/book.css` |
| sound, preloading, controls | `js/audio/sound.js`, `js/loader/preload.js`, `js/ui/controls.js` |

Page turning uses [StPageFlip](https://github.com/Nodlik/StPageFlip) (MIT),
included in `vendor/page-flip/`.

Accessibility: every stage works with the keyboard (Tab to the tape, hold →
to cut; Enter on the question mark; Enter on each "Move the … aside" button,
then on the booklet; ← → Home End to read; Esc to close). Reduced-motion settings swap camera moves and zooms for gentle fades
and make page buttons turn instantly. Custom cursors appear only for mice and
trackpads.

## Tests

```bash
npm install                       # once, installs Playwright (uses your installed Chrome)
npm test                          # unit tests for the pure logic
npm run test:py                   # the Python tools (needs pytest)
npm run test:e2e                  # full journeys in Chrome: mouse, touch, keyboard, reduced motion
```

## Publishing on GitHub Pages

All paths are relative, so the site works at `https://<you>.github.io/` and at
`https://<you>.github.io/<repository>/`. Push the files to a repository, then
enable **Settings → Pages → Deploy from a branch → `main` / root**.

Regenerate the built-in box art, placeholders, textures and sounds with `npm run assets:placeholders`
(needs Python with Pillow and NumPy).

## Credits

- Fonts: Caveat and Noto Sans, SIL Open Font License (`assets/fonts/OFL-*.txt`).
- Page turning: StPageFlip © 2020 Nodlik, MIT (`vendor/page-flip/LICENSE`).
- Cloth simulation: after Matthias Müller's [Ten Minute Physics](https://matthias-research.github.io/pages/) cloth demos, MIT (notice in `js/cloth/hash.js`).
- Box art, placeholder art, textures and sounds: generated by `tools/generate_placeholders.py`.
- Clothes, booklet drawings, the desiccant packet and the hand cursors: generated by `tools/generate_clothes.py`, `tools/generate_manual.py`, `tools/generate_props.py` and `tools/generate_cursors.py`.
- The figurine: generated from the owner's photo with an image model and finished by `tools/prepare_figurine.py`. The food: the owner's photos, cut out by `tools/prepare_food.py`. Book covers: drawn by `tools/generate_books.py` in the bundled Noto Sans (SIL OFL).
