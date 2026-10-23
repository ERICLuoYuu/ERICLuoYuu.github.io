/**
 * Cast shadows for the CSS-3D books, from the same light as the clothes
 * (shading.LIGHT_DIR, upper left), so a book's shadow falls the way the
 * garments' do. Pure — no DOM.
 */

import { LIGHT_DIR } from '../cloth/shading.js';
import { rotateZ } from './geometry.js';

/** Parcel-space offset [dx, dy] of the shadow cast by something `height` tall onto the surface it lies on. */
export function castShadow(height, dir = LIGHT_DIR) {
  return [(-dir[0] / dir[2]) * height, (-dir[1] / dir[2]) * height];
}

/** The same offset in the frame of an item turned by `rotateDeg` (CSS rotate), so it still points the same way in the box. */
export function localOffset([dx, dy], rotateDeg) {
  const [lx, ly] = rotateZ([dx, dy, 0], -rotateDeg);
  return [lx, ly];
}

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/**
 * The convex hull of the rectangle (0, 0)–(width, height) and its copy moved
 * by [lx, ly]: the area the book and its shadow cover together. Clockwise on
 * screen (y down), starting at the leftmost, then topmost, corner.
 */
export function shadowHull(width, height, [lx, ly]) {
  const rect = [[0, 0], [width, 0], [width, height], [0, height]];
  const points = [...rect, ...rect.map(([x, y]) => [x + lx, y + ly])]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const chain = (list) => list.reduce((hull, p) => {
    const kept = [...hull];
    while (kept.length >= 2 && cross(kept[kept.length - 2], kept[kept.length - 1], p) <= 0) kept.pop();
    return [...kept, p];
  }, []);
  const lower = chain(points);
  const upper = chain([...points].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
