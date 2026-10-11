import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMesh } from '../../js/cloth/mesh.js';
import { createWorld, setPositions } from '../../js/cloth/solver.js';
import { bookCoverage, isBookUncovered } from '../../js/cloth/coverage.js';
import { CONTENTS } from '../../js/scene/geometry.js';

const book = CONTENTS.book;
const top = 0.6 + book.thickness;
const material = { stretchCompliance: 0, bendCompliance: 2e-4, friction: 0.5 };

/** One flat sheet of `width × height`, its top-left corner at (x, y), at height z. */
function sheetAt(x, y, z, width = 260, height = 300) {
  const mesh = buildMesh({ id: 's', size: [width, height], grid: { cols: width / 10, rows: height / 10, cells: '1'.repeat((width / 10) * (height / 10)) } });
  const w = createWorld({ garments: [{ mesh, material }], bounds: { min: [-900, -900, 0], max: [1300, 1300, 900] } });
  const p = w.pos.slice();
  for (let i = 0; i < p.length; i += 3) {
    p[i] += x;
    p[i + 1] += y;
    p[i + 2] = z;
  }
  setPositions(w, 0, p);
  return w;
}

test('nothing over the booklet: coverage 0', () => {
  assert.equal(bookCoverage(sheetAt(600, 0, top + 5), book), 0);
});

test('a sheet lying over the whole booklet covers it', () => {
  assert.ok(bookCoverage(sheetAt(160, 0, top + 5), book) > 0.97);
});

test('a sheet over the left half covers about half', () => {
  // reaches 40 of the booklet's 96 units; the 9-unit sampling radius takes it to about half
  const half = bookCoverage(sheetAt(book.x + 40 - 200, -20, top + 5, 200, 300), book);
  assert.ok(half > 0.4 && half < 0.6, `coverage ${half}`);
});

test('cloth lying on the floor next to the booklet does not count', () => {
  assert.ok(bookCoverage(sheetAt(160, 0, 3.75), book) < 0.01);
});

test('the rule: fully covered is locked, bare is open', () => {
  assert.equal(isBookUncovered(1, false), false);
  assert.equal(isBookUncovered(1, true), false);
  assert.equal(isBookUncovered(0, false), true);
  assert.equal(isBookUncovered(0, true), true);
});

test('cloth that touches no core cell does not cover the booklet', () => {
  const book = { x: 0, y: 0, width: 40, height: 40, thickness: 1, rotate: 0 };
  const lying = (core) => {
    const mesh = buildMesh({ id: 'm', size: [40, 40], grid: { cols: 4, rows: 4, cells: '1'.repeat(16), core } });
    const w = createWorld({
      garments: [{ mesh, material: { stretchCompliance: 0, bendCompliance: 1e-4, friction: 0.5 } }],
      bounds: { min: [-100, -100, 0], max: [200, 200, 200] },
      thickness: 7.5,
    });
    setPositions(w, 0, Float32Array.from(mesh.rest, (v, i) => (i % 3 === 2 ? v + 10 : v)));
    return w;
  };
  assert.equal(bookCoverage(lying('1'.repeat(16)), book), 1);
  assert.equal(bookCoverage(lying('0'.repeat(16)), book), 0);
});
