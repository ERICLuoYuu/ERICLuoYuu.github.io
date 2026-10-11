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
  expect(await page.$eval('.pack-img', (img) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await page.$eval('.question-img', (img) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(problems).toEqual([]);
});

test('the vacuum pack and the desiccant packet lie on the box floor', async ({ page }) => {
  const problems = await openSite(page, '?jump=overhead');
  await waitForState(page, 'overhead');
  const loaded = (selector) => page.$eval(selector, (img) => ({ src: img.currentSrc, ok: img.complete && img.naturalWidth > 0 }));
  const pack = await loaded('.pack-img');
  expect(pack.src).toContain('assets/photo/vacuum-pack.webp');
  expect(pack.ok).toBe(true);
  expect((await loaded('.pack-shade')).ok).toBe(true);
  await expect(page.locator('.photo-card')).toHaveCount(0);
  const packet = await loaded('.desiccant');
  expect(packet.src).toContain('assets/art/desiccant.webp');
  expect(packet.ok).toBe(true);
  const [packBox, bookBox] = await Promise.all([page.locator('.pack-body').boundingBox(), page.locator('.book3d').boundingBox()]);
  expect(packBox.x + packBox.width).toBeLessThan(bookBox.x + 4); // the pack lies to the left of the booklet
  expect(problems).toEqual([]);
});

test('without its shade overlay the pack still shows, with no broken image', async ({ page }) => {
  await page.route('**/content/site.js', async (route) => {
    const original = await (await route.fetch()).text();
    const body = original.replace("'assets/photo/vacuum-pack-shade.webp'", "'assets/photo/not-made-yet.webp'");
    await route.fulfill({ contentType: 'text/javascript', body });
  });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?jump=overhead');
  await waitForState(page, 'overhead');
  await expect(page.locator('.pack-shade')).toBeHidden();
  expect(await page.$eval('.pack-img', (img) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(errors.join('\n')).toContain('not-made-yet.webp');
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
  expect((await page.evaluate(() => window.__parcel.clothes())).enabled, 'the clothes load too').toBe(true);
  expect(problems).toEqual([]);
  await page.unrouteAll({ behavior: 'ignoreErrors' }); // late requests (textures) may still be on their way
});

test("the owner's books lie in the box with their covers", async ({ page }) => {
  const problems = await openSite(page, '?jump=overhead');
  await waitForState(page, 'overhead');
  const covers = await page.$$eval('.tome-cover', (imgs) => imgs.map((img) => ({
    book: img.closest('.tome').dataset.book, alt: img.alt, ok: img.complete && img.naturalWidth > 0,
  })));
  expect(covers.map((c) => c.book).sort()).toEqual(['dictionary', 'hunter-x-hunter', 'siddhartha', 'solitude']);
  covers.forEach((c) => expect(c.ok, c.book).toBe(true));
  const alts = covers.map((c) => c.alt).join(' | ');
  ['Hunter × Hunter', 'German-Chinese dictionary', 'One Hundred Years of Solitude', 'Gabriel García Márquez', 'Siddhartha', 'Hermann Hesse']
    .forEach((title) => expect(alts).toContain(title));
  expect(problems).toEqual([]);
});

test('a book whose cover is missing still lies there, plain, without a broken image', async ({ page }) => {
  await page.route('**/assets/books/solitude.webp', (route) => route.fulfill({ status: 404, body: '' }));
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?jump=overhead');
  await waitForState(page, 'overhead');
  await expect(page.locator('.tome[data-book="solitude"]')).toBeVisible();
  await expect(page.locator('.tome[data-book="solitude"] .tome-cover')).toBeHidden();
  expect(errors.join('\n')).toContain('solitude.webp');
});
