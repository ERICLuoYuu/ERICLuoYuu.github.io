import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOX, CONTENTS, FLAP_OPEN } from '../../js/scene/geometry.js';
import { flapCorners, boxColliders, occluderQuads } from '../../js/scene/solids.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test('a closed front flap lies on the rim and reaches half way across', () => {
  const corners = flapCorners('front', 0);
  corners.forEach(([, , z]) => near(z, BOX.height + BOX.longFlapLift));
  const [hingeLeft, hingeRight, tipRight, tipLeft] = corners;
  near(hingeLeft[0], 0); near(hingeRight[0], BOX.width);
  near(hingeLeft[1], BOX.depth); near(tipLeft[1], BOX.depth - BOX.flapDepth);
  near(tipRight[0], BOX.width);
});

test('an open front flap leans out past the wall and rises', () => {
  const [hinge, , , tip] = flapCorners('front', FLAP_OPEN.front);
  near(hinge[1], BOX.depth);
  assert.ok(tip[1] > BOX.depth, 'the tip is outside the box');
  assert.ok(tip[2] > hinge[2], 'the tip is higher than the hinge');
});

test('side flaps hinge on their own walls', () => {
  flapCorners('left', FLAP_OPEN.left).slice(0, 2).forEach(([x, , z]) => {
    near(x, 0);
    near(z, BOX.height + BOX.shortFlapLift);
  });
  flapCorners('right', FLAP_OPEN.right).slice(0, 2).forEach(([x]) => near(x, BOX.width));
  flapCorners('back', FLAP_OPEN.back).slice(0, 2).forEach(([, y]) => near(y, 0));
  assert.ok(flapCorners('left', FLAP_OPEN.left)[3][0] < 0, 'the left flap opens to the left');
});

test('colliders: 4 walls, 4 open flaps, the booklet, the desiccant and the pack, each a proper box', () => {
  const colliders = boxColliders();
  assert.equal(colliders.length, 11);
  colliders.forEach(({ kind, axes, half, center }) => {
    assert.equal(kind, 'obb');
    axes.forEach((a, i) => axes.forEach((b, j) => near(dot(a, b), i === j ? 1 : 0, 1e-9)));
    half.forEach((h) => assert.ok(h > 0));
    center.forEach((c) => assert.ok(Number.isFinite(c)));
  });
});

test('the front wall collider spans the front edge from floor to rim', () => {
  const front = boxColliders().find((c) => c.name === 'wall-front');
  near(front.center[1] + front.half[1], BOX.depth);
  near(front.center[2] - front.half[2], 0);
  near(front.center[2] + front.half[2], BOX.height + BOX.longFlapLift);
});

test('the booklet collider sits on the floor at the booklet\'s place and thickness', () => {
  const book = boxColliders().find((c) => c.name === 'book');
  const { x, y, width, height, thickness } = CONTENTS.book;
  near(book.center[0], x + width / 2);
  near(book.center[1], y + height / 2);
  near(book.half[2] * 2, thickness);
});

test('occluders: the table plus every face of every collider, as planar quads', () => {
  const quads = occluderQuads();
  assert.equal(quads.length, 1 + 11 * 6);
  quads.forEach((quad) => {
    assert.equal(quad.length, 4);
    const [a, b, c, d] = quad;
    const u = b.map((v, i) => v - a[i]);
    const v = d.map((w, i) => w - a[i]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    near(dot(n, c.map((w, i) => w - a[i])), 0, 1e-6);
  });
  const table = quads[0];
  table.forEach(([, , z]) => near(z, 0));
});

test('the pack collider lies on the floor under its flat part, as thick as the pack', () => {
  const pack = boxColliders().find((c) => c.name === 'pack');
  const { x, y, width, height, thickness } = CONTENTS.pack;
  near(pack.center[0], x + width / 2);
  near(pack.center[1], y + height / 2);
  near(pack.center[2] - pack.half[2], 0);
  near(pack.half[2] * 2, thickness);
});
