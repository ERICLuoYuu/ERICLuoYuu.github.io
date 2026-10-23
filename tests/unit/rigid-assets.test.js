import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FOOD } from '../../js/scene/geometry.js';

test('the food in the box is the size and height prepare_food.py drew it', async () => {
  const data = JSON.parse(await readFile(new URL('../../assets/food/food.json', import.meta.url), 'utf8'));
  assert.deepEqual(data.items.map((i) => i.id), FOOD.map((f) => f.id));
  data.items.forEach((i, k) => assert.deepEqual([i.size, i.height], [FOOD[k].footprint, FOOD[k].height]));
});
