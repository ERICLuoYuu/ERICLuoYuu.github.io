/**
 * Is the booklet still buried under the clothes? Pure — no DOM.
 */

/** Points spread evenly over the booklet's top (its CONTENTS entry, rotated like .book3d). */
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

/**
 * Share (0…1) of the booklet's top with cloth over it: a sample point counts
 * as covered when some core cloth particle above the cover lies within `radius`
 * of it, seen from above.
 */
export function bookCoverage(world, book, { cols = 8, rows = 11, radius = 9 } = {}) {
  const top = 0.6 + book.thickness + 0.5; // .book3d sits at translateZ(.6px)
  const points = samplePoints(book, cols, rows);
  const reach = Math.hypot(book.width, book.height) / 2 + radius;
  const cx = book.x + book.width / 2;
  const cy = book.y + book.height / 2;

  // Only cloth above the cover and near the booklet can cover it.
  const nearby = [];
  for (let i = 0; i < world.count; i += 1) {
    if (world.core && !world.core[i]) continue; // a transparent margin hides nothing
    const px = world.pos[3 * i];
    const py = world.pos[3 * i + 1];
    if (world.pos[3 * i + 2] > top && Math.hypot(px - cx, py - cy) < reach) nearby.push([px, py]);
  }
  const r2 = radius * radius;
  const covered = points.filter(([sx, sy]) => nearby.some(([px, py]) => (px - sx) ** 2 + (py - sy) ** 2 <= r2));
  return covered.length / points.length;
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
