/**
 * The open book: pagination + StPageFlip (vendor/page-flip, MIT).
 *
 * StPageFlip provides the paper fold, moving shadows, corner dragging that
 * completes or springs back, and touch swipes. This module feeds it pages
 * that fit the current screen and wires up buttons, keys and the indicator.
 */

import { parseBook } from './markdown.js';
import { paginate } from './paginate.js';
import { buildPage, buildEndpaper, createMeasurer } from './book-render.js';
import { loadImage } from '../loader/preload.js';

const FLIP_MS = 900;
const REDUCED_FLIP_MS = 320;

/** Give every block a stable id so we can find our place after re-pagination. */
const tagBlocks = (sections) => sections.map((blocks, s) => blocks.map((b, i) => ({ ...b, id: `s${s}b${i}` })));

function waitForEvent(flip, name) {
  return new Promise((resolve) => flip.on(name, resolve));
}

export function createBookView({ mount, measureHost, ui, text, sound, reducedMotion }) {
  let sections = [];
  let pageBlocks = [];
  let pageEls = [];
  let layout = null;
  let flip = null;
  let contentCount = 0;
  const listeners = { flip: new Set() };

  async function load(source) {
    try {
      const res = await fetch(source);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      sections = tagBlocks(parseBook(await res.text()).sections);
      const images = sections.flat().filter((b) => b.type === 'image');
      await Promise.all(images.map((b) => loadImage(b.src).catch((err) => console.warn('[parcel] book image:', err.message))));
    } catch (err) {
      console.error(`[parcel] could not read the book (${source}):`, err.message);
      sections = tagBlocks([[{ type: 'paragraph', html: 'This book could not be opened right now. Please try again later.' }]]);
    }
  }

  function applyLayoutVars(l) {
    const root = document.documentElement.style;
    root.setProperty('--page-w', `${l.pageWidth}px`);
    root.setProperty('--page-h', `${l.pageHeight}px`);
    root.setProperty('--page-font', `${l.fontSize}px`);
    mount.style.width = `${l.mode === 'spread' ? l.pageWidth * 2 : l.pageWidth}px`;
    mount.style.height = `${l.pageHeight}px`;
    root.setProperty('--book-w', `${l.mode === 'spread' ? l.pageWidth * 2 : l.pageWidth}px`);
    document.documentElement.dataset.bookMode = l.mode;
  }

  /** Paginate for a layout and build page elements (not yet shown). */
  function prepare(newLayout) {
    layout = newLayout;
    applyLayoutVars(layout);
    const measurer = createMeasurer(measureHost);
    pageBlocks = paginate(sections, { fits: measurer.fits });
    measurer.dispose();
    contentCount = pageBlocks.length;
    const content = pageBlocks.map((blocks, i) => buildPage(blocks, { folio: i + 1 }));
    const all = [buildEndpaper(text), ...content];
    if (all.length % 2 === 1) all.push(buildEndpaper(text, { back: true }));
    pageEls = all;
  }

  /** Page index that should be visible first (single page mode skips the endpaper). */
  const firstPage = () => (layout?.mode === 'single' ? 1 : 0);

  const visibleIndexes = () => {
    if (!flip) return [];
    const i = flip.getCurrentPageIndex();
    return layout.mode === 'spread' ? [i, i + 1] : [i];
  };

  function updateUi() {
    if (!flip) return;
    const visible = visibleIndexes();
    const numbers = visible.filter((n) => n >= 1 && n <= contentCount);
    // Short handwritten figures for the eye, a full sentence for screen readers.
    ui.indicatorVisual.textContent = numbers.length ? `${numbers.join('–')} / ${contentCount}` : `· / ${contentCount}`;
    ui.indicatorSpoken.textContent = numbers.length
      ? `Page ${numbers.join(' and ')} of ${contentCount}`
      : 'Inside cover';
    const atStart = visible[0] <= firstPage();
    const atEnd = visible.at(-1) >= flip.getPageCount() - 1;
    // Don't strand keyboard focus on a button that is about to be disabled.
    const stranded = (atStart && document.activeElement === ui.prev) || (atEnd && document.activeElement === ui.next);
    ui.prev.disabled = atStart;
    ui.next.disabled = atEnd;
    if (stranded) ui.fallbackFocus.focus({ preventScroll: true });
    listeners.flip.forEach((fn) => fn(visible));
  }

  /** Create the flipbook at the prepared layout. Resolves once it is drawn. */
  async function show(startPage = firstPage()) {
    destroy();
    const host = document.createElement('div');
    host.className = 'flipbook';
    mount.append(host);
    const PageFlip = globalThis.St?.PageFlip;
    if (!PageFlip) throw new Error('page-flip library failed to load');
    flip = new PageFlip(host, {
      width: layout.pageWidth,
      height: layout.pageHeight,
      size: 'fixed',
      autoSize: true,
      usePortrait: true,
      showCover: false,
      drawShadow: true,
      maxShadowOpacity: 0.42,
      flippingTime: reducedMotion() ? REDUCED_FLIP_MS : FLIP_MS,
      mobileScrollSupport: false,
      swipeDistance: 24,
      clickEventForward: true,
      useMouseEvents: true,
      showPageCorners: !reducedMotion(),
      disableFlipByClick: true,
      startPage: Math.min(startPage, pageEls.length - 1),
    });
    const ready = waitForEvent(flip, 'init');
    flip.loadFromHTML(pageEls);
    await ready;
    flip.on('flip', updateUi);
    flip.on('changeState', (e) => {
      if (e.data === 'flipping') sound.play('page', { volume: 0.75, rate: 0.92 + Math.random() * 0.16 });
    });
    updateUi();
  }

  function destroy() {
    if (!flip) return;
    try {
      flip.destroy();
    } catch (err) {
      console.warn('[parcel] page-flip cleanup:', err.message);
    }
    flip = null;
    mount.replaceChildren();
  }

  /** Turn one spread/page. Reduced motion jumps instead of animating. */
  function turn(direction) {
    if (!flip || flip.getState?.() === 'flipping') return;
    const target = flip.getCurrentPageIndex() + direction * (layout.mode === 'spread' ? 2 : 1);
    if (target < firstPage() || target > flip.getPageCount() - 1) return;
    if (reducedMotion()) {
      flip.turnToPage(target);
      sound.play('page', { volume: 0.5 });
      updateUi();
    } else if (direction > 0) {
      flip.flipNext('bottom');
    } else {
      flip.flipPrev('bottom');
    }
  }

  function goTo(edge) {
    if (!flip) return;
    flip.turnToPage(edge === 'start' ? firstPage() : flip.getPageCount() - 1);
    updateUi();
  }

  /** Copies of the currently visible pages, for the closing animation. */
  function snapshot() {
    const [a, b] = visibleIndexes();
    const clone = (i) => {
      if (i === undefined || !pageEls[i]) return null;
      const copy = pageEls[i].cloneNode(true);
      // Drop the flipbook's inline positioning so the copy fills the flyer page.
      copy.removeAttribute('style');
      copy.classList.remove('stf__item', '--simple', '--soft', '--hard');
      return copy;
    };
    return layout.mode === 'spread' ? { left: clone(a), right: clone(b) } : { left: null, right: clone(a) };
  }

  /** The pages shown right after the cover opens. */
  const openingPages = () => ({ left: pageEls[0].cloneNode(true), right: (pageEls[1] ?? pageEls[0]).cloneNode(true) });

  /** Re-paginate for a new layout and keep the reader's place. */
  async function relayout(newLayout) {
    if (!flip || !layout) return;
    const same = newLayout.mode === layout.mode && Math.abs(newLayout.pageWidth - layout.pageWidth) < 6
      && Math.abs(newLayout.pageHeight - layout.pageHeight) < 6;
    if (same) return;
    const firstVisible = visibleIndexes().find((i) => i >= 1 && i <= contentCount);
    const anchor = firstVisible ? pageBlocks[firstVisible - 1]?.[0]?.id : null;
    prepare(newLayout);
    const found = anchor ? pageBlocks.findIndex((blocks) => blocks.some((b) => b.id === anchor)) : -1;
    await show(found >= 0 ? found + 1 : firstPage());
  }

  return {
    load,
    prepare,
    show,
    destroy,
    next: () => turn(1),
    prev: () => turn(-1),
    goTo,
    snapshot,
    openingPages,
    relayout,
    isOpen: () => flip !== null,
    /** Show a friendly note instead of an empty reader. */
    showError(message) {
      const note = document.createElement('p');
      note.className = 'reader-error';
      note.textContent = message;
      mount.replaceChildren(note);
    },
    hasPlaceholders: () => sections.flat().some((b) => /\[placeholder/i.test(b.html ?? (b.items ?? []).join(' '))),
    get layout() { return layout; },
    onFlip: (fn) => listeners.flip.add(fn),
    /** For tests and debugging. */
    status: () => ({ open: flip !== null, visible: visibleIndexes(), pages: pageEls.length, content: contentCount, mode: layout?.mode }),
  };
}
