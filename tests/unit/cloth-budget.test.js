import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floorPixelsPerUnit, textureScale } from '../../js/cloth/budget.js';

test('the overhead view shows the floor at a sensible size, sharper on a denser screen', () => {
  const desktop = floorPixelsPerUnit(1280, 800, 1);
  assert.ok(desktop > 1 && desktop < 3, `desktop: ${desktop}`);
  assert.ok(Math.abs(floorPixelsPerUnit(1280, 800, 2) - 2 * desktop) < 1e-9);
  assert.ok(floorPixelsPerUnit(412, 839, 2.625) < floorPixelsPerUnit(1280, 800, 2.625));
});

test('textures are uploaded at what the screen needs, with headroom', () => {
  assert.equal(textureScale(4, 2), (2 * 1.25) / 4);
});

test('never more than the file holds, however dense the screen', () => {
  assert.equal(textureScale(4, 9), 1);
  assert.equal(textureScale(2.4, 3), 1);
});

test('never below 1.5 pixels per unit, however small the screen', () => {
  assert.equal(textureScale(4, 0.3), 1.5 / 4);
  assert.equal(textureScale(4, 0.3, { floor: 2 }), 0.5);
});
