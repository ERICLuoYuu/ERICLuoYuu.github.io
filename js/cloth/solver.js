/**
 * Extended position-based dynamics (XPBD) for a handful of garments sharing
 * one world, after Matthias Müller's Ten Minute Physics cloth demos (MIT —
 * see hash.js for the notice). Pure — no DOM — so tools/build-pile.mjs can
 * run it in Node.
 *
 * Units are parcel pixels and seconds. Garments that stop moving fall asleep:
 * they cost nothing and act as solid obstacles until something wakes them.
 *
 * The world's typed arrays are updated in place every step; that is the one
 * deliberate exception to the codebase's immutability rule, because the
 * solver touches thousands of numbers sixty times a second.
 */

import { createHash } from './hash.js';
import { collideBox, collidePair, collidePlane, prepareCollider } from './collide.js';

export const DEFAULTS = Object.freeze({
  gravity: -2400, // lighter than real gravity: garments drift down like soft fabric
  substeps: 16, // with travel 0.1 and the pile's 4.5 thickness, held cloth follows the pointer at up to 430 units/s
  maxStep: 1 / 30, // longer pauses (a hidden tab) are clamped
  travel: 0.1, // no particle, and no grip, moves more than this share of the thickness per substep
  airDamping: 2.5, // per second: fabric meets a lot of air
  wakeSpeed: 40, // cloth running into a sleeping garment this fast, or moving out from under it, disturbs it (units/s)
  wakeTouches: 3, // a sleeping garment wakes once this many moving particles disturb it in one frame
  sleepAfter: 0.4, // a garment sleeps when, over this many seconds,
  sleepDrift: 1.5, // nearly all of its particles moved less than this...
  restlessShare: 0.05, // ...where "nearly all" allows this share of stray, buzzing particles
  contactDamping: 0.98, // share of speed a touching particle keeps per substep: a little calm for crumpled heaps
});

/** How far apart two particles may start a frame and still meet during it. */
const neighbourReach = (thickness, { travel, substeps }) => thickness * (1 + travel * substeps);

/**
 * @param {{garments: {mesh: object, material: {stretchCompliance:number, bendCompliance:number, friction:number}}[],
 *          colliders?: object[], bounds: {min:number[], max:number[]}, thickness?: number, settings?: object}} options
 */
export function createWorld({ garments, colliders = [], bounds, thickness = 6, settings = {} }) {
  const counts = garments.map(({ mesh }) => mesh.count);
  const offsets = counts.map((_, g) => counts.slice(0, g).reduce((a, b) => a + b, 0));
  const count = counts.reduce((a, b) => a + b, 0);
  const merged = { ...DEFAULTS, ...settings };

  const pos = new Float32Array(3 * count);
  const rest = new Float32Array(3 * count);
  const garmentOf = new Uint16Array(count);
  garments.forEach(({ mesh }, g) => {
    pos.set(mesh.rest, 3 * offsets[g]);
    rest.set(mesh.rest, 3 * offsets[g]);
    garmentOf.fill(g, offsets[g], offsets[g] + counts[g]);
  });

  const constraints = garments.flatMap(({ mesh, material }, g) => [
    ...mesh.stretch.map((c) => ({ ...c, g, compliance: material.stretchCompliance })),
    ...mesh.bend.map((c) => ({ ...c, g, compliance: material.bendCompliance })),
  ]);
  const ranges = garments.map((_, g) => {
    const first = constraints.findIndex((c) => c.g === g);
    const last = constraints.findLastIndex((c) => c.g === g);
    return [first, last + 1];
  });

  return {
    count,
    counts,
    offsets,
    pos,
    prev: Float32Array.from(pos),
    vel: new Float32Array(3 * count),
    rest,
    invMass: new Float32Array(count).fill(1),
    garmentOf,
    thickness,
    bounds,
    settings: merged,
    friction: garments.map(({ material }) => material.friction),
    colliders: colliders.map(prepareCollider),
    constraints: {
      ids: Int32Array.from(constraints.flatMap(({ a, b, g }) => [a + offsets[g], b + offsets[g]])),
      rest: Float32Array.from(constraints.map((c) => c.rest)),
      compliance: Float32Array.from(constraints.map((c) => c.compliance)),
      ranges,
    },
    touching: new Uint8Array(count), // set when a particle met the floor, a box or other cloth this substep
    disturber: new Uint8Array(count), // set when a particle disturbed a sleeping garment this frame
    disturbed: new Int32Array(2 * count), // (disturbing particle, garment it disturbed) pairs this frame
    awake: new Uint8Array(garments.length).fill(1),
    anchor: Float32Array.from(pos), // where each particle was when its garment's sleep window began
    watchedFor: new Float32Array(garments.length), // seconds into the current sleep window
    hash: createHash(neighbourReach(thickness, merged), count),
    grip: null,
  };
}

