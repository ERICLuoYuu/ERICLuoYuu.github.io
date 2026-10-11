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

const STATIC_RATIO = 1.3; // static friction is this much stronger than sliding friction

/**
 * Coulomb friction for a contact that just pushed particle i out by `depth`
 * along the unit normal (nx, ny, nz). Sliding this substep that is small
 * next to the push stops dead (static friction: fabric stays on a sloping
 * flap); faster sliding loses at most `kinetic × depth` (it slides on, and
 * slows the way real cloth does).
 */
function rub(pos, prev, i, nx, ny, nz, depth, kinetic) {
  const v = 3 * i;
  const mx = pos[v] - prev[v];
  const my = pos[v + 1] - prev[v + 1];
  const mz = pos[v + 2] - prev[v + 2];
  const along = mx * nx + my * ny + mz * nz;
  const tx = mx - nx * along;
  const ty = my - ny * along;
  const tz = mz - nz * along;
  const slide = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (slide === 0) return;
  const grip = kinetic * depth;
  const stop = slide <= STATIC_RATIO * grip ? 1 : grip / slide;
  pos[v] -= tx * stop;
  pos[v + 1] -= ty * stop;
  pos[v + 2] -= tz * stop;
}

/**
 * Keep particle i above the floor and the table (z = 0), with friction on
 * contact. A particle that was already below last substep (placed there)
 * is lifted without being given speed, so it does not jump.
 */
export function collidePlane(pos, prev, i, radius, friction) {
  const z = 3 * i + 2;
  if (pos[z] >= radius) return false;
  const depth = radius - pos[z];
  pos[z] = radius;
  if (prev[z] < radius) prev[z] = radius;
  rub(pos, prev, i, 0, 0, 1, depth, friction);
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
  if (!enteredAny) {
    // Already inside last substep — placed there, or resting right on the face
    // give or take rounding: leave it no speed into or out of the box, so it
    // neither jumps out nor keeps pressing in.
    const along = (pos[3 * i] - prev[3 * i]) * axis[0] + (pos[3 * i + 1] - prev[3 * i + 1]) * axis[1]
      + (pos[3 * i + 2] - prev[3 * i + 2]) * axis[2];
    for (let c = 0; c < 3; c += 1) prev[3 * i + c] += axis[c] * along;
  }

  rub(pos, prev, i, axis[0] * bestSide, axis[1] * bestSide, axis[2] * bestSide, Math.abs(push), friction);
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
