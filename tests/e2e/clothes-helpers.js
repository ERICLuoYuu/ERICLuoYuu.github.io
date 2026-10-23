import { expect } from '@playwright/test';

export const clothesOf = (page) => page.evaluate(() => window.__parcel.clothes());

// A move settles in about 3–6 s of simulated time. A loaded machine (tests in
// parallel, all drawing WebGL) plays the cloth in slow motion rather than
// skipping frames, which stretches that in real time.
export async function waitForSettled(page, timeout = 30_000) {
  await page.waitForFunction(() => window.__parcel.clothes().settled, null, { timeout });
}

/**
 * A screen point where garment `id` is the cloth on top, searching out from
 * the middle of its outline. Without an id: any garment over the booklet.
 */
export async function pointOn(page, id = null) {
  return page.evaluate((gid) => {
    const parcel = window.__parcel;
    const box = gid ? parcel.garmentBox(gid) : document.querySelector('.book-top').getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const points = [];
    for (let j = 0; j <= 16; j += 1) {
      for (let i = 0; i <= 16; i += 1) points.push([box.left + (box.width * i) / 16, box.top + (box.height * j) / 16]);
    }
    points.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
    for (const [x, y] of points) {
      const hit = parcel.pick(x, y);
      if (hit && (!gid || hit === gid)) return { x, y, id: hit };
    }
    return null;
  }, id);
}

/**
 * A screen point on the booklet with no cloth over it, nearest its middle —
 * where a visitor would point once enough clothes are out of the way.
 */
export async function bareBookletPoint(page) {
  return page.evaluate(() => {
    const box = document.querySelector('.book-top').getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const points = [];
    for (let j = 1; j < 16; j += 1) {
      for (let i = 1; i < 16; i += 1) points.push([box.left + (box.width * i) / 16, box.top + (box.height * j) / 16]);
    }
    points.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
    const bare = points.find(([x, y]) => !window.__parcel.pick(x, y));
    return bare ? { x: bare[0], y: bare[1] } : null;
  });
}

/** Press on `from`, move to `to` in small steps, let go. */
export async function dragMouse(page, from, to, { steps = 30, release = true } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await page.waitForTimeout(16);
  }
  if (release) await page.mouse.up();
}

/** Drag garments off the booklet, over the front flap, until the booklet can be opened. */
export async function clearWithMouse(page) {
  const bottom = page.viewportSize().height - 4;
  for (let n = 0; n < 16 && !(await clothesOf(page)).reachable; n += 1) {
    const point = await pointOn(page);
    if (point) await dragMouse(page, point, { x: point.x, y: bottom });
    await waitForSettled(page);
  }
  expect((await clothesOf(page)).reachable).toBe(true);
}

const focusedKey = (page) => page.evaluate(() => {
  const el = document.activeElement;
  return el?.classList.contains('clothes-key') ? el.getAttribute('aria-label') : null;
});

/** Tab to the garment buttons and move garments aside with Enter until the booklet can be opened. */
export async function clearWithKeyboard(page, { onMove } = {}) {
  for (let i = 0; i < 12 && !(await focusedKey(page)); i += 1) await page.keyboard.press('Tab');
  for (let n = 0; n < 10 && !(await clothesOf(page)).reachable; n += 1) {
    const label = await focusedKey(page);
    expect(label, 'a "Move the … aside" button has focus').toMatch(/^Move the .+ aside$/);
    const garment = label.replace(/^Move the (.+) aside$/, '$1');
    const started = Date.now();
    await page.keyboard.press('Enter');
    await expect(page.locator('#announcer')).toHaveText(`The ${garment} is out of the way.`, { timeout: 8000 });
    onMove?.(Date.now() - started);
    await waitForSettled(page);
  }
  expect((await clothesOf(page)).reachable).toBe(true);
}

/** Tab forward until the booklet has focus. */
export async function tabToBooklet(page) {
  for (let i = 0; i < 12; i += 1) {
    if (await page.evaluate(() => document.activeElement?.classList.contains('book-top'))) return;
    await page.keyboard.press('Tab');
  }
  await expect(page.locator('.book-top')).toBeFocused();
}

/** Screen points spread over a body's outline on screen, n − 1 to a side. */
export async function gridOver(page, id, n = 16) {
  const box = await page.evaluate((gid) => window.__parcel.garmentBox(gid), id);
  const points = [];
  for (let j = 1; j < n; j += 1) {
    for (let i = 1; i < n; i += 1) points.push({ x: box.left + (box.width * i) / n, y: box.top + (box.height * j) / n });
  }
  return points;
}

/** The colour the clothes layer draws at (x, y): [r, g, b, a], premultiplied, 0–255. */
export const pixelAt = (page, x, y) => page.evaluate(([px, py]) => window.__parcel.pixel(px, py), [x, y]);
