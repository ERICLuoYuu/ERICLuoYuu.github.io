/**
 * Rigid bodies: the figurine and the food. A body is an immutable record —
 * its definition (geometry.FIGURINE, geometry.FOOD) plus where it is now —
 * and every move makes a new one. Bodies only translate: they never turn or
 * tip. `position` is the footprint's centre and the height of its base.
 * Pure — no DOM.
 */

import { rotateZ } from '../scene/geometry.js';

const EPS = 1e-9;

/** A body at its starting place, on the floor and still. */
export function createBody(def) {
  return Object.freeze({ ...def, position: Object.freeze([...def.start, 0]), vz: 0 });
}

/** The same body at [x, y, z], falling at vz (0: still). */
export function withPosition(body, [x, y, z], vz = 0) {
  return Object.freeze({ ...body, position: Object.freeze([x, y, z]), vz });
}

/** A CONTENTS- or BOOKS-style rectangle (x, y its unturned top-left corner) as a body lying at `base`. */
export function fromRect({ id, x, y, width, height, thickness = 0, rotate = 0 }, base = 0) {
  const start = [x + width / 2, y + height / 2];
  const def = { id, label: id, footprint: [width, height], height: thickness, start, rotate, inset: 0, keepIn: false };
  return withPosition(createBody(def), [...start, base]);
}

/** Its rectangle in the CONTENTS style, for coverage: the full footprint, without the inset. */
export function areaOf({ position: [cx, cy], footprint: [w, d], rotate }) {
  return { x: cx - w / 2, y: cy - d / 2, width: w, height: d, rotate };
}

/** Half the footprint's width and depth, shrunk by the inset. */
const halves = ({ footprint: [w, d] }, inset) => [(w / 2) * (1 - inset), (d / 2) * (1 - inset)];

/** A point in the body's own turned frame → floor point. */
function toFloor({ position: [cx, cy], rotate }, [lx, ly]) {
  const [x, y] = rotateZ([lx, ly, 0], rotate);
  return [cx + x, cy + y];
}

/** The four corners of the (inset) footprint, on the floor. */
export function footprintCorners(body, { inset = body.inset } = {}) {
  const [hw, hd] = halves(body, inset);
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map((p) => toFloor(body, p));
}

/** A grid of floor points over the inset footprint, about `spacing` apart, its edges and corners included. */
export function footprintPoints(body, spacing = 8) {
  const [hw, hd] = halves(body, body.inset);
  const steps = (half) => Math.max(1, Math.ceil((2 * half) / spacing));
  const [nx, ny] = [steps(hw), steps(hd)];
  return Array.from({ length: (nx + 1) * (ny + 1) }, (_, k) => {
    const [i, j] = [k % (nx + 1), Math.floor(k / (nx + 1))];
    return toFloor(body, [-hw + (2 * hw * i) / nx, -hd + (2 * hd * j) / ny]);
  });
}

/** The oriented box the cloth collides with: the inset footprint, from the base up to the body's height. */
export function bodyCollider(body) {
  const [hw, hd] = halves(body, body.inset);
  const [cx, cy, z] = body.position;
  return Object.freeze({
    kind: 'obb',
    name: `body:${body.id}`,
    center: [cx, cy, z + body.height / 2],
    axes: [rotateZ([1, 0, 0], body.rotate), rotateZ([0, 1, 0], body.rotate), [0, 0, 1]],
    half: [hw, hd, body.height / 2],
  });
}

/** Do two bodies' turned footprints overlap (separating axes)? Touching is not overlapping. `inset` overrides both bodies' own. */
export function overlapXY(a, b, { inset } = {}) {
  const [pa, pb] = [a, b].map((body) => footprintCorners(body, { inset: inset ?? body.inset }));
  return [pa, pb].every((shape) => shape.every((c, i) => {
    const next = shape[(i + 1) % 4];
    const axis = [c[1] - next[1], next[0] - c[0]];
    const span = (pts) => pts.map(([x, y]) => x * axis[0] + y * axis[1]);
    const [sa, sb] = [span(pa), span(pb)];
    return Math.max(...sa) > Math.min(...sb) + EPS && Math.max(...sb) > Math.min(...sa) + EPS;
  }));
}

/** Is floor point (x, y) on the inset footprint, edges included? */
export function containsXY(body, [x, y]) {
  const [hw, hd] = halves(body, body.inset);
  const [cx, cy] = body.position;
  const [lx, ly] = rotateZ([x - cx, y - cy, 0], -body.rotate);
  return Math.abs(lx) <= hw + EPS && Math.abs(ly) <= hd + EPS;
}
