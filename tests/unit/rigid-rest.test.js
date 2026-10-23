import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMesh } from '../../js/cloth/mesh.js';
import { createWorld, setPositions, sleepAll } from '../../js/cloth/solver.js';
import { supportUnder } from '../../js/cloth/grip.js';
import { boxColliders, flapCorners } from '../../js/scene/solids.js';
import { BOOKS, FOOD, baseOf } from '../../js/scene/geometry.js';
import { createBody, withPosition, bodyCollider, footprintPoints } from '../../js/rigid/body.js';
import { supportOf, settle, isResting, clothOn } from '../../js/rigid/rest.js';

const THICKNESS = 4.5;
/** A 60 × 60 sheet asleep with its middle at (x, y) on the floor (far away by default). */
function sheetWorld(x = -2000, y = 0) {
  const mesh = buildMesh({ id: 'sheet', size: [60, 60], grid: { cols: 10, rows: 10, cells: '1'.repeat(100) } });
  const world = createWorld({ garments: [{ mesh, material: { stretchCompliance: 0, bendCompliance: 2e-4, friction: 0.5 } }], bounds: { min: [-3000, -900, 0], max: [1300, 1300, 900] }, thickness: THICKNESS });
  setPositions(world, 0, Float32Array.from(mesh.rest, (v, i) => v + [x - 30, y - 30, THICKNESS / 2][i % 3]));
  sleepAll(world);
  return world;
}
const fall = (body, support, frames = 120) => Array.from({ length: frames }).reduce((b) => settle(b, support, 1 / 60), body);

test('a body in the air falls and lands level; x and y never change', () => {
  const b = fall(withPosition(createBody(FOOD[1]), [170, 115, 50]), 0);
  assert.deepEqual(b.position, [170, 115, 0]);
  assert.equal(b.vz, 0);
});

test('a support that appears under a resting body lifts it straight up', () => {
  const b = settle(createBody(FOOD[1]), 8, 1 / 60);
  assert.deepEqual(b.position, [170, 115, 8]);
  assert.ok(isResting(b, 8));
});

test('it rests on the highest thing under any part of it: half on the dictionary, it lies on the dictionary', () => {
  const dict = BOOKS.find((b) => b.id === 'dictionary');
  // a 10 × 10 block across the dictionary's left edge, clear of Hunter × Hunter lying on it (left edge ≈ x 212)
  const block = createBody({ id: 'block', label: 'block', footprint: [10, 10], height: 5, start: [0, 0], rotate: 0, inset: 0, keepIn: false });
  const s = supportOf(block, [dict.x + 2, dict.y + 48], { world: sheetWorld(), colliders: boxColliders() });
  assert.ok(Math.abs(s - (baseOf(dict) + dict.thickness)) < 0.5, `support ${s}`);
});

test('let go over a sloping open flap, food rests level on its highest point beneath it', () => {
  const colliders = boxColliders();
  const flap = colliders.find((c) => c.name === 'flap-front');
  const [hingeLeft, , tipRight] = flapCorners('front');
  const at = [(hingeLeft[0] + tipRight[0]) / 2, (hingeLeft[1] + tipRight[1]) / 2];
  const world = sheetWorld();
  const bowl = createBody(FOOD[3]);
  const s = supportOf(bowl, at, { world, colliders });
  const tops = footprintPoints(withPosition(bowl, [...at, 0])).map((p) => supportUnder(world, [flap], [p], { reach: 1 }));
  assert.ok(Math.abs(s - Math.max(...tops)) < 1, `rests at ${s}, flap top ${Math.max(...tops)}`);
  assert.ok(Math.max(...tops) > Math.min(...tops) + 2, 'the flap slopes under it');
});

test('stacked food drops straight down when the one beneath is dragged away', () => {
  const lower = withPosition(createBody(FOOD[3]), [300, 200, 0]);
  const world = sheetWorld();
  let upper = withPosition(createBody(FOOD[4]), [300, 200, 0]);
  upper = settle(upper, supportOf(upper, [300, 200], { world, colliders: [bodyCollider(lower)] }), 1 / 60);
  assert.equal(upper.position[2], lower.height);
  for (let f = 0; f < 60; f += 1) upper = settle(upper, supportOf(upper, [300, 200], { world, colliders: [] }), 1 / 60);
  assert.deepEqual(upper.position, [300, 200, 0]);
});

test('it rests on cloth, and when the cloth is pulled away it settles to the floor', () => {
  const world = sheetWorld(300, 200);
  const fries = createBody(FOOD[1]);
  const onCloth = supportOf(fries, [300, 200], { world, colliders: [] });
  assert.ok(onCloth >= THICKNESS && onCloth <= 2 * THICKNESS, `on cloth at ${onCloth}`);
  setPositions(world, 0, world.pos.map((v, i) => (i % 3 === 0 ? v - 3000 : v)));
  assert.equal(supportOf(fries, [300, 200], { world, colliders: [] }), 0);
});

test('a body is never its own support', () => {
  const sushi = createBody(FOOD[0]);
  assert.equal(supportOf(sushi, [170, 56], { world: sheetWorld(), colliders: [bodyCollider(sushi)] }), 0);
});

test('cloth lying on top of a body does not hold it up', () => {
  const sushi = createBody(FOOD[0]);
  const world = sheetWorld(170, 56);
  setPositions(world, 0, world.pos.map((v, i) => (i % 3 === 2 ? v + sushi.height : v)));
  assert.equal(supportOf(sushi, [170, 56], { world, colliders: [] }), 0);
});

test('cloth lying on a body is found; cloth beside it is not', () => {
  const sushi = withPosition(createBody(FOOD[0]), [300, 200, 0]);
  const on = sheetWorld(300, 200);
  setPositions(on, 0, on.pos.map((v, i) => (i % 3 === 2 ? v + sushi.height : v)));
  assert.deepEqual(clothOn(on, sushi), [0]);
  assert.deepEqual(clothOn(sheetWorld(500, 200), sushi), []);
});
