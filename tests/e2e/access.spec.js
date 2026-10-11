import { test, expect } from '@playwright/test';
import {
  openSite, stateOf, progressOf, bookOf, waitForState, mouseCutAll,
} from './helpers.js';
import { clearWithKeyboard, tabToBooklet } from './clothes-helpers.js';

test.skip(({ isMobile }) => isMobile, 'keyboard and preference checks run on desktop');

test('the whole experience works with the keyboard alone', async ({ page }) => {
  test.setTimeout(150_000); // the clothes are moved aside one by one
  await openSite(page);
  await page.keyboard.press('Tab');
  await expect(page.locator('#cut-slider')).toBeFocused();
  await expect(page.locator('#knife-marker')).toBeVisible();
  for (let i = 0; i < 70 && (await stateOf(page)) !== 'opening'; i += 1) {
    await page.keyboard.down('ArrowRight');
  }
  await page.keyboard.up('ArrowRight');
  await waitForState(page, 'dark');
  await expect(page.locator('.question')).toBeFocused();

  await page.keyboard.press('Enter');
  await waitForState(page, 'overhead');
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', /^Move the .+ aside$/);
  await clearWithKeyboard(page);
  await tabToBooklet(page);

  await page.keyboard.press('Enter');
  await waitForState(page, 'reading', 15_000);
  await expect(page.locator('#reader')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await bookOf(page)).visible, { timeout: 4000 }).toEqual([2, 3]);
  await page.waitForTimeout(1000);
  await page.keyboard.press('End');
  await expect(page.locator('#reader-next')).toBeDisabled();
  await page.keyboard.press('Home');
  await expect(page.locator('#reader-prev')).toBeDisabled();
  await page.keyboard.press('Escape');
  await waitForState(page, 'overhead');
  await expect(page.locator('.book-top')).toBeFocused();
});

test('controls and stages have accessible names', async ({ page }) => {
  await openSite(page);
  await expect(page.getByRole('slider', { name: /packing tape/i })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Mute sound' })).toBeVisible();
  await expect(page.getByRole('button', { name: /start again/i })).toBeVisible();
  await page.goto('?jump=book');
  await waitForState(page, 'reading', 15_000);
  await expect(page.getByRole('button', { name: 'Close the book' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next page' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
});

test.describe('reduced motion', () => {
  // Emulated per page: the `reducedMotion` use-option did not reach the installed-Chrome channel.
  test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

  test('every stage is still reachable, with instant page turns', async ({ page }) => {
    test.setTimeout(120_000); // the clothes are moved aside one by one
    const problems = await openSite(page);
    const floatAnimation = await page.$eval('.question-glyph', (el) => getComputedStyle(el).animationName);
    expect(floatAnimation).toBe('none');
    await mouseCutAll(page);
    await waitForState(page, 'dark');
    await page.click('.question');
    await waitForState(page, 'overhead');
    await clearWithKeyboard(page);
    await page.click('.book-top');
    await waitForState(page, 'reading', 5000);
    await page.click('#reader-next');
    const total = (await bookOf(page)).content;
    await expect(page.locator('#indicator-visual')).toHaveText(`2–3 / ${total}`, { timeout: 400 });
    await page.click('#reader-close');
    await waitForState(page, 'overhead', 5000);
    expect(problems).toEqual([]);
  });
});

test.describe('mute and restart', () => {
  test('mute is remembered after a reload', async ({ page }) => {
    await openSite(page);
    const mute = page.locator('#mute');
    await expect(mute).toHaveAttribute('aria-pressed', 'false');
    await mute.click();
    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    await expect(mute).toHaveAttribute('aria-label', 'Mute sound');
    await expect(mute).toHaveAttribute('title', 'Turn sound on');
    await page.reload();
    await page.waitForFunction(() => window.__parcel?.state === 'sealed');
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#mute').click();
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'false');
  });

  test('restart from the open book returns a sealed parcel', async ({ page }) => {
    await openSite(page, '?jump=book');
    await waitForState(page, 'reading', 15_000);
    await page.click('#restart');
    await waitForState(page, 'sealed');
    await expect(page.locator('#reader')).toBeHidden();
    await expect(page.locator('.parcel')).not.toHaveClass(/is-open|is-cut/);
    expect(await progressOf(page)).toBe(0);
    const slits = await page.$$eval('[data-slit]', (els) => els.map((e) => e.getAttribute('d') ?? ''));
    expect(slits.every((d) => d === '')).toBe(true);
    await mouseCutAll(page);
    await waitForState(page, 'dark');
  });

  test('restart is unavailable while a transition is running', async ({ page }) => {
    await openSite(page, '?jump=dark');
    await page.click('.question');
    await expect(page.locator('#restart')).toBeDisabled();
    await waitForState(page, 'overhead');
    await expect(page.locator('#restart')).toBeEnabled();
  });
});
