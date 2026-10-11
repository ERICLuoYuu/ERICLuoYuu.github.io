import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from '../../js/cloth/hash.js';

/** Deterministic pseudo-random points in a 200-unit cube. */
function cloud(count, seed = 7) {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  return Float32Array.from({ length: count * 3 }, () => rand() * 200 - 50);
}

const dist = (pos, a, b) => Math.hypot(pos[3 * a] - pos[3 * b], pos[3 * a + 1] - pos[3 * b + 1], pos[3 * a + 2] - pos[3 * b + 2]);

test('query returns every point within the distance (and maybe a few more)', () => {
  const pos = cloud(300);
  const hash = createHash(10, 300);
  hash.create(pos, 300);
  for (const i of [0, 17, 42, 199, 299]) {
    hash.query(pos, i, 15);
    const found = new Set(hash.queryIds.subarray(0, hash.querySize));
    for (let j = 0; j < 300; j += 1) {
      if (dist(pos, i, j) <= 15) assert.ok(found.has(j), `${j} is near ${i}`);
    }
  }
});

test('queryAll lists each close pair once', () => {
  const pos = cloud(200, 3);
  const hash = createHash(10, 200);
  hash.create(pos, 200);
  hash.queryAll(pos, 200, 12, () => true);
  const pairs = new Set();
  for (let i = 0; i < 200; i += 1) {
    for (let k = hash.firstAdjId[i]; k < hash.firstAdjId[i + 1]; k += 1) {
      const j = hash.adjIds[k];
      const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
      assert.ok(!pairs.has(key), `pair ${key} listed twice`);
      pairs.add(key);
    }
  }
  let expected = 0;
  for (let i = 0; i < 200; i += 1) for (let j = 0; j < i; j += 1) if (dist(pos, i, j) <= 12) expected += 1;
  assert.equal(pairs.size, expected);
});

test('only active points ask for neighbours, but they still meet inactive ones', () => {
  const pos = new Float32Array([0, 0, 0, 3, 0, 0, 100, 0, 0, 103, 0, 0]);
  const hash = createHash(10, 4);
  hash.create(pos, 4);
  const active = (i) => i === 1 || i === 2;
  hash.queryAll(pos, 4, 5, active);
  const neighbours = (i) => [...hash.adjIds.subarray(hash.firstAdjId[i], hash.firstAdjId[i + 1])];
  assert.deepEqual(neighbours(0), []);
  assert.deepEqual(neighbours(1), [0]);
  assert.deepEqual(neighbours(2), [3]);
  assert.deepEqual(neighbours(3), []);
});

test('the neighbour list grows when a crowd needs more room', () => {
  const pos = new Float32Array(3 * 60); // every point at the origin
  const hash = createHash(10, 60);
  hash.create(pos, 60);
  hash.queryAll(pos, 60, 1, () => true);
  assert.equal(hash.firstAdjId[60], (60 * 59) / 2);
});
