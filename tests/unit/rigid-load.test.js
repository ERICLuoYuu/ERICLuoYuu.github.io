import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bagged } from '../../js/rigid/load.js';

test('the clear bag counts as the figurine: picked wherever there is film, at the height of whichever is higher', () => {
  const figure = { alpha: (u) => (u < 0.5 ? 1 : 0), relief: (u) => (u < 0.5 ? 0.8 : 0) };
  const bag = { alpha: (u) => (u < 0.95 ? 0.1 : 0), level: () => 0.5 };
  const pick = bagged(figure, bag, 32 / 30);
  assert.equal(pick.alpha(0.2, 0.5), 1, 'the figure');
  assert.equal(pick.alpha(0.7, 0.5), 1, 'clear film only');
  assert.equal(pick.alpha(0.99, 0.5), 0, 'outside the bag');
  assert.equal(pick.relief(0.2, 0.5), 0.8, 'the figure stands above the bag');
  assert.ok(Math.abs(pick.relief(0.7, 0.5) - (0.5 * 32) / 30) < 1e-9, 'the bag');
  assert.equal(pick.shape, figure.relief, 'the figure keeps its own shape for drawing');
});
