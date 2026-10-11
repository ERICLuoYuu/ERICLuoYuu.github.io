import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildMesh } from '../../js/cloth/mesh.js';
import { createWorld, setPositions, sleepAll, step, centroid, isSettled } from '../../js/cloth/solver.js';
import { boxColliders, flapCorners } from '../../js/scene/solids.js';
import { BOX, CONTENTS } from '../../js/scene/geometry.js';
import { createHand, asideTarget, topParticle, dropAt } from '../../js/cloth/hand.js';

const THICKNESS = 4.5; // the pile's thickness (tools/build-pile.mjs)
const RIM = BOX.height + BOX.longFlapLift;
// The box's walls and open flaps: what the hand works against. The things lying on
// the floor move with every layout and would sit under these test sheets.
const walls = () => boxColliders().filter((c) => /^(wall|flap)-/.test(c.name));
const sheet = (cols, rows) => buildMesh({ id: 'sheet', size: [cols * 10, rows * 10], grid: { cols, rows, cells: '1'.repeat(cols * rows) } });
const FINE = 4.5; // the pile's thickness (tools/build-pile.mjs)
const fine = (cols, rows) => buildMesh({ id: 'fine', size: [cols * 6, rows * 6], grid: { cols, rows, cells: '1'.repeat(cols * rows) } });
/** Looking straight down: screen (sx, sy) is parcel (x, y). */
const ray = (sx, sy) => ({ origin: [sx, sy, 3000], dir: [0, 0, -1] });

/** A 60 × 60 sheet lying at (x, y) on the box floor, plus the box. */
function scene(x = 230, y = 150) {
  const mesh = sheet(6, 6);
  const world = createWorld({
    garments: [{ mesh, material: { stretchCompliance: 0, bendCompliance: 2e-4, friction: 0.5 } }],
    colliders: walls(),
    bounds: { min: [-700, -600, 0], max: [1200, 1000, 700] },
    thickness: THICKNESS,
  });
  setPositions(world, 0, Float32Array.from(mesh.rest, (v, i) => v + [x - 30, y - 30, THICKNESS / 2][i % 3]));
  sleepAll(world);
  return { world, hand: createHand({ world, colliders: walls(), ray }) };
}

/** Advance hand and world together, like the layer's animation frames. */
function frames(world, hand, count) {
  for (let f = 0; f < count; f += 1) {
    hand.advance(1 / 60);
    step(world, 1 / 60);
  }
}
const hitAt = (world, i) => ({ garment: 0, ids: [i], point: [...world.pos.slice(3 * i, 3 * i + 3)] });

test('the hand lifts what it grabs and carries it under the pointer', () => {
  const { world, hand } = scene();
  const i = topParticle(world, 0);
  hand.grab(hitAt(world, i), world.pos[3 * i], world.pos[3 * i + 1]);
  assert.equal(hand.garment, 0);
  hand.dragTo(150, 150);
  const [x, y, z] = world.grip.to;
  assert.deepEqual([Math.round(x), Math.round(y)], [150, 150]);
  const below = world.pos[3 * i + 2];
  assert.ok(z >= below + 12 && z < below + 18, `held at ${z}, just clear of the cloth at ${below}`);
});

test('carried over a wall, the hand rises above the rim at once', () => {
  const { world, hand } = scene(380, 150);
  const i = topParticle(world, 0);
  hand.grab(hitAt(world, i), world.pos[3 * i], world.pos[3 * i + 1]);
  hand.dragTo(BOX.width + 4, 150);
  assert.ok(world.grip.to[2] >= RIM + 12, `hand at ${world.grip.to[2]}`);
});

test('letting go inside the box drops the garment where it is', () => {
  const { world, hand } = scene();
  const i = topParticle(world, 0);
  hand.grab(hitAt(world, i), world.pos[3 * i], world.pos[3 * i + 1]);
  hand.dragTo(200, 140);
  frames(world, hand, 20);
  hand.release();
  assert.equal(world.grip, null);
  assert.equal(hand.garment, null);
});

/** How far beyond the walls the open flaps reach, seen from above. */
const flapReach = (side) => {
  const [hinge, , tip] = flapCorners(side);
  return side === 'right' ? tip[0] - BOX.width : tip[1] - BOX.depth;
};
/** Lying on the table, flat or folded over on itself: nothing is left up on a flap or a wall. */
const onTable = (world) => {
  const top = Math.max(...world.pos.filter((_, k) => k % 3 === 2));
  return top < 4 * THICKNESS;
};

