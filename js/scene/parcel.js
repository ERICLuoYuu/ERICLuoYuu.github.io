/**
 * Builds the CSS-3D parcel: floor, four walls (outside + inside), four flaps,
 * the split tape, the contents and the question mark. Geometry lives in CSS
 * (scene.css) driven by the custom properties set here from BOX/CONTENTS.
 */

import {
  BOX, CONTENTS, BOOKS, FLAP_OPEN, baseOf, tapeCorners,
} from './geometry.js';
import { cssUrl } from '../core/env.js';

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

/** The owner's vacuum pack, lying flat along the left wall. */
function buildPack() {
  const { x, y, width, height, thickness, rotate } = CONTENTS.pack;
  const pack = h('div', 'pack');
  pack.style.cssText = `left:${x}px;top:${y}px;width:${width}px;height:${height}px;--rot:${rotate}deg;--thick:${thickness}px`;
  const img = h('img', 'pack-img', { alt: '', draggable: 'false' });
  const shade = h('img', 'pack-shade', { alt: '', draggable: 'false', 'aria-hidden': 'true' });
  const body = h('div', 'pack-body');
  body.append(img, shade);
  pack.append(body);
  return { el: pack, img, shade };
}

/** The silica-gel packet: a small static prop the clothes can rest against. */
function buildDesiccant() {
  const { x, y, width, height, rotate } = CONTENTS.desiccant;
  const img = h('img', 'desiccant', { alt: '', draggable: 'false' });
  img.style.cssText = `left:${x}px;top:${y}px;width:${width}px;height:${height}px;--rot:${rotate}deg;`
    + `--base:${baseOf(CONTENTS.desiccant)}px`;
  return img;
}

/**
 * One of the owner's books: a block like the booklet. Its top is a board in
 * the cover's colour with the cover image on it, so a cover that fails to
 * load leaves a plain book rather than a hollow one.
 */
function buildTome({ id, x, y, width, height, thickness, rotate, ...item }) {
  const tome = h('div', 'tome', { 'data-book': id });
  tome.style.cssText = `left:${x}px;top:${y}px;--bw:${width};--bh:${height};--bt:${thickness};`
    + `--rot:${rotate}deg;--base:${baseOf(item)}px`;
  const top = h('div', 'tome-top inside');
  const cover = h('img', 'tome-cover', { alt: '', draggable: 'false' });
  top.append(cover);
  tome.append(
    h('div', 'book-shadow'),
    ...['front', 'back', 'right'].map((s) => h('div', `book-edge pages ${s} inside`)),
    h('div', 'book-edge spine left inside'),
    top,
  );
  return { el: tome, cover };
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

  const pack = buildPack();
  const book = buildBook(text);
  const desiccant = buildDesiccant();
  const books = Object.fromEntries(BOOKS.map((b) => [b.id, buildTome(b)]));
  const contents = h('div', 'contents');
  contents.append(pack.el, ...Object.values(books).map((t) => t.el), desiccant, book.el);

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
    parcel, flaps, tapeSvgs, tapeProbes, question, questionImg: glyphImg, book, books, pack, desiccant,
  };
}

/** Centre of an element's on-screen box (works for transformed 1px probes). */
export function screenPoint(el) {
  const r = el.getBoundingClientRect();
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}
