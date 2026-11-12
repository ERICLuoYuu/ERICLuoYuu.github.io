import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import config from '../../content/site.js';
import { parseBook } from '../../js/book/markdown.js';

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), 'utf8');

for (const key of ['bookCover', 'endpaper']) {
  test(`${key} is the instruction-manual art: 360 × 500, black on white, no borrowed names`, async () => {
    const path = config.art[key];
    assert.ok(path.startsWith('assets/art/manual-'), `${key} points at ${path}`);
    const svg = await read(path);
    const [, , w, h] = svg.match(/viewBox="([^"]+)"/)[1].split(/[\s,]+/).map(Number);
    assert.equal(w / h, 360 / 500);
    assert.doesNotMatch(svg, /ikea/i);
    assert.doesNotMatch(svg, /placeholder/i);
  });
}

test('every drawing the booklet uses exists', async () => {
  const book = await read(config.book.source);
  const used = [...book.replace(/<!--[\s\S]*?-->/g, '').matchAll(/!\[[^\]]*\]\((\S+?)(?:\s+"[^"]*")?\)/g)].map((m) => m[1]);
  assert.ok(used.length >= 4, 'the manual is illustrated');
  await Promise.all(used.map(async (src) => assert.ok((await read(src)).includes('<svg'), `${src} is an SVG drawing`)));
});

// The owner's "XY-2005 Human User Manual" (version 1.0), section by section; each one a numbered step.
const MANUAL_SECTIONS = [
  'Product identification',
  'Physical specifications',
  'Core system architecture',
  'Language and communication system',
  'Social interface and energy management',
  'Operating modes',
  'Interests and functional capabilities',
  'Preferences and compatibility',
  'Daily maintenance and energy recharging',
  'Emotional support interface',
  'Stress response and troubleshooting',
  'Limitations and safety warnings',
  'Long-term development and calibration',
  'Final operating notice',
];

test('the booklet is the owner’s manual: no placeholders left, its fourteen sections numbered in order', async () => {
  const book = await read(config.book.source);
  const { sections } = parseBook(book);
  const text = sections.flat().map((b) => b.html ?? (b.items ?? []).join(' ')).join(' ');
  assert.doesNotMatch(text, /\[placeholder/i);
  assert.doesNotMatch(book, /ikea/i);
  const steps = sections.flat().filter((b) => b.type === 'heading' && b.level === 2);
  assert.deepEqual(steps.map((b) => b.html), MANUAL_SECTIONS);
  assert.deepEqual(steps.map((b) => b.number), MANUAL_SECTIONS.map((_, i) => i + 1));
});

test('the cover and the owner label carry the manual’s title and the owner’s name', () => {
  assert.equal(config.text.bookTitle, 'Human User Manual');
  assert.equal(config.text.ownerName, 'Xiaoyi');
});
