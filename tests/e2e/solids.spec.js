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

test("the figurine is drawn in its picture's own light, matte, not lit over again", async ({ page }) => {
  await openSite(page, '?jump=overhead');
  await waitForState(page, 'overhead');
  await waitForSettled(page);
  // At points over the figurine, away from its cut edge (where drawn and picture points need not line up
  // to the pixel): the brightness drawn, and its picture's at the same picture point.
  const points = await page.evaluate(async () => {
    const EDGE = 4; // picture px
    const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const img = new Image();
    img.src = 'assets/figurine/figurine.webp';
    await img.decode();
    const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const at = (px, py) => 4 * (Math.min(height - 1, Math.max(0, py)) * width + Math.min(width - 1, Math.max(0, px)));
    const inside = (px, py) => [[0, 0], [EDGE, 0], [-EDGE, 0], [0, EDGE], [0, -EDGE]].every(([dx, dy]) => data[at(px + dx, py + dy) + 3] > 250);
    const box = window.__parcel.garmentBox('figurine');
    const found = [];
    for (let j = 1; j < 30; j += 1) {
      for (let i = 1; i < 30; i += 1) {
        const [x, y] = [box.left + (box.width * i) / 30, box.top + (box.height * j) / 30];
        const hit = window.__parcel.hit(x, y);
        const [px, py] = hit ? [Math.floor(hit.uv[0] * width), Math.floor(hit.uv[1] * height)] : [];
        const drawn = hit?.id === 'figurine' && inside(px, py) && window.__parcel.pixel(x, y);
        if (drawn && drawn[3] > 250) found.push({ drawn: lum(drawn), picture: lum([...data.slice(at(px, py), at(px, py) + 3)]) });
      }
    }
    return found;
  });
  expect(points.length, 'points on the figurine').toBeGreaterThan(120);
  const share = (list, test) => list.filter(test).length / list.length;
  expect(share(points, (p) => p.drawn < 0.7 * p.picture), 'drawn much darker than its picture').toBeLessThan(0.1);
  // the clear bag over it adds a little light everywhere: only where the picture is not dark can it not explain a lot
  const lit = points.filter((p) => p.picture >= 80);
  expect(share(lit, (p) => p.drawn > 1.4 * p.picture), 'drawn much brighter than its picture: glossy').toBeLessThan(0.1);
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

const FOODS = ['sushi', 'fries', 'strawberries', 'bowl', 'dumplings'];
const rigidOf = (status, id) => status.rigid.find((b) => b.id === id);
async function overhead(page, jump = 'overhead') {
  await openSite(page, `?jump=${jump}`);
  await waitForState(page, 'overhead');
  await waitForSettled(page);
}
async function bookletMiddle(page) {
  const book = await page.locator('.book-top').boundingBox();
  return { x: book.x + book.width / 2, y: book.y + book.height / 2 };
}

/** Screen pixels across `units` parcel units along x, on the floor of the box. */
const unitsAcross = (page, units) => page.evaluate((u) => {
  const [a, b] = [[150, 150, 0], [150 + u, 150, 0]].map((point) => window.__parcel.project(point));
  return b.x - a.x;
}, units);

test('each food item dragged alone moves only itself', async ({ page }) => {
  await overhead(page);
  // 70 units right takes each item clear of the column the others still stand in (the sushi is 52 wide)
  const across = await unitsAcross(page, 70);
  for (const id of FOODS) {
    const before = await clothesOf(page);
    const from = await pointOn(page, id);
    await dragMouse(page, from, { x: from.x + across, y: from.y });
    await waitForSettled(page);
    const after = await clothesOf(page);
    expect(rigidOf(after, id).centre, `${id} moved`).not.toEqual(rigidOf(before, id).centre);
    after.rigid.filter((b) => b.id !== id).forEach((b) => expect(b.centre, `${b.id} stayed`).toEqual(rigidOf(before, b.id).centre));
    after.garments.forEach((g, k) => expect(g.centre, `${g.id} stayed`).toEqual(before.garments[k].centre));
  }
});

test('food dropped on the clothes rests on them; dropped past the front wall it lies outside the box', async ({ page }) => {
  await overhead(page);
  const middle = await bookletMiddle(page);
  await dragMouse(page, await pointOn(page, 'strawberries'), middle);
  await waitForSettled(page);
  expect(rigidOf(await clothesOf(page), 'strawberries').base, 'above the cover and a layer of cloth').toBeGreaterThan(0.6 + 8 + 4.5);
  expect(await page.evaluate(([x, y]) => window.__parcel.pick(x, y), [middle.x, middle.y])).toBe('strawberries');

  // past the front wall: on the open front flap, or on the table where the screen shows it (phone)
  const viewport = page.viewportSize();
  const out = await page.evaluate(() => window.__parcel.project([210, 380, 0]));
  await dragMouse(page, await pointOn(page, 'dumplings'), { x: out.x, y: Math.min(out.y, viewport.height - 30) });
  await waitForSettled(page);
  const dumplings = rigidOf(await clothesOf(page), 'dumplings');
  expect(dumplings.centre[1], 'outside the box').toBeGreaterThan(300);
  expect(dumplings.resting).toBe(true);
});

test('the figurine moves as one rigid piece and stays inside the box', async ({ page }) => {
  await overhead(page, 'clear');
  const box = await page.evaluate(() => window.__parcel.garmentBox('figurine'));
  const probes = [[0.5, 0.3], [0.5, 0.5], [0.4, 0.7]].map(([u, v]) => ({ x: box.left + box.width * u, y: box.top + box.height * v }));
  const before = await Promise.all(probes.map((p) => page.evaluate(([x, y]) => window.__parcel.hit(x, y), [p.x, p.y])));
  before.forEach((h) => expect(h?.id).toBe('figurine'));
  await dragMouse(page, probes[1], { x: probes[1].x + 100, y: probes[1].y });
  await waitForSettled(page);
  for (const h of before) {
    const at = await page.evaluate((uv) => window.__parcel.bodyScreen('figurine', uv), h.uv);
    const again = await page.evaluate(([x, y]) => window.__parcel.hit(x, y), [at.x, at.y]);
    expect(again?.id).toBe('figurine');
    again.uv.forEach((c, k) => expect(Math.abs(c - h.uv[k]), 'the same spot on the figure').toBeLessThan(0.02));
  }
  const [x] = rigidOf(await clothesOf(page), 'figurine').centre;
  expect(x).toBeGreaterThan(75);
  expect(x + 62.5).toBeLessThanOrEqual(418);
});

test('pulled out from under food, the clothes let it settle straight down', async ({ page }) => {
  await overhead(page);
  await dragMouse(page, await pointOn(page, 'sushi'), await bookletMiddle(page));
  await waitForSettled(page);
  const onPile = rigidOf(await clothesOf(page), 'sushi');
  await page.evaluate(() => window.__parcel.clearAside());
  await waitForSettled(page);
  const after = rigidOf(await clothesOf(page), 'sushi');
  expect(after.base).toBeLessThan(onPile.base - 2);
  expect(after.centre.slice(0, 2)).toEqual(onPile.centre.slice(0, 2));
  expect(after.resting).toBe(true);
});

test('restarting mid-drag puts every body back where it started', async ({ page }) => {
  await overhead(page);
  const start = Object.fromEntries((await clothesOf(page)).rigid.map((b) => [b.id, b.centre]));
  const bowl = await pointOn(page, 'bowl');
  await dragMouse(page, bowl, { x: bowl.x + 50, y: bowl.y - 40 });
  await waitForSettled(page);
  const fries = await pointOn(page, 'fries');
  await dragMouse(page, fries, { x: fries.x + 40, y: fries.y + 30 }, { release: false });
  expect((await clothesOf(page)).heldBody).toBe('fries');
  await page.locator('#restart').dispatchEvent('click'); // the mouse stays down on the fries
  await waitForState(page, 'sealed');
  const status = await clothesOf(page);
  expect(status.heldBody).toBeNull();
  status.rigid.forEach((b) => expect(b.centre, b.id).toEqual(start[b.id]));
});
