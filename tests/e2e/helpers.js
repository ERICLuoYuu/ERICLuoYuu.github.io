import { expect } from '@playwright/test';

/** Open the site and collect anything that went wrong while loading. */
export async function openSite(page, query = '') {
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`${r.status()} ${r.url()}`); });
  await page.goto(query);
  await page.waitForFunction(() => window.__parcel && window.__parcel.state !== 'loading', null, { timeout: 20_000 });
  return problems;
}

export const stateOf = (page) => page.evaluate(() => window.__parcel.state);
export const progressOf = (page) => page.evaluate(() => window.__parcel.progress());
export const soundOf = (page) => page.evaluate(() => window.__parcel.sound());
export const bookOf = (page) => page.evaluate(() => window.__parcel.book());
/** Move every garment off the booklet (they lie on top of it until a visitor moves them). */
export const clearClothes = (page) => page.evaluate(() => window.__parcel.clearClothes());

export async function waitForState(page, state, timeout = 10_000) {
  await page.waitForFunction((s) => window.__parcel?.state === s, state, { timeout });
}

/** Screen-space points along the tape's centre line (t = 0…1), with an optional sideways offset. */
export async function tapeLine(page) {
  const corners = await page.evaluate(() => [...document.querySelectorAll('.parcel > .probe')].map((p) => {
    const r = p.getBoundingClientRect();
    return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
  }));
  expect(corners).toHaveLength(4);
  const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const left = mix(corners[0], corners[3], 0.5);
  const right = mix(corners[1], corners[2], 0.5);
  return (t, offset = 0) => {
    const p = mix(left, right, t);
    return { x: p.x, y: p.y + offset };
  };
}

/** Drag the mouse along the tape from t0 to t1 (button must already be down). */
export async function dragAlong(page, along, t0, t1, steps = 40) {
  for (let i = 0; i <= steps; i += 1) {
    const p = along(t0 + ((t1 - t0) * i) / steps, Math.sin(i / 3) * 2);
    await page.mouse.move(p.x, p.y);
  }
}

export async function mouseCutAll(page) {
  const along = await tapeLine(page);
  const start = along(0.01);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await dragAlong(page, along, 0.01, 0.99, 90);
  await page.mouse.up();
}

/** Real touch input through the Chrome DevTools protocol (touchstart → touchmove → touchend). */
export async function touchDrag(page, points) {
  const cdp = await page.context().newCDPSession(page);
  const [first, ...rest] = points;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: first.x, y: first.y }] });
  for (const p of rest) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
