import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOX, CONTENTS, BOOKS, VIEWS, baseOf, frameFor, tapeCorners, rimMagnification,
} from '../../js/scene/geometry.js';
import { projectPoint } from '../../js/scene/projection.js';

const screens = [
  { width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 },
  { width: 844, height: 390 }, { width: 320, height: 568 },
];

test('the overhead view looks down at a slight tilt', () => {
  assert.equal(VIEWS.overhead.tilt, 14);
});

test('tilted, the overhead view keeps the whole rim on screen and centred', () => {
  const rim = [[0, 0], [BOX.width, 0], [BOX.width, BOX.depth], [0, BOX.depth]];
  for (const s of screens) {
    const f = frameFor('overhead', s.width, s.height);
    const points = rim.map(([x, y]) => projectPoint(f, s, [x, y, BOX.height]));
    points.forEach(({ x, y }) => {
      assert.ok(x >= 0 && x <= s.width, `x ${x.toFixed(0)} on ${s.width}x${s.height}`);
      assert.ok(y >= 48 && y <= s.height - 48, `y ${y.toFixed(0)} on ${s.width}x${s.height}`);
    });
    const ys = points.map((p) => p.y);
    assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - s.height / 2) <= 2, `centred on ${s.width}x${s.height}`);
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

test('the booklet and the desiccant lie inside the walls', () => {
  const inner = { left: 2, right: BOX.width - 2, top: 2, bottom: BOX.depth - 2 };
  ['book', 'desiccant'].map((k) => footprint(CONTENTS[k])).forEach((b) => {
    assert.ok(b.left >= inner.left && b.right <= inner.right, 'inside the side walls');
    assert.ok(b.top >= inner.top && b.bottom <= inner.bottom, 'inside the front and back walls');
  });
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
  const onFloor = [{ ...CONTENTS.book, id: 'booklet' }, ...BOOKS.filter((b) => !b.on)];
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
  [...BOOKS, { ...CONTENTS.book, id: 'booklet' }]
    .forEach((b) => assert.ok(!overlaps(packet, b), `clear of ${b.id}`));
});
