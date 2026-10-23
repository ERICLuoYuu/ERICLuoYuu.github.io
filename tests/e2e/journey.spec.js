import { test, expect } from '@playwright/test';
import { openSite, stateOf, bookOf, waitForState, mouseCutAll } from './helpers.js';
import { clearWithMouse, bareBookletPoint } from './clothes-helpers.js';

test.describe('the whole parcel, start to finish', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop journey');

  test('cut → dark box → overhead reveal → clothes aside → book → close', async ({ page }) => {
    test.setTimeout(150_000); // moving the whole pile aside by hand takes a while
    const problems = await openSite(page);
    await mouseCutAll(page);
    await waitForState(page, 'dark');

    await page.click('.question');
    expect(await stateOf(page)).toBe('revealing');
    await page.click('.question', { force: true, noWaitAfter: true }).catch(() => {}); // a second click is ignored
    await waitForState(page, 'overhead');
    const light = await page.$eval('.parcel', (el) => el.style.getPropertyValue('--light'));
    expect(Number(light)).toBeCloseTo(1, 2);

    await clearWithMouse(page);
    const bare = await bareBookletPoint(page);
    expect(bare, 'some of the booklet is bare').not.toBeNull();
    await page.mouse.move(bare.x, bare.y);
    await expect.poll(() => page.$eval('.book-top', (el) => getComputedStyle(el).cursor)).toContain('hand.svg');

    await page.mouse.dblclick(bare.x, bare.y); // double activation must not open twice
    await waitForState(page, 'reading');
    await expect(page.locator('#reader')).toBeVisible();
    await expect(page.locator('.flyer')).toBeHidden();
    expect((await bookOf(page)).visible).toEqual([0, 1]);
    const total = (await bookOf(page)).content; // follows content/book.md as the owner fills it in
    await expect(page.locator('#indicator-visual')).toHaveText(`1 / ${total}`);

    // background box stays softly visible
    const filter = await page.$eval('#stage', (el) => getComputedStyle(el).filter);
    expect(filter).toContain('blur');

    await page.click('#reader-next');
    await expect(page.locator('#indicator-visual')).toHaveText(`2–3 / ${total}`, { timeout: 4000 });
    await page.waitForFunction(() => document.querySelector('#reader-prev').disabled === false);
    await page.click('#reader-prev');
    await expect(page.locator('#indicator-visual')).toHaveText(`1 / ${total}`, { timeout: 4000 });

    await page.click('#reader-close');
    await waitForState(page, 'overhead');
    await expect(page.locator('#reader')).toBeHidden();
    await expect(page.locator('.book3d')).not.toHaveClass(/is-away/);
    await expect(page.locator('.book-top')).toBeFocused();
    expect(problems).toEqual([]);
  });

  test('page corners: clicking turns, dragging can be cancelled or completed', async ({ page }) => {
    await openSite(page, '?jump=book');
    await waitForState(page, 'reading', 15_000);
    const box = await page.locator('#reader-book').boundingBox();
    const corner = { x: box.x + box.width - 8, y: box.y + box.height - 8 };

    // a short drag that is released early springs back
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    await page.mouse.move(corner.x - box.width * 0.2, corner.y - 40, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(1300);
    expect((await bookOf(page)).visible).toEqual([0, 1]);

    // a long drag completes the turn
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    await page.mouse.move(corner.x - box.width * 0.9, corner.y - 30, { steps: 20 });
    await page.mouse.up();
    await expect.poll(async () => (await bookOf(page)).visible, { timeout: 4000 }).toEqual([2, 3]);

    // clicking the left page's corner turns back
    await page.waitForTimeout(300);
    await page.mouse.click(box.x + 8, box.y + box.height - 8);
    await expect.poll(async () => (await bookOf(page)).visible, { timeout: 4000 }).toEqual([0, 1]);
  });

  test('long passages flow onto extra pages that never overflow', async ({ page }) => {
    const long = Array.from({ length: 24 }, (_, i) => `Paragraph ${i + 1}. ${'This sentence is filler to test how a long passage flows across pages. '.repeat(4)}`).join('\n\n');
    await page.route('**/content/book.md', (route) => route.fulfill({ contentType: 'text/markdown', body: `# A long one\n\n${long}` }));
    await openSite(page, '?jump=book');
    await waitForState(page, 'reading', 15_000);
    const status = await bookOf(page);
    expect(status.content).toBeGreaterThan(5);
    for (let i = 0; i < 3; i += 1) {
      const overflowing = await page.$$eval('.stf__item .page-inner', (els) => els
        .filter((el) => el.offsetParent !== null)
        .filter((el) => el.scrollHeight > el.clientHeight + 1).length);
      expect(overflowing).toBe(0);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(1100);
    }
  });
});

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout');

  test('tapping the question mark looks down into the box', async ({ page }) => {
    await openSite(page, '?jump=dark');
    await page.tap('.question');
    await waitForState(page, 'overhead');
    const book = await page.locator('.book-top').boundingBox();
    // tilted 14°, the nearer front rim sets the fit, so the floor is a little smaller: 66 px; touch targets want 48
    expect(book.width).toBeGreaterThan(60); // still comfortable to tap
    expect(book.x).toBeGreaterThan(0);
    expect(book.x + book.width).toBeLessThan(page.viewportSize().width);
  });

  test('the book shows one readable page at a time', async ({ page }) => {
    await openSite(page, '?jump=clear');
    await waitForState(page, 'overhead');
    await page.tap('.book-top');
    await waitForState(page, 'reading', 15_000);
    const status = await bookOf(page);
    expect(status.mode).toBe('single');
    expect(status.visible).toEqual([1]);
    const fontSize = await page.$eval('.stf__item .page-inner', (el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
    const box = await page.locator('#reader-book').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
    await page.tap('#reader-next');
    await expect(page.locator('#indicator-visual')).toHaveText(`2 / ${status.content}`, { timeout: 4000 });
    await page.tap('#reader-close');
    await waitForState(page, 'overhead');
  });
});
