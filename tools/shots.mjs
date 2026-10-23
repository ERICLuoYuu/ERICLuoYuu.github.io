/**
 * Overhead screenshots, desktop and phone, for checking artwork by eye.
 *
 *   node tools/shots.mjs [base url] [output folder]
 *
 * Defaults: the local server (npm run serve) and ./shots (git-ignored). Per
 * view it saves the overhead view, a close-up of the figurine and one of the
 * four books; on the desktop also the fruit bowl held mid-drag over the
 * clothes.
 */
import { mkdir } from 'node:fs/promises';
import { chromium, devices } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:4173/';
const out = process.argv[3] ?? 'shots';
const VIEWS = [
  ['desktop', { viewport: { width: 1280, height: 800 } }],
  ['phone', devices['Pixel 7']],
];
const PAD = 12; // px around a close-up

/** A screenshot clip around `box`, padded and kept on the screen. */
function clipTo(box, { width, height }) {
  const x = Math.max(0, Math.floor(box.left - PAD));
  const y = Math.max(0, Math.floor(box.top - PAD));
  return {
    x, y, width: Math.min(width, Math.ceil(box.left + box.width + PAD)) - x, height: Math.min(height, Math.ceil(box.top + box.height + PAD)) - y,
  };
}

/** The box around every one of the owner's books on screen. */
const booksBox = (page) => page.evaluate(() => {
  const rects = [...document.querySelectorAll('.tome')].map((el) => el.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  return {
    left, top, width: Math.max(...rects.map((r) => r.right)) - left, height: Math.max(...rects.map((r) => r.bottom)) - top,
  };
});

/** Pick up the fruit bowl and hold it over the clothes, the mouse still down. */
async function holdBowl(page) {
  const [from, to] = await page.evaluate(() => {
    const parcel = window.__parcel;
    const box = parcel.garmentBox('bowl');
    let grab = null;
    for (let j = 4; j <= 12 && !grab; j += 1) {
      for (let i = 4; i <= 12 && !grab; i += 1) {
        const x = box.left + (box.width * i) / 16;
        const y = box.top + (box.height * j) / 16;
        if (parcel.pick(x, y) === 'bowl') grab = { x, y };
      }
    }
    return [grab, parcel.project([300, 90, 40])]; // over the middle of the pile
  });
  if (!from) return false;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= 24; k += 1) {
    await page.mouse.move(from.x + ((to.x - from.x) * k) / 24, from.y + ((to.y - from.y) * k) / 24);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(400);
  return true;
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [name, options] of VIEWS) {
    const page = await browser.newPage(options);
    const screen = page.viewportSize();
    await page.goto(new URL('?jump=overhead', base).href);
    await page.waitForFunction(() => window.__parcel?.state === 'overhead', null, { timeout: 20_000 });
    await page.waitForTimeout(1500); // the light comes on
    await page.screenshot({ path: `${out}/${name}-overhead.png` });
    const figurine = await page.evaluate(() => window.__parcel.garmentBox('figurine'));
    if (figurine) await page.screenshot({ path: `${out}/${name}-figurine.png`, clip: clipTo(figurine, screen) });
    await page.screenshot({ path: `${out}/${name}-books.png`, clip: clipTo(await booksBox(page), screen) });
    if (name === 'desktop' && await holdBowl(page)) {
      await page.screenshot({ path: `${out}/${name}-food-held.png` });
      await page.mouse.up();
    }
    console.log(`${out}/${name}-*.png`, JSON.stringify(await page.evaluate(() => window.__parcel.clothes())));
    await page.close();
  }
} finally {
  await browser.close();
}
