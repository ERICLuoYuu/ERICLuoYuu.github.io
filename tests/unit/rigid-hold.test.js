import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOX, FIGURINE, FOOD } from '../../js/scene/geometry.js';
import { WALL } from '../../js/scene/solids.js';
import { createBody, footprintCorners } from '../../js/rigid/body.js';
import { createRigidHand, LIFT, SCREEN_MARGIN } from '../../js/rigid/hold.js';

const ray = (sx, sy) => ({ origin: [sx, sy, 3000], dir: [0, 0, -1] }); // looking straight down: screen = parcel
const viewport = () => ({ width: 1280, height: 800 });
const RIM = BOX.height + BOX.longFlapLift;
const wallsUnder = (body, [x]) => (x > BOX.width - 4 && x < BOX.width + 30 ? RIM : 0); // a wall around x = 420
const frames = (hand, body, n) => Array.from({ length: n }).reduce((b) => { hand.advance(1 / 60); return hand.place(b); }, body);
const top = (b) => [b.position[0] + 5, b.position[1] - 3, b.height];

test('grabbed food follows the pointer LIFT above what lies beneath, and only moves', () => {
  const fries = createBody(FOOD[1]);
  const hand = createRigidHand({ ray, viewport, supportAt: () => 0 });
  const p = top(fries);
  hand.grab(fries, p, p[0], p[1]);
  assert.equal(hand.id, 'fries');
  hand.dragTo(p[0] + 100, p[1] + 40);
  const moved = hand.place(fries);
  assert.deepEqual(moved.position.slice(0, 2).map(Math.round), [270, 155]);
  assert.equal(moved.position[2], LIFT);
  assert.deepEqual([moved.footprint, moved.rotate, moved.height], [fries.footprint, fries.rotate, fries.height]);
});

test('it rises at once over a wall and sinks back once past it', () => {
  const sushi = createBody(FOOD[0]);
  const hand = createRigidHand({ ray, viewport, supportAt: wallsUnder });
  hand.grab(sushi, top(sushi), ...top(sushi).slice(0, 2));
  hand.dragTo(BOX.width + 10, 56);
  assert.ok(hand.place(sushi).position[2] >= RIM + LIFT);
  hand.dragTo(BOX.width + 200, 56);
  assert.ok(frames(hand, sushi, 120).position[2] < LIFT + 1, 'sunk back over the table');
});

test('the figurine stays inside the walls however far it is pulled', () => {
  const fig = createBody(FIGURINE);
  const hand = createRigidHand({ ray, viewport, supportAt: () => 0 });
  hand.grab(fig, top(fig), ...top(fig).slice(0, 2));
  hand.dragTo(900, -300);
  footprintCorners(hand.place(fig), { inset: 0 }).forEach(([x, y]) => {
    assert.ok(x >= WALL && x <= BOX.width - WALL && y >= WALL && y <= BOX.depth - WALL, `${x}, ${y}`);
  });
});

test('food may go anywhere, but its grab point never leaves the screen', () => {
  const bowl = createBody(FOOD[3]);
  const hand = createRigidHand({ ray, viewport, supportAt: () => 0 });
  const p = top(bowl);
  hand.grab(bowl, p, p[0], p[1]);
  hand.dragTo(-500, 2000);
  const moved = hand.place(bowl);
  const grip = [moved.position[0] + (p[0] - bowl.position[0]), moved.position[1] + (p[1] - bowl.position[1])];
  assert.ok(grip[0] >= SCREEN_MARGIN - 0.5 && grip[1] <= 800 - SCREEN_MARGIN + 0.5, `grip at ${grip}`);
});

test('released, the hand lets go and the body stays where it was put', () => {
  const fries = createBody(FOOD[1]);
  const hand = createRigidHand({ ray, viewport, supportAt: () => 0 });
  hand.grab(fries, top(fries), ...top(fries).slice(0, 2));
  hand.dragTo(700, 150);
  const moved = hand.place(fries);
  hand.release();
  assert.equal(hand.id, null);
  assert.deepEqual(hand.place(moved), moved);
});

test('a keyboard carry lifts the body, takes it to the target and lets go', async () => {
  const bowl = createBody(FOOD[3]);
  const hand = createRigidHand({ ray, viewport, supportAt: () => 0 });
  let done = false;
  const moved = hand.carry(bowl, [300, 60], { duration: 0.5 }).then(() => { done = true; });
  const end = frames(hand, bowl, 60);
  await moved;
  assert.ok(done);
  assert.deepEqual(end.position.slice(0, 2).map(Math.round), [300, 60]);
  assert.equal(hand.id, null);
});

test('drop() ends a carry at once', async () => {
  const bowl = createBody(FOOD[3]);
  const hand = createRigidHand({ ray, viewport, supportAt: () => 0 });
  const moved = hand.carry(bowl, [300, 60], { duration: 2 });
  hand.drop();
  await moved;
  assert.equal(hand.id, null);
});
