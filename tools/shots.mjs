/**
 * Overhead screenshots, desktop and phone, for checking artwork by eye.
 *
 *   node tools/shots.mjs [base url] [output folder]
 *
 * Defaults: the local server (npm run serve) and ./shots (git-ignored). Also
 * saves a close-up of the vacuum pack.
 */
import { mkdir } from 'node:fs/promises';
import { chromium, devices } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:4173/';
const out = process.argv[3] ?? 'shots';
const VIEWS = [
  ['desktop', { viewport: { width: 1280, height: 800 } }],
  ['phone', devices['Pixel 7']],
];
const padded = ({ x, y, width, height }, by = 30) => ({ x: Math.max(0, x - by), y: Math.max(0, y - by), width: width + 2 * by, height: height + 2 * by });

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [name, options] of VIEWS) {
    const page = await browser.newPage(options);
    await page.goto(new URL('?jump=overhead', base).href);
    await page.waitForFunction(() => window.__parcel?.state === 'overhead', null, { timeout: 20_000 });
    await page.waitForTimeout(1500); // the light comes on
    await page.screenshot({ path: `${out}/${name}-overhead.png` });
    // The CSS pack may be handed over (transparent): clip the close-up to the drawn pack when there is one.
    const packBox = await page.evaluate(() => {
      const drawn = window.__parcel.garmentBox('pack');
      return drawn ?? document.querySelector('.pack-body').getBoundingClientRect().toJSON();
    });
    await page.screenshot({ path: `${out}/${name}-pack.png`, clip: padded({ x: packBox.left, y: packBox.top, width: packBox.width, height: packBox.height }) });
    console.log(`${out}/${name}-*.png`, JSON.stringify(await page.evaluate(() => window.__parcel.clothes())));
    await page.close();
  }
} finally {
  await browser.close();
}
