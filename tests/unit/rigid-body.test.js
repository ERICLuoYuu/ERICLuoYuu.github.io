import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOX, CONTENTS, BOOKS, FIGURINE, FOOD } from '../../js/scene/geometry.js';
import {
  createBody, withPosition, fromRect, footprintCorners, footprintPoints, bodyCollider, overlapXY, containsXY,
} from '../../js/rigid/body.js';

test('a body starts on the floor at its place; moving it makes a new record', () => {
  const sushi = createBody(FOOD[0]);
  assert.deepEqual(sushi.position, [170, 56, 0]);
  assert.ok(Object.isFrozen(sushi));
  const moved = withPosition(sushi, [10, 20, 5]);
  assert.deepEqual(moved.position, [10, 20, 5]);
  assert.deepEqual(sushi.position, [170, 56, 0], 'the original is unchanged');
});

test("a body's collider is its inset footprint, as tall as the body", () => {
  const bowl = withPosition(createBody(FOOD[3]), [100, 100, 9]);
  const c = bodyCollider(bowl);
  assert.equal(c.name, 'body:bowl');
  assert.deepEqual(c.center, [100, 100, 18]);
  assert.ok(Math.abs(c.half[0] - 21 * 0.85) < 1e-9);
  assert.equal(c.half[2], 9);
});

test('turned a quarter, a footprint swaps its width and depth', () => {
  const b = withPosition(createBody({ id: 't', label: 't', footprint: [40, 20], height: 5, start: [0, 0], rotate: 90, inset: 0 }), [100, 50, 0]);
  const xs = footprintPoints(b, 8).map(([x]) => x);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 20) < 1e-6);
  assert.ok(footprintPoints(b, 8).every((p) => containsXY(b, p)));
  assert.ok(containsXY(b, [100, 50 + 19]) && !containsXY(b, [100 + 11, 50]));
});

test('overlap is decided on turned footprints', () => {
  const a = withPosition(createBody({ ...FOOD[1], rotate: 45 }), [100, 100, 0]);
  assert.ok(overlapXY(a, withPosition(a, [120, 100, 0])));
  assert.ok(!overlapXY(a, withPosition(a, [160, 100, 0])));
});

test('the figurine lies along the left wall, the full depth, and stays inside', () => {
  footprintCorners(createBody(FIGURINE), { inset: 0 }).forEach(([x, y]) => {
    assert.ok(x >= 4 && x <= 135 && y >= 4 && y <= BOX.depth - 4, `${x}, ${y}`);
  });
  assert.equal(FIGURINE.keepIn, true);
});

test('the food stands in a column beside it, sushi at the back, dumplings at the front', () => {
  assert.deepEqual(FOOD.map((f) => f.id), ['sushi', 'fries', 'strawberries', 'bowl', 'dumplings']);
  const ys = FOOD.map((f) => f.start[1]);
  assert.deepEqual([...ys].sort((p, q) => p - q), ys);
  FOOD.map(createBody).forEach((b) => footprintCorners(b, { inset: 0 }).forEach(([x, y]) => {
    assert.ok(x >= 140 && x <= 200, `${b.id} x ${x}`);
    assert.ok(y >= 4 && y <= BOX.depth - 4, `${b.id} y ${y}`);
  }));
  FOOD.forEach((f) => assert.ok(f.height > 0 && f.inset >= 0 && f.inset <= 0.2 && f.label));
});

test('at the start nothing on the floor overlaps anything else', () => {
  const things = [
    createBody(FIGURINE), ...FOOD.map(createBody),
    fromRect({ ...CONTENTS.book, id: 'booklet' }), fromRect({ ...CONTENTS.desiccant, id: 'desiccant' }),
    ...BOOKS.filter((b) => !b.on).map((b) => fromRect(b)),
  ];
  things.forEach((a, i) => things.slice(i + 1).forEach((b) => assert.ok(!overlapXY(a, b, { inset: 0 }), `${a.id} / ${b.id}`)));
});
