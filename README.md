# A parcel for you

A hand-made, interactive personal website. Visitors cut the tape on a parcel,
peer into the dark box, look down into it, and read a little book about you.
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
| `http://127.0.0.1:4173/?jump=overhead` | the view down into the box |
| `http://127.0.0.1:4173/?jump=book` | the open book |

The browser console (F12) lists every placeholder that is still in use.

## Make it yours

Everything you are meant to change lives in **`content/`** and **`assets/`**.

### 1. The introduction book — `content/book.md`

Write in plain text. A quick reference sits at the top of the file:

```markdown
# Big handwritten heading
## Smaller handwritten heading
A paragraph. Leave an empty line between paragraphs.
> A handwritten note in the margin.
- A list item
**bold**  *italic*  ==handwriting inside a sentence==  [a link](https://example.com)
![what the picture shows](assets/art/my-drawing.png "optional caption")
---            ← three dashes start a new page
```

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
swap them only if you want your own box. The book cover, endpaper and question
mark are still placeholders.

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
| `boxFloor` | 420 × 300 | the floor inside the box | the photo and book lie on it |
| `bookCover` | 360 × 500 | the book's cover (in the box and when it flies out) | leave the top ~30 % calm: the title is written there |
| `endpaper` | 360 × 500 | inside of the cover, first left page | a pattern works well |
| `questionMark` | about 200 × 280 | the glowing question mark | **transparent background**; light colours glow best |
| `instruction` | any | optional image of your handwritten instruction | transparent background; replaces the typed text |

Layers that are **not** needed: separate drawings for the overhead view, the
open flaps or the book's sides — those come from the same layers (the page
edges and spine are drawn in CSS). If you would rather have hand-drawn page
edges or a spine, ask and they can become layers too.

If a path is wrong or a file is missing, the site falls back to the built-in
art for that layer and the console says which file it could not find.

### 4. Your photo — `assets/photo/` + `content/site.js` → `photo`

A portrait around 4 : 5 (it is cropped to fit the photo card). Also set
`photo.alt` to a short description for screen-reader users, and optionally
`text.photoCaption` for a handwritten caption under it.

### 5. Your handwriting

Either point `handwriting.font` at a handwriting font made from your own
writing (for example with a free font-from-handwriting service), and every
handwritten heading, note and label uses it — or keep the bundled Caveat font.
For single pieces (the instruction, the question mark) use images, above.

### 6. Sounds — `assets/sounds/` + `content/site.js` → `sounds`

The bundled sounds are simple synthesised stand-ins. Replace any of them with
WAV, MP3 or OGG files. `cut` must loop seamlessly — it plays only while the
knife is moving on the tape.

### Still needed from you

- [ ] Artwork layers: `bookCover`, `endpaper`, `questionMark` (and optionally `instruction`) — the box itself is done
- [ ] Your photo, plus its `alt` description
- [ ] Your handwriting (font or images), if you want it instead of Caveat
- [ ] The book text in `content/book.md`, the cover title and `ownerName`
- [ ] The site title and description (`meta` in `content/site.js`)

## How it works

| Part | File |
| --- | --- |
| stages and transitions (sealed → cutting → dark → overhead → book) | `js/core/state-machine.js`, `js/flow.js` |
| the 3D parcel and camera | `js/scene/*`, `css/scene.css` |
| cutting (mouse, touch, keyboard) and the traced slit | `js/tape/*` |
| the book: pagination, page turning, the flying cover | `js/book/*`, `css/book.css` |
| sound, preloading, controls | `js/audio/sound.js`, `js/loader/preload.js`, `js/ui/controls.js` |

Page turning uses [StPageFlip](https://github.com/Nodlik/StPageFlip) (MIT),
included in `vendor/page-flip/`.

Accessibility: every stage works with the keyboard (Tab to the tape, hold →
to cut; Enter on the question mark and the book; ← → Home End to read; Esc to
close). Reduced-motion settings swap camera moves and zooms for gentle fades
and make page buttons turn instantly. Custom cursors appear only for mice and
trackpads.

## Tests

```bash
npm install                       # once, installs Playwright (uses your installed Chrome)
npm test                          # unit tests for the pure logic
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
- Box art, placeholder art, textures and sounds: generated by `tools/generate_placeholders.py`.
