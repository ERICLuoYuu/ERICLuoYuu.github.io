import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMesh } from '../../js/cloth/mesh.js';
import { createWorld, setPositions } from '../../js/cloth/solver.js';
import { pick } from '../../js/cloth/pick.js';

const mesh = buildMesh({ id: 'sheet', size: [60, 40], grid: { cols: 6, rows: 4, cells: '1'.repeat(24) } });
const material = { stretchCompliance: 0, bendCompliance: 2e-4, friction: 0.5 };
const opaque = () => 1;
const down = (x, y) => ({ origin: [x, y, 500], dir: [0, 0, -1] });

/** Two sheets: the first on the floor, the second lifted by `lift` and moved by (dx, dy). */
function scene(lift = 20, [dx, dy] = [0, 0]) {
  const w = createWorld({ garments: [{ mesh, material }, { mesh, material }], bounds: { min: [-500, -500, 0], max: [900, 900, 900] } });
  const top = w.pos.slice(3 * w.offsets[1], 3 * (w.offsets[1] + w.counts[1]));
  for (let i = 0; i < top.length; i += 3) {
    top[i] += dx;
    top[i + 1] += dy;
    top[i + 2] += lift;
  }
  setPositions(w, 1, top);
  return w;
}

test('a ray straight down hits the sheet at the point under it', () => {
  const w = scene(20, [200, 0]);
  const hit = pick(w, [mesh, mesh], down(25, 15), opaque);
  assert.equal(hit.garment, 0);
  hit.point.forEach((v, i) => assert.ok(Math.abs(v - [25, 15, 0][i]) < 1e-4));
  assert.ok(Math.abs(hit.uv[0] - 25 / 60) < 1e-6 && Math.abs(hit.uv[1] - 15 / 40) < 1e-6);
  hit.ids.forEach((id) => assert.ok(id >= 0 && id < w.counts[0]));
});

test('where garments overlap, the one on top wins', () => {
  const w = scene(20);
  const hit = pick(w, [mesh, mesh], down(30, 20), opaque);
  assert.equal(hit.garment, 1);
  assert.ok(Math.abs(hit.point[2] - 20) < 1e-4);
  hit.ids.forEach((id) => assert.ok(id >= w.offsets[1]));
});

test('transparent parts of the texture are not cloth', () => {
  const w = scene(20, [200, 0]);
  const holeInTheMiddle = (g, u) => (g === 0 && u > 0.3 && u < 0.6 ? 0 : 1);
  assert.equal(pick(w, [mesh, mesh], down(25, 15), holeInTheMiddle), null);
  assert.equal(pick(w, [mesh, mesh], down(5, 15), holeInTheMiddle).garment, 0);
});

test('a ray that misses everything finds nothing', () => {
  const w = scene();
  assert.equal(pick(w, [mesh, mesh], down(-50, -50), opaque), null);
  assert.equal(pick(w, [mesh, mesh], { origin: [30, 20, 500], dir: [0, 0, 1] }, opaque), null);
});

test('an oblique ray finds the first surface along the line of sight', () => {
  const w = scene(30);
  const dir = [0.3, 0, -1];
  const length = Math.hypot(...dir);
  const hit = pick(w, [mesh, mesh], { origin: [0, 20, 100], dir: dir.map((v) => v / length) }, opaque);
  assert.equal(hit.garment, 1);
  assert.ok(Math.abs(hit.point[0] - 21) < 1e-3);
});
