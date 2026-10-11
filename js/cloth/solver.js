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
  substeps: 10,
  maxStep: 1 / 30, // longer pauses (a hidden tab) are clamped
  airDamping: 2.5, // per second: fabric meets a lot of air
  wakeSpeed: 25, // a garment this fast wakes the sleeping garments it touches
  sleepSpeed: 6, // when nearly every particle is slower than this for sleepAfter seconds, the garment sleeps
  sleepAfter: 0.4,
  restlessShare: 0.05, // ...where "nearly every" allows this share of stray, buzzing particles
  contactFriction: 0.25, // cloth on cloth
  contactDamping: 0.8, // share of speed a touching particle keeps per substep: calms crumpled heaps
});

/**
 * @param {{garments: {mesh: object, material: {stretchCompliance:number, bendCompliance:number, friction:number}}[],
 *          colliders?: object[], bounds: {min:number[], max:number[]}, thickness?: number}} options
 */
export function createWorld({ garments, colliders = [], bounds, thickness = 6, settings = {} }) {
  const counts = garments.map(({ mesh }) => mesh.count);
  const offsets = counts.map((_, g) => counts.slice(0, g).reduce((a, b) => a + b, 0));
  const count = counts.reduce((a, b) => a + b, 0);

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
    settings: { ...DEFAULTS, ...settings },
    friction: garments.map(({ material }) => material.friction),
    colliders: colliders.map(prepareCollider),
    constraints: {
      ids: Int32Array.from(constraints.flatMap(({ a, b, g }) => [a + offsets[g], b + offsets[g]])),
      rest: Float32Array.from(constraints.map((c) => c.rest)),
      compliance: Float32Array.from(constraints.map((c) => c.compliance)),
      ranges,
    },
    touching: new Uint8Array(count), // set when a particle met the floor, a box or other cloth this substep
    awake: new Uint8Array(garments.length).fill(1),
    stillFor: new Float32Array(garments.length),
    hash: createHash(thickness, count),
    grip: null,
  };
}

/** Wake garment g: from now on it moves, starting at rest. */
export function wake(world, g) {
  const { offsets, counts, pos, prev, vel } = world;
  const from = 3 * offsets[g];
  const to = from + 3 * counts[g];
  prev.set(pos.subarray(from, to), from);
  vel.fill(0, from, to);
  world.awake[g] = 1;
  world.stillFor[g] = 0;
}

/** Put garment g to sleep where it is. */
export function sleep(world, g) {
  const from = 3 * world.offsets[g];
  world.vel.fill(0, from, from + 3 * world.counts[g]);
  world.awake[g] = 0;
  world.stillFor[g] = 0;
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

/** Hold particles `ids` of garment g at `target`; they keep their offsets from it. */
export function grab(world, g, ids, target) {
  release(world);
  wake(world, g);
  const offsets = ids.map((i) => [0, 1, 2].map((c) => world.pos[3 * i + c] - target[c]));
  ids.forEach((i) => { world.invMass[i] = 0; });
  world.grip = { garment: g, ids, offsets, from: [...target], to: [...target] };
}

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

const forAwake = (world, fn) => {
  for (let g = 0; g < world.awake.length; g += 1) {
    if (!world.awake[g]) continue;
    for (let i = world.offsets[g]; i < world.offsets[g] + world.counts[g]; i += 1) fn(i, g);
  }
};

function integrate(world, dt, maxSpeed) {
  const { pos, prev, vel, invMass, settings } = world;
  const damping = Math.exp(-settings.airDamping * dt);
  forAwake(world, (i) => {
    if (invMass[i] === 0) return;
    vel[3 * i + 2] += settings.gravity * dt;
    const speed = Math.hypot(vel[3 * i], vel[3 * i + 1], vel[3 * i + 2]);
    const scale = (speed > maxSpeed ? maxSpeed / speed : 1) * damping;
    for (let c = 0; c < 3; c += 1) {
      vel[3 * i + c] *= scale;
      prev[3 * i + c] = pos[3 * i + c];
      pos[3 * i + c] += vel[3 * i + c] * dt;
    }
  });
}

function moveHeld(world, t) {
  const { grip, pos, prev } = world;
  if (!grip) return;
  grip.ids.forEach((i, n) => {
    for (let c = 0; c < 3; c += 1) {
      prev[3 * i + c] = pos[3 * i + c];
      pos[3 * i + c] = grip.from[c] + (grip.to[c] - grip.from[c]) * t + grip.offsets[n][c];
    }
  });
}

function solveConstraints(world, dt) {
  const { pos, invMass, constraints: { ids, rest, compliance, ranges } } = world;
  for (let g = 0; g < ranges.length; g += 1) {
    if (!world.awake[g]) continue;
    for (let k = ranges[g][0]; k < ranges[g][1]; k += 1) {
      const a = ids[2 * k];
      const b = ids[2 * k + 1];
      const w = invMass[a] + invMass[b];
      if (w === 0) continue;
      const d = [pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]];
      const length = Math.hypot(d[0], d[1], d[2]);
      if (length === 0) continue;
      const s = -(length - rest[k]) / (w + compliance[k] / (dt * dt)) / length;
      for (let c = 0; c < 3; c += 1) {
        pos[3 * a + c] += d[c] * s * invMass[a];
        pos[3 * b + c] -= d[c] * s * invMass[b];
      }
    }
  }
}

