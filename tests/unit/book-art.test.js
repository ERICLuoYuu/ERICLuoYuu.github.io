import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import config from '../../content/site.js';

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

test('the booklet text keeps clearly marked slots for the owner', async () => {
  const book = await read(config.book.source);
  assert.match(book, /\[Placeholder — /);
  assert.doesNotMatch(book, /ikea/i);
});
