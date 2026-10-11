import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOX, CONTENTS, BOOKS, baseOf, frameFor, tapeCorners, rimMagnification,
} from '../../js/scene/geometry.js';

const screens = [
  { width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 },
  { width: 844, height: 390 }, { width: 320, height: 568 },
];

test('the overhead view keeps the whole box rim on screen', () => {
  for (const s of screens) {
    const f = frameFor('overhead', s.width, s.height);
    const m = rimMagnification(f);
    assert.ok(BOX.width * f.zoom * m <= s.width, `rim width fits ${s.width}x${s.height}`);
    assert.ok(BOX.depth * f.zoom * m <= s.height, `rim depth fits ${s.width}x${s.height}`);
  }
});

test('the overhead view is a closer look than the three-quarter view', () => {
  for (const s of screens) {
    assert.ok(frameFor('overhead', s.width, s.height).zoom >= frameFor('threeQuarter', s.width, s.height).zoom * 0.95);
  }
});

test('perspective stays far enough away to avoid extreme distortion', () => {
  for (const s of screens) {
    for (const view of ['threeQuarter', 'overhead']) {
      assert.ok(rimMagnification(frameFor(view, s.width, s.height)) < 1.5, `${view} ${s.width}`);
    }
  }
});

test('tape corners run along the seam on top of the closed box', () => {
  const [tl, tr, br, bl] = tapeCorners();
  assert.equal(tr.x - tl.x, BOX.width);
  assert.equal(bl.y - tl.y, BOX.tapeWidth);
  assert.equal((tl.y + bl.y) / 2, BOX.depth / 2);
  assert.ok(tl.z > BOX.height && tl.z === br.z);
});

test('unknown views throw', () => {
  assert.throws(() => frameFor('sideways', 800, 600));
});

/** Axis-aligned bounds of a rotated rectangle lying on the floor. */
const footprint = ({ x, y, width, height, rotate }) => {
  const a = (rotate * Math.PI) / 180;
  const hx = Math.abs((width / 2) * Math.cos(a)) + Math.abs((height / 2) * Math.sin(a));
  const hy = Math.abs((width / 2) * Math.sin(a)) + Math.abs((height / 2) * Math.cos(a));
  const cx = x + width / 2;
  const cy = y + height / 2;
  return { left: cx - hx, right: cx + hx, top: cy - hy, bottom: cy + hy };
};

/** Corners of a rotated rectangle lying on the floor, as [x, y]. */
const corners = ({ x, y, width, height, rotate }) => {
  const a = (rotate * Math.PI) / 180;
  const [cx, cy] = [x + width / 2, y + height / 2];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => {
    const [u, v] = [(s * width) / 2, (t * height) / 2];
    return [cx + u * Math.cos(a) - v * Math.sin(a), cy + u * Math.sin(a) + v * Math.cos(a)];
  });
};
/** A floor point in a rectangle's own frame: (0, 0) at its top-left corner. */
const local = ([px, py], { x, y, width, height, rotate }) => {
  const a = (-rotate * Math.PI) / 180;
  const [dx, dy] = [px - x - width / 2, py - y - height / 2];
  return [dx * Math.cos(a) - dy * Math.sin(a) + width / 2, dx * Math.sin(a) + dy * Math.cos(a) + height / 2];
};
/** Do two rotated rectangles overlap (separating axis test)? */
const overlaps = (p, q) => {
  const [a, b] = [corners(p), corners(q)];
  return [a, b].every((shape) => shape.every((c, i) => {
    const next = shape[(i + 1) % 4];
    const axis = [c[1] - next[1], next[0] - c[0]];
    const span = (pts) => pts.map(([x, y]) => x * axis[0] + y * axis[1]);
    const [sa, sb] = [span(a), span(b)];
    return Math.max(...sa) >= Math.min(...sb) && Math.max(...sb) >= Math.min(...sa);
  }));
};

test('pack, booklet and desiccant lie inside the walls without overlapping', () => {
  const inner = { left: 2, right: BOX.width - 2, top: 2, bottom: BOX.depth - 2 };
  const [pack, book, desiccant] = ['pack', 'book', 'desiccant'].map((k) => footprint(CONTENTS[k]));
  [pack, book, desiccant].forEach((b) => {
    assert.ok(b.left >= inner.left && b.right <= inner.right, 'inside the side walls');
    assert.ok(b.top >= inner.top && b.bottom <= inner.bottom, 'inside the front and back walls');
  });
  assert.ok(pack.right < book.left && pack.right < desiccant.left, 'the pack stays clear of the rest');
});

test('the pack lies square along the left wall, the full depth of the box', () => {
  const { x, y, width, height, rotate } = CONTENTS.pack;
  assert.equal(rotate, 0);
  assert.ok(x - 2 <= 6, `${x - 2} units from the left wall`);
  assert.ok(y >= 2 && y + height <= BOX.depth - 2, 'between the back and front walls');
  assert.ok(height >= 0.95 * (BOX.depth - 4), `${height} of ${BOX.depth - 4} units deep`);
  assert.ok(Math.abs(width / height - 747 / 1200) < 0.01, 'the picture keeps its proportions (747 × 1200)');
});

test('the booklet lies in the upper right, where the pile goes', () => {
  const book = footprint(CONTENTS.book);
  assert.ok(book.left >= 195 && book.bottom <= 165, `booklet from x ${book.left.toFixed(0)}, down to y ${book.bottom.toFixed(0)}`);
  assert.deepEqual([CONTENTS.book.width, CONTENTS.book.height], [96, 134], 'the old booklet, smaller, same proportions');
});

test('the books lie in the lower-right quarter, on the floor or on another book', () => {
  BOOKS.forEach((b) => {
    const f = footprint(b);
    assert.ok(f.left >= 195 && f.right <= BOX.width - 2 && f.top >= 158 && f.bottom <= BOX.depth - 2, `${b.id} in the lower right`);
  });
  const onFloor = [{ ...CONTENTS.book, id: 'booklet' }, { ...CONTENTS.pack, id: 'pack' }, ...BOOKS.filter((b) => !b.on)];
  onFloor.forEach((a, i) => onFloor.slice(i + 1).forEach((b) => assert.ok(!overlaps(a, b), `${a.id} and ${b.id} overlap`)));
});

test('what lies on a book lies within its cover, at its height', () => {
  BOOKS.filter((b) => b.on).forEach((item) => {
    const below = BOOKS.find((b) => b.id === item.on);
    corners(item).forEach((p) => {
      const [u, v] = local(p, below);
      assert.ok(u >= 0 && u <= below.width && v >= 0 && v <= below.height, `${item.id} lies on ${below.id}`);
    });
    assert.equal(baseOf(item), baseOf(below) + below.thickness);
  });
  assert.equal(baseOf(CONTENTS.book), 0);
  assert.throws(() => baseOf({ on: 'nowhere' }), /nowhere/);
});

test('the desiccant packet lies small, on the floor, in the front-right corner', () => {
  const packet = { ...CONTENTS.desiccant, id: 'desiccant' };
  const f = footprint(packet);
  assert.equal(baseOf(packet), 0, 'on the floor');
  assert.ok(packet.width <= 26 && packet.height <= 36, 'about the size of a real packet beside the books');
  assert.ok(f.right >= BOX.width - 10 && f.bottom >= BOX.depth - 10, 'tucked into the corner');
  [...BOOKS, { ...CONTENTS.book, id: 'booklet' }, { ...CONTENTS.pack, id: 'pack' }]
    .forEach((b) => assert.ok(!overlaps(packet, b), `clear of ${b.id}`));
});
