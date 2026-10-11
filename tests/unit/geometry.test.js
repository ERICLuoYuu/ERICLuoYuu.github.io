import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOX, CONTENTS, frameFor, tapeCorners, rimMagnification } from '../../js/scene/geometry.js';

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

test('photo, booklet and desiccant lie inside the walls without overlapping', () => {
  const inner = { left: 2, right: BOX.width - 2, top: 2, bottom: BOX.depth - 2 };
  const [photo, book, desiccant] = ['photo', 'book', 'desiccant'].map((k) => footprint(CONTENTS[k]));
  [photo, book, desiccant].forEach((b) => {
    assert.ok(b.left >= inner.left && b.right <= inner.right, 'inside the side walls');
    assert.ok(b.top >= inner.top && b.bottom <= inner.bottom, 'inside the front and back walls');
  });
  assert.ok(photo.right < book.left, 'the photo stays clear of the booklet');
  assert.ok(CONTENTS.photo.x + CONTENTS.photo.width / 2 < BOX.width / 2, 'the photo is on the left');
  assert.ok(desiccant.left > BOX.width * 0.75 && desiccant.top > BOX.depth * 0.6, 'the desiccant sits in the front-right corner');
});