/** Wake garment g: from now on it moves, starting at rest. */
export function wake(world, g) {
  const { offsets, counts, pos, prev, vel, anchor } = world;
  const from = 3 * offsets[g];
  const to = from + 3 * counts[g];
  prev.set(pos.subarray(from, to), from);
  anchor.set(pos.subarray(from, to), from);
  vel.fill(0, from, to);
  world.awake[g] = 1;
  world.watchedFor[g] = 0;
}

/** Put garment g to sleep where it is. */
export function sleep(world, g) {
  const from = 3 * world.offsets[g];
  world.vel.fill(0, from, from + 3 * world.counts[g]);
  world.awake[g] = 0;
  world.watchedFor[g] = 0;
}

export function sleepAll(world) {
  world.counts.forEach((_, g) => sleep(world, g));
}

/** Place garment g (positions for its particles, xyz each) and wake it. */
export function setPositions(world, g, positions) {
  world.pos.set(positions, 3 * world.offsets[g]);
  wake(world, g);
}

export function isSettled(world) {
  return world.awake.every((a) => a === 0);
}

/** Average position of garment g. */
export function centroid(world, g) {
  const sum = [0, 0, 0];
  for (let i = world.offsets[g]; i < world.offsets[g] + world.counts[g]; i += 1) {
    for (let c = 0; c < 3; c += 1) sum[c] += world.pos[3 * i + c];
  }
  return sum.map((v) => v / world.counts[g]);
}

/**
 * Hold particles `ids` of garment g at `target`; they keep their offsets
 * from it. Garments lying on it wake as soon as it moves (see solveContacts).
 */
export function grab(world, g, ids, target) {
  release(world);
  wake(world, g);
  const offsets = ids.map((i) => [0, 1, 2].map((c) => world.pos[3 * i + c] - target[c]));
  ids.forEach((i) => { world.invMass[i] = 0; });
  world.grip = { garment: g, ids, offsets, from: [...target], to: [...target] };
}

/** Move the hand to `target`. The held cloth follows at most `travel` per substep, so a fling lags a little. */
export function moveGrip(world, target) {
  if (world.grip) world.grip = { ...world.grip, to: [...target] };
}

/** Let go: the held particles fall with whatever speed the hand gave them. */
export function release(world) {
  if (!world.grip) return;
  world.grip.ids.forEach((i) => { world.invMass[i] = 1; });
  world.grip = null;
}

// ─── one time step ─────────────────────────────────────────────────────────
// Plain indexed loops and scalar maths only: each of these runs for every
// awake particle ten times a frame, so closures, Math.hypot and small
// temporary arrays add up to real milliseconds.

