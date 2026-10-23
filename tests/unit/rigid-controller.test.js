import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMesh } from '../../js/cloth/mesh.js';
import { createWorld, setPositions, sleepAll } from '../../js/cloth/solver.js';
import { boxColliders } from '../../js/scene/solids.js';
import { FIGURINE, FOOD, CONTENTS } from '../../js/scene/geometry.js';
import { createRigid } from '../../js/rigid/controller.js';

const ray = (sx, sy) => ({ origin: [sx, sy, 3000], dir: [0, 0, -1] });
const viewport = () => ({ width: 1280, height: 800 });
const DEFS = [FIGURINE, ...FOOD];
const solid = { alpha: () => 1, relief: () => 1 };

function scene({ sheetAt = [-2000, 0, 2.25] } = {}) {
  const mesh = buildMesh({ id: 'sheet', size: [60, 60], grid: { cols: 10, rows: 10, cells: '1'.repeat(100) } });
  const world = createWorld({ garments: [{ mesh, material: { stretchCompliance: 0, bendCompliance: 2e-4, friction: 0.5 } }], bounds: { min: [-3000, -900, 0], max: [1300, 1300, 900] }, thickness: 4.5 });
  setPositions(world, 0, Float32Array.from(mesh.rest, (v, i) => v + [sheetAt[0] - 30, sheetAt[1] - 30, sheetAt[2]][i % 3]));
  sleepAll(world);
  const rigid = createRigid({ defs: DEFS, samplers: DEFS.map(() => solid), world, staticColliders: boxColliders(), ray, viewport });
  return { world, rigid };
}
const run = (rigid, seconds = 2) => { for (let t = 0; t < seconds; t += 1 / 60) rigid.advance(1 / 60); };
const drag = (rigid, id, to) => {
  const at = rigid.bodies.find((b) => b.id === id).position;
  const hit = rigid.pick(ray(at[0], at[1]));
  rigid.grab(hit, at[0], at[1]);
  rigid.dragTo(...to);
  run(rigid, 0.2);
  rigid.release();
  run(rigid);
};

test('at the start every body rests in its place and the cloth world knows its collider', () => {
  const { world, rigid } = scene();
  rigid.bodies.forEach((b, i) => assert.deepEqual(b.position, [...DEFS[i].start, 0]));
  assert.ok(world.colliders.some((c) => c.name === 'body:sushi'));
  assert.equal(rigid.active(), false);
});

test('the pointer picks the food beneath it', () => {
  const { rigid } = scene();
  assert.equal(rigid.pick(ray(170, 56))?.id, 'sushi');
  assert.equal(rigid.pick(ray(300, 56)), null);
});

test('dragging one food item moves it alone, out over the rim onto the table', () => {
  const { rigid } = scene();
  const before = rigid.bodies;
  drag(rigid, 'fries', [720, 150]); // beyond the right flap's tip (x ≤ 557): the table
  rigid.bodies.forEach((b, i) => {
    if (b.id === 'fries') assert.deepEqual(b.position.map(Math.round), [720, 150, 0]);
    else assert.equal(b, before[i], `${b.id} is the very same record`);
  });
});

test('when the cloth beneath is taken away at once, a disturbed body settles straight down', () => {
  const { world, rigid } = scene({ sheetAt: [720, 150, 2.25] }); // on the table, clear of every book and flap
  drag(rigid, 'fries', [720, 150]);
  const onCloth = rigid.bodies.find((b) => b.id === 'fries').position;
  assert.ok(onCloth[2] > 4, `on the cloth at ${onCloth[2]}`);
  setPositions(world, 0, world.pos.map((v, i) => (i % 3 === 0 ? v - 3000 : v)));
  sleepAll(world);
  rigid.disturb();
  assert.equal(rigid.active(), true);
  run(rigid);
  assert.deepEqual(rigid.bodies.find((b) => b.id === 'fries').position, [onCloth[0], onCloth[1], 0]);
  assert.equal(rigid.active(), false);
});

test('let go over another item, food comes to rest on top of it, level', () => {
  const { rigid } = scene();
  drag(rigid, 'dumplings', [170, 210]);
  const d = rigid.bodies.find((b) => b.id === 'dumplings');
  assert.deepEqual(d.position.map(Math.round), [170, 210, FOOD[3].height]);
});

test('restart puts every body back, resting, with nothing held', () => {
  const { rigid } = scene();
  drag(rigid, 'bowl', [320, 80]);
  const hit = rigid.pick(ray(170, 56));
  rigid.grab(hit, 170, 56);
  rigid.dragTo(250, 250);
  rigid.reset();
  assert.equal(rigid.heldId, null);
  rigid.bodies.forEach((b, i) => assert.deepEqual(b.position, [...DEFS[i].start, 0]));
  assert.equal(rigid.active(), false);
});

test('the keyboard brings a body home, onto whatever now lies there', async () => {
  const { rigid } = scene();
  const book = [CONTENTS.book.x + 48, CONTENTS.book.y + 67];
  drag(rigid, 'bowl', book);
  drag(rigid, 'dumplings', [170, 210]);
  const home = rigid.carryHome(DEFS.findIndex((d) => d.id === 'bowl'), { duration: 0.8 });
  run(rigid, 3);
  await home;
  const bowl = rigid.bodies.find((b) => b.id === 'bowl');
  assert.deepEqual(bowl.position.map(Math.round), [170, 210, FOOD[4].height]);
});

test('with reduced motion the move home happens at once and still resolves', async () => {
  const { rigid } = scene();
  drag(rigid, 'bowl', [320, 80]);
  await rigid.carryHome(DEFS.findIndex((d) => d.id === 'bowl'), { instant: true });
  assert.deepEqual(rigid.bodies.find((b) => b.id === 'bowl').position.slice(0, 2), FOOD[3].start);
});

test('cloth lying on a body that is carried away wakes', () => {
  const { world, rigid } = scene({ sheetAt: [170, 56, 12 + 2.25] });
  assert.equal(world.awake[0], 0);
  drag(rigid, 'sushi', [320, 80]);
  assert.equal(world.awake[0], 1, 'the sheet woke (the layer, not the controller, steps the cloth)');
});
