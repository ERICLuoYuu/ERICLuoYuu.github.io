import { test, expect } from '@playwright/test';
import { openSite, waitForState } from './helpers.js';
import {
  clothesOf, waitForSettled, pointOn, dragMouse, pixelAt,
} from './clothes-helpers.js';
import { FIGURINE } from '../../js/scene/geometry.js';

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

/**
 * At a grid × grid of points over the figurine, away from its cut edge (where drawn and picture points need
 * not line up to the pixel): the brightness drawn, its picture's at the same picture point, and whether the
 * picture is dark (below DARK) all around it, within AROUND picture px.
 */
function sampleFigurine(page, grid) {
  return page.evaluate(async (n) => {
    const EDGE = 4; // picture px
    const AROUND = 4; // picture px
    const DARK = 60;
    const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const img = new Image();
    img.src = 'assets/figurine/figurine.webp';
    await img.decode();
    const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const at = (px, py) => 4 * (Math.min(height - 1, Math.max(0, py)) * width + Math.min(width - 1, Math.max(0, px)));
    const lumAt = (px, py) => lum([...data.slice(at(px, py), at(px, py) + 3)]);
    const inside = (px, py) => [[0, 0], [EDGE, 0], [-EDGE, 0], [0, EDGE], [0, -EDGE]].every(([dx, dy]) => data[at(px + dx, py + dy) + 3] > 250);
    const darkAround = (px, py) => {
      for (let dy = -AROUND; dy <= AROUND; dy += 1) {
        for (let dx = -AROUND; dx <= AROUND; dx += 1) if (lumAt(px + dx, py + dy) >= DARK) return false;
      }
      return true;
    };
    const box = window.__parcel.garmentBox('figurine');
    const found = [];
    for (let j = 1; j < n; j += 1) {
      for (let i = 1; i < n; i += 1) {
        const [x, y] = [box.left + (box.width * i) / n, box.top + (box.height * j) / n];
        const hit = window.__parcel.hit(x, y);
        const [px, py] = hit ? [Math.floor(hit.uv[0] * width), Math.floor(hit.uv[1] * height)] : [];
        const drawn = hit?.id === 'figurine' && inside(px, py) && window.__parcel.pixel(x, y);
        if (drawn && drawn[3] > 250) found.push({ drawn: lum(drawn), picture: lumAt(px, py), darkAround: darkAround(px, py) });
      }
    }
    return found;
  }, grid);
}

test("the figurine is drawn in its photo's own light: not shaded over again, nor glossy", async ({ page }) => {
  await openSite(page, '?jump=overhead');
  await waitForState(page, 'overhead');
  await waitForSettled(page);
  const points = await sampleFigurine(page, 30);
  expect(points.length, 'points on the figurine').toBeGreaterThan(120);
  const share = (list, test) => list.filter(test).length / list.length;
  expect(share(points, (p) => p.drawn < 0.7 * p.picture), 'drawn much darker than its picture').toBeLessThan(0.1);
  // the clear bag over it adds a little light everywhere: only where the picture is not dark can it not explain a lot
  const lit = points.filter((p) => p.picture >= 80);
  expect(share(lit, (p) => p.drawn > 1.4 * p.picture), 'drawn much brighter than its picture: glossy').toBeLessThan(0.1);
});

test("the figurine's clear bag does not grey the photo's shadows", async ({ page }) => {
  await openSite(page, '?jump=overhead');
  await waitForState(page, 'overhead');
  await waitForSettled(page);
  // Its shadows are what make the photo look solid. Where the photo is dark all around (its hair), a small
  // screen's blur with brighter neighbours cannot lift what is drawn: only the bag over it can. Without the
  // bag they are drawn as dark as the photo; a milky film lifted them by some 45 levels.
  const dark = (await sampleFigurine(page, 80)).filter((p) => p.picture < 40 && p.darkAround);
  expect(dark.length, 'points dark all around on the figurine').toBeGreaterThan(15);
  const lift = dark.reduce((sum, p) => sum + p.drawn - p.picture, 0) / dark.length;
  expect(lift, 'how far the bag lifts the darkest parts, on average').toBeLessThan(20);
});

/** The head, the figure's top fifth: its box in the picture (px) and where it is drawn on screen (css px). */
function headOnScreen(page) {
  return page.evaluate(async () => {
    const img = new Image();
    img.src = 'assets/figurine/figurine.webp';
    await img.decode();
    const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let [x0, y0, x1, y1] = [width, height, 0, 0];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[4 * (y * width + x) + 3] > 127) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
      }
    }
    const box = [x0, y0, x1, Math.round(y0 + 0.2 * (y1 - y0))];
    const shown = window.__parcel.garmentBox('figurine');
    let [sx0, sy0, sx1, sy1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let y = shown.top; y < shown.top + shown.height * 0.35; y += 1) {
      for (let x = shown.left; x < shown.left + shown.width; x += 1) {
        const hit = window.__parcel.hit(x, y);
        const [px, py] = hit?.id === 'figurine' ? [hit.uv[0] * width, hit.uv[1] * height] : [-1, -1];
        if (px >= box[0] && px <= box[2] && py >= box[1] && py <= box[3]) [sx0, sy0, sx1, sy1] = [Math.min(sx0, x), Math.min(sy0, y), Math.max(sx1, x), Math.max(sy1, y)];
      }
    }
    return { head: box, screen: [sx0, sy0, sx1 + 1, sy1 + 1], pictureWidth: width };
  });
}

