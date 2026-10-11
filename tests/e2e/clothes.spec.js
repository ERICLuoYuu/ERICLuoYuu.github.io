import { test, expect } from '@playwright/test';
import { openSite, stateOf, waitForState, touchDrag } from './helpers.js';
import {
  clothesOf, waitForSettled, pointOn, dragMouse, clearWithKeyboard, tabToBooklet, gridOver, filmPoints,
} from './clothes-helpers.js';

const shownKeys = (page) => page.locator('.clothes-key:not([hidden])');
const focusedKey = (page) => page.evaluate(() => {
  const el = document.activeElement;
  return el?.classList.contains('clothes-key') ? el.getAttribute('aria-label') : null;
});

const centreOf = async (page, id) => (await clothesOf(page)).garments.find((g) => g.id === id).centre;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test.describe('clothes in the box (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'mouse and keyboard');

  test('the pack can be picked up anywhere, clear film included, and moved', async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    // The film point nearest the middle: pulled by a corner, a heavy sheet mostly swings round rather than slides
    const box = await page.evaluate(() => window.__parcel.garmentBox('pack'));
    const middle = [box.left + box.width / 2, box.top + box.height / 2];
    const [film] = (await filmPoints(page, await gridOver(page, 'pack')))
      .sort((a, b) => Math.hypot(a.x - middle[0], a.y - middle[1]) - Math.hypot(b.x - middle[0], b.y - middle[1]));
    expect(film, 'a point over clear film').toBeDefined();
    expect(await page.evaluate(([x, y]) => window.__parcel.pick(x, y), [film.x, film.y])).toBe('pack');
    const before = await centreOf(page, 'pack');
    await dragMouse(page, film, { x: film.x + 40, y: film.y });
    await waitForSettled(page);
    expect((await centreOf(page, 'pack'))[0] - before[0]).toBeGreaterThan(10);
  });

  test('while the clothes show, the drawn pack stands in for the CSS one; restart puts it back', async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    const opacity = () => page.$eval('.pack', (el) => getComputedStyle(el).opacity);
    expect(await opacity()).toBe('0');
    expect(await page.$eval('.pack-img', (img) => img.alt), 'screen readers still hear it').not.toBe('');
    const home = await centreOf(page, 'pack');
    const grip = await pointOn(page, 'pack');
    await dragMouse(page, grip, { x: grip.x + 40, y: grip.y });
    await waitForSettled(page);
    await page.click('#restart');
    await waitForState(page, 'sealed');
    expect(await opacity()).toBe('1');
    expect(await centreOf(page, 'pack')).toEqual(home);
  });

  test('the keyboard offers to move the garments, never the pack', async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    const labels = await page.$$eval('#clothes-controls button', (buttons) => buttons.map((b) => b.getAttribute('aria-label')));
    expect(labels).toHaveLength(8);
    labels.forEach((label) => expect(label).not.toMatch(/pack/i));
  });

  test('the open hand shows exactly where cloth is visible, never over a transparent margin', async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    const box = await page.evaluate(() => window.__parcel.garmentBox('qipao'));
    for (const row of [0.08, 0.3, 0.7]) {
      for (let k = 0; k <= 24; k += 1) {
        const x = box.left + (box.width * k) / 24;
        const y = box.top + box.height * row;
        await page.mouse.move(x, y);
        const [picked, hover] = await page.evaluate(([px, py]) => [
          window.__parcel.pick(px, py) !== null,
          document.querySelector('.stage').classList.contains('over-garment'),
        ], [x, y]);
        expect(hover, `hand at (${x.toFixed(0)}, ${y.toFixed(0)})`).toBe(picked);
      }
    }
  });

  test('the booklet is locked under the pile: clicking it does nothing yet', async ({ page }) => {
    const problems = await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    expect((await clothesOf(page)).reachable).toBe(false);
    await expect(page.locator('#clothes-hint')).toHaveText('Move the clothes aside to find what’s underneath.');
    await expect(page.locator('#clothes-hint')).toBeVisible();
    const book = await page.locator('.book-top').boundingBox();
    await page.mouse.click(book.x + book.width / 2, book.y + book.height / 2);
    await page.waitForTimeout(600);
    expect(await stateOf(page)).toBe('overhead');
    // screen readers can still reach it by browsing: it says it is unavailable, and why
    await expect(page.locator('.book-top')).toHaveAttribute('aria-disabled', 'true');
    await page.$eval('.book-top', (el) => el.click());
    await expect(page.locator('#announcer')).toHaveText('Move the clothes aside to find what’s underneath.');
    expect(await stateOf(page)).toBe('overhead');
    expect(problems).toEqual([]);
  });

  test('hovering a garment shows an open hand, carrying it a closed one', async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    const point = await pointOn(page);
    await page.mouse.move(point.x, point.y);
    await expect.poll(() => page.$eval('#stage', (el) => getComputedStyle(el).cursor)).toContain('hand-open');
    await page.mouse.down();
    await expect.poll(() => page.$eval('#stage', (el) => getComputedStyle(el).cursor)).toContain('hand-closed');
    await page.mouse.up();
  });

  test('a garment dragged with the mouse moves, settles and stays where it was put', async ({ page }) => {
    const problems = await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    const point = await pointOn(page);
    const before = await centreOf(page, point.id);
    await dragMouse(page, point, { x: point.x - 260, y: point.y + 20 });
    await waitForSettled(page);
    const after = await centreOf(page, point.id);
    expect(distance(before, after)).toBeGreaterThan(80);
    await page.waitForTimeout(1500);
    expect(await centreOf(page, point.id)).toEqual(after);
    expect(problems).toEqual([]);
  });

  test('a cancelled pointer lets go of the garment', async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    const point = await pointOn(page);
    await dragMouse(page, point, { x: point.x - 80, y: point.y }, { release: false });
    expect((await clothesOf(page)).held).not.toBeNull();
    await page.$eval('#stage', (el) => el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', isPrimary: true, bubbles: true })));
    const status = await clothesOf(page);
    expect(status.held).toBeNull();
    expect(status.grip).toBeNull();
    await waitForSettled(page);
    await page.mouse.up();
  });

  test('a second pointer is ignored while a garment is carried', async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    const point = await pointOn(page);
    await dragMouse(page, point, { x: point.x - 60, y: point.y }, { release: false });
    const held = (await clothesOf(page)).held;
    const book = await page.locator('.book-top').boundingBox();
    await page.$eval('#stage', (el, [x, y]) => {
      const options = { pointerId: 7, pointerType: 'touch', isPrimary: false, bubbles: true, clientX: x, clientY: y };
      el.dispatchEvent(new PointerEvent('pointerdown', options));
      el.dispatchEvent(new PointerEvent('pointerup', options));
    }, [book.x + 10, book.y + 10]);
    expect((await clothesOf(page)).held).toBe(held);
    expect(await stateOf(page)).toBe('overhead');
    await page.mouse.up();
    await waitForSettled(page);
  });

  test('restarting mid-drag gives a sealed parcel and the packed pile', async ({ page }) => {
    const problems = await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    const packed = (await clothesOf(page)).garments.map((g) => g.centre);
    const point = await pointOn(page);
    await dragMouse(page, point, { x: point.x - 120, y: point.y }, { release: false });
    await page.locator('#restart').dispatchEvent('click');
    await waitForState(page, 'sealed');
    await page.mouse.up();
    const status = await clothesOf(page);
    expect(status.held).toBeNull();
    expect(status.visible).toBe(false);
    expect(status.garments.map((g) => g.centre)).toEqual(packed);
    expect(problems).toEqual([]);
  });

  test('after a resize mid-drag the garment still hangs under the pointer', async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    const point = await pointOn(page);
    const to = { x: point.x - 150, y: point.y + 30 };
    await dragMouse(page, point, to, { release: false });
    await page.setViewportSize({ width: 1100, height: 720 });
    await page.waitForTimeout(400);
    const { grip } = await clothesOf(page);
    const seen = await page.evaluate((p) => window.__parcel.project(p), grip);
    expect(Math.hypot(seen.x - to.x, seen.y - to.y)).toBeLessThan(6);
    await page.mouse.up();
  });

  test('keyboard: move the clothes aside one by one, then open the booklet', async ({ page }) => {
    const problems = await openSite(page, '?jump=dark');
    await waitForState(page, 'dark');
    await page.locator('.question').focus();
    await page.keyboard.press('Enter');
    await waitForState(page, 'overhead');
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', /^Move the .+ aside$/);
    await clearWithKeyboard(page);
    await expect(page.locator('#announcer')).toHaveText('The little book is uncovered.', { timeout: 8000 });
    await expect(page.locator('#clothes-hint')).toBeHidden();
    await tabToBooklet(page);
    await page.keyboard.press('Enter');
    await waitForState(page, 'reading', 15_000);
    expect(problems).toEqual([]);
  });

  test('?jump=clear starts with the clothes already off the booklet', async ({ page }) => {
    await openSite(page, '?jump=clear');
    await waitForState(page, 'overhead');
    expect((await clothesOf(page)).reachable).toBe(true);
    await expect(page.locator('.book-top')).toHaveAttribute('aria-disabled', 'false');
    await page.click('.book-top');
    await waitForState(page, 'reading', 15_000);
  });

  test('a garment taken out of the box with the mouse no longer has a keyboard button', async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    const point = await pointOn(page);
    await dragMouse(page, point, { x: point.x, y: page.viewportSize().height - 4 });
    await waitForSettled(page);
    // cloth lying on the garment may come out with it: every garment out of the box loses its button
    const inBox = ([x, y]) => x > 0 && x < 420 && y > 0 && y < 300;
    const { garments } = await clothesOf(page);
    expect(inBox(garments.find((g) => g.id === point.id).centre)).toBe(false);
    await expect(shownKeys(page)).toHaveCount(garments.filter((g) => g.id !== 'pack' && inBox(g.centre)).length);
  });

  test('losing the graphics mid-move does not jam the keyboard moves', async ({ page }) => {
    const problems = await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    await shownKeys(page).first().focus();
    const garment = (await focusedKey(page)).replace(/^Move the (.+) aside$/, '$1');
    const lose = await page.evaluate(() => {
      window.__lose = document.getElementById('clothes').getContext('webgl2').getExtension('WEBGL_lose_context');
      return Boolean(window.__lose);
    });
    test.skip(!lose, 'this browser cannot simulate a lost context');
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.__lose.loseContext());
    await expect(page.locator('#announcer')).toHaveText(`The ${garment} is out of the way.`, { timeout: 8000 });
    await page.evaluate(() => window.__lose.restoreContext());
    expect(problems).toEqual([]);
  });

  test.describe('with reduced motion', () => {
    test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

    test('after the very last garment, keyboard focus moves on to the booklet', async ({ page }) => {
      test.setTimeout(90_000);
      await openSite(page, '?jump=overhead');
      await waitForState(page, 'overhead');
      await shownKeys(page).first().focus();
      for (let n = 0; n < 12 && await focusedKey(page); n += 1) {
        await page.keyboard.press('Enter');
        await waitForSettled(page);
      }
      await expect(shownKeys(page)).toHaveCount(0);
      await expect(page.locator('.book-top')).toBeFocused();
      await page.keyboard.press('Enter');
      await waitForState(page, 'reading', 15_000);
    });

    test('keyboard moves finish quickly, without a carrying arc', async ({ page }) => {
      await openSite(page, '?jump=overhead');
      await waitForState(page, 'overhead');
      const times = [];
      await clearWithKeyboard(page, { onMove: (ms) => times.push(ms) });
      expect(times.length).toBeGreaterThan(0);
      times.forEach((ms) => expect(ms).toBeLessThan(1500));
    });
  });
});

