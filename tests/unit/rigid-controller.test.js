import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMesh } from '../../js/cloth/mesh.js';
import { createWorld, setPositions, sleepAll } from '../../js/cloth/solver.js';
import { supportUnder } from '../../js/cloth/grip.js';
import { boxColliders } from '../../js/scene/solids.js';
import { FIGURINE, FOOD, CONTENTS } from '../../js/scene/geometry.js';
import { createRigid } from '../../js/rigid/controller.js';
import { LIFT } from '../../js/rigid/hold.js';

const ray = (sx, sy) => ({ origin: [sx, sy, 3000], dir: [0, 0, -1] });
const viewport = () => ({ width: 1280, height: 800 });
const DEFS = [FIGURINE, ...FOOD];
const solid = { alpha: () => 1, relief: () => 1 };
const round = { alpha: (u, v) => ((u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.25 ? 1 : 0), relief: () => 1 }; // a picture filling its footprint's circle

function scene({ sheetAt = [-2000, 0, 2.25], samplers = DEFS.map(() => solid), sight = ray } = {}) {
  const mesh = buildMesh({ id: 'sheet', size: [60, 60], grid: { cols: 10, rows: 10, cells: '1'.repeat(100) } });
  const world = createWorld({ garments: [{ mesh, material: { stretchCompliance: 0, bendCompliance: 2e-4, friction: 0.5 } }], bounds: { min: [-3000, -900, 0], max: [1300, 1300, 900] }, thickness: 4.5 });
  setPositions(world, 0, Float32Array.from(mesh.rest, (v, i) => v + [sheetAt[0] - 30, sheetAt[1] - 30, sheetAt[2]][i % 3]));
  sleepAll(world);
  const rigid = createRigid({ defs: DEFS, samplers, world, staticColliders: boxColliders(), ray: sight, viewport });
  return { world, rigid };
}
const where = (rigid, id) => rigid.bodies.find((b) => b.id === id).position;
const grabAt = (rigid, x, y, id) => {
  const hit = rigid.pick(ray(x, y));
  assert.equal(hit?.id, id, `the pointer at ${x}, ${y} picks the ${id}`);
  rigid.grab(hit, x, y);
};
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

test('clicking the lower of two stacked items leaves the stack as it was', () => {
  const { rigid } = scene();
  drag(rigid, 'bowl', [720, 150]); // out on the table
  drag(rigid, 'dumplings', [735, 150]); // half over the bowl: it rests on the bowl
  assert.equal(Math.round(where(rigid, 'dumplings')[2]), FOOD[3].height);
  grabAt(rigid, 702, 150, 'bowl'); // the bowl's uncovered edge
  rigid.advance(1 / 60);
  assert.ok(where(rigid, 'dumplings')[2] >= FOOD[3].height - 0.01, `the dumplings stay on the lifted bowl (at ${where(rigid, 'dumplings')[2]})`);
  run(rigid, 0.2);
  rigid.release();
  run(rigid);
  assert.deepEqual(where(rigid, 'bowl').map(Math.round), [720, 150, 0]);
  assert.deepEqual(where(rigid, 'dumplings').map(Math.round), [735, 150, FOOD[3].height]);
});

test('lifting the figurine lifts the food lying on it; let go, the food lies on it again', () => {
  const { rigid } = scene();
  drag(rigid, 'sushi', [70, 80]); // onto the figurine's bag
  assert.equal(Math.round(where(rigid, 'sushi')[2]), FIGURINE.height);
  grabAt(rigid, 70, 250, 'figurine');
  rigid.advance(1 / 60);
  assert.ok(where(rigid, 'figurine')[2] <= LIFT + 0.01, `the figurine is held just LIFT up, not over the sushi (at ${where(rigid, 'figurine')[2]})`);
  assert.ok(where(rigid, 'sushi')[2] >= FIGURINE.height - 0.01, `the sushi rides on it (at ${where(rigid, 'sushi')[2]})`);
  rigid.release();
  run(rigid);
  assert.deepEqual(where(rigid, 'figurine'), [...FIGURINE.start, 0]);
  assert.deepEqual(where(rigid, 'sushi').map(Math.round), [70, 80, FIGURINE.height]);
});

test('let go over each sloping open flap, the round bowl rests on the highest point beneath its outline', () => {
  const flaps = { front: [210, 368.5], back: [210, -32.9], left: [-52.1, 150], right: [482.9, 150] };
  const SHIFT = 300; // screen point (sx, sy) looks down on parcel point (sx − SHIFT, sy − SHIFT): every flap is on the screen
  const sight = (sx, sy) => ray(sx - SHIFT, sy - SHIFT);
  Object.entries(flaps).forEach(([side, to]) => {
    const { rigid } = scene({ samplers: DEFS.map((d) => (d.id === 'bowl' ? round : solid)), sight });
    const [sx, sy] = FOOD[3].start.map((v) => v + SHIFT);
    rigid.grab(rigid.pick(sight(sx, sy)), sx, sy);
    rigid.dragTo(to[0] + SHIFT, to[1] + SHIFT);
    run(rigid, 0.2);
    rigid.release();
    run(rigid);
    assert.deepEqual(where(rigid, 'bowl').slice(0, 2).map(Math.round), to.map(Math.round), `${side}: let go where it was taken`);
    const [x, y, z] = where(rigid, 'bowl');
    const r = FOOD[3].footprint[0] / 2;
    const rim = Array.from({ length: 720 }, (_, k) => [x + r * Math.cos((k * Math.PI) / 360), y + r * Math.sin((k * Math.PI) / 360)]);
    const flap = boxColliders().find((c) => c.name === `flap-${side}`);
    const top = supportUnder({ count: 0 }, [flap], rim, { reach: 0 });
    assert.ok(z >= top - 0.5, `${side}: the bowl sinks ${(top - z).toFixed(2)} into the flap`);
    assert.ok(z <= top + 1, `${side}: the bowl floats ${(z - top).toFixed(2)} above the flap`);
  });
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