/** The colliders whose bounding spheres come within `margin` of particles [first, end). */
function collidersNear(world, first, end, margin) {
  const { pos } = world;
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let v = 3 * first; v < 3 * end; v += 3) {
    minX = Math.min(minX, pos[v]); maxX = Math.max(maxX, pos[v]);
    minY = Math.min(minY, pos[v + 1]); maxY = Math.max(maxY, pos[v + 1]);
    minZ = Math.min(minZ, pos[v + 2]); maxZ = Math.max(maxZ, pos[v + 2]);
  }
  return world.colliders.filter(({ center: [cx, cy, cz], radius }) => {
    const dx = Math.max(minX - cx, 0, cx - maxX);
    const dy = Math.max(minY - cy, 0, cy - maxY);
    const dz = Math.max(minZ - cz, 0, cz - maxZ);
    return dx * dx + dy * dy + dz * dz <= (radius + margin) ** 2;
  });
}

/** [garment, first particle, end particle, nearby colliders] for each awake garment. */
function awakeRanges(world, margin) {
  const ranges = [];
  for (let g = 0; g < world.awake.length; g += 1) {
    if (!world.awake[g]) continue;
    const first = world.offsets[g];
    const end = first + world.counts[g];
    ranges.push([g, first, end, collidersNear(world, first, end, margin)]);
  }
  return ranges;
}

function integrate(world, ranges, dt, maxSpeed) {
  const { pos, prev, vel, invMass, settings } = world;
  const damping = Math.exp(-settings.airDamping * dt);
  const fall = settings.gravity * dt;
  for (const [, first, end] of ranges) {
    for (let i = first; i < end; i += 1) {
      if (invMass[i] === 0) continue;
      const v = 3 * i;
      vel[v + 2] += fall;
      const speed = Math.sqrt(vel[v] * vel[v] + vel[v + 1] * vel[v + 1] + vel[v + 2] * vel[v + 2]);
      const scale = (speed > maxSpeed ? maxSpeed / speed : 1) * damping;
      for (let c = v; c < v + 3; c += 1) {
        vel[c] *= scale;
        prev[c] = pos[c];
        pos[c] += vel[c] * dt;
      }
    }
  }
}

/** Where the hand gets to this frame: towards grip.to, at most `limit` away from grip.from. */
function gripAim({ from, to }, limit) {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(d[0], d[1], d[2]);
  return length <= limit ? to : from.map((v, c) => v + (d[c] * limit) / length);
}

function moveHeld(world, aim, t) {
  const { grip, pos, prev } = world;
  grip.ids.forEach((i, n) => {
    for (let c = 0; c < 3; c += 1) {
      prev[3 * i + c] = pos[3 * i + c];
      pos[3 * i + c] = grip.from[c] + (aim[c] - grip.from[c]) * t + grip.offsets[n][c];
    }
  });
}

function solveConstraints(world, ranges, dt) {
  const { pos, invMass, constraints: { ids, rest, compliance, ranges: span } } = world;
  const dt2 = dt * dt;
  for (const [g] of ranges) {
    for (let k = span[g][0]; k < span[g][1]; k += 1) {
      const wa = invMass[ids[2 * k]];
      const wb = invMass[ids[2 * k + 1]];
      if (wa + wb === 0) continue;
      const a = 3 * ids[2 * k];
      const b = 3 * ids[2 * k + 1];
      const dx = pos[a] - pos[b];
      const dy = pos[a + 1] - pos[b + 1];
      const dz = pos[a + 2] - pos[b + 2];
      const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (length === 0) continue;
      const s = -(length - rest[k]) / (wa + wb + compliance[k] / dt2) / length;
      pos[a] += dx * s * wa;
      pos[a + 1] += dy * s * wa;
      pos[a + 2] += dz * s * wa;
      pos[b] -= dx * s * wb;
      pos[b + 1] -= dy * s * wb;
      pos[b + 2] -= dz * s * wb;
    }
  }
}

