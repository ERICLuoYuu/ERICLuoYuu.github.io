import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMesh } from '../../js/cloth/mesh.js';
import {
  createWorld, setPositions, step, grab, moveGrip, release, isSettled, centroid, sleepAll,
} from '../../js/cloth/solver.js';

const sheet = (cols = 6, rows = 6) => buildMesh({ id: 'sheet', size: [cols * 10, rows * 10], grid: { cols, rows, cells: '1'.repeat(cols * rows) } });
const material = { stretchCompliance: 0, bendCompliance: 2e-5, friction: 0.5 };
const bounds = { min: [-500, -500, 0], max: [900, 900, 900] };
// Particles sit 10 apart; the thickness must cover the 7.1-unit gap in the
// middle of a cell, or another sheet could fall through between particles.
const THICKNESS = 7.5;

const world = ({ meshes = [sheet()], colliders = [] } = {}) => createWorld({
  garments: meshes.map((mesh) => ({ mesh, material })), colliders, bounds, thickness: THICKNESS,
});
/** A copy of garment g's positions, moved by (dx, dy, dz). */
const shifted = (w, g, [dx, dy, dz]) => {
  const start = w.offsets[g] * 3;
  const p = w.pos.slice(start, start + w.counts[g] * 3);
  for (let i = 0; i < p.length; i += 3) {
    p[i] += dx;
    p[i + 1] += dy;
    p[i + 2] += dz;
  }
  return p;
};
const run = (w, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 60) step(w, 1 / 60);
};
const zs = (w) => w.pos.filter((_, i) => i % 3 === 2);

test('a new world lays each garment flat at its rest shape', () => {
  const w = world();
  assert.equal(w.count, sheet().count);
  assert.deepEqual([...w.pos], [...sheet().rest]);
});

test('a garment placed partly inside the floor is lifted out without jumping', () => {
  const w = world();
  run(w, 0.5);
  zs(w).forEach((z) => assert.ok(z < THICKNESS, `z = ${z}`));
});

test('cloth falls under gravity and rests on the floor', () => {
  const w = world();
  setPositions(w, 0, shifted(w, 0, [0, 0, 100]));
  run(w, 2);
  zs(w).forEach((z) => assert.ok(z >= THICKNESS / 2 - 1e-3 && z < THICKNESS * 1.5, `z = ${z}`));
});

test('stretch constraints hold the cloth near its rest lengths while it hangs', () => {
  const m = sheet();
  const w = world({ meshes: [m] });
  setPositions(w, 0, shifted(w, 0, [0, 0, 200]));
  grab(w, 0, [0], [0, 0, 200]);
  run(w, 1.5);
  const worst = Math.max(...m.stretch.map(({ a, b, rest }) => {
    const d = Math.hypot(w.pos[3 * a] - w.pos[3 * b], w.pos[3 * a + 1] - w.pos[3 * b + 1], w.pos[3 * a + 2] - w.pos[3 * b + 2]);
    return Math.abs(d - rest) / rest;
  }));
  assert.ok(worst < 0.08, `worst strain ${worst}`);
});

test('a held corner follows the grip and the rest hangs below it', () => {
  const w = world();
  grab(w, 0, [0], [0, 0, 0]);
  moveGrip(w, [100, 50, 150]);
  run(w, 1);
  assert.ok(Math.hypot(w.pos[0] - 100, w.pos[1] - 50, w.pos[2] - 150) < 1);
  assert.ok(centroid(w, 0)[2] < 150);
});

test('released cloth settles and falls asleep, then stays put', () => {
  const w = world();
  grab(w, 0, [0], [0, 0, 0]);
  moveGrip(w, [0, 0, 80]);
  run(w, 0.5);
  release(w);
  run(w, 3);
  assert.ok(isSettled(w));
  assert.equal(w.awake[0], 0);
  const before = [...w.pos];
  run(w, 1);
  assert.deepEqual([...w.pos], before);
});

test('a sheet dropped onto another, offset by half a cell, cannot fall through the gaps', () => {
  const w = world({ meshes: [sheet(), sheet()] });
  setPositions(w, 1, shifted(w, 1, [5, 5, 40]));
  run(w, 3);
  // Offset grids nest: particles stay a thickness apart while the layers sit closer.
  assert.ok(centroid(w, 1)[2] > centroid(w, 0)[2] + 1.5, `${centroid(w, 1)[2]} vs ${centroid(w, 0)[2]}`);
});

test('a fast particle does not pass through a wall slab', () => {
  const wall = { kind: 'obb', name: 'wall', center: [100, 30, 110], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], half: [1, 200, 110] };
  const w = world({ colliders: [wall] });
  setPositions(w, 0, shifted(w, 0, [0, 0, 50]));
  for (let i = 0; i < w.vel.length; i += 3) w.vel[i] = 3000;
  run(w, 0.5);
  for (let i = 0; i < w.count; i += 1) assert.ok(w.pos[3 * i] < 99, `particle ${i} at x = ${w.pos[3 * i]}`);
});

