import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMesh } from '../../js/cloth/mesh.js';
import {
  LIGHT_DIR, SHADOW_VOLUME, lightMatrix, vertexNormals, neighbourLists, cavity, CREASE,
} from '../../js/cloth/shading.js';

const apply = (m, [x, y, z]) => [0, 1, 2, 3].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);
const sheet = (cols = 4, rows = 3) => buildMesh({ id: 'sheet', size: [cols * 10, rows * 10], grid: { cols, rows, cells: '1'.repeat(cols * rows) } });

test('the light points up and towards the back left, normalised', () => {
  assert.ok(Math.abs(Math.hypot(...LIGHT_DIR) - 1) < 1e-9);
  assert.ok(LIGHT_DIR[0] < 0 && LIGHT_DIR[1] < 0 && LIGHT_DIR[2] > 0.8);
});

test('the shadow matrix fits the whole shadow volume into clip space', () => {
  const m = lightMatrix();
  const { min, max } = SHADOW_VOLUME;
  [min[0], max[0]].forEach((x) => [min[1], max[1]].forEach((y) => [min[2], max[2]].forEach((z) => {
    const [cx, cy, cz, cw] = apply(m, [x, y, z]);
    assert.equal(cw, 1, 'orthographic');
    [cx, cy, cz].forEach((v) => assert.ok(v >= -1 - 1e-5 && v <= 1 + 1e-5, `corner (${x}, ${y}, ${z}) → ${v}`));
  })));
});

test('points on one light ray share a shadow-map texel; the one nearer the light is in front', () => {
  const m = lightMatrix();
  const low = [200, 150, 10];
  const high = low.map((v, i) => v + LIGHT_DIR[i] * 80);
  const [x0, y0, z0] = apply(m, low);
  const [x1, y1, z1] = apply(m, high);
  assert.ok(Math.abs(x0 - x1) < 1e-5 && Math.abs(y0 - y1) < 1e-5);
  assert.ok(z1 < z0, 'nearer the light means smaller depth');
});

test('a flat sheet faces straight up, and turns with the cloth', () => {
  const mesh = sheet();
  const out = new Float32Array(3 * mesh.count);
  vertexNormals(mesh.rest, 0, mesh.tris, out);
  for (let i = 0; i < mesh.count; i += 1) assert.deepEqual([...out.slice(3 * i, 3 * i + 3)], [0, 0, 1]);

  const standing = Float32Array.from(mesh.rest, (v, k) => (k % 3 === 1 ? 0 : k % 3 === 2 ? mesh.rest[k - 1] : v)); // y → z
  vertexNormals(standing, 0, mesh.tris, out);
  assert.ok(Math.abs(Math.abs(out[1]) - 1) < 1e-6 && Math.abs(out[2]) < 1e-6, 'a standing sheet faces sideways');
});

test('normals are read from the garment\'s slice of a shared position array', () => {
  const mesh = sheet();
  const shared = new Float32Array(3 * (mesh.count + 5));
  shared.set(mesh.rest, 15);
  const out = new Float32Array(3 * mesh.count);
  vertexNormals(shared, 5, mesh.tris, out);
  assert.deepEqual([...out.slice(0, 3)], [0, 0, 1]);
});

test('neighbour lists hold every vertex sharing an edge, once', () => {
  const mesh = sheet(2, 1); // 6 vertices: 0 1 2 / 3 4 5
  const lists = neighbourLists(mesh);
  const of = (i) => [...lists.ids.slice(lists.start[i], lists.start[i + 1])].sort();
  assert.deepEqual(of(1), [0, 2, 3, 4, 5].filter((j) => mesh.stretch.some(({ a, b }) => (a === 1 && b === j) || (b === 1 && a === j))));
  assert.equal(new Set(of(4)).size, of(4).length);
});

test('cavity darkens creases, leaves flat cloth alone and barely brightens ridges', () => {
  const mesh = sheet(4, 4);
  const lists = neighbourLists(mesh);
  const out = new Float32Array(mesh.count);
  cavity(mesh.rest, 0, lists, out);
  out.forEach((v) => assert.equal(v, 1));

  const middle = 12; // an inner vertex of the 5 × 5 grid
  const dented = Float32Array.from(mesh.rest);
  dented[3 * middle + 2] = -6;
  cavity(dented, 0, lists, out);
  assert.ok(out[middle] < 0.9, `crease ${out[middle]}`);

  dented[3 * middle + 2] = 40;
  cavity(dented, 0, lists, out);
  assert.ok(out[middle] > 1 && out[middle] <= 1.06, `ridge ${out[middle]}`);
});

test('cloth crushed to a point still gets a usable, upward normal', () => {
  const mesh = sheet(1, 1);
  const out = new Float32Array(3 * mesh.count);
  vertexNormals(new Float32Array(3 * mesh.count), 0, mesh.tris, out);
  for (let i = 0; i < mesh.count; i += 1) assert.deepEqual([...out.slice(3 * i, 3 * i + 3)], [0, 0, 1]);
});

test('a finer mesh can ask for a stronger crease', () => {
  const pos = new Float32Array([0, 0, -1, 1, 0, 0, -1, 0, 0]); // vertex 0 lies 1 below its two neighbours
  const lists = neighbourLists({ count: 3, stretch: [{ a: 0, b: 1 }, { a: 0, b: 2 }] });
  const out = new Float32Array(3);
  cavity(pos, 0, lists, out);
  const normal = 1 - out[0];
  cavity(pos, 0, lists, out, { crease: CREASE * 4 });
  assert.ok(Math.abs((1 - out[0]) - 4 * normal) < 1e-6);
});