test("the figurine's head is drawn with all the fine light and dark its photo has at that size", async ({ page }) => {
  await openSite(page, '?jump=overhead');
  await waitForState(page, 'overhead');
  await waitForSettled(page);
  const { head, screen } = await headOnScreen(page);
  // Fine light and dark: the spread of the brightness less its blur, over the figure (away from its outline),
  // as the canvas draws it (at its own resolution, before the browser scales it to the screen) and in the photo
  // scaled down to the same size as finely as the browser can.
  const ratio = await page.evaluate(async ({ box, rect }) => {
    const drawn = window.__parcel.region(...rect);
    const [w, h] = [drawn.width, drawn.height];
    const img = new Image();
    img.src = 'assets/figurine/figurine.webp';
    await img.decode();
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, box[0], box[1], box[2] - box[0], box[3] - box[1], 0, 0, w, h);
    const photo = ctx.getImageData(0, 0, w, h).data;
    const lum = (d) => Float32Array.from({ length: w * h }, (_, i) => 0.2126 * d[4 * i] + 0.7152 * d[4 * i + 1] + 0.0722 * d[4 * i + 2]);
    const blur = (v) => { // Gaussian, sigma 1.5 px, across then down
      const k = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((d) => Math.exp(-(d * d) / 4.5));
      const sum = k.reduce((a, b) => a + b, 0);
      const pass = (src, dx, dy) => Float32Array.from({ length: w * h }, (_, i) => {
        const [x, y] = [i % w, Math.floor(i / w)];
        return k.reduce((acc, kk, j) => acc + kk * src[Math.min(h - 1, Math.max(0, y + (j - 4) * dy)) * w + Math.min(w - 1, Math.max(0, x + (j - 4) * dx))], 0) / sum;
      });
      return pass(pass(v, 1, 0), 0, 1);
    };
    const solid = (i) => { // opaque in the photo, three px all round
      const [x, y] = [i % w, Math.floor(i / w)];
      for (let dy = -3; dy <= 3; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) if (photo[4 * (Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))) + 3] < 250) return false;
      }
      return true;
    };
    const fine = (d) => { const l = lum(d); const b = blur(l); return Float32Array.from(l, (v, i) => v - b[i]); };
    const [a, b] = [fine(drawn.data), fine(photo)];
    const keep = Array.from({ length: w * h }, (_, i) => i).filter(solid);
    const spread = (v) => Math.sqrt(keep.reduce((s2, i) => s2 + v[i] * v[i], 0) / keep.length);
    return spread(a) / spread(b);
  }, { box: head, rect: [screen[0], screen[1], screen[2] - screen[0], screen[3] - screen[1]] });
  expect(ratio, "the head's fine light and dark, drawn, against its photo's at that size").toBeGreaterThan(1);
});

test("the box floor right beside the figurine's face is shaded, so its pale edge stands out from the pale floor", async ({ page }) => {
  await openSite(page, '?jump=overhead');
  await waitForState(page, 'overhead');
  await waitForSettled(page);
  // Sunlit skin is about as bright as the box floor, so without a shadow beside it the profile of a face turned
  // away, and its nose, melt into the floor. The doll's contact shadow darkens the floor just past its outline
  // and is gone a few units further out. How dark, from the canvas: its alpha less the bag film's faint light.
  const { head, screen, pictureWidth } = await headOnScreen(page);
  const { near, far } = await page.evaluate(({ head, screen, pxPerUnit }) => {
    const UNIT = ((screen[2] - screen[0]) / (head[2] - head[0])) * pxPerUnit; // css px a unit
    const pad = 8 * UNIT;
    const drawn = window.__parcel.region(screen[0] - pad, screen[1] - pad, screen[2] - screen[0] + 2 * pad, screen[3] - screen[1] + 2 * pad);
    const { width: w, height: h, data } = drawn;
    const unit = UNIT * (w / (screen[2] - screen[0] + 2 * pad)); // canvas px a unit
    const solid = (x, y) => data[4 * (y * w + x) + 3] > 250;
    const reach = Math.ceil(7 * unit);
    const shades = { near: [], far: [] };
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (solid(x, y)) continue;
        let d2 = Infinity;
        for (let dy = -reach; dy <= reach; dy += 1) {
          for (let dx = -reach; dx <= reach; dx += 1) {
            const [u, v] = [x + dx, y + dy];
            if (u >= 0 && v >= 0 && u < w && v < h && dx * dx + dy * dy < d2 && solid(u, v)) d2 = dx * dx + dy * dy;
          }
        }
        const d = Math.sqrt(d2) / unit;
        const i = 4 * (y * w + x);
        const shade = (data[i + 3] - (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])) / 255;
        if (d > 1 && d <= 2) shades.near.push(shade);
        if (d > 5 && d <= 7) shades.far.push(shade);
      }
    }
    const median = (v) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)];
    return { near: median(shades.near), far: median(shades.far) };
  }, { head, screen, pxPerUnit: pictureWidth / FIGURINE.footprint[0] });
  // (within a unit lies the outline's own antialiased edge; a slight shadow there, as before, darkened the floor
  // one to two units out by some 0.03)
  expect(near - far, 'the floor one to two units past the outline, darker than five to seven units out').toBeGreaterThan(0.08);
  expect(far, 'five to seven units out the floor is bare: no grey cloud round the doll').toBeLessThan(0.03);
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
