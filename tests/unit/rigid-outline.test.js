import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportUnder } from '../../js/cloth/grip.js';
import { boxColliders } from '../../js/scene/solids.js';
import { FIGURINE, FOOD } from '../../js/scene/geometry.js';
import { createBody, withPosition, bodyCollider } from '../../js/rigid/body.js';
import { outlineOf, outlineCovers } from '../../js/rigid/outline.js';
import { supportOf } from '../../js/rigid/rest.js';

const NO_CLOTH = { count: 0 };
const ROUND = (u, v) => ((u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.25 ? 1 : 0);
const SOLID = () => 1;

test("an outline is where the picture is opaque: a round picture's edge lies on its circle", () => {
  const outline = outlineOf(FOOD[3], ROUND);
  const r = FOOD[3].footprint[0] / 2;
  const radii = [];
  for (let k = 0; k < outline.edge.length; k += 2) radii.push(Math.hypot(outline.edge[k], outline.edge[k + 1]));
  assert.ok(radii.length > 50, `${radii.length} edge points`);
  assert.ok(radii.every((d) => Math.abs(d - r) <= 0.75), `edge from ${Math.min(...radii)} to ${Math.max(...radii)}, circle ${r}`);
  const bowl = createBody({ ...FOOD[3], outline });
  const [cx, cy] = FOOD[3].start;
  assert.ok(outlineCovers(bowl, [cx, cy]) && outlineCovers(bowl, [cx + r - 1, cy]));
  assert.ok(!outlineCovers(bowl, [cx + r - 1, cy + r - 1]), 'a transparent corner is not part of it');
  assert.ok(outlineCovers(bowl, [cx + r + 0.5, cy], 1) && !outlineCovers(bowl, [cx + r + 2, cy], 1), 'grown by a reach');
});

test('the highest point under an outline, found along its edge and at the colliders\' corners, matches a dense search', () => {
  const colliders = [
    ...boxColliders(),
    bodyCollider(withPosition(createBody(FOOD[0]), [200, 120, 0])),
    bodyCollider(withPosition(createBody(FOOD[2]), [60, 240, 0])),
  ];
  const STEEPEST = 2.1; // the steepest flap's rise per unit across
  // [def, picture, dense spacing, spots across x and y]
  const bodies = [
    [FIGURINE, SOLID, 1, [60, 360, 100], [150, 150, 1]],
    [FOOD[3], ROUND, 0.5, [-90, 520, 61], [-80, 390, 47]],
    [FOOD[1], SOLID, 0.5, [-90, 520, 61], [-80, 390, 47]],
    [{ ...FOOD[1], rotate: 30 }, SOLID, 0.5, [-90, 520, 61], [-80, 390, 47]], // no body turns yet, but one may
  ];
  let spots = 0;
  bodies.forEach(([def, alpha, step, [x0, x1, dx], [y0, y1, dy]]) => {
    const body = createBody({ ...def, outline: outlineOf(def, alpha) });
    const [w, d] = def.footprint;
    const [c, s] = [Math.cos, Math.sin].map((f) => Math.abs(f(((def.rotate ?? 0) * Math.PI) / 180)));
    const [hx, hy] = [c * w + s * d, s * w + c * d].map((v) => v / 2 + 1); // the turned footprint's box, and a little more
    for (let x = x0; x <= x1; x += dx) {
      for (let y = y0; y <= y1; y += dy) {
        const at = withPosition(body, [x, y, 0]);
        const [inside, near] = [[], []];
        for (let i = 0; i <= (2 * hx) / step; i += 1) {
          for (let j = 0; j <= (2 * hy) / step; j += 1) {
            const p = [x - hx + i * step, y - hy + j * step];
            if (outlineCovers(at, p)) inside.push(p);
            if (outlineCovers(at, p, step)) near.push(p);
          }
        }
        // The dense search can miss a sliver thinner than its step, but not over the outline grown by a step;
        // there it can still fall up to a step short of a slope's highest edge.
        const [least, most] = [inside, near].map((points) => supportUnder(NO_CLOTH, colliders, points, { reach: 0 }));
        const found = supportOf(at, [x, y], { world: NO_CLOTH, colliders, moving: false });
        assert.ok(found >= least - 0.01, `${def.id} at ${x}, ${y} misses a support: ${found} against ${least}`);
        assert.ok(found <= most + STEEPEST * step + 0.01, `${def.id} at ${x}, ${y} invents one: ${found}, though within a step of it lies only ${most}`);
        spots += 1;
      }
    }
  });
  assert.ok(spots > 300, `${spots} spots`);
});
