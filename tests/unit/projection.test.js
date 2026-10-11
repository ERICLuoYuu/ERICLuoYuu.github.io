import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraMatrix, projectPoint, screenRay } from '../../js/scene/projection.js';
import { BOX, frameFor } from '../../js/scene/geometry.js';

const vp = { width: 1000, height: 800 };
const flat = { tilt: 0, spin: 0, zoom: 1, panX: 0, panY: 0, perspective: 1000 };
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

/** Apply the column-major 4 × 4 matrix and return screen pixels plus NDC depth. */
const throughMatrix = (m, [x, y, z]) => {
  const c = [0, 1, 2, 3].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);
  return {
    x: ((c[0] / c[3] + 1) / 2) * vp.width,
    y: ((1 - c[1] / c[3]) / 2) * vp.height,
    depth: c[2] / c[3],
  };
};

test('the floor centre lands on the screen centre', () => {
  const p = projectPoint(flat, vp, [BOX.width / 2, BOX.depth / 2, 0]);
  near(p.x, 500);
  near(p.y, 400);
});

test('height magnifies like CSS perspective', () => {
  const p = projectPoint(flat, vp, [BOX.width / 2 + 100, BOX.depth / 2, 500]);
  near(p.x, 500 + 200); // P / (P − z) = 1000 / 500
});

test('zoom and pan move points the way the camera element does', () => {
  const p = projectPoint({ ...flat, zoom: 2, panX: 30, panY: -10 }, vp, [BOX.width / 2 + 10, BOX.depth / 2 + 5, 0]);
  near(p.x, 500 + 30 + 20);
  near(p.y, 400 - 10 + 10);
});

test('tilt lifts high points up the screen; spin turns clockwise', () => {
  const top = projectPoint({ ...flat, tilt: 54 }, vp, [BOX.width / 2, BOX.depth / 2, 100]);
  assert.ok(top.y < 400);
  const spun = projectPoint({ ...flat, spin: 90 }, vp, [BOX.width / 2 + 50, BOX.depth / 2, 0]);
  near(spun.x, 500);
  near(spun.y, 450);
});

test('the matrix agrees with projectPoint and keeps the scene inside the depth range', () => {
  const frame = { tilt: 31, spin: -17, zoom: 1.4, panX: 12, panY: -30, perspective: 1300 };
  const m = cameraMatrix(frame, vp);
  for (const pt of [[80, 260, 140], [0, 0, 0], [BOX.width, BOX.depth, BOX.height], [-300, 500, 0]]) {
    const viaMatrix = throughMatrix(m, pt);
    const direct = projectPoint(frame, vp, pt);
    near(viaMatrix.x, direct.x, 1e-3);
    near(viaMatrix.y, direct.y, 1e-3);
    assert.ok(viaMatrix.depth > -1 && viaMatrix.depth < 1, `depth ${viaMatrix.depth} for ${pt}`);
  }
});

test('nearer points get smaller depth', () => {
  const m = cameraMatrix(flat, vp);
  const high = throughMatrix(m, [BOX.width / 2, BOX.depth / 2, 200]);
  const low = throughMatrix(m, [BOX.width / 2, BOX.depth / 2, 0]);
  assert.ok(high.depth < low.depth);
});

test('screenRay starts at the eye and passes back through the projected point', () => {
  for (const view of ['threeQuarter', 'overhead']) {
    const frame = frameFor(view, 1280, 800);
    const viewport = { width: 1280, height: 800 };
    const pt = [123, 211, 57];
    const p = projectPoint(frame, viewport, pt);
    const { origin, dir } = screenRay(frame, viewport, p.x, p.y);
    near(Math.hypot(...dir), 1, 1e-9);
    const v = pt.map((x, i) => x - origin[i]);
    const len = Math.hypot(...v);
    v.forEach((x, i) => near(x / len, dir[i], 1e-6));
  }
});

test('the overhead eye sits above the box, looking down', () => {
  const frame = frameFor('overhead', 1280, 800);
  const { origin, dir } = screenRay(frame, { width: 1280, height: 800 }, 640, 400);
  assert.ok(origin[2] > BOX.height);
  assert.ok(dir[2] < -0.99);
});
