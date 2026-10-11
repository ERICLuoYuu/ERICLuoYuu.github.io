/**
 * How much texture a screen can use. Pure — no DOM.
 *
 * Garment pictures hold several pixels per parcel unit (pxPerUnit in
 * garments.json) — enough for a sharp desktop screen. A phone shows the box
 * far smaller, so its textures are uploaded scaled down: the GPU holds a
 * fraction of the memory and the picture looks the same.
 */

import { BOX, frameFor } from '../scene/geometry.js';
import { projectPoint } from '../scene/projection.js';

/** Device pixels one parcel unit of floor spans in the overhead view of a vw × vh screen. */
export function floorPixelsPerUnit(vw, vh, ratio) {
  const frame = frameFor('overhead', vw, vh);
  const viewport = { width: vw, height: vh };
  const a = projectPoint(frame, viewport, [BOX.width / 2 - 50, BOX.depth / 2, 0]);
  const b = projectPoint(frame, viewport, [BOX.width / 2 + 50, BOX.depth / 2, 0]);
  return (Math.hypot(b.x - a.x, b.y - a.y) / 100) * ratio;
}

/**
 * Share of a texture's resolution worth uploading: what the screen needs,
 * with headroom for cloth lifted toward the eye, never above the file's own
 * resolution and never below `floor` pixels per unit.
 */
export function textureScale(pxPerUnit, need, { headroom = 1.25, floor = 1.5 } = {}) {
  return Math.min(1, Math.max(floor, need * headroom) / pxPerUnit);
}
