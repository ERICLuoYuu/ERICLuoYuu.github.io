/**
 * Where a rigid body rests. A body that is not held never moves sideways:
 * each frame it lies level on the highest thing beneath its footprint — the
 * floor or the table (0), the walls, flaps and books, other bodies, cloth —
 * and when that support goes it falls straight down onto the next one, with
 * the clothes' gravity. Pure — no DOM.
 */

import { supportUnder } from '../cloth/grip.js';
import { DEFAULTS } from '../cloth/solver.js';
import { footprintPoints, withPosition } from './body.js';
import { rotateZ } from '../scene/geometry.js';

const REACH = 1; // a collider counts from this far beyond the footprint
// Collider tops are sampled this far apart: under the 4 units a 2-thick wall
// spans with its reach either side, so a footprint never steps over a wall.
const SPACING = 3;
const NO_CLOTH = Object.freeze({ count: 0 });
const SETTLED = 0.01;

/** Could collider c reach the body's footprint? (A cheap test on bounding circles, before sampling.) */
function mayReach({ center, axes, half }, { position: [x, y], footprint: [w, d] }) {
  const spread = axes.reduce((r, a, k) => r + half[k] * Math.hypot(a[0], a[1]), 0);
  return Math.hypot(center[0] - x, center[1] - y) <= spread + Math.hypot(w, d) / 2 + REACH;
}

/**
 * The highest cloth surface under the body's inset footprint (grown by REACH):
 * a particle's centre plus a thickness, as grip.supportUnder counts cloth.
 * Only cloth below the body's middle holds it up: cloth lying on top of it
 * does not. With `moving: false`, cloth that is awake does not count either.
 */
function clothTop(world, body, moving) {
  if (!world.count) return 0;
  const { pos, garmentOf, thickness, awake } = world;
  const [cx, cy, z] = body.position;
  const [hw, hd] = body.footprint.map((v) => (v / 2) * (1 - body.inset) + REACH);
  const middle = z + body.height / 2;
  let top = 0;
  for (let i = 0; i < world.count; i += 1) {
    const pz = pos[3 * i + 2];
    if (pz >= middle || pz + thickness <= top || (!moving && awake[garmentOf[i]])) continue;
    const [lx, ly] = rotateZ([pos[3 * i] - cx, pos[3 * i + 1] - cy, 0], -body.rotate);
    if (Math.abs(lx) <= hw && Math.abs(ly) <= hd) top = pz + thickness;
  }
  return top;
}

/**
 * The support under `body` were it centred at (x, y): the highest collider
 * top or cloth surface beneath its inset footprint, never its own collider.
 */
export function supportOf(body, [x, y], { world, colliders, moving = true }) {
  const at = withPosition(body, [x, y, body.position[2]]);
  const own = `body:${body.id}`;
  const near = colliders.filter((c) => c.name !== own && mayReach(c, at));
  const solid = near.length > 0 ? supportUnder(NO_CLOTH, near, footprintPoints(at, SPACING), { reach: REACH }) : 0;
  return Math.max(solid, clothTop(world, at, moving));
}

/**
 * One frame for a body that is not held: above its support it falls (it
 * lands level, at rest); at or below it, it stands on it. x and y never
 * change. A body already resting there comes back as the very same record.
 */
export function settle(body, support, dt) {
  const [x, y, z] = body.position;
  if (z <= support) return z === support && body.vz === 0 ? body : withPosition(body, [x, y, support], 0);
  const vz = body.vz + DEFAULTS.gravity * dt;
  const next = z + vz * dt;
  return next <= support ? withPosition(body, [x, y, support], 0) : withPosition(body, [x, y, next], vz);
}

/** Is the body lying still on `support`? */
export function isResting(body, support) {
  return Math.abs(body.position[2] - support) < SETTLED && body.vz === 0;
}
