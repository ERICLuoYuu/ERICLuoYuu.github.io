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
 * These functions run in the innermost simulation loop, many thousands of
 * times a frame, so they work on plain numbers, update the world's typed
 * arrays in place and allocate nothing.
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

/**
 * Push particle i out of a box (grown by `radius`) through the face it came
 * in by — judged from its previous position — so fast cloth cannot slip
 * through a thin wall. Friction removes part of the sliding motion.
 */
export function collideBox(pos, prev, i, box, radius, friction) {
  const [cx, cy, cz] = box.center;
  const px = pos[3 * i] - cx;
  const py = pos[3 * i + 1] - cy;
  const pz = pos[3 * i + 2] - cz;
  const reach = box.radius + radius;
  if (px * px + py * py + pz * pz > reach * reach) return false;

  const { axes, half } = box;
  let best = -1;
  let bestDepth = Infinity;
  let bestSide = 1;
  let bestQ = 0;
  let enteredAny = false;
  const ox = prev[3 * i] - cx;
  const oy = prev[3 * i + 1] - cy;
  const oz = prev[3 * i + 2] - cz;
  // First pass: is the particle inside on every axis? Track faces it entered through.
  for (let k = 0; k < 3; k += 1) {
    const a = axes[k];
    const q = px * a[0] + py * a[1] + pz * a[2];
    const extent = half[k] + radius;
    if (q >= extent || q <= -extent) return false;
    const before = ox * a[0] + oy * a[1] + oz * a[2];
    if (before >= extent || before <= -extent) enteredAny = true;
  }
  for (let k = 0; k < 3; k += 1) {
    const a = axes[k];
    const q = px * a[0] + py * a[1] + pz * a[2];
    const extent = half[k] + radius;
    const before = ox * a[0] + oy * a[1] + oz * a[2];
    const entered = before >= extent || before <= -extent;
    if (enteredAny && !entered) continue;
    const depth = extent - Math.abs(q);
    if (depth < bestDepth) {
      best = k;
      bestDepth = depth;
      bestQ = q;
      bestSide = Math.sign(entered ? before : q) || 1;
    }
  }

  const axis = axes[best];
  const push = bestSide * (half[best] + radius) - bestQ;
  for (let c = 0; c < 3; c += 1) pos[3 * i + c] += axis[c] * push;
  // Already inside last substep (placed there): move it out without adding speed.
  if (!enteredAny) for (let c = 0; c < 3; c += 1) prev[3 * i + c] += axis[c] * push;

  // friction: take away part of the motion along the face
  const mx = pos[3 * i] - prev[3 * i];
  const my = pos[3 * i + 1] - prev[3 * i + 1];
  const mz = pos[3 * i + 2] - prev[3 * i + 2];
  const normal = mx * axis[0] + my * axis[1] + mz * axis[2];
  pos[3 * i] -= (mx - axis[0] * normal) * friction;
  pos[3 * i + 1] -= (my - axis[1] * normal) * friction;
  pos[3 * i + 2] -= (mz - axis[2] * normal) * friction;
  return true;
}

/**
 * Resolve one particle pair. `w0`, `w1` are effective inverse masses (0 for
 * a held or resting particle). Returns whether they touched.
 */
export function collidePair(world, id0, id1, w0, w1, friction) {
  const { pos, prev, rest, garmentOf, thickness } = world;
  const a = 3 * id0;
  const b = 3 * id1;
  let dx = pos[b] - pos[a];
  let dy = pos[b + 1] - pos[a + 1];
  let dz = pos[b + 2] - pos[a + 2];
  const dist2 = dx * dx + dy * dy + dz * dz;
  if (dist2 > thickness * thickness || dist2 === 0) return false;

  let minDist = thickness;
  if (garmentOf[id0] === garmentOf[id1]) {
    const rx = rest[b] - rest[a];
    const ry = rest[b + 1] - rest[a + 1];
    const rz = rest[b + 2] - rest[a + 2];
    const restDist2 = rx * rx + ry * ry + rz * rz;
    if (dist2 > restDist2) return false;
    if (restDist2 < thickness * thickness) minDist = Math.sqrt(restDist2);
  }

  const dist = Math.sqrt(dist2);
  const w = w0 + w1;
  const correction = (minDist - dist) / dist / w;
  dx *= correction;
  dy *= correction;
  dz *= correction;
  pos[a] -= dx * w0;
  pos[a + 1] -= dy * w0;
  pos[a + 2] -= dz * w0;
  pos[b] += dx * w1;
  pos[b + 1] += dy * w1;
  pos[b + 2] += dz * w1;

  // friction: nudge both towards a shared motion (a resting partner does not move)
  const share = w1 / w; // weight of id0's motion: the heavier (lower w) particle counts for more
  for (let c = 0; c < 3; c += 1) {
    const move0 = pos[a + c] - prev[a + c];
    const move1 = w1 > 0 ? pos[b + c] - prev[b + c] : 0;
    const shared = move0 * share + move1 * (1 - share);
    if (w0 > 0) pos[a + c] += (shared - move0) * friction;
    if (w1 > 0) pos[b + c] += (shared - move1) * friction;
  }
  return true;
}