test.describe('without WebGL', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop');

  test('the CSS pack stays, flat, as the fallback', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
        return type === 'webgl2' ? null : original.call(this, type, ...rest);
      };
    });
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    await expect(page.locator('.pack')).toBeVisible();
    await expect(page.locator('.pack-edge')).toHaveCount(0);
  });

  test('the clothes are skipped and the booklet opens straight after the reveal', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
        return type === 'webgl2' ? null : original.call(this, type, ...rest);
      };
    });
    const problems = await openSite(page, '?jump=dark');
    await waitForState(page, 'dark');
    await page.click('.question');
    await waitForState(page, 'overhead');
    expect((await clothesOf(page)).enabled).toBe(false);
    await expect(page.locator('#clothes-hint')).toBeHidden();
    await page.click('.book-top');
    await waitForState(page, 'reading', 15_000);
    expect(problems).toEqual([]);
  });
});

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch');

  test('a garment can be dragged with a finger', async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    const point = await pointOn(page);
    const before = await centreOf(page, point.id);
    const path = Array.from({ length: 25 }, (_, i) => ({ x: point.x - 4 * i, y: point.y + 5 * i }));
    await touchDrag(page, path);
    await waitForSettled(page);
    expect(distance(before, await centreOf(page, point.id))).toBeGreaterThan(40);
    expect(await stateOf(page)).toBe('overhead');
  });
});
