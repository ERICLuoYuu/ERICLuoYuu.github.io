import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DROP } from '../../js/cloth/render.js';

test('cloth lying on the floor is drawn above it, not hidden beneath', async () => {
  const pile = JSON.parse(await readFile(new URL('../../assets/clothes/pile.json', import.meta.url), 'utf8'));
  // particles float half a thickness above what they lie on; drawn DROP lower, they must stay clear of it
  assert.ok(pile.thickness / 2 - DROP >= 1, `drawn ${(pile.thickness / 2 - DROP).toFixed(2)} above the floor`);
});