test('cloth drapes over a tilted board instead of sinking into it', () => {
  const s = Math.SQRT1_2;
  const board = { kind: 'obb', name: 'board', center: [30, 30, 40], axes: [[s, 0, s], [0, 1, 0], [-s, 0, s]], half: [60, 60, 1] };
  const w = world({ colliders: [board] });
  setPositions(w, 0, shifted(w, 0, [0, 0, 120]));
  run(w, 2);
  for (let i = 0; i < w.count; i += 1) {
    const local = [0, 1, 2].map((k) => w.pos[3 * i + k] - board.center[k]);
    const height = local[0] * board.axes[2][0] + local[1] * board.axes[2][1] + local[2] * board.axes[2][2];
    const inPlane = Math.abs(local[0] * board.axes[0][0] + local[2] * board.axes[0][2]) < 58 && Math.abs(local[1]) < 58;
    if (inPlane) assert.ok(Math.abs(height) >= 1 + THICKNESS / 2 - 0.2, `particle ${i} inside the board`);
  }
});

test('world bounds clamp a flung garment and a huge time step is clamped', () => {
  const w = world();
  for (let i = 1; i < w.vel.length; i += 3) w.vel[i] = 1e6;
  step(w, 5);
  w.pos.forEach((v) => assert.ok(Number.isFinite(v)));
  for (let i = 1; i < w.pos.length; i += 3) assert.ok(w.pos[i] <= bounds.max[1]);
});

test('a falling garment lands on a sleeping one and comes to rest on top of it', () => {
  const w = world({ meshes: [sheet(), sheet()] });
  setPositions(w, 1, shifted(w, 1, [5, 5, 60]));
  sleepAll(w);
  setPositions(w, 1, shifted(w, 1, [0, 0, 0])); // wakes only the top sheet
  assert.equal(w.awake[0], 0);
  run(w, 4);
  assert.ok(isSettled(w));
  assert.ok(centroid(w, 1)[2] > centroid(w, 0)[2] + 1.5, 'the second sheet rests on the first');
});

test('a sleeping garment is not moved by a slow neighbour resting on it', () => {
  const w = world({ meshes: [sheet(), sheet()] });
  setPositions(w, 1, shifted(w, 1, [0, 0, THICKNESS]));
  sleepAll(w);
  const bottom = [...w.pos.slice(0, w.counts[0] * 3)];
  setPositions(w, 1, shifted(w, 1, [0, 0, 0]));
  run(w, 1);
  assert.deepEqual([...w.pos.slice(0, w.counts[0] * 3)], bottom);
});

test('pulling a garment out from under another wakes the one on top; others sleep on', () => {
  const w = world({ meshes: [sheet(), sheet(), sheet()] });
  setPositions(w, 1, shifted(w, 1, [5, 5, THICKNESS]));
  setPositions(w, 2, shifted(w, 2, [200, 0, 0])); // beside them, on the floor
  run(w, 0.5);
  sleepAll(w);
  const start = [w.pos[0], w.pos[1], w.pos[2]]; // sheet 0's corner furthest from sheet 2
  grab(w, 0, [0], start);
  assert.deepEqual([...w.awake], [1, 0, 0], 'holding still disturbs nothing');
  for (let t = 1; t <= 40; t += 1) {
    moveGrip(w, [start[0] - 5 * t, start[1], start[2]]);
    step(w, 1 / 60);
  }
  assert.equal(w.awake[1], 1, 'the top sheet lost its support and woke');
  assert.equal(w.awake[2], 0);
});

test('a garment dragged across the top of a sleeping one leaves it asleep', () => {
  const w = world({ meshes: [sheet(10, 10), sheet()] });
  setPositions(w, 1, shifted(w, 1, [5, 5, THICKNESS]));
  run(w, 0.5);
  sleepAll(w);
  const held = w.offsets[1] + 6; // the top sheet's right-hand front corner
  const start = [0, 1, 2].map((c) => w.pos[3 * held + c]);
  grab(w, 1, [held], start);
  for (let t = 1; t <= 30; t += 1) {
    moveGrip(w, [start[0] + 4 * t, start[1], start[2] + Math.min(20, t)]); // lift a little, pull across
    step(w, 1 / 60);
  }
  assert.equal(w.awake[0], 0);
});

test('one stray fast particle does not wake a sleeping garment', () => {
  const w = world({ meshes: [sheet(), sheet()] });
  setPositions(w, 1, shifted(w, 1, [5, 5, THICKNESS]));
  run(w, 0.5);
  sleepAll(w);
  setPositions(w, 1, shifted(w, 1, [0, 0, 0])); // wakes only the top sheet
  const buzzing = w.offsets[1] + 24; // a particle in the middle of the top sheet
  w.vel[3 * buzzing + 2] = -1000;
  step(w, 1 / 60);
  assert.equal(w.awake[0], 0);
});

test('cloth dragged hard into a sleeping garment wakes it', () => {
  const w = world({ meshes: [sheet(), sheet()] });
  setPositions(w, 1, shifted(w, 1, [80, 0, 0]));
  run(w, 0.5);
  sleepAll(w);
  const held = w.offsets[1];
  const start = [0, 1, 2].map((c) => w.pos[3 * held + c]);
  grab(w, 1, [held], start);
  assert.equal(w.awake[0], 0);
  for (let t = 1; t <= 30; t += 1) {
    moveGrip(w, [start[0] - 8 * t, start[1], start[2]]); // 480 units a second, towards sheet 0
    step(w, 1 / 60);
  }
  assert.equal(w.awake[0], 1);
});
