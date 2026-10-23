/**
 * Builds the CSS-3D parcel: floor, four walls (outside + inside), four flaps,
 * the split tape, the contents and the question mark. Geometry lives in CSS
 * (scene.css) driven by the custom properties set here from BOX/CONTENTS.
 */

import {
  BOX, CONTENTS, BOOKS, FIGURINE, FOOD, FLAP_OPEN, baseOf, tapeCorners,
} from './geometry.js';
import { cssUrl } from '../core/env.js';
import { castShadow, localOffset, shadowHull } from './shadow.js';

const SIDES = ['front', 'back', 'left', 'right'];

function h(tag, className = '', attrs = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

/** A 1px marker whose on-screen position reveals where a 3D point projects. */
function probe(x, y, z = 0) {
  const el = h('i', 'probe', { 'aria-hidden': 'true' });
  el.style.transform = `translate3d(${x}px, ${y}px, ${z}px)`;
  return el;
}

function buildWall(side) {
  const isLong = side === 'front' || side === 'back';
  const wall = h('div', `wall ${side}`);
  wall.append(
    h('div', `face outer cardboard ${isLong ? 'art-box-front' : 'art-box-side'}`),
    h('div', 'face inner cardboard inside art-box-inside'),
  );
  if (!isLong) wall.append(h('div', 'tape-drop'));
  return wall;
}

function buildFlap(side) {
  const isLong = side === 'front' || side === 'back';
  const flap = h('div', `flap ${side}`);
  const length = isLong ? BOX.width : BOX.depth;
  // Corner markers (hinge-left, hinge-right, tip-right, tip-left), matching solids.flapCorners().
  const corners = [[0, BOX.flapDepth], [length, BOX.flapDepth], [length, 0], [0, 0]].map(([u, v]) => {
    const marker = probe(u, v);
    marker.classList.add('flap-probe');
    return marker;
  });
  flap.append(
    h('div', `face outer cardboard ${isLong ? 'art-flap-long' : 'art-flap-short'}`),
    h('div', 'face inner cardboard liner art-box-inside'),
    ...corners,
  );
  let tapeSvg = null;
  if (isLong) {
    const holder = h('div', 'tape-half');
    tapeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    holder.append(tapeSvg);
    flap.append(holder);
  }
  return { flap, tapeSvg };
}

/** The silica-gel packet: a small static prop the clothes can rest against. */
function buildDesiccant() {
  const { x, y, width, height, rotate } = CONTENTS.desiccant;
  const img = h('img', 'desiccant', { alt: '', draggable: 'false' });
  img.style.cssText = `left:${x}px;top:${y}px;width:${width}px;height:${height}px;--rot:${rotate}deg;`
    + `--base:${baseOf(CONTENTS.desiccant)}px`;
  return img;
}

/** CSS for a book's cast shadow: its offset along the light, the outline it and its shadow cover, and its softness. */
function shadowStyle({ width, height, thickness, rotate }) {
  const [sx, sy] = localOffset(castShadow(thickness), rotate);
  const [x0, y0] = [Math.min(0, sx), Math.min(0, sy)]; // the shadow box starts here, so the outline is relative to it
  const hull = shadowHull(width, height, [sx, sy]).map(([px, py]) => `${(px - x0).toFixed(1)}px ${(py - y0).toFixed(1)}px`);
  return `--sx:${sx.toFixed(2)}px;--sy:${sy.toFixed(2)}px;--hull:polygon(${hull.join(', ')});`
    + `--sblur:${(1 + 0.12 * thickness).toFixed(2)}px`;
}

/**
 * One of the owner's books: a block like the booklet. Its top is a board in
 * the cover's colour with the cover image on it, so a cover that fails to
 * load leaves a plain book rather than a hollow one. It casts a shadow along
 * the scene's light, as far as it is thick, and sits on a tight contact shadow.
 */
function buildTome({ id, x, y, width, height, thickness, rotate, ...item }) {
  const tome = h('div', 'tome', { 'data-book': id });
  tome.style.cssText = `left:${x}px;top:${y}px;--bw:${width};--bh:${height};--bt:${thickness};`
    + `--rot:${rotate}deg;--base:${baseOf(item)}px;${shadowStyle({ width, height, thickness, rotate })}`;
  const top = h('div', 'tome-top inside');
  const cover = h('img', 'tome-cover', { alt: '', draggable: 'false' });
  top.append(cover);
  const shadow = h('div', 'book-shadow');
  shadow.append(h('div', 'book-shadow-shape'));
  tome.append(
    shadow,
    h('div', 'book-contact'),
    ...['front', 'back', 'right'].map((s) => h('div', `book-edge pages ${s} inside`)),
    h('div', 'book-edge spine left inside'),
    top,
  );
  return { el: tome, cover };
}

/** One body as a still picture lying at its top, its shadow cast along the light. */
function buildSolid({ id, footprint: [w, d], height, start: [cx, cy], rotate }, withWrap) {
  const el = h('div', 'solid', { 'data-id': id });
  const [sx, sy] = localOffset(castShadow(height), rotate);
  el.style.cssText = `left:${cx - w / 2}px;top:${cy - d / 2}px;width:${w}px;height:${d}px;--rot:${rotate}deg;`
    + `--lift:${height}px;--sx:${sx.toFixed(2)}px;--sy:${sy.toFixed(2)}px;--sblur:${(1 + 0.12 * height).toFixed(2)}px`;
  const img = h('img', 'solid-img', { alt: '', draggable: 'false' });
  const wrap = withWrap ? h('img', 'solid-wrap', { alt: '', 'aria-hidden': 'true', draggable: 'false' }) : null;
  el.append(...[img, wrap].filter(Boolean));
  return { el, img, wrap };
}

/**
 * The figurine (in its bag) and the food as still pictures at their starting
 * places: what shows without WebGL2, and what screen readers hear. While the
 * clothes layer draws them as bodies that can be moved, they step aside
 * (.is-handed-over, set by main.js).
 */
export function buildSolids() {
  const figurine = buildSolid(FIGURINE, true);
  const food = Object.fromEntries(FOOD.map((def) => {
    const { el, img } = buildSolid(def, false);
    return [def.id, { el, img }];
  }));
  return { figurine, food };
}

function buildBook(text) {
  const { x, y, width, height, thickness, rotate } = CONTENTS.book;
  const book = h('div', 'book3d');
  book.style.cssText = `left:${x}px;top:${y}px;--bw:${width};--bh:${height};--bt:${thickness};--rot:${rotate}deg`;
  const cover = h('button', 'book-top inside', { type: 'button', 'aria-label': text.bookLabel, tabindex: '-1' });
  const title = h('span', 'book-title', { 'aria-hidden': 'true' });
  title.textContent = text.bookTitle;
  const corners = [[0, 0], [width, 0], [width, height], [0, height]].map(([px, py]) => probe(px, py));
  cover.append(title, ...corners);
  book.append(
    h('div', 'book-shadow'),
    ...['front', 'back', 'right'].map((s) => h('div', `book-edge pages ${s} inside`)),
    h('div', 'book-edge spine left inside'),
    cover,
  );
  return { el: book, button: cover, corners };
}

/** Apply artwork and texture paths as CSS custom properties on the parcel. */
export function applyArt(parcel, art, textures) {
  const map = {
    '--art-box-front': art.boxFront,
    '--art-box-side': art.boxSide,
    '--art-flap-long': art.flapLong,
    '--art-flap-short': art.flapShort,
    '--art-box-inside': art.boxInside,
    '--art-box-floor': art.boxFloor,
    '--art-book-cover': art.bookCover,
    '--tex-grain': textures.grain,
  };
  Object.entries(map).forEach(([prop, path]) => {
    if (path) parcel.style.setProperty(prop, cssUrl(path));
  });
}

export function buildParcel(container, { text }) {
  const parcel = h('div', 'parcel');
  const vars = {
    '--W': BOX.width, '--D': BOX.depth, '--H': BOX.height, '--F': BOX.flapDepth,
    '--T': BOX.tapeWidth, '--drop': BOX.tapeDrop, '--light': 0,
    ...Object.fromEntries(Object.entries(FLAP_OPEN).map(([side, deg]) => [`--open-${side}`, `${deg}deg`])),
  };
  Object.entries(vars).forEach(([k, v]) => parcel.style.setProperty(k, v));

  const book = buildBook(text);
  const desiccant = buildDesiccant();
  const books = Object.fromEntries(BOOKS.map((b) => [b.id, buildTome(b)]));
  const solids = buildSolids();
  const contents = h('div', 'contents');
  contents.append(
    ...Object.values(books).map((t) => t.el),
    desiccant,
    book.el,
    solids.figurine.el,
    ...Object.values(solids.food).map((f) => f.el),
  );

  const flaps = {};
  const tapeSvgs = {};
  SIDES.forEach((side) => {
    const { flap, tapeSvg } = buildFlap(side);
    flaps[side] = flap;
    if (tapeSvg) tapeSvgs[side] = tapeSvg;
  });

  const tapeProbes = tapeCorners().map(({ x, y, z }) => probe(x, y, z));

  const question = h('button', 'question', { type: 'button', 'aria-label': text.questionLabel, tabindex: '-1' });
  const glyph = h('span', 'question-glyph', { 'aria-hidden': 'true' });
  const glyphImg = h('img', 'question-img', { alt: '', draggable: 'false' });
  glyph.append(glyphImg);
  question.append(glyph);

  parcel.append(
    h('div', 'ground-shadow'),
    h('div', 'face floor cardboard inside art-box-floor'),
    h('div', 'floor-glow'),
    contents,
    ...SIDES.map(buildWall),
    flaps.left, flaps.right, flaps.front, flaps.back,
    ...tapeProbes,
    question,
  );
  container.append(parcel);

  return {
    parcel, flaps, tapeSvgs, tapeProbes, question, questionImg: glyphImg, book, books, desiccant, solids,
  };
}

/** Centre of an element's on-screen box (works for transformed 1px probes). */
export function screenPoint(el) {
  const r = el.getBoundingClientRect();
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}
