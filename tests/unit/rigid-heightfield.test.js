import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIGURINE } from '../../js/scene/geometry.js';
import { createBody, withPosition } from '../../js/rigid/body.js';
import {
  heightfieldMesh, modelMatrix, pickBody, surfacePoint,
} from '../../js/rigid/heightfield.js';

const apply = (m, [x, y, z]) => [0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);

test('a heightfield spans the footprint at its spacing, raised by the relief', () => {
  const mesh = heightfieldMesh({ footprint: [10, 6], height: 4 }, () => 0.5, 2);
  assert.equal(mesh.count, 6 * 4);
  const xs = mesh.positions.filter((_, i) => i % 3 === 0);
  assert.deepEqual([Math.min(...xs), Math.max(...xs)], [-5, 5]);
  assert.ok(mesh.positions.filter((_, i) => i % 3 === 2).every((z) => z === 2));
  assert.equal(mesh.indices.length, 5 * 3 * 6);
});

test('normals point up on flat ground and lean away from a slope', () => {
  const flat = heightfieldMesh({ footprint: [10, 10], height: 4 }, () => 0.5, 2);
  assert.deepEqual([...flat.normals.slice(0, 3)].map((v) => Math.round(v * 1000) / 1000), [0, 0, 1]);
  const ramp = heightfieldMesh({ footprint: [10, 10], height: 4 }, (u) => u, 2);
  assert.ok(ramp.normals[3 * 8] < -0.1, 'rising to the right, the surface faces left');
});

test('the model matrix turns about the centre, then moves the body into place', () => {
  const body = withPosition(createBody({ ...FIGURINE, rotate: 90 }), [10, 20, 3]);
  assert.deepEqual(apply(modelMatrix(body), [1, 0, 0]).map((v) => Math.round(v * 1e6) / 1e6), [10, 21, 3]);
});

test('picking hits the top of an opaque body and misses its clear part', () => {
  const body = withPosition(createBody({ ...FIGURINE, footprint: [40, 40], height: 10, rotate: 0 }), [100, 100, 0]);
  const look = { alpha: (u) => (u < 0.5 ? 0 : 1), relief: () => 1 };
  const down = (x, y) => ({ origin: [x, y, 3000], dir: [0, 0, -1] });
  const hit = pickBody(down(110, 100), body, look);
  assert.ok(hit && Math.abs(hit.point[2] - 10) < 0.5 && Math.abs(hit.t - 2990) < 0.5);
  assert.ok(Math.abs(hit.uv[0] - 0.75) < 0.02);
  assert.equal(pickBody(down(90, 100), body, look), null);
  assert.equal(pickBody(down(200, 100), body, look), null);
});

test("the figurine's meshes fit 16-bit indices", () => {
  assert.ok(heightfieldMesh(FIGURINE, () => 0).count <= 65535);
});

test('a point on the picture is found on the body\'s top, where picking would hit it', () => {
  const body = withPosition({ ...createBody(FIGURINE), rotate: 90 }, [100, 150, 6]);
  const relief = (u, v) => (u > 0.5 ? 1 : 0.5);
  const top = surfacePoint(body, relief, [0.75, 0.25]);
  assert.deepEqual(top.map((c) => Math.round(c * 1000) / 1000), [172.5, 181.25, 36]);
  const hit = pickBody({ origin: [top[0], top[1], 500], dir: [0, 0, -1] }, body, { alpha: () => 1, relief });
  assert.ok(Math.abs(hit.point[2] - top[2]) < 0.5 && Math.abs(hit.uv[0] - 0.75) < 1e-6 && Math.abs(hit.uv[1] - 0.25) < 1e-6);
});
