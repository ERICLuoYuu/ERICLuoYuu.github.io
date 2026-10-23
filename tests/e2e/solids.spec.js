import { test, expect } from '@playwright/test';
import { openSite, waitForState } from './helpers.js';
import {
  clothesOf, waitForSettled, pointOn, dragMouse, pixelAt,
} from './clothes-helpers.js';

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

test('the figurine laid over the booklet keeps it locked; its keyboard button takes it home', async ({ page }) => {
  await openSite(page, '?jump=clear');
  await waitForState(page, 'overhead');
  await waitForSettled(page);
  expect((await clothesOf(page)).reachable).toBe(true);
  const figurine = await pointOn(page, 'figurine');
  const book = await page.locator('.book-top').boundingBox();
  await dragMouse(page, figurine, { x: book.x + book.width, y: figurine.y });
  await waitForSettled(page);
  expect((await clothesOf(page)).reachable, 'the figurine covers the booklet').toBe(false);
  const key = page.getByRole('button', { name: 'Move the figurine aside' });
  await key.focus();
  await page.keyboard.press('Enter');
  await waitForSettled(page);
  const status = await clothesOf(page);
  const [x, y] = status.rigid.find((b) => b.id === 'figurine').centre;
  expect(Math.abs(x - 68.5)).toBeLessThanOrEqual(1);
  expect(Math.abs(y - 150)).toBeLessThanOrEqual(1);
  expect(status.reachable).toBe(true);
});

test('a food item over the booklet gets its own keyboard button', async ({ page }) => {
  await openSite(page, '?jump=clear');
  await waitForState(page, 'overhead');
  await waitForSettled(page);
  await expect(page.getByRole('button', { name: 'Move the fruit bowl aside' })).toBeHidden();
  const book = await page.locator('.book-top').boundingBox();
  await dragMouse(page, await pointOn(page, 'bowl'), { x: book.x + book.width / 2, y: book.y + book.height / 2 });
  await waitForSettled(page);
  await expect(page.getByRole('button', { name: 'Move the fruit bowl aside' })).toHaveCount(1);
});
