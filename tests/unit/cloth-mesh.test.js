import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMesh } from '../../js/cloth/mesh.js';

const garment = (cells, cols, rows, size = [cols * 10, rows * 10]) => ({ id: 'test', size, grid: { cols, rows, cells } });
const distance = (m, a, b) => Math.hypot(
  m.rest[3 * a] - m.rest[3 * b], m.rest[3 * a + 1] - m.rest[3 * b + 1], m.rest[3 * a + 2] - m.rest[3 * b + 2],
);

test('one cell gives 4 vertices, 2 triangles, 5 edges and 1 bend', () => {
  const m = buildMesh(garment('1', 1, 1));
  assert.equal(m.count, 4);
  assert.equal(m.tris.length, 6);
  assert.equal(m.stretch.length, 5);
  assert.equal(m.bend.length, 1);
});

test('uncovered cells add nothing and corners are shared', () => {
  const m = buildMesh(garment('110' + '010', 3, 2));
  assert.equal(m.tris.length / 3, 6);
  assert.equal(m.count, 8);
});

test('rest lengths match the flat layout and UVs span the texture', () => {
  const m = buildMesh(garment('1111', 2, 2, [30, 50]));
  m.stretch.forEach(({ a, b, rest }) => assert.ok(Math.abs(distance(m, a, b) - rest) < 1e-6));
  m.bend.forEach(({ a, b, rest }) => assert.ok(Math.abs(distance(m, a, b) - rest) < 1e-6));
  assert.equal(Math.max(...m.uv), 1);
  assert.equal(Math.min(...m.uv), 0);
  assert.equal(Math.max(...m.rest.filter((_, i) => i % 3 === 0)), 30);
  assert.equal(Math.max(...m.rest.filter((_, i) => i % 3 === 1)), 50);
});

test('diagonals alternate so the cloth has no built-in bias', () => {
  const m = buildMesh(garment('11', 2, 1));
  const diagonals = m.stretch.filter(({ rest }) => rest > 10.5);
  const slopes = diagonals.map(({ a, b }) => Math.sign((m.rest[3 * b] - m.rest[3 * a]) * (m.rest[3 * b + 1] - m.rest[3 * a + 1])));
  assert.deepEqual(new Set(slopes).size, 2);
});

test('every triangle edge is a stretch constraint, and every inner edge bends', () => {
  const m = buildMesh(garment('111' + '111' + '111', 3, 3));
  const keys = new Set(m.stretch.map(({ a, b }) => `${Math.min(a, b)},${Math.max(a, b)}`));
  for (let t = 0; t < m.tris.length; t += 3) {
    const [a, b, c] = m.tris.slice(t, t + 3);
    [[a, b], [b, c], [c, a]].forEach(([p, q]) => assert.ok(keys.has(`${Math.min(p, q)},${Math.max(p, q)}`)));
  }
  const edges = m.stretch.length;
  const boundary = 12;
  assert.equal(m.bend.length, edges - boundary);
});

test('a malformed grid is rejected with a clear message', () => {
  assert.throws(() => buildMesh(garment('11', 2, 2)), /test: grid/);
  assert.throws(() => buildMesh(garment('1x', 2, 1)), /test: grid/);
  assert.throws(() => buildMesh(garment('00', 2, 1)), /test: .*no covered cells/);
});

test('core marks the corners of core cells; without a core every particle counts', () => {
  const plain = buildMesh(garment('11', 2, 1));
  assert.deepEqual([...plain.core], [1, 1, 1, 1, 1, 1]);
  const m = buildMesh({ id: 'half', size: [20, 10], grid: { cols: 2, rows: 1, cells: '11', core: '10' } });
  for (let v = 0; v < m.count; v += 1) {
    assert.equal(m.core[v], m.rest[3 * v] < 15 ? 1 : 0, `corner at x = ${m.rest[3 * v]}`);
  }
});

test('a core cell outside the covered cells is refused', () => {
  assert.throws(
    () => buildMesh({ id: 'bad', size: [20, 10], grid: { cols: 2, rows: 1, cells: '10', core: '01' } }),
    /grid\.core/,
  );
});

test('the lattice maps every grid corner to its particle, or −1', () => {
  const m = buildMesh(garment('10' + '01', 2, 2));
  const { cols, rows, at } = m.lattice;
  assert.equal(at.length, (cols + 1) * (rows + 1));
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= cols; i += 1) {
      const v = at[j * (cols + 1) + i];
      if (v < 0) continue;
      assert.deepEqual([m.rest[3 * v], m.rest[3 * v + 1]], [i * 10, j * 10]);
    }
  }
  assert.equal(at[2], -1, 'corner (2, 0) touches no covered cell');
});
