import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBook, renderInline, safeUrl } from '../../js/book/markdown.js';

test('splits sections on --- and keeps block order', () => {
  const { sections } = parseBook('# Hello\n\nFirst para.\n\n---\n\n## Second\nMore.');
  assert.equal(sections.length, 2);
  assert.deepEqual(sections[0].map((b) => b.type), ['heading', 'paragraph']);
  assert.equal(sections[0][0].level, 1);
  assert.equal(sections[1][0].level, 2);
});

test('joins wrapped lines into one paragraph', () => {
  const { sections } = parseBook('one\ntwo\nthree\n\nfour');
  assert.deepEqual(sections[0].map((b) => b.html), ['one two three', 'four']);
});

test('parses handwritten notes, lists and images', () => {
  const src = '> a margin note\n> continues\n\n- apple\n- pear\n\n![A sketch](assets/art/x.png "my caption")';
  const [blocks] = parseBook(src).sections;
  assert.deepEqual(blocks[0], { type: 'note', html: 'a margin note continues' });
  assert.deepEqual(blocks[1], { type: 'list', items: ['apple', 'pear'] });
  assert.deepEqual(blocks[2], { type: 'image', src: 'assets/art/x.png', alt: 'A sketch', caption: 'my caption' });
});

test('strips HTML comments so the file can carry instructions', () => {
  const { sections } = parseBook('<!-- edit me\nplease -->\n# Title');
  assert.equal(sections.length, 1);
  assert.deepEqual(sections[0].map((b) => b.type), ['heading']);
});

test('escapes raw HTML', () => {
  assert.equal(renderInline('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('renders emphasis, handwriting spans and safe links', () => {
  assert.equal(renderInline('**bold** and *soft*'), '<strong>bold</strong> and <em>soft</em>');
  assert.equal(renderInline('a ==scribble== here'), 'a <span class="hand">scribble</span> here');
  assert.equal(
    renderInline('[site](https://example.com/?a=1&b=2)'),
    '<a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">site</a>',
  );
});

test('refuses unsafe link targets', () => {
  assert.equal(renderInline('[x](javascript:alert(1))'), 'x');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html;base64,xx'), null);
  assert.equal(safeUrl('mailto:me@example.com'), 'mailto:me@example.com');
  assert.equal(safeUrl('assets/photo/me.jpg'), 'assets/photo/me.jpg');
});

test('ignores images with unsafe sources', () => {
  const [blocks] = parseBook('![x](javascript:alert(1))').sections;
  assert.equal(blocks, undefined);
});

test('empty input gives no sections', () => {
  assert.deepEqual(parseBook('').sections, []);
  assert.deepEqual(parseBook('\n---\n\n---\n').sections, []);
});

test('refuses schemes hidden behind control characters or backslashes', () => {
  assert.equal(safeUrl('\u0001javascript:alert(1)'), null);
  assert.equal(safeUrl(' \tjava\nscript:alert(1)'), null);
  assert.equal(safeUrl(String.raw`/\evil.example`), null);
  assert.equal(safeUrl(String.raw`\evil.example`), null);
  assert.equal(renderInline('[x](\u0001javascript:alert(1))'), 'x');
});

test('## headings are numbered as manual steps, across pages', () => {
  const { sections } = parseBook('# Parts\n\n## Unpack\n\n---\n\n## Read\n\n### Aside\n\n## Wave');
  const headings = sections.flat().filter((b) => b.type === 'heading');
  assert.deepEqual(headings.map((h) => [h.level, h.number ?? null]), [[1, null], [2, 1], [2, 2], [3, null], [2, 3]]);
});

test('step numbers do not leak between books', () => {
  parseBook('## One\n\n## Two');
  const { sections } = parseBook('## Again');
  assert.equal(sections[0][0].number, 1);
});
