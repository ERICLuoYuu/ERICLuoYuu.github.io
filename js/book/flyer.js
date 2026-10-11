/**
 * The "flying" book: a stand-in that lifts the closed book out of the box,
 * zooms it to reading size, swings the hard cover open, and later reverses
 * all of that. It hands over to the real flipbook at identical geometry, so
 * the switch is invisible. (StPageFlip itself must never be CSS-scaled.)
 */

const EASE = 'cubic-bezier(.45,.05,.2,1)';
const COVER_EASE = 'cubic-bezier(.42,.02,.24,1)';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Translate/rotate/scale that places the reading-size book over a screen quad. */
function placeOver(quad, layout) {
  const [tl, tr, br, bl] = quad;
  const cx = (tl.x + tr.x + br.x + bl.x) / 4;
  const cy = (tl.y + tr.y + br.y + bl.y) / 4;
  return {
    dx: cx - innerWidth / 2,
    dy: cy - innerHeight / 2,
    angle: (Math.atan2(tr.y - tl.y, tr.x - tl.x) * 180) / Math.PI,
    sx: (dist(tl, tr) + dist(bl, br)) / 2 / layout.pageWidth,
    sy: (dist(tl, bl) + dist(tr, br)) / 2 / layout.pageHeight,
  };
}

const tf = ({ dx = 0, dy = 0, angle = 0, sx = 1, sy = 1 }) => `translate(${dx}px, ${dy}px) rotate(${angle}deg) scale(${sx}, ${sy})`;
const AT_REST = tf({});

