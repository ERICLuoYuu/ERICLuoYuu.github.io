/**
 * Builds the CSS-3D parcel: floor, four walls (outside + inside), four flaps,
 * the split tape, the contents and the question mark. Geometry lives in CSS
 * (scene.css) driven by the custom properties set here from BOX/CONTENTS.
 */

import { BOX, CONTENTS, tapeCorners } from './geometry.js';
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
  flap.append(
    h('div', `face outer cardboard ${isLong ? 'art-flap-long' : 'art-flap-short'}`),
    h('div', 'face inner cardboard liner art-box-inside'),
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

function buildPhoto(text) {
  const { x, y, width, height, rotate } = CONTENTS.photo;
  const card = h('figure', 'photo-card print');
  card.style.cssText = `left:${x}px;top:${y}px;width:${width}px;height:${height}px;--rot:${rotate}deg`;
  const frame = h('div', 'photo-frame inside');
  const img = h('img', 'photo-img', { alt: '', draggable: 'false' });
  const caption = h('figcaption', 'photo-caption hand');
  caption.textContent = text.photoCaption || '';
  frame.append(img, caption, h('span', 'washi', { 'aria-hidden': 'true' }));
  card.append(frame);
  return { el: card, img };
}

/** The silica-gel packet: a small static prop the clothes can rest against. */
function buildDesiccant() {
  const { x, y, width, height, rotate } = CONTENTS.desiccant;
  const img = h('img', 'desiccant', { alt: '', draggable: 'false' });
  img.style.cssText = `left:${x}px;top:${y}px;width:${width}px;height:${height}px;--rot:${rotate}deg`;
  return img;
}

function buildBook(text) {
  const { x, y, width, height, thickness, rotate } = CONTENTS.book;
  const book = h('div', 'book3d');
  book.style.cssText = `left:${x}px;top:${y}px;--bw:${width};--bh:${height};--bt:${thickness};--rot:${rotate}deg`;
  const cover = h('button', 'book-top inside', { type: 'button', 'aria-label': text.bookLabel, tabindex: '-1' });
  const title = h('span', 'book-title hand', { 'aria-hidden': 'true' });
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
  };
  Object.entries(vars).forEach(([k, v]) => parcel.style.setProperty(k, v));

  const photo = buildPhoto(text);
  const book = buildBook(text);
  const desiccant = buildDesiccant();
  const contents = h('div', 'contents');
  contents.append(photo.el, desiccant, book.el);

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

  return { parcel, flaps, tapeSvgs, tapeProbes, question, questionImg: glyphImg, book, photo, desiccant };
}

/** Centre of an element's on-screen box (works for transformed 1px probes). */
export function screenPoint(el) {
  const r = el.getBoundingClientRect();
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}
