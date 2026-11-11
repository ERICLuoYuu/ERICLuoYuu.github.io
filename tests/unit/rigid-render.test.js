import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIGURINE, FOOD } from '../../js/scene/geometry.js';
import { partsFor } from '../../js/rigid/render.js';

const picture = (w, h) => ({ naturalWidth: w, naturalHeight: h });

function parts() {
  const defs = [FIGURINE, FOOD[0]];
  const pictures = defs.map((d) => picture(d.footprint[0] * 4, d.footprint[1] * 4));
  return partsFor({
    defs,
    images: pictures,
    reliefs: pictures,
    wraps: [{ image: pictures[0], relief: pictures[0], level: () => 0.5 }, null],
    samplers: defs.map(() => ({ shape: () => 0.5 })),
  }, (image) => image);
}

test("the figurine is shaded halfway: rounder than its photo alone, not lit over again like the food", () => {
  const [figurine, food] = parts();
  assert.ok(figurine.relight >= 0.4 && figurine.relight <= 0.6, `the scene relights the figurine's photo ${figurine.relight}`);
  assert.ok(figurine.sheen < food.sheen, 'matte: less gloss than the food');
  assert.equal(food.relight, 1);
  assert.equal(figurine.wrap.sheen > figurine.sheen, true, 'its clear bag still glints');
});
