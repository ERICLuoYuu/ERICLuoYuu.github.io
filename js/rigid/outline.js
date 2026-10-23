/**
 * A body's outline as resting sees it: where its picture is opaque, on a
 * grid of CELL-sized cells over its footprint. What a body rests on is found
 * along the outline's edge and at the colliders' own corners inside it (see
 * rest.supportOf); cloth, wherever the outline lies over it. Built once per
 * body, in the body's own unturned frame: x across its width, y across its
 * depth, both from its centre; v = 0 at the back, like the top of its
 * picture. Pure — no DOM.
 */

import { rotateZ } from '../scene/geometry.js';

const CELL = 0.5; // units: the outline follows its picture this closely
const OPAQUE = 0.5; // a cell is part of the outline where its picture is at least this opaque
const rects = new Map(); // the outlines of bodies without a picture, by footprint and inset

/**
 * @param {{footprint: number[]}} def
 * @param {(u: number, v: number) => number} alpha  the picture's opacity, 0…1, at (u, v)
 * @returns {{footprint: number[], cols: number, rows: number, size: number[], cells: Uint8Array, edge: Float64Array}}
 *   cells: 1 where opaque, row by row from the back left; edge: x, y pairs in
 *   the body's own frame, every corner of a side between an opaque cell and
 *   the outside.
 */
export function outlineOf({ footprint: [w, d] }, alpha) {
  const cols = Math.max(1, Math.ceil(w / CELL));
  const rows = Math.max(1, Math.ceil(d / CELL));
  const [cw, cd] = [w / cols, d / rows];
  const cells = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) cells[j * cols + i] = alpha((i + 0.5) / cols, (j + 0.5) / rows) >= OPAQUE ? 1 : 0;
  }
  const opaque = (i, j) => i >= 0 && j >= 0 && i < cols && j < rows && cells[j * cols + i] === 1;
  const corners = new Uint8Array((cols + 1) * (rows + 1));
  const mark = (pairs) => pairs.forEach(([i, j]) => { corners[j * (cols + 1) + i] = 1; });
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      if (!opaque(i, j)) continue;
      if (!opaque(i - 1, j)) mark([[i, j], [i, j + 1]]);
      if (!opaque(i + 1, j)) mark([[i + 1, j], [i + 1, j + 1]]);
      if (!opaque(i, j - 1)) mark([[i, j], [i + 1, j]]);
      if (!opaque(i, j + 1)) mark([[i, j + 1], [i + 1, j + 1]]);
    }
  }
  const edge = [];
  corners.forEach((on, k) => {
    if (on) edge.push(-w / 2 + (k % (cols + 1)) * cw, -d / 2 + Math.floor(k / (cols + 1)) * cd);
  });
  return Object.freeze({ footprint: [w, d], cols, rows, size: [cw, cd], cells, edge: Float64Array.from(edge) });
}

/** The body's outline: from its picture, or for a body without one its inset footprint. */
export function outlineFor(body) {
  if (body.outline) return body.outline;
  const key = `${body.footprint.join('×')}/${body.inset}`;
  if (!rects.has(key)) {
    const half = (1 - body.inset) / 2;
    rects.set(key, outlineOf(body, (u, v) => (Math.abs(u - 0.5) <= half && Math.abs(v - 0.5) <= half ? 1 : 0)));
  }
  return rects.get(key);
}

/** Is the point (x, y) of the body's own frame on its outline, or within `reach` of it? */
export function coversLocal({ footprint: [w, d], cols, rows, size: [cw, cd], cells }, x, y, reach = 0) {
  const [i0, i1] = [Math.floor((x - reach + w / 2) / cw), Math.floor((x + reach + w / 2) / cw)];
  const [j0, j1] = [Math.floor((y - reach + d / 2) / cd), Math.floor((y + reach + d / 2) / cd)];
  for (let j = Math.max(0, j0); j <= Math.min(rows - 1, j1); j += 1) {
    for (let i = Math.max(0, i0); i <= Math.min(cols - 1, i1); i += 1) {
      if (cells[j * cols + i]) return true;
    }
  }
  return false;
}

/** Is floor point (x, y) on the body's outline where it lies now, or within `reach` of it? */
export function outlineCovers(body, [x, y], reach = 0) {
  const [cx, cy] = body.position;
  const [lx, ly] = rotateZ([x - cx, y - cy, 0], -body.rotate);
  return coversLocal(outlineFor(body), lx, ly, reach);
}