function solveContacts(world, dt, wakeList) {
  const { hash, invMass, garmentOf, awake, settings } = world;
  const weight = (i) => (awake[garmentOf[i]] ? invMass[i] : 0);
  forAwake(world, (id0) => {
    for (let k = hash.firstAdjId[id0]; k < hash.firstAdjId[id0 + 1]; k += 1) {
      const id1 = hash.adjIds[k];
      const w0 = weight(id0);
      const w1 = weight(id1);
      if (w0 + w1 === 0) continue;
      const moved = collidePair(world, id0, id1, w0, w1, settings.contactFriction);
      if (moved < 0) continue;
      world.touching[id0] = 1;
      world.touching[id1] = 1;
      if (!awake[garmentOf[id1]] && moved / dt > settings.wakeSpeed) wakeList.add(garmentOf[id1]);
    }
  });
}

function solveSolids(world) {
  const { pos, prev, invMass, colliders, thickness, bounds, friction } = world;
  const radius = thickness / 2;
  forAwake(world, (i, g) => {
    if (invMass[i] === 0) return;
    let touched = collidePlane(pos, prev, i, radius, friction[g]);
    colliders.forEach((box) => { touched = collideBox(pos, prev, i, box, radius, friction[g]) || touched; });
    if (touched) world.touching[i] = 1;
    for (let c = 0; c < 3; c += 1) {
      pos[3 * i + c] = Math.min(bounds.max[c], Math.max(bounds.min[c], pos[3 * i + c]));
    }
  });
}

function updateVelocities(world, dt) {
  const { pos, prev, vel, touching, settings } = world;
  forAwake(world, (i) => {
    const keep = touching[i] ? settings.contactDamping : 1;
    for (let c = 0; c < 3; c += 1) vel[3 * i + c] = ((pos[3 * i + c] - prev[3 * i + c]) / dt) * keep;
    touching[i] = 0;
  });
}

/** A garment sleeps once (nearly) all of it has been still for a moment. */
function updateSleep(world, dt) {
  const { settings, vel } = world;
  const limit2 = settings.sleepSpeed * settings.sleepSpeed;
  world.awake.forEach((isAwake, g) => {
    if (!isAwake || world.grip?.garment === g) return;
    let restless = 0;
    for (let i = world.offsets[g]; i < world.offsets[g] + world.counts[g]; i += 1) {
      if (vel[3 * i] ** 2 + vel[3 * i + 1] ** 2 + vel[3 * i + 2] ** 2 > limit2) restless += 1;
    }
    const still = restless <= world.counts[g] * settings.restlessShare;
    world.stillFor[g] = still ? world.stillFor[g] + dt : 0;
    if (world.stillFor[g] >= settings.sleepAfter) sleep(world, g);
  });
}

/** Advance the world by `frameDt` seconds. */
export function step(world, frameDt, { substeps = world.settings.substeps } = {}) {
  if (isSettled(world)) return;
  const dt = Math.min(frameDt, world.settings.maxStep);
  const sdt = dt / substeps;
  const maxSpeed = (0.2 * world.thickness) / sdt; // no particle moves more than a fifth of the thickness per substep
  const isActive = (i) => world.awake[world.garmentOf[i]] === 1;
  world.hash.create(world.pos, world.count);
  world.hash.queryAll(world.pos, world.count, maxSpeed * dt + world.thickness, isActive);

  const wakeList = new Set();
  for (let s = 0; s < substeps; s += 1) {
    integrate(world, sdt, maxSpeed);
    moveHeld(world, (s + 1) / substeps);
    solveConstraints(world, sdt);
    solveContacts(world, sdt, wakeList);
    solveSolids(world);
    updateVelocities(world, sdt);
  }
  if (world.grip) world.grip = { ...world.grip, from: [...world.grip.to] };
  wakeList.forEach((g) => wake(world, g));
  updateSleep(world, dt);
}
