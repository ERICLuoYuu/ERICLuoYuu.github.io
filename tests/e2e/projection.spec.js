import { test, expect } from '@playwright/test';
import { openSite, waitForState } from './helpers.js';

/**
 * The clothes are drawn by WebGL on top of the CSS-3D box, so the maths in
 * projection.js and solids.js must land exactly where the browser draws the
 * box. Compare predicted corners with the zero-size probe elements in the DOM.
 */
async function worstMiss(page, view) {
  return page.evaluate(async (viewName) => {
    const { frameFor, tapeCorners } = await import('./js/scene/geometry.js');
    const { projectPoint } = await import('./js/scene/projection.js');
    const { flapCorners } = await import('./js/scene/solids.js');
    const frame = frameFor(viewName, innerWidth, innerHeight);
    const viewport = { width: innerWidth, height: innerHeight };
    const centre = (el) => {
      const r = el.getBoundingClientRect();
      return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
    };
    const pairs = [];
    const tapeProbes = [...document.querySelectorAll('.parcel > .probe')];
    tapeCorners().forEach((c, i) => pairs.push([[c.x, c.y, c.z], tapeProbes[i]]));
    if (document.querySelector('.parcel.is-open')) {
      ['front', 'back', 'left', 'right'].forEach((side) => {
        const probes = document.querySelectorAll(`.flap.${side} .flap-probe`);
        flapCorners(side).forEach((corner, i) => pairs.push([corner, probes[i]]));
      });
    }
    return Math.max(...pairs.map(([point, el]) => {
      const p = projectPoint(frame, viewport, point);
      const seen = centre(el);
      return Math.hypot(p.x - seen.x, p.y - seen.y);
    }));
  }, view);
}

test.describe('the WebGL camera matches the CSS camera', () => {
  test('three-quarter view of the sealed parcel', async ({ page }) => {
    await openSite(page);
    expect(await worstMiss(page, 'threeQuarter')).toBeLessThan(1);
  });

  test('overhead view, with every open flap where the maths puts it', async ({ page }) => {
    await openSite(page, '?jump=overhead');
    await waitForState(page, 'overhead');
    await page.waitForTimeout(300);
    expect(await worstMiss(page, 'overhead')).toBeLessThan(1);
  });
});
