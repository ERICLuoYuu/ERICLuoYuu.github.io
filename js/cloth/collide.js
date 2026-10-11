/**
 * Collision responses for the cloth solver: the floor/table plane, oriented
 * boxes (walls, flaps, booklet, desiccant) and particle-against-particle
 * contacts within and between garments.
 *
 * Particle contacts follow "15 - Self-collision of cloth" from Ten Minute
 * Physics (Matthias Müller, MIT — see hash.js for the full notice): two
 * particles of the same garment are only pushed apart when they are closer
 * than both the cloth thickness and their distance in the flat garment.
 *
 * These functions update the world's typed arrays in place: they run in the
 * innermost simulation loop, where allocating would be too slow.
 */

/** Pre-computed oriented box: centre, axes, half sizes and a bounding radius. */
export function prepareCollider({ name, center, axes, half }) {
  return { name, center, axes, half, radius: Math.hypot(...half) };
}

/**
 * Keep particle i above the floor and the table (z = 0), with friction on
 * contact. A particle that was already below last substep (placed there)
 * is lifted without being given speed, so it does not jump.
 */
export function collidePlane(pos, prev, i, radius, friction) {
  const z = 3 * i + 2;
  if (pos[z] >= radius) return false;
  pos[z] = radius;
  if (prev[z] < radius) prev[z] = radius;
  pos[3 * i] -= (pos[3 * i] - prev[3 * i]) * friction;
  pos[3 * i + 1] -= (pos[3 * i + 1] - prev[3 * i + 1]) * friction;
  return true;
}

const along = (v, a) => v[0] * a[0] + v[1] * a[1] + v[2] * a[2];

/**
 * Push particle i out of a box (grown by `radius`) through the face it came
 * in by — judged from its previous position — so fast cloth cannot slip
 * through a thin wall. Friction removes part of the sliding motion.
 */
export function collideBox(pos, prev, i, box, radius, friction) {
  const p = [pos[3 * i] - box.center[0], pos[3 * i + 1] - box.center[1], pos[3 * i + 2] - box.center[2]];
  const reach = box.radius + radius;
  if (p[0] * p[0] + p[1] * p[1] + p[2] * p[2] > reach * reach) return false;
  const q = box.axes.map((a) => along(p, a));
  const extent = box.half.map((h) => h + radius);
  if (q.some((v, k) => Math.abs(v) >= extent[k])) return false;

  const before = [prev[3 * i] - box.center[0], prev[3 * i + 1] - box.center[1], prev[3 * i + 2] - box.center[2]];
  const qPrev = box.axes.map((a) => along(before, a));
  const entered = [0, 1, 2].filter((k) => Math.abs(qPrev[k]) >= extent[k]);
  const candidates = entered.length ? entered : [0, 1, 2];
  const k = candidates.reduce((best, c) => (extent[c] - Math.abs(q[c]) < extent[best] - Math.abs(q[best]) ? c : best));
  const side = Math.sign(entered.includes(k) ? qPrev[k] : q[k]) || 1;
  const push = side * extent[k] - q[k];
  const axis = box.axes[k];
  for (let c = 0; c < 3; c += 1) pos[3 * i + c] += axis[c] * push;
  // Already inside last substep (placed there): move it out without adding speed.
  if (!entered.length) for (let c = 0; c < 3; c += 1) prev[3 * i + c] += axis[c] * push;

  // friction: take away part of the motion along the face
  const moved = [0, 1, 2].map((c) => pos[3 * i + c] - prev[3 * i + c]);
  const normal = along(moved, axis);
  for (let c = 0; c < 3; c += 1) pos[3 * i + c] -= (moved[c] - axis[c] * normal) * friction;
  return true;
}

/**
 * Resolve one particle pair. `w0`, `w1` are effective inverse masses (0 for
 * a held or resting particle). Returns the speed (units per step) of particle
 * id0 when they touched, or −1 when they did not.
 */
export function collidePair(world, id0, id1, w0, w1, friction) {
  const { pos, prev, rest, garmentOf, thickness } = world;
  const d = [pos[3 * id1] - pos[3 * id0], pos[3 * id1 + 1] - pos[3 * id0 + 1], pos[3 * id1 + 2] - pos[3 * id0 + 2]];
  const dist2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
  if (dist2 > thickness * thickness || dist2 === 0) return -1;

  let minDist = thickness;
  if (garmentOf[id0] === garmentOf[id1]) {
    const r = [rest[3 * id1] - rest[3 * id0], rest[3 * id1 + 1] - rest[3 * id0 + 1], rest[3 * id1 + 2] - rest[3 * id0 + 2]];
    const restDist2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
    if (dist2 > restDist2) return -1;
    if (restDist2 < thickness * thickness) minDist = Math.sqrt(restDist2);
  }

  const dist = Math.sqrt(dist2);
  const w = w0 + w1;
  const correction = (minDist - dist) / dist / w;
  for (let c = 0; c < 3; c += 1) {
    pos[3 * id0 + c] -= d[c] * correction * w0;
    pos[3 * id1 + c] += d[c] * correction * w1;
  }

  // friction: nudge both towards a shared motion (a resting partner does not move)
  const move0 = [0, 1, 2].map((c) => pos[3 * id0 + c] - prev[3 * id0 + c]);
  const move1 = [0, 1, 2].map((c) => (w1 > 0 ? pos[3 * id1 + c] - prev[3 * id1 + c] : 0));
  const share0 = w > 0 ? w0 / w : 0;
  for (let c = 0; c < 3; c += 1) {
    const shared = move0[c] * (1 - share0) + move1[c] * share0;
    pos[3 * id0 + c] += (shared - move0[c]) * friction * (w0 > 0 ? 1 : 0);
    if (w1 > 0) pos[3 * id1 + c] += (shared - move1[c]) * friction;
  }
  return Math.hypot(...move0);
}
