/**
 * Turn parsed blocks into page elements.
 * Block HTML comes from markdown.js, which escapes all text and allows only
 * a handful of inline tags and safe links — so innerHTML here is safe.
 */

function el(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

const QUANTITY = /^(\d+)\s*[×x]\s+/;

function renderHeading(block) {
  const node = el(`h${block.level}`, 'manual-heading');
  if (block.number === undefined) {
    node.innerHTML = block.html;
    return node;
  }
  const number = el('span', 'step-number');
  number.textContent = String(block.number);
  const title = el('span', 'step-title');
  title.innerHTML = block.html;
  node.classList.add('step');
  node.append(number, title);
  return node;
}

/** A list item; "2× socks" gets a bold quantity badge like a parts list. */
function renderItem(html) {
  const li = el('li');
  const match = QUANTITY.exec(html);
  if (!match) {
    li.innerHTML = html;
    return li;
  }
  const badge = el('span', 'qty');
  badge.textContent = `${match[1]}×`;
  const rest = el('span');
  rest.innerHTML = html.slice(match[0].length);
  li.classList.add('has-qty');
  li.append(badge, rest);
  return li;
}

export function renderBlock(block) {
  switch (block.type) {
    case 'heading':
      return renderHeading(block);
    case 'note': {
      const node = el('p', `note${block.continued ? ' continued' : ''}`);
      const icon = el('span', 'note-icon');
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '!';
      const text = el('span', 'note-text');
      text.innerHTML = block.html;
      node.append(icon, text);
      return node;
    }
    case 'list': {
      const node = el('ul', block.continued ? 'continued' : '');
      node.append(...block.items.map(renderItem));
      return node;
    }
    case 'image': {
      const figure = el('figure');
      const img = el('img');
      img.src = block.src;
      img.alt = block.alt;
      img.decoding = 'async';
      figure.append(img);
      if (block.caption) {
        const caption = el('figcaption');
        caption.textContent = block.caption;
        figure.append(caption);
      }
      return figure;
    }
    default: {
      const node = el('p', block.continued ? 'continued' : '');
      node.innerHTML = block.html;
      return node;
    }
  }
}

/** One paper page; `folio` is the printed page number (omit for endpapers). */
export function buildPage(blocks, { folio = null, kind = 'text' } = {}) {
  const page = el('div', `page page-${kind}`);
  page.dataset.density = 'soft';
  const paper = el('div', 'page-paper');
  const inner = el('div', 'page-inner');
  inner.append(...blocks.map(renderBlock));
  paper.append(inner);
  if (folio !== null) {
    const number = el('span', 'page-folio');
    number.textContent = String(folio);
    paper.append(number);
  }
  page.append(paper);
  return page;
}

/** The inside of the cover: the manual's first page, with an owner label. */
export function buildEndpaper({ ownerLine, ownerName }, { back = false } = {}) {
  const page = el('div', `page page-endpaper${back ? ' page-endpaper-back' : ''}`);
  page.dataset.density = 'soft';
  if (!back) {
    const label = el('div', 'parts-label');
    const line = el('span', 'parts-label-line');
    line.textContent = ownerLine;
    const name = el('span', 'parts-label-name');
    name.textContent = ownerName;
    label.append(line, name);
    page.append(label);
  }
  return page;
}

/**
 * Build a `fits(blocks)` measure using a hidden page of the current size.
 * Returns { fits, dispose }.
 */
export function createMeasurer(host) {
  const page = buildPage([], { folio: 0 });
  page.classList.add('page-measure');
  page.setAttribute('aria-hidden', 'true');
  host.append(page);
  const inner = page.querySelector('.page-inner');
  return {
    fits(blocks) {
      inner.replaceChildren(...blocks.map(renderBlock));
      return inner.scrollHeight <= inner.clientHeight + 0.5;
    },
    dispose: () => page.remove(),
  };
}
