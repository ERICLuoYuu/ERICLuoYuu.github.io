import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMesh } from '../../js/cloth/mesh.js';
import { createWorld, setPositions, sleepAll, step, centroid, isSettled } from '../../js/cloth/solver.js';
import { boxColliders, flapCorners } from '../../js/scene/solids.js';
import { BOX } from '../../js/scene/geometry.js';
import { createHand, asideTarget, topParticle, dropAt } from '../../js/cloth/hand.js';

const THICKNESS = 4.5; // the pile's thickness (tools/build-pile.mjs)
const RIM = BOX.height + BOX.longFlapLift;
// The box's walls and open flaps: what the hand works against. The things lying on
// the floor move with every layout and would sit under these test sheets.
const walls = () => boxColliders().filter((c) => /^(wall|flap)-/.test(c.name));
const sheet = (cols, rows) => buildMesh({ id: 'sheet', size: [cols * 10, rows * 10], grid: { cols, rows, cells: '1'.repeat(cols * rows) } });
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
  assert.ok(z >= 60 && z >= world.pos[3 * i + 2] + 45, `held at ${z}`);
});

test('carried over a wall, the hand rises above the rim at once', () => {
  const { world, hand } = scene(380, 150);
  const i = topParticle(world, 0);
  hand.grab(hitAt(world, i), world.pos[3 * i], world.pos[3 * i + 1]);
  hand.dragTo(BOX.width + 4, 150);
  assert.ok(world.grip.to[2] >= RIM + 45, `hand at ${world.grip.to[2]}`);
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
  const [x, , z] = centroid(world, 0);
  assert.ok(x > BOX.width + flapReach('right'), `came to rest at x ${x.toFixed(0)}, past the flap`);
  assert.ok(z < THICKNESS, 'on the table');
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
  const [x, , z] = centroid(world, 0);
  assert.ok(x > BOX.width + flapReach('right'), `came to rest at x ${x.toFixed(0)}, past the flap`);
  assert.ok(z < THICKNESS, 'on the table');
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