test('letting go beyond the rim carries on past the flap, onto the table', () => {
  const { world, hand } = scene(370, 150);
  const i = topParticle(world, 0);
  hand.grab(hitAt(world, i), world.pos[3 * i], world.pos[3 * i + 1]);
  for (let x = 370; x <= BOX.width + 30; x += 6) {
    hand.dragTo(x, 150);
    frames(world, hand, 1);
  }
  hand.release();
  assert.equal(hand.garment, 0, 'still held while it carries on');
  frames(world, hand, 240);
  assert.equal(hand.garment, null);
  for (let f = 0; f < 600 && !isSettled(world); f += 1) frames(world, hand, 1);
  const [x] = centroid(world, 0);
  assert.ok(x > BOX.width + flapReach('right'), `came to rest at x ${x.toFixed(0)}, past the flap`);
  assert.ok(onTable(world), 'on the table');
});

test('a keyboard move takes the garment beyond the nearest wall and lets go', async () => {
  const { world, hand } = scene(330, 150);
  const to = asideTarget(world, 0);
  assert.ok(to[0] > BOX.width, 'the right wall is nearest');
  const moved = hand.carry(0, to, { duration: 0.8 });
  let done = false;
  moved.then(() => { done = true; });
  for (let f = 0; f < 400 && !done; f += 1) {
    frames(world, hand, 1);
    await Promise.resolve();
  }
  assert.ok(done, 'the move finished');
  for (let f = 0; f < 600 && !isSettled(world); f += 1) frames(world, hand, 1);
  const [x] = centroid(world, 0);
  assert.ok(x > BOX.width + flapReach('right'), `came to rest at x ${x.toFixed(0)}, past the flap`);
  assert.ok(onTable(world), 'on the table');
});

test('aside means over the gentle right or front flap onto the table — never left over the pack, nor up the steep back flap', () => {
  const left = scene(40, 150);
  const to = asideTarget(left.world, 0);
  assert.ok(to[0] > BOX.width || to[1] > BOX.depth, `right or front: ${to}`);
  const front = scene(230, 280);
  assert.ok(asideTarget(front.world, 0)[1] > BOX.depth + flapReach('front'));
  const right = scene(380, 150);
  assert.ok(asideTarget(right.world, 0)[0] > BOX.width + flapReach('right'));
  const back = scene(230, 20);
  const [bx, by] = asideTarget(back.world, 0);
  assert.ok(by >= 0 && (bx > BOX.width || by > BOX.depth), `not up the back flap: ${[bx, by]}`);
});

test('without motion, a move just puts the garment down beyond the wall, awake to settle', () => {
  const { world } = scene(330, 150);
  const to = asideTarget(world, 0);
  dropAt(world, walls(), 0, to);
  const [x, y] = centroid(world, 0);
  assert.ok(Math.abs(x - to[0]) < 1 && Math.abs(y - to[1]) < 1);
  assert.equal(world.awake[0], 1);
  for (let f = 0; f < 600 && !isSettled(world); f += 1) step(world, 1 / 60);
  const [restX, , restZ] = centroid(world, 0);
  assert.ok(restX > BOX.width + flapReach('right') && restZ < THICKNESS, 'on the table, past the flap');
});

test('grabbing again or dropping lets go of the previous garment cleanly', () => {
  const { world, hand } = scene();
  const i = topParticle(world, 0);
  hand.grab(hitAt(world, i), 0, 0);
  hand.drop();
  assert.equal(world.grip, null);
  assert.ok(world.invMass.every((w) => w === 1), 'no particle left pinned');
});

