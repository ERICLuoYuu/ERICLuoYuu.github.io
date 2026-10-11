/**
 * The parcel's solid parts in parcel space (x right, y toward the front, z up),
 * worked out from the same transforms scene.css applies, so the clothes can
 * bump into them and the WebGL layer can hide clothes behind them. Pure — no DOM.
 */

import {
  BOX, CONTENTS, BOOKS, FLAP_OPEN, baseOf, rotateX, rotateZ,
} from './geometry.js';

const WALL = 2; // .face.inner sits 2px inside the outer face
const FLAP = 1; // .flap .face.inner sits 1px under the outer face

/** Each side, as scene.css builds it: a front-facing part turned about the box centre. */
const SIDES = Object.freeze({
  front: { turn: 0, half: BOX.depth / 2, length: BOX.width, lift: BOX.longFlapLift },
  back: { turn: 180, half: BOX.depth / 2, length: BOX.width, lift: BOX.longFlapLift },
  left: { turn: 90, half: BOX.width / 2, length: BOX.depth, lift: BOX.shortFlapLift },
  right: { turn: -90, half: BOX.width / 2, length: BOX.depth, lift: BOX.shortFlapLift },
});

const ORIGIN = [BOX.width / 2, BOX.depth / 2, 0]; // every wall and flap turns about the floor centre

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (a, s) => a.map((v) => v * s);

/**
 * A point on a flap. (u, v) are the flap element's own pixels: u along the
 * hinge, v from the tip (0) to the hinge (flapDepth); w goes out of the
 * outer face (0) toward the inner face (−1).
 */
function flapPoint(side, angle, u, v, w = 0) {
  const { turn, half, length, lift } = SIDES[side];
  const local = [u - length / 2, v - BOX.flapDepth, w];
  const swung = add([0, half, BOX.height + lift], rotateX(local, angle));
  return add(ORIGIN, rotateZ(swung, turn));
}

/** Corners of a flap's outer face: hinge-left, hinge-right, tip-right, tip-left. */
export function flapCorners(side, angle = FLAP_OPEN[side]) {
  const { length } = SIDES[side];
  const F = BOX.flapDepth;
  return [[0, F], [length, F], [length, 0], [0, 0]].map(([u, v]) => flapPoint(side, angle, u, v));
}

const unit = (v) => scale(v, 1 / Math.hypot(...v));

function obb(name, center, axes, half) {
  return Object.freeze({ kind: 'obb', name, center, axes: axes.map(unit), half });
}

function wallCollider(side) {
  const { turn, half, length, lift } = SIDES[side];
  const height = BOX.height + lift;
  const centre = add(ORIGIN, rotateZ([0, half - WALL / 2, height / 2], turn));
  const axes = [rotateZ([1, 0, 0], turn), rotateZ([0, 1, 0], turn), [0, 0, 1]];
  return obb(`wall-${side}`, centre, axes, [length / 2, WALL / 2, height / 2]);
}

function flapCollider(side) {
  const angle = FLAP_OPEN[side];
  const { length } = SIDES[side];
  const centre = flapPoint(side, angle, length / 2, BOX.flapDepth / 2, -FLAP / 2);
  const along = sub(flapPoint(side, angle, length, 0), flapPoint(side, angle, 0, 0));
  const across = sub(flapPoint(side, angle, 0, BOX.flapDepth), flapPoint(side, angle, 0, 0));
  const normal = sub(flapPoint(side, angle, 0, 0, 0), flapPoint(side, angle, 0, 0, -1));
  return obb(`flap-${side}`, centre, [along, across, normal], [length / 2, BOX.flapDepth / 2, FLAP / 2]);
}

/** Something lying flat on the floor (CONTENTS entry), raised by `base`. */
function floorItemCollider(name, { x, y, width, height, thickness, rotate }, base) {
  const centre = [x + width / 2, y + height / 2, base + thickness / 2];
  const axes = [rotateZ([1, 0, 0], rotate), rotateZ([0, 1, 0], rotate), [0, 0, 1]];
  return obb(name, centre, axes, [width / 2, height / 2, thickness / 2]);
}

/** Oriented boxes for the walls, the open flaps, the booklet, the desiccant and the books (the pack is cloth: js/cloth). */
export function boxColliders() {
  const sides = Object.keys(SIDES);
  return [
    ...sides.map(wallCollider),
    ...sides.map(flapCollider),
    floorItemCollider('book', CONTENTS.book, 0.6), // .book3d: translateZ(.6px)
    floorItemCollider('desiccant', CONTENTS.desiccant, baseOf(CONTENTS.desiccant)),
    ...BOOKS.map((b) => floorItemCollider(b.id, b, baseOf(b))),
  ];
}

/** The six faces of an oriented box, each as four corners in order. */
function obbFaces({ center, axes, half }) {
  const corner = (sx, sy, sz) => add(center, add(add(scale(axes[0], sx * half[0]), scale(axes[1], sy * half[1])), scale(axes[2], sz * half[2])));
  return [
    [corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)],
    [corner(-1, -1, -1), corner(-1, 1, -1), corner(1, 1, -1), corner(1, -1, -1)],
    [corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1)],
    [corner(-1, 1, -1), corner(-1, 1, 1), corner(1, 1, 1), corner(1, 1, -1)],
    [corner(-1, -1, -1), corner(-1, -1, 1), corner(-1, 1, 1), corner(-1, 1, -1)],
    [corner(1, -1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(1, -1, 1)],
  ];
}

/** The table (a wide plane at z = 0) and every face of every collider. */
export function occluderQuads() {
  const table = [[-900, -900, 0], [BOX.width + 900, -900, 0], [BOX.width + 900, BOX.depth + 900, 0], [-900, BOX.depth + 900, 0]];
  return [table, ...boxColliders().flatMap(obbFaces)];
}
