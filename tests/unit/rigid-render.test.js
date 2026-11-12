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

test("the figurine shows its photo's own light: not lit over again, nor shadowed on itself, unlike the food", () => {
  const [figurine, food] = parts();
  assert.equal(figurine.relight, 0, "the photo's sunlight is its shading");
  assert.equal(figurine.shadowed, false, 'the photo already has its shadows');
  assert.equal(food.relight, 1);
  assert.equal(food.shadowed, true);
  assert.equal(figurine.lodBias, -1, 'its small face sampled from the sharper picture level');
  assert.equal(food.lodBias, 0);
  assert.equal(figurine.sheen, 0, 'on its level top a gloss is no highlight, only a veil over the whole photo');
  assert.equal(figurine.wrap.sheen > figurine.sheen, true, 'its clear bag still glints');
});

test("the figurine's contact shadow spreads past its outline, so its pale edge stands out from the pale floor; the food's is as it was", () => {
  const [figurine, food] = parts();
  assert.deepEqual(food.contact, { grow: 1.5, alpha: 0.55 });
  assert.ok(figurine.contact.grow >= 3 * food.contact.grow, `the figurine's spreads ${figurine.contact.grow} units`);
  assert.ok(figurine.contact.alpha >= food.contact.alpha);
  assert.equal(figurine.wrap.contact, undefined, 'its clear bag casts no contact shadow of its own');
});