test('cloth carried along on the held garment does not lift the hand ever higher', () => {
  const lower = sheet(6, 6);
  const rider = sheet(2, 2);
  const world = createWorld({
    garments: [lower, rider].map((mesh) => ({ mesh, material: { stretchCompliance: 0, bendCompliance: 2e-4, friction: 0.5 } })),
    colliders: walls(),
    bounds: { min: [-700, -600, 0], max: [1200, 1000, 700] },
    thickness: THICKNESS,
  });
  setPositions(world, 0, Float32Array.from(lower.rest, (v, i) => v + [200, 120, THICKNESS / 2][i % 3]));
  setPositions(world, 1, Float32Array.from(rider.rest, (v, i) => v + [-1000, 0, THICKNESS / 2][i % 3]));
  sleepAll(world);
  const hand = createHand({ world, colliders: walls(), ray });
  const i = topParticle(world, 0);
  hand.grab(hitAt(world, i), world.pos[3 * i], world.pos[3 * i + 1]);
  for (let f = 0; f < 60; f += 1) {
    // cloth lying on the held garment comes up with it, just under the hand
    const [x, y, z] = world.grip.from;
    setPositions(world, 1, Float32Array.from(rider.rest, (v, k) => v + [x - 10, y - 10, z - 10][k % 3]));
    frames(world, hand, 1);
  }
  assert.ok(world.grip.to[2] < 80, `the hand rose to ${world.grip.to[2].toFixed(0)}`);
});

/** The vacuum pack as garments.json describes it, in its place, with a hand that knows its hold. */
function packScene() {
  const data = JSON.parse(readFileSync(new URL('../../assets/clothes/garments.json', import.meta.url), 'utf8'));
  const pack = data.garments.find((g) => g.kind === 'film');
  if (!pack) throw new Error('garments.json has no pack body yet (npm run clothes)');
  const mesh = buildMesh(pack);
  const world = createWorld({
    garments: [{ mesh, material: pack.material }],
    colliders: walls(),
    bounds: { min: [-700, -600, 0], max: [1200, 1000, 700] },
    thickness: 4.5,
  });
  setPositions(world, 0, Float32Array.from(mesh.rest, (v, i) => v + [CONTENTS.pack.x, CONTENTS.pack.y, 2.25][i % 3]));
  sleepAll(world);
  return { world, hand: createHand({ world, colliders: walls(), ray, holds: [pack.hold] }) };
}

/** The particle nearest floor point (x, y). */
const nearest = (world, x, y) => [...Array(world.count).keys()].reduce((best, i) => (
  Math.hypot(world.pos[3 * i] - x, world.pos[3 * i + 1] - y) < Math.hypot(world.pos[3 * best] - x, world.pos[3 * best + 1] - y) ? i : best), 0);

test('the pack is held by a wide patch, lifted only a little', () => {
  const { world, hand } = packScene();
  const i = nearest(world, 96, 150);
  const point = [...world.pos.slice(3 * i, 3 * i + 3)];
  hand.grab(hitAt(world, i), point[0], point[1]);
  const within = [...Array(world.count).keys()]
    .filter((j) => Math.hypot(world.pos[3 * j] - point[0], world.pos[3 * j + 1] - point[1]) <= 30);
  assert.equal(world.grip.ids.length, within.length);
  assert.ok(Math.abs(world.grip.to[2] - (point[2] + 6)) < 0.01, `held at ${world.grip.to[2]}`);
});

test('grabbed by its edge beside the wall, the pack is still lifted only a little', () => {
  const { world, hand } = packScene();
  const i = nearest(world, CONTENTS.pack.x, 150); // its left edge lies 4 units from the left wall
  const point = [...world.pos.slice(3 * i, 3 * i + 3)];
  hand.grab(hitAt(world, i), point[0], point[1]);
  assert.ok(Math.abs(world.grip.to[2] - (point[2] + 6)) < 0.01, `held at ${world.grip.to[2]}`);
});

test('pulled onto the wall, the pack is lifted over the rim', () => {
  const { world, hand } = packScene();
  const i = nearest(world, CONTENTS.pack.x, 150);
  hand.grab(hitAt(world, i), world.pos[3 * i], world.pos[3 * i + 1]);
  hand.dragTo(1, 150);
  assert.ok(world.grip.to[2] >= BOX.height + 6, `hand at ${world.grip.to[2]}`);
});