/**
 * Does moving particle a disturb sleeping particle b? It does when it pushes
 * into b side-on, or moves while holding b up. Cloth above b never does: a
 * sleeping garment is solid ground for whatever lands on it or is dragged
 * across it — even over the little bumps of its particles — so dragging a
 * garment over the pile leaves the garments underneath asleep.
 *
 * Judged by a's velocity (its net motion), not by how far this substep's
 * constraints have pushed it: deep in a pile those pushes are large and the
 * contacts undo them straight away. And a must really have gone somewhere
 * since its sleep window began (`drift2`, squared): particles deep in a pile
 * can buzz fast while staying put, and must not wake their neighbours.
 */
function disturbs(world, a, b, touched, drift2) {
  const { pos, vel, anchor, thickness, settings: { wakeSpeed } } = world;
  const i = 3 * a;
  const j = 3 * b;
  const ax = pos[i] - anchor[i];
  const ay = pos[i + 1] - anchor[i + 1];
  const az = pos[i + 2] - anchor[i + 2];
  if (ax * ax + ay * ay + az * az <= drift2) return false;
  const dx = pos[j] - pos[i];
  const dy = pos[j + 1] - pos[i + 1];
  const rise = pos[j + 2] - pos[i + 2]; // how far b sits above a
  const level = 0.25 * thickness;
  if (rise < -level) return false; // a is above b
  if (rise <= level) { // side by side: a pushes into b
    const toward = (vel[i] * dx + vel[i + 1] * dy + vel[i + 2] * rise) / Math.sqrt(dx * dx + dy * dy + rise * rise);
    return touched && toward > wakeSpeed;
  }
  if (rise > 1.5 * thickness || dx * dx + dy * dy > thickness * thickness) return false;
  // a holds b up: lifting it, or moving out from under it
  return vel[i] * vel[i] + vel[i + 1] * vel[i + 1] + vel[i + 2] * vel[i + 2] > wakeSpeed * wakeSpeed;
}

/**
 * Cloth against cloth. A sleeping garment is a solid obstacle (weight 0);
 * a moving particle that disturbs it is noted, at most once a frame, and
 * wakeDisturbed decides afterwards. `count` pairs are noted so far this
 * frame; returns the new count.
 */
function solveContacts(world, ranges, count) {
  const { hash, invMass, garmentOf, awake, touching, settings, disturber, disturbed, grip } = world;
  const held = grip ? grip.garment : -1;
  const { firstAdjId, adjIds } = hash;
  const drift2 = settings.sleepDrift * settings.sleepDrift;
  let noted = count;
  for (const [, first, end] of ranges) {
    for (let id0 = first; id0 < end; id0 += 1) {
      const w0 = invMass[id0];
      for (let k = firstAdjId[id0]; k < firstAdjId[id0 + 1]; k += 1) {
        const id1 = adjIds[k];
        const sleeping = awake[garmentOf[id1]] === 0;
        const w1 = sleeping ? 0 : invMass[id1];
        if (w0 + w1 === 0) continue;
        const touched = collidePair(world, id0, id1, w0, w1, garmentOf[id0] === held || garmentOf[id1] === held);
        if (touched) {
          touching[id0] = 1;
          touching[id1] = 1;
        }
        if (sleeping && disturber[id0] === 0 && disturbs(world, id0, id1, touched, drift2)) {
          disturber[id0] = 1;
          disturbed[2 * noted] = id0;
          disturbed[2 * noted + 1] = garmentOf[id1];
          noted += 1;
        }
      }
    }
  }
  return noted;
}

function solveSolids(world, ranges) {
  const { pos, prev, invMass, thickness, bounds, friction, touching } = world;
  const radius = thickness / 2;
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;
  for (const [g, first, end, boxes] of ranges) {
    const grip = friction[g];
    for (let i = first; i < end; i += 1) {
      if (invMass[i] === 0) continue;
      let touched = collidePlane(pos, prev, i, radius, grip);
      for (let b = 0; b < boxes.length; b += 1) {
        if (collideBox(pos, prev, i, boxes[b], radius, grip)) touched = true;
      }
      if (touched) touching[i] = 1;
      const v = 3 * i;
      pos[v] = Math.min(maxX, Math.max(minX, pos[v]));
      pos[v + 1] = Math.min(maxY, Math.max(minY, pos[v + 1]));
      pos[v + 2] = Math.min(maxZ, Math.max(minZ, pos[v + 2]));
    }
  }
}

