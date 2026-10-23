/**
 * Where the visitor's hand holds a garment. Pure — no DOM.
 *
 * The held cloth hangs from a point that follows the pointer across a
 * horizontal plane. That plane must clear whatever lies under the pointer —
 * a wall's rim, an open flap, the booklet, other cloth — or the garment would
 * be dragged through it.
 */

/**
 * Highest point of an oriented box on the vertical line at (x, y), or −∞.
 * The box is widened by `reach` along its lying-down axes only, so a thin
 * wall counts from a little way off, while a tilted flap keeps its true
 * surface height instead of growing thicker.
 */
export function boxTop({ center, axes, half }, x, y, reach) {
  let lo = -Infinity;
  let hi = Infinity;
  for (let k = 0; k < 3; k += 1) {
    const a = axes[k];
    const extent = half[k] + (Math.abs(a[2]) < 0.5 ? reach * Math.hypot(a[0], a[1]) : 0);
    const base = a[0] * (x - center[0]) + a[1] * (y - center[1]);
    if (Math.abs(a[2]) < 1e-9) {
      if (Math.abs(base) > extent) return -Infinity;
    } else {
      const t1 = (-extent - base) / a[2];
      const t2 = (extent - base) / a[2];
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
    }
  }
  return lo <= hi ? center[2] + hi : -Infinity;
}

/**
 * Height the hand must clear at (x, y): the highest collider top or cloth
 * surface within `reach`, or 0 for the floor and the table. Cloth of
 * garment `skip` (the one being held) does not count. With `moving: false`
 * neither does cloth that is awake: cloth lying on the held garment comes up
 * with it, and counted, it would lift the hand that lifts it, without end.
 */
export function supportHeight(world, colliders, x, y, options) {
  return supportUnder(world, colliders, [[x, y]], options);
}

/** The same for a footprint: the highest support within `reach` of any of `points` (a held patch). */
export function supportUnder(world, colliders, points, { reach = 20, skip = -1, moving = true } = {}) {
  let top = 0;
  colliders.forEach((box) => points.forEach(([x, y]) => { top = Math.max(top, boxTop(box, x, y, reach)); }));
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  points.forEach(([x, y]) => {
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  });
  const { pos, garmentOf, thickness, awake } = world;
  for (let i = 0; i < world.count; i += 1) {
    const g = garmentOf[i];
    if (g === skip || (!moving && awake[g])) continue;
    const [px, py, z] = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2] + thickness];
    if (z <= top || px < x0 - reach || px > x1 + reach || py < y0 - reach || py > y1 + reach) continue;
    if (points.some(([x, y]) => Math.abs(px - x) <= reach && Math.abs(py - y) <= reach)) top = z;
  }
  return top;
}

/**
 * Particles to hold for a pick hit: those of the hit garment within `radius`
 * of the hit point, or else the hit triangle's corner nearest to it.
 */
export function gripCluster({ pos, offsets, counts }, { garment, ids, point }, radius) {
  const distance2 = (i) => (pos[3 * i] - point[0]) ** 2 + (pos[3 * i + 1] - point[1]) ** 2 + (pos[3 * i + 2] - point[2]) ** 2;
  const held = [];
  for (let i = offsets[garment]; i < offsets[garment] + counts[garment]; i += 1) {
    if (distance2(i) <= radius * radius) held.push(i);
  }
  if (held.length > 0) return held;
  return [ids.reduce((best, i) => (distance2(i) < distance2(best) ? i : best))];
}

/** Where a ray meets the horizontal plane at height z, or null if it never does. */
export function onPlane({ origin, dir }, z) {
  if (Math.abs(dir[2]) < 1e-9) return null;
  const t = (z - origin[2]) / dir[2];
  if (t < 0) return null;
  return [origin[0] + dir[0] * t, origin[1] + dir[1] * t, z];
}
