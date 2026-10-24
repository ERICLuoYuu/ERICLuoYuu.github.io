import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { FIGURINE, FOOD } from '../../js/scene/geometry.js';
import { webpSize } from './webp.js';

// spec §1 Budget (the garments keep their own 3 MB test): the measured total
// after Task 10, rounded up to the next 0.25 MB, and no more than 1.5 MB.
// Measured 0.17 MB with the owner's figurine (if new pictures come out larger
// than the budget, lower the WebP quality).
const BODY_BUDGET = 0.25 * 2 ** 20;

test('the food in the box is the size and height prepare_food.py drew it', async () => {
  const data = JSON.parse(await readFile(new URL('../../assets/food/food.json', import.meta.url), 'utf8'));
  assert.deepEqual(data.items.map((i) => i.id), FOOD.map((f) => f.id));
  data.items.forEach((i, k) => assert.deepEqual([i.size, i.height], [FOOD[k].footprint, FOOD[k].height]));
});

test("the figurine's pictures are its footprint at 4 px a unit", async () => {
  for (const name of ['figurine', 'figurine-relief', 'wrap', 'wrap-relief']) {
    assert.deepEqual(webpSize(await readFile(new URL(`../../assets/figurine/${name}.webp`, import.meta.url))), FIGURINE.footprint.map((u) => u * 4));
  }
  assert.equal(FIGURINE.height, 30, 'prepare_figurine.HEIGHT');
});

test('the figurine and food pictures together stay within their budget', async () => {
  const data = JSON.parse(await readFile(new URL('../../assets/food/food.json', import.meta.url), 'utf8'));
  const paths = [
    ...data.items.flatMap((i) => [i.texture, i.relief]),
    ...['figurine', 'figurine-relief', 'wrap', 'wrap-relief'].map((n) => `assets/figurine/${n}.webp`),
  ];
  const sizes = await Promise.all(paths.map(async (p) => (await stat(new URL(`../../${p}`, import.meta.url))).size));
  const total = sizes.reduce((a, b) => a + b, 0);
  assert.ok(total <= BODY_BUDGET, `${(total / 2 ** 20).toFixed(2)} MB`);
});