function updateVelocities(world, ranges, dt) {
  const { pos, prev, vel, touching, settings } = world;
  for (const [, first, end] of ranges) {
    for (let i = first; i < end; i += 1) {
      const keep = (touching[i] ? settings.contactDamping : 1) / dt;
      for (let c = 3 * i; c < 3 * i + 3; c += 1) vel[c] = (pos[c] - prev[c]) * keep;
      touching[i] = 0;
    }
  }
}

/** Wake the sleeping garments that enough moving particles disturbed this frame, and clear the notes. */
function wakeDisturbed(world, count) {
  const { disturbed, disturber, settings } = world;
  const votes = new Array(world.awake.length).fill(0);
  for (let n = 0; n < count; n += 1) {
    disturber[disturbed[2 * n]] = 0;
    votes[disturbed[2 * n + 1]] += 1;
  }
  votes.forEach((v, g) => { if (v >= settings.wakeTouches && !world.awake[g]) wake(world, g); });
}

/**
 * A garment sleeps when, over a whole sleep window, nearly all of it stayed
 * within sleepDrift of where it was. Judging the drift over a window rather
 * than the speed in one frame lets a few particles buzz in place (as they
 * do deep in a pile) without keeping the garment awake.
 */
function updateSleep(world, dt) {
  const { settings, pos, anchor } = world;
  const drift2 = settings.sleepDrift * settings.sleepDrift;
  for (let g = 0; g < world.awake.length; g += 1) {
    if (!world.awake[g] || world.grip?.garment === g) continue;
    world.watchedFor[g] += dt;
    if (world.watchedFor[g] < settings.sleepAfter) continue;
    const from = 3 * world.offsets[g];
    const to = from + 3 * world.counts[g];
    let restless = 0;
    for (let v = from; v < to; v += 3) {
      const dx = pos[v] - anchor[v];
      const dy = pos[v + 1] - anchor[v + 1];
      const dz = pos[v + 2] - anchor[v + 2];
      if (dx * dx + dy * dy + dz * dz > drift2) restless += 1;
    }
    if (restless <= world.counts[g] * settings.restlessShare) {
      sleep(world, g);
    } else {
      anchor.set(pos.subarray(from, to), from);
      world.watchedFor[g] = 0;
    }
  }
}

/** Advance the world by `frameDt` seconds. */
export function step(world, frameDt, { substeps = world.settings.substeps } = {}) {
  if (isSettled(world)) return;
  const { settings, thickness, awake, garmentOf, grip } = world;
  const dt = Math.min(frameDt, settings.maxStep);
  const sdt = dt / substeps;
  const travel = settings.travel * thickness; // per substep
  const reach = neighbourReach(thickness, { travel: settings.travel, substeps });
  world.hash.create(world.pos, world.count);
  world.hash.queryAll(world.pos, world.count, reach, (i) => awake[garmentOf[i]] === 1);

  const ranges = awakeRanges(world, travel * substeps + thickness);
  const aim = grip && gripAim(grip, travel * substeps);
  let disturbances = 0;
  for (let s = 0; s < substeps; s += 1) {
    integrate(world, ranges, sdt, travel / sdt);
    if (grip) moveHeld(world, aim, (s + 1) / substeps);
    solveConstraints(world, ranges, sdt);
    disturbances = solveContacts(world, ranges, disturbances);
    solveSolids(world, ranges);
    updateVelocities(world, ranges, sdt);
  }
  if (grip) world.grip = { ...grip, from: [...aim] };
  wakeDisturbed(world, disturbances);
  updateSleep(world, dt);
}
