import { test, expect } from '@playwright/test';
import { openSite, waitForState } from './helpers.js';
import { waitForSettled, pointOn, pixelAt } from './clothes-helpers.js';

const IDS = ['figurine', 'sushi', 'fries', 'strawberries', 'bowl', 'dumplings'];

test('the figurine and every food item are drawn and can be picked up', async ({ page }) => {
  await openSite(page, '?jump=overhead');
  await waitForState(page, 'overhead');
  await waitForSettled(page);
  for (const id of IDS) {
    const p = await pointOn(page, id);
    expect(p, `${id} can be picked`).not.toBeNull();
    const [, , , a] = await pixelAt(page, p.x, p.y);
    expect(a, `${id} is drawn`).toBeGreaterThan(200);
  }
});

test('without WebGL2 the figurine and the food lie still as pictures, fully visible', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : original.call(this, type, ...rest); };
  });
  await openSite(page, '?jump=overhead');
  await waitForState(page, 'overhead');
  for (const id of IDS) {
    const img = page.locator(`.solid[data-id="${id}"] .solid-img`);
    await expect(img).toHaveCount(1);
    expect(await img.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true);
    expect(await img.evaluate((el) => getComputedStyle(el.closest('.solid')).opacity)).toBe('1');
    expect(await img.getAttribute('alt')).not.toBe('');
  }
});
