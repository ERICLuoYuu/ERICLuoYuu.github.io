import { test, expect } from '@playwright/test';
import { openSite, waitForState } from './helpers.js';

test('essential artwork, fonts and sounds load cleanly', async ({ page }) => {
  const problems = await openSite(page);
  await expect(page.locator('#loader')).toBeHidden();
  const fontsReady = await page.evaluate(() => document.fonts.check('500 24px Caveat') && document.fonts.check('400 18px "Noto Sans"') && document.fonts.check('700 18px "Noto Sans"'));
  expect(fontsReady).toBe(true);
  const images = await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector('.parcel'));
    return ['--art-box-front', '--art-box-side', '--art-flap-long', '--art-box-floor'].map((v) => style.getPropertyValue(v));
  });
  images.forEach((value) => expect(value).toMatch(/^url\("http/));
  expect(await page.$eval('.photo-img', (img) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await page.$eval('.question-img', (img) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(problems).toEqual([]);
});

test('the owner photo and the desiccant packet lie on the box floor', async ({ page }) => {
  const problems = await openSite(page, '?jump=overhead');
  await waitForState(page, 'overhead');
  const photo = await page.$eval('.photo-img', (img) => ({ src: img.currentSrc, ok: img.complete && img.naturalWidth > 0 }));
  expect(photo.src).toContain('assets/photo/vacuum-collage.webp');
  expect(photo.ok).toBe(true);
  const packet = await page.$eval('.desiccant', (img) => ({ src: img.currentSrc, ok: img.complete && img.naturalWidth > 0 }));
  expect(packet.src).toContain('assets/art/desiccant.webp');
  expect(packet.ok).toBe(true);
  const [photoBox, bookBox] = await Promise.all([page.locator('.photo-card').boundingBox(), page.locator('.book3d').boundingBox()]);
  expect(photoBox.x + photoBox.width).toBeLessThan(bookBox.x + 4); // the print lies to the left of the booklet
  expect(problems).toEqual([]);
});

test('a missing artwork file falls back to the built-in art', async ({ page }) => {
  await page.route('**/content/site.js', async (route) => {
    const original = await (await route.fetch()).text();
    const body = original.replace("boxFront: 'assets/art/box-front.svg'", "boxFront: 'assets/art/not-uploaded-yet.png'");
    await route.fulfill({ contentType: 'text/javascript', body });
  });
  const warnings = [];
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  await page.goto('/');
  await waitForState(page, 'sealed');
  const front = await page.$eval('.parcel', (el) => el.style.getPropertyValue('--art-box-front'));
  expect(front).toContain('assets/art/box-front.svg');
  expect(warnings.join('\n')).toContain('assets/art/not-uploaded-yet.png is missing');
});

test('works from a sub-folder, as on a GitHub Pages project site', async ({ page }) => {
  // Serve the same files under /some-repo/ to prove every path is relative.
  await page.route('**/some-repo/**', async (route) => {
    const url = new URL(route.request().url());
    const target = url.href.replace('/some-repo/', '/');
    const response = await route.fetch({ url: target });
    await route.fulfill({ response });
  });
  const problems = await openSite(page, '/some-repo/');
  expect(await page.evaluate(() => window.__parcel.state)).toBe('sealed');
  const front = await page.$eval('.parcel', (el) => el.style.getPropertyValue('--art-box-front'));
  expect(front).toContain('/some-repo/assets/art/box-front.svg');
  expect(problems).toEqual([]);
});
