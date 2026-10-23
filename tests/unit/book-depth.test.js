import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOX, BOOKS, baseOf, frameFor, rotateZ } from '../../js/scene/geometry.js';
import { projectPoint, screenRay } from '../../js/scene/projection.js';
import { WALL } from '../../js/scene/solids.js';
import { castShadow, localOffset, shadowHull } from '../../js/scene/shadow.js';

const close = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

/** Screen px a book's cast shadow reaches past its top face: the most over its three corners nearest the shadow. */
function shadowBeyond(frame, view, book) {
  const [dx, dy] = castShadow(book.thickness);
  const base = baseOf(book);
  const cx = book.x + book.width / 2;
  const cy = book.y + book.height / 2;
  return Math.max(...[[1, 1], [1, -1], [-1, 1]].map(([sx, sy]) => {
    const [ox, oy] = rotateZ([(sx * book.width) / 2, (sy * book.height) / 2, 0], book.rotate);
    const top = projectPoint(frame, view, [cx + ox, cy + oy, base + book.thickness]);
    const shadow = projectPoint(frame, view, [cx + ox + dx, cy + oy + dy, base]);
    return Math.hypot(shadow.x - top.x, shadow.y - top.y);
  }));
}

/** The middle of a book's front page edge, at its foot. */
function frontFoot(book) {
  const [ox, oy] = rotateZ([0, book.height / 2, 0], book.rotate);
  return [book.x + book.width / 2 + ox, book.y + book.height / 2 + oy, baseOf(book)];
}

/** Screen px of the front page edge's height, at the middle of the front edge. */
function frontEdge(frame, view, book) {
  const foot = frontFoot(book);
  const low = projectPoint(frame, view, foot);
  const high = projectPoint(frame, view, [foot[0], foot[1], foot[2] + book.thickness]);
  return low.y - high.y;
}

/** Whether the front wall stands between the eye and a parcel point (tilted, the camera looks over it). */
function behindFrontWall(frame, view, point) {
  const face = BOX.depth - WALL;
  const s = projectPoint(frame, view, point);
  const { origin, dir } = screenRay(frame, view, s.x, s.y);
  if (origin[1] <= face || point[1] >= face) return false;
  const t = (face - origin[1]) / dir[1];
  return origin[2] + t * dir[2] < BOX.height;
}

test('a cast shadow falls down-right, 0.57 × the height, along the light', () => {
  const [dx, dy] = castShadow(10);
  assert.ok(close(dx, 3.5) && close(dy, 4.5), `${dx}, ${dy}`);
});

test('turned with its book, the offset still points the same way in the box', () => {
  const [lx, ly] = localOffset([3.5, 4.5], 90);
  const [bx, by] = rotateZ([lx, ly, 0], 90);
  assert.ok(close(bx, 3.5) && close(by, 4.5));
});

test('the shadow hull joins the book and its shifted copy', () => {
  assert.deepEqual(shadowHull(100, 50, [10, 20]), [[0, 0], [100, 0], [110, 20], [110, 70], [10, 70], [0, 50]]);
  assert.equal(shadowHull(100, 50, [-10, 20]).length, 6);
});

test('the thick books keep their real proportions', () => {
  const t = Object.fromEntries(BOOKS.map((b) => [b.id, b.thickness]));
  assert.deepEqual(t, { dictionary: 28, 'hunter-x-hunter': 7, solitude: 13, siddhartha: 8 });
});

test('tilted, the front wall hides none of the floor where the figurine, the food and the books lie', () => {
  for (const view of [{ width: 1280, height: 800 }, { width: 412, height: 915 }]) {
    const frame = frameFor('overhead', view.width, view.height);
    [20, 170, 300, 400].forEach((x) => assert.ok(!behindFrontWall(frame, view, [x, 284, 0]), `y 284 at x ${x}, ${view.width} wide`));
    assert.ok(behindFrontWall(frame, view, [300, 296, 0]), 'right at the wall the floor is out of sight');
  }
});

// A page edge shows only as far as the sight leans toward the front, and the
// same lean lets the front wall hide the front of the floor: at 14° the thin
// books' edges are about 1 px, so their depth comes mainly from the shadows.
test('on the desktop every book shows its shadow and, in front of the wall, its page edge', () => {
  const view = { width: 1280, height: 800 };
  const frame = frameFor('overhead', view.width, view.height);
  BOOKS.forEach((b) => {
    assert.ok(shadowBeyond(frame, view, b) >= 6, `${b.id}: shadow ${shadowBeyond(frame, view, b).toFixed(1)} px`);
    assert.ok(!behindFrontWall(frame, view, frontFoot(b)), `${b.id}: front edge hidden by the wall`);
    const min = b.id === 'dictionary' ? 3 : 0.9;
    assert.ok(frontEdge(frame, view, b) >= min, `${b.id}: front edge ${frontEdge(frame, view, b).toFixed(2)} px`);
  });
});

test('on a phone every book still casts a visible shadow', () => {
  const view = { width: 390, height: 844 };
  const frame = frameFor('overhead', view.width, view.height);
  BOOKS.forEach((b) => assert.ok(shadowBeyond(frame, view, b) >= 2.5, `${b.id}: ${shadowBeyond(frame, view, b).toFixed(1)} px`));
});
