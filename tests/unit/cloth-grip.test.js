import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxColliders, flapCorners } from '../../js/scene/solids.js';
import { BOX, CONTENTS } from '../../js/scene/geometry.js';
import { supportHeight, gripCluster, onPlane } from '../../js/cloth/grip.js';

const colliders = boxColliders();
const noCloth = { count: 0, pos: new Float32Array(0), garmentOf: new Uint16Array(0), thickness: 7.5 };
const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;

test('nothing to clear over the open floor or the table', () => {
  // between the pack and the booklet, more than the hand's reach from either
  assert.equal(supportHeight(noCloth, colliders, 165, 150), 0);
  assert.equal(supportHeight(noCloth, colliders, -500, -500), 0);
});

test('near a wall the hand must clear its rim', () => {
  const rim = BOX.height + BOX.longFlapLift;
  assert.ok(near(supportHeight(noCloth, colliders, 210, BOX.depth - 10), rim));
  // just outside, the open front flap already rises above the rim
  assert.ok(supportHeight(noCloth, colliders, 210, BOX.depth + 12) >= rim, 'just outside counts too');
});

test('over the booklet, its cover', () => {
  const { x, y, width, height, thickness } = CONTENTS.book;
  assert.ok(near(supportHeight(noCloth, colliders, x + width / 2, y + height / 2), 0.6 + thickness));
});

test('over the vacuum pack, its top', () => {
  const { x, y, width, height, thickness } = CONTENTS.pack;
  assert.ok(near(supportHeight(noCloth, colliders, x + width / 2, y + height / 2), thickness));
});

test('over an open flap, the flap surface at that spot', () => {
  const [hingeL, hingeR, tipR, tipL] = flapCorners('front');
  const mid = (p, q) => p.map((v, i) => (v + q[i]) / 2);
  const centre = mid(mid(hingeL, hingeR), mid(tipL, tipR));
  const h = supportHeight(noCloth, colliders, centre[0], centre[1]);
  // open flaps lean outwards and up: the tip is higher than the hinge
  assert.ok(h > hingeL[2] && h < tipL[2], `between hinge ${hingeL[2]} and tip ${tipL[2]}: ${h}`);
  assert.ok(h >= centre[2] && h < centre[2] + 3, `on the flap's upper side (${centre[2]}): ${h}`);
});

test('other cloth underneath counts; the held garment itself does not', () => {
  const world = { count: 2, pos: new Float32Array([165, 150, 40, 168, 150, 90]), garmentOf: new Uint16Array([0, 1]), thickness: 7.5 };
  assert.ok(near(supportHeight(world, colliders, 165, 150), 90 + 7.5));
  assert.ok(near(supportHeight(world, colliders, 165, 150, { skip: 1 }), 40 + 7.5));
  assert.equal(supportHeight(world, colliders, 165, 210), 0, 'too far away to matter');
});

test('the grip holds the particles of the hit garment close to the hit point', () => {
  const pos = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 30, 0, 0, 5, 5, 0]);
  const world = { pos, offsets: [0, 4], counts: [4, 1] };
  const ids = gripCluster(world, { garment: 0, ids: [0, 1, 2], point: [3, 3, 0] }, 12);
  assert.deepEqual(ids, [0, 1, 2], 'garment 1 and the far particle are left out');
  assert.deepEqual(gripCluster(world, { garment: 0, ids: [3, 1, 0], point: [29, 0, 0] }, 0.5), [3], 'at least the nearest particle');
});

test('a pointer ray meets a horizontal plane where expected', () => {
  assert.deepEqual(onPlane({ origin: [10, 20, 500], dir: [0, 0, -1] }, 60), [10, 20, 60]);
  const slanted = onPlane({ origin: [0, 0, 100], dir: [Math.SQRT1_2, 0, -Math.SQRT1_2] }, 40);
  assert.ok(near(slanted[0], 60, 1e-9) && near(slanted[2], 40, 1e-9));
  assert.equal(onPlane({ origin: [0, 0, 100], dir: [1, 0, 0] }, 40), null, 'parallel rays never meet it');
});
