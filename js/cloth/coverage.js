/**
 * Is the booklet still buried under the clothes (or the food)? Pure — no DOM.
 */

/** Points spread evenly over a rectangle on the floor (a CONTENTS entry, rotated like .book3d). */
function samplePoints({ x, y, width, height, rotate }, cols, rows) {
  const a = (rotate * Math.PI) / 180;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const points = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const u = ((i + 0.5) / cols - 0.5) * width;
      const v = ((j + 0.5) / rows - 0.5) * height;
      points.push([cx + u * Math.cos(a) - v * Math.sin(a), cy + u * Math.sin(a) + v * Math.cos(a)]);
    }
  }
  return points;
}

/** Does an upright solid box (a rigid body's collider) stand over floor point (x, y), higher than `top`? */
function solidCovers({ center, axes, half }, [x, y], top) {
  if (center[2] + half[2] <= top) return false;
  const [dx, dy] = [x - center[0], y - center[1]];
  return [0, 1].every((k) => Math.abs(dx * axes[k][0] + dy * axes[k][1]) <= half[k]);
}

/**
 * Share (0…1) of a rectangle on the floor (CONTENTS style: `x`, `y` its
 * unturned top-left corner) that something lies over, seen from above: a
 * sample point counts as covered when some core cloth particle higher than
 * `top` lies within `radius` of it, or when one of `solids` (rigid bodies'
 * colliders) stands over it and reaches higher than `top`.
 */
export function coverageOf(world, area, top, { cols = 8, rows = 11, radius = 9, solids = [] } = {}) {
  const points = samplePoints(area, cols, rows);
  const reach = Math.hypot(area.width, area.height) / 2 + radius;
  const cx = area.x + area.width / 2;
  const cy = area.y + area.height / 2;

  // Only cloth above the top and near the rectangle can cover it.
  const nearby = [];
  for (let i = 0; i < world.count; i += 1) {
    if (world.core && !world.core[i]) continue; // a transparent margin hides nothing
    const px = world.pos[3 * i];
    const py = world.pos[3 * i + 1];
    if (world.pos[3 * i + 2] > top && Math.hypot(px - cx, py - cy) < reach) nearby.push([px, py]);
  }
  const r2 = radius * radius;
  const covered = points.filter((p) => solids.some((box) => solidCovers(box, p, top))
    || nearby.some(([px, py]) => (px - p[0]) ** 2 + (py - p[1]) ** 2 <= r2));
  return covered.length / points.length;
}

/** Share (0…1) of the booklet's top hidden under cloth, or under `solids` lying on it. */
export function bookCoverage(world, book, options) {
  return coverageOf(world, book, 0.6 + book.thickness + 0.5, options); // .book3d sits at translateZ(.6px)
}

/**
 * The rule that unlocks the booklet once enough clothes are moved off it.
 *
 * @param {number} coverage      share of the cover under cloth, 0 (bare) … 1 (buried)
 * @param {boolean} wasUncovered what this rule answered last time
 * @returns {boolean} true when the visitor may open the booklet
 *
 * TODO(owner): this is yours to decide — see the note in the chat. Things to weigh:
 *  - How much may still be covered? A sleeve over one corner feels fine;
 *    half the cover buried probably does not.
 *  - Hysteresis: use `wasUncovered` so that a garment sliding back and forth
 *    over the edge does not lock and unlock the booklet again and again
 *    (e.g. unlock below one threshold, lock again only above a higher one).
 * Provisional rule until then: open when less than 35 % is covered.
 */
export function isBookUncovered(coverage, wasUncovered) { // eslint-disable-line no-unused-vars
  return coverage < 0.35;
}

/** Can particle i be seen from above: no cloth lies over it within `radius`? */
export function isExposed(world, i, radius = 7) {
  const x = world.pos[3 * i];
  const y = world.pos[3 * i + 1];
  const above = world.pos[3 * i + 2] + world.thickness / 2;
  const r2 = radius * radius;
  for (let j = 0; j < world.count; j += 1) {
    const p = 3 * j;
    if (world.pos[p + 2] > above && (world.pos[p] - x) ** 2 + (world.pos[p + 1] - y) ** 2 < r2) return false;
  }
  return true;
}
