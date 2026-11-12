import { test, expect } from '@playwright/test';
import { openSite, waitForState, bookOf } from './helpers.js';

// Chrome keeps a preloaded picture ready only while something still holds it. Collecting garbage all through
// start-up drops any picture the page has let go of, as a busy phone might, before the book is measured.
test.use({ launchOptions: { args: ['--js-flags=--expose-gc'] } });

test('the booklet is paged with its drawings at their real size, even after garbage collection', async ({ page }) => {
  await page.addInitScript(() => setInterval(() => window.gc?.(), 20));
  const problems = await openSite(page, '?jump=book');
  await waitForState(page, 'reading', 30_000);

  const settled = await page.evaluate(async () => {
    const [{ parseBook }, { paginate }, { createMeasurer }] = await Promise.all(
      ['./js/book/markdown.js', './js/book/paginate.js', './js/book/book-render.js'].map((path) => import(path)),
    );
    const { sections } = parseBook(await (await fetch('content/book.md')).text());
    const held = [...new Set(sections.flat().filter((b) => b.type === 'image').map((b) => b.src))].map((src) => {
      const img = new Image();
      img.src = src;
      return img;
    });
    await Promise.all(held.map((img) => img.decode()));
    const measurer = createMeasurer(document.getElementById('measure'));
    const pages = paginate(sections, { fits: measurer.fits }).length;
    measurer.dispose();
    return { pages, held: held.length };
  });
  expect(settled.held, 'the booklet has drawings').toBeGreaterThan(3);
  expect((await bookOf(page)).content, 'pages as many as with every drawing measured').toBe(settled.pages);

  const overflowing = await page.$$eval('.stf__item .page-inner', (els) => els
    .filter((el) => el.offsetParent !== null)
    .filter((el) => el.scrollHeight > el.clientHeight + 1).length);
  expect(overflowing, 'no page hides its last lines').toBe(0);
  expect(problems).toEqual([]);
});
