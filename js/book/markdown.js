/**
 * Markdown-lite for the introduction book.
 *
 *   #                a title
 *   ##               a numbered step (numbers count up through the whole book)
 *   ###              a small heading
 *   > text           a "!" note
 *   - item           list (start an item with "2×" for a quantity badge)
 *   ![alt](src "caption")   image (relative path or https)
 *   **bold**  *italic*  ==highlight==  [link](https://…)
 *   ---              start a new page
 *   <!-- … -->       comments, ignored
 *
 * All text is HTML-escaped; only http(s), mailto and relative URLs survive.
 */

const escapeHtml = (s) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const unescapeHtml = (s) => s
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&');

export function safeUrl(url) {
  // Browsers ignore control characters and whitespace inside URLs, so strip
  // them before checking the scheme ("\u0001javascript:" is still javascript:).
  // eslint-disable-next-line no-control-regex
  const u = String(url ?? '').replace(/[\u0000- \u007f-\u009f]/g, '');
  if (!u || u.startsWith('//') || u.startsWith('\\') || u.startsWith('/\\')) return null;
  if (/^(https?:|mailto:)/i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return null;
  return u;
}

const LINK = /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

export function renderInline(text) {
  const links = [];
  let html = escapeHtml(String(text ?? '')).replace(LINK, (_, label, href) => {
    const url = safeUrl(unescapeHtml(href));
    if (!url) return label;
    const external = /^https?:/i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : '';
    links.push(`<a href="${escapeHtml(url)}"${external}>${label}</a>`);
    return `\u0000${links.length - 1}\u0000`;
  });
  html = html
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\s][^*]*)\*/g, '<em>$1</em>')
    .replace(/(^|\s)_([^_]+)_(?=$|\s|[.,;:!?])/g, '$1<em>$2</em>')
    .replace(/==([^=]+)==/g, '<span class="hand">$1</span>');
  // eslint-disable-next-line no-control-regex
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)]);
}

const HEADING = /^(#{1,3})\s+(.+)$/;
const IMAGE = /^!\[([^\]]*)\]\((.*)\)$/;
const IMAGE_TARGET = /^\s*(\S+?)(?:\s+"([^"]*)")?\s*$/;
const NOTE = /^>\s?(.*)$/;
const LIST_ITEM = /^[-*]\s+(.+)$/;

function parseImage(match) {
  const target = IMAGE_TARGET.exec(match[2]);
  const src = target && safeUrl(target[1]);
  if (!src) return null;
  const block = { type: 'image', src, alt: match[1].trim() };
  return target[2] ? { ...block, caption: target[2] } : block;
}

function parseSection(chunk) {
  const blocks = [];
  let para = [];
  let note = [];
  let list = [];

  const flush = () => {
    if (para.length) blocks.push({ type: 'paragraph', html: renderInline(para.join(' ')) });
    if (note.length) blocks.push({ type: 'note', html: renderInline(note.join(' ')) });
    if (list.length) blocks.push({ type: 'list', items: list.map(renderInline) });
    para = [];
    note = [];
    list = [];
  };

  for (const raw of chunk.split('\n')) {
    const line = raw.trim();
    let m;
    if (!line) {
      flush();
    } else if ((m = HEADING.exec(line))) {
      flush();
      blocks.push({ type: 'heading', level: m[1].length, html: renderInline(m[2]) });
    } else if ((m = IMAGE.exec(line))) {
      flush();
      const image = parseImage(m);
      if (image) blocks.push(image);
    } else if ((m = NOTE.exec(line))) {
      if (para.length || list.length) flush();
      note = [...note, m[1]];
    } else if ((m = LIST_ITEM.exec(line))) {
      if (para.length || note.length) flush();
      list = [...list, m[1]];
    } else {
      if (note.length || list.length) flush();
      para = [...para, line];
    }
  }
  flush();
  return blocks;
}

/** Number every `##` heading as a manual step, counting across the whole book. */
function numberSteps(sections) {
  let step = 0;
  return sections.map((blocks) => blocks.map((block) => {
    if (block.type !== 'heading' || block.level !== 2) return block;
    step += 1;
    return { ...block, number: step };
  }));
}

/** @returns {{sections: object[][]}} each section starts on a fresh page */
export function parseBook(source) {
  const text = String(source ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '');
  const sections = text
    .split(/^\s*-{3,}\s*$/m)
    .map(parseSection)
    .filter((blocks) => blocks.length > 0);
  return { sections: numberSteps(sections) };
}