test('dragged by its middle, the pack flexes but keeps its shape', () => {
  const { world, hand } = packScene();
  const i = nearest(world, 96, 150);
  const [x, y] = [world.pos[3 * i], world.pos[3 * i + 1]];
  hand.grab(hitAt(world, i), x, y);
  for (let f = 1; f <= 40; f += 1) {
    hand.dragTo(x + f, y);
    frames(world, hand, 1);
  }
  frames(world, hand, 20);
  const span = (k) => {
    const v = [...Array(world.count).keys()].map((j) => world.pos[3 * j + k]);
    return Math.max(...v) - Math.min(...v);
  };
  assert.ok(span(0) >= 0.9 * 181 && span(1) >= 0.9 * 290, `the pack spans ${span(0).toFixed(0)} × ${span(1).toFixed(0)}`);
  assert.ok(span(2) <= 12, `it rises ${span(2).toFixed(1)} at most: flexing, not folding`);
});

test('the hand holds a fingertip-sized patch: the grab point and its four nearest neighbours', () => {
  const mesh = fine(10, 10);
  const world = createWorld({
    garments: [{ mesh, material: { stretchCompliance: 0, bendCompliance: 2e-4, friction: 0.5 } }],
    bounds: { min: [-700, -600, 0], max: [1200, 1000, 700] },
    thickness: FINE,
  });
  setPositions(world, 0, Float32Array.from(mesh.rest, (v, k) => v + [100, 100, FINE / 2][k % 3]));
  sleepAll(world);
  const hand = createHand({ world, colliders: [], ray });
  const i = [...Array(mesh.count).keys()].find((v) => mesh.rest[3 * v] === 30 && mesh.rest[3 * v + 1] === 30);
  hand.grab(hitAt(world, i), world.pos[3 * i], world.pos[3 * i + 1]);
  assert.equal(world.grip.ids.length, 5, 'within 8 units: the particle and the four 6 units away');
});

test('held low, most of a garment stays spread out behind the hand', () => {
  const mesh = fine(16, 16);
  const world = createWorld({
    garments: [{ mesh, material: { stretchCompliance: 0, bendCompliance: 2e-4, friction: 0.5 } }],
    bounds: { min: [-700, -600, 0], max: [1200, 1000, 700] },
    thickness: FINE,
  });
  setPositions(world, 0, Float32Array.from(mesh.rest, (v, k) => v + [100, 100, FINE / 2][k % 3]));
  sleepAll(world);
  const hand = createHand({ world, colliders: [], ray });
  const edge = [...Array(mesh.count).keys()].find((v) => mesh.rest[3 * v] === 96 && mesh.rest[3 * v + 1] === 48);
  hand.grab(hitAt(world, edge), world.pos[3 * edge], world.pos[3 * edge + 1]);
  for (let f = 1; f <= 60; f += 1) {
    hand.dragTo(196 + f, 148);
    frames(world, hand, 1);
  }
  frames(world, hand, 30);
  const xs = [...Array(world.count).keys()].map((j) => world.pos[3 * j]);
  const span = Math.max(...xs) - Math.min(...xs);
  assert.ok(span > 0.9 * 96, `the garment spans ${span.toFixed(0)} units along the pull (96 flat)`); // hung from 60 up: 72
});

test('carried off the pile onto bare floor, the hand sinks back to just clear of the floor', () => {
  const [upper, lower] = [sheet(6, 6), sheet(6, 6)];
  const world = createWorld({
    garments: [upper, lower].map((mesh) => ({ mesh, material: { stretchCompliance: 0, bendCompliance: 2e-4, friction: 0.5 } })),
    colliders: walls(),
    bounds: { min: [-700, -600, 0], max: [1200, 1000, 700] },
    thickness: THICKNESS,
  });
  setPositions(world, 0, Float32Array.from(upper.rest, (v, k) => v + [200, 120, 1.5 * THICKNESS][k % 3]));
  setPositions(world, 1, Float32Array.from(lower.rest, (v, k) => v + [200, 120, THICKNESS / 2][k % 3]));
  sleepAll(world);
  const hand = createHand({ world, colliders: walls(), ray });
  const i = topParticle(world, 0);
  hand.grab(hitAt(world, i), world.pos[3 * i], world.pos[3 * i + 1]);
  hand.dragTo(100, 150); // off the pile, over bare floor
  frames(world, hand, 90);
  // resting on the floor a particle lies THICKNESS / 2 up; the hand holds it 12 above that, not 12 above where it was picked up
  assert.ok(world.grip.to[2] < THICKNESS / 2 + 12 + 1, `held at ${world.grip.to[2].toFixed(1)} over the floor`);
});
