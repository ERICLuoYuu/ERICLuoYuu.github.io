/**
 * Overhead screenshots, desktop and phone, for checking artwork by eye.
 *
 *   node tools/shots.mjs [base url] [output folder]
 *
 * Defaults: the local server (npm run serve) and ./shots (git-ignored). On the
 * desktop it also saves a garment held mid-drag.
 */
import { mkdir } from 'node:fs/promises';
import { chromium, devices } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:4173/';
const out = process.argv[3] ?? 'shots';
const VIEWS = [
  ['desktop', { viewport: { width: 1280, height: 800 } }],
  ['phone', devices['Pixel 7']],
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [name, options] of VIEWS) {
    const page = await browser.newPage(options);
    await page.goto(new URL('?jump=overhead', base).href);
    await page.waitForFunction(() => window.__parcel?.state === 'overhead', null, { timeout: 20_000 });
    await page.waitForTimeout(1500); // the light comes on
    await page.screenshot({ path: `${out}/${name}-overhead.png` });
    if (name === 'desktop') {
      const grab = await page.evaluate(() => {
        const box = document.querySelector('.book-top').getBoundingClientRect();
        for (let j = 4; j <= 12; j += 1) {
          for (let i = 4; i <= 12; i += 1) {
            const x = box.left + (box.width * i) / 16;
            const y = box.top + (box.height * j) / 16;
            if (window.__parcel.pick(x, y)) return { x, y };
          }
        }
        return null;
      });
      if (grab) {
        await page.mouse.move(grab.x, grab.y);
        await page.mouse.down();
        for (let k = 1; k <= 20; k += 1) {
          await page.mouse.move(grab.x - 4 * k, grab.y + 3 * k);
          await page.waitForTimeout(16);
        }
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${out}/${name}-held.png` });
        await page.mouse.up();
      }
    }
    console.log(`${out}/${name}-*.png`, JSON.stringify(await page.evaluate(() => window.__parcel.clothes())));
    await page.close();
  }
} finally {
  await browser.close();
}