function h(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

export function createFlyer({ root, text }) {
  const pos = h('div', 'flyer-pos');
  const shadow = h('div', 'flyer-shadow');
  const book = h('div', 'flyer-book');
  const block = h('div', 'flyer-block');
  const right = h('div', 'flyer-right');
  const leaf = h('div', 'flyer-leaf');
  const front = h('div', 'leaf-front');
  const back = h('div', 'leaf-back');
  const title = h('span', 'flyer-title');
  title.textContent = text.bookTitle;
  front.append(title, h('span', 'leaf-shade'));
  back.append(h('span', 'leaf-shade'));
  leaf.append(front, back);
  book.append(block, right, leaf);
  pos.append(shadow, book);
  root.append(pos);

  let running = [];
  const run = (el, keyframes, options) => {
    const anim = el.animate(keyframes, { fill: 'forwards', ...options });
    running.push(anim);
    return anim.finished;
  };
  const clear = () => {
    running.forEach((a) => a.cancel());
    running = [];
  };
  /**
   * Fade the cover's two faces. Opacity goes on the flat faces, never on the
   * 3D leaf itself: opacity on a preserve-3d element flattens it, and the
   * back of the cover would then show the front, mirrored.
   */
  const fadeFaces = (values, duration) => Promise.all(
    [front, back].map((face) => run(face, values.map((opacity) => ({ opacity })), { duration })),
  );

  let currentLayout = null;
  const setLayout = (layout) => {
    currentLayout = layout;
    root.dataset.mode = layout.mode;
    Object.assign(pos.style, {
      width: `${layout.pageWidth}px`,
      height: `${layout.pageHeight}px`,
      left: `${(innerWidth - layout.pageWidth) / 2}px`,
      top: `${(innerHeight - layout.pageHeight) / 2}px`,
    });
  };

  const setPages = ({ left, right: rightPage }) => {
    back.replaceChildren(...[left, h('span', 'leaf-shade')].filter(Boolean));
    right.replaceChildren(...[rightPage].filter(Boolean));
  };

  const show = () => { root.hidden = false; };
  const hide = () => {
    root.hidden = true;
    clear();
  };

  const openShift = () => (currentLayout.mode === 'spread' ? currentLayout.pageWidth / 2 : 0);

  /** Lift the closed book from its place in the box to the middle of the screen. */
  async function lift(quad, layout, { reduced }) {
    clear();
    setLayout(layout);
    show();
    if (reduced) {
      await run(pos, [{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
      return;
    }
    const start = placeOver(quad, layout);
    const raised = { ...start, sx: start.sx * 1.07, sy: start.sy * 1.07, dy: start.dy - 18 };
    await Promise.all([
      run(pos, [
        { transform: tf(start), offset: 0 },
        { transform: tf(raised), offset: 0.22 },
        { transform: AT_REST, offset: 1 },
      ], { duration: 1150, easing: EASE }),
      run(shadow, [
        { opacity: 0.35, transform: 'translate(4px, 6px) scale(1)' },
        { opacity: 0.55, transform: 'translate(14px, 30px) scale(1.04)', offset: 0.3 },
        { opacity: 0.5, transform: 'translate(10px, 22px) scale(1.02)' },
      ], { duration: 1150, easing: EASE }),
    ]);
  }

  /** Swing the cover open (to the left) and slide the spread to centre. */
  async function openCover({ reduced }) {
    const shift = openShift();
    if (reduced) {
      if (currentLayout.mode === 'single') fadeFaces([0], 0);
      await Promise.all([
        run(leaf, [{ transform: 'translateZ(1px) rotateY(-180deg)' }], { duration: 0 }),
        run(book, [{ transform: `translateX(${shift}px)` }], { duration: 0 }),
      ]);
      return;
    }
    const single = currentLayout.mode === 'single';
    await Promise.all([
      run(leaf, [
        { transform: 'translateZ(1px) rotateY(0deg)' },
        { transform: 'translateZ(1px) rotateY(-180deg)' },
      ], { duration: 1100, easing: COVER_EASE }),
      run(book, [{ transform: 'translateX(0px)' }, { transform: `translateX(${shift}px)` }], { duration: 1100, easing: COVER_EASE }),
      ...[...root.querySelectorAll('.leaf-shade')].map((s) => run(s, [{ opacity: 0 }, { opacity: 0.32, offset: 0.5 }, { opacity: 0 }], { duration: 1100 })),
      // One page at a time: the opened cover slips away instead of lying beside the page.
      single ? fadeFaces([1, 1, 0], 1100) : null,
    ]);
  }

  /** Close the cover over the current pages. */
  async function closeCover({ reduced }) {
    const shift = openShift();
    const single = currentLayout.mode === 'single';
    show();
    if (reduced) {
      clear();
      return;
    }
    await Promise.all([
      run(leaf, [
        { transform: 'translateZ(1px) rotateY(-180deg)' },
        { transform: 'translateZ(1px) rotateY(0deg)' },
      ], { duration: 950, easing: COVER_EASE }),
      single ? fadeFaces([0, 1, 1], 950) : null,
      run(book, [{ transform: `translateX(${shift}px)` }, { transform: 'translateX(0px)' }], { duration: 950, easing: COVER_EASE }),
    ]);
  }

  /** Put the closed book back at its place in the box. */
  async function land(quad, { reduced }) {
    if (reduced) {
      await run(pos, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
      return;
    }
    const end = placeOver(quad, currentLayout);
    const raised = { ...end, sx: end.sx * 1.07, sy: end.sy * 1.07, dy: end.dy - 18 };
    await Promise.all([
      run(pos, [
        { transform: AT_REST },
        { transform: tf(raised), offset: 0.8 },
        { transform: tf(end) },
      ], { duration: 1050, easing: EASE }),
      run(shadow, [
        { opacity: 0.5, transform: 'translate(10px, 22px) scale(1.02)' },
        { opacity: 0.3, transform: 'translate(4px, 6px) scale(1)' },
      ], { duration: 1050, easing: EASE }),
    ]);
  }

  /** Start in the open position (used before closing). */
  function showOpen(layout, pages) {
    clear();
    setLayout(layout);
    setPages(pages);
    run(leaf, [{ transform: 'translateZ(1px) rotateY(-180deg)' }], { duration: 0 });
    if (layout.mode === 'single') fadeFaces([0], 0);
    run(book, [{ transform: `translateX(${openShift()}px)` }], { duration: 0 });
    show();
  }

  return { lift, openCover, closeCover, land, setPages, showOpen, show, hide, setLayout };
}
