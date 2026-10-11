import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMesh } from '../../js/cloth/mesh.js';
import { createSmoother, halfway } from '../../js/cloth/smooth.js';

const mesh = (cells, cols, rows) => buildMesh({ id: 't', size: [cols * 10, rows * 10], grid: { cols, rows, cells } });
const drawn = (m, s, pos = m.rest) => s.evaluate(pos, 0, new Float32Array(3 * s.count));
const point = (a, v) => [a[3 * v], a[3 * v + 1], a[3 * v + 2]];
const close = (a, b, eps = 1e-4) => a.forEach((x, k) => assert.ok(Math.abs(x - b[k]) < eps, `${a} ≉ ${b}`));

test('halfway weights: four points, three, or two, always summing to 1', () => {
  [[true, true], [false, true], [true, false], [false, false]].forEach(([a, d]) => {
    const w = halfway(a, d);
    assert.ok(Math.abs(w.reduce((s, x) => s + x, 0) - 1) < 1e-12);
    if (!a) assert.equal(w[0], 0);
    if (!d) assert.equal(w[3], 0);
  });
  assert.deepEqual(halfway(true, true), [-1 / 16, 9 / 16, 9 / 16, -1 / 16]);
});

test('one cell: 3 × 3 points, 8 triangles, the centre is the average of the corners', () => {
  const m = mesh('1', 1, 1);
  const s = createSmoother(m);
  assert.equal(s.count, 9);
  assert.equal(s.tris.length, 24);
  const pos = Float32Array.from([0, 0, 0, 10, 0, 4, 10, 10, 8, 0, 10, 0]);
  const out = s.evaluate(pos, 0, new Float32Array(27));
  const centre = [...Array(9).keys()].find((v) => s.uv[2 * v] === 0.5 && s.uv[2 * v + 1] === 0.5);
  close(point(out, centre), [5, 5, 3]);
});

test('the surface passes through every particle', () => {
  const m = mesh('111' + '110' + '100', 3, 3);
  const s = createSmoother(m);
  const pos = Float32Array.from(m.rest, (v, i) => v + Math.sin(i * 1.7) * 6);
  const out = drawn(m, s, pos);
  let corners = 0;
  for (let v = 0; v < s.count; v += 1) {
    if (s.start[v + 1] - s.start[v] !== 1) continue;
    corners += 1;
    assert.equal(s.weights[s.start[v]], 1);
    close(point(out, v), point(pos, s.ids[s.start[v]]));
  }
  assert.equal(corners, m.count);
});

test('any flat, stretched or turned layout is drawn exactly, even at ragged edges', () => {
  const m = mesh('111' + '110' + '100', 3, 3);
  const s = createSmoother(m);
  const map = ([x, y]) => [3 + 0.8 * x - 0.6 * y, -2 + 0.6 * x + 0.8 * y, 5 + 0.1 * x];
  const pos = new Float32Array(m.rest.length);
  for (let v = 0; v < m.count; v += 1) pos.set(map(point(m.rest, v)), 3 * v);
  const out = drawn(m, s, pos);
  for (let v = 0; v < s.count; v += 1) close(point(out, v), map([s.uv[2 * v] * 30, s.uv[2 * v + 1] * 30]));
});

test('the weights of every drawn point add up to 1', () => {
  const s = createSmoother(mesh('1101' + '1111' + '0110', 4, 3));
  for (let v = 0; v < s.count; v += 1) {
    let sum = 0;
    for (let k = s.start[v]; k < s.start[v + 1]; k += 1) sum += s.weights[k];
    assert.ok(Math.abs(sum - 1) < 1e-6, `point ${v}: ${sum}`);
  }
});

test('a row bent into a circle stays on the circle, far closer than straight lines', () => {
  const cols = 8;
  const m = mesh('1'.repeat(cols), cols, 1);
  const s = createSmoother(m);
  const R = 100;
  const step = Math.PI / 8;
  const pos = new Float32Array(m.rest.length);
  for (let v = 0; v < m.count; v += 1) {
    const a = (m.rest[3 * v] / 10) * step;
    pos.set([R * Math.cos(a), R * Math.sin(a), m.rest[3 * v + 1]], 3 * v);
  }
  const out = drawn(m, s, pos);
  const straight = R * (1 - Math.cos(step / 2));
  for (let v = 0; v < s.count; v += 1) {
    const u = s.uv[2 * v] * cols;
    if (u < 1 || u > cols - 1 || Math.abs(u % 1 - 0.5) > 1e-6) continue; // interior midpoints only
    const r = Math.hypot(out[3 * v], out[3 * v + 1]);
    assert.ok(Math.abs(r - R) < 0.2 * straight, `radius ${r.toFixed(3)} at u = ${u}`);
  }
});

test('a sleeve across a gap does not tug on the body', () => {
  const m = mesh('101', 3, 1);
  const s = createSmoother(m);
  const moved = Float32Array.from(m.rest, (v, i) => (m.rest[i - (i % 3)] > 15 && i % 3 === 2 ? v + 25 : v));
  const before = drawn(m, s);
  const after = drawn(m, s, moved);
  for (let v = 0; v < s.count; v += 1) {
    if (s.uv[2 * v] * 3 <= 1) close(point(after, v), point(before, v));
  }
});

test('UVs are bilinear over the lattice and edges come from the triangles', () => {
  const s = createSmoother(mesh('11', 2, 1));
  assert.equal(s.count, 5 * 3);
  const us = new Set([...Array(s.count).keys()].map((v) => s.uv[2 * v]));
  assert.deepEqual([...us].sort(), [0, 0.25, 0.5, 0.75, 1]);
  const key = ({ a, b }) => `${Math.min(a, b)},${Math.max(a, b)}`;
  assert.equal(new Set(s.edges.map(key)).size, s.edges.length);
  assert.ok(s.edges.length >= s.count - 1);
});
