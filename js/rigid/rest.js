/**
 * Where a rigid body rests. A body that is not held never moves sideways:
 * each frame it lies level on the highest thing beneath its outline (where
 * its picture is opaque, js/rigid/outline.js) — the floor or the table (0),
 * the walls, flaps and books, other bodies, cloth — and when that support
 * goes it falls straight down onto the next one, with the clothes' gravity.
 * Pure — no DOM.
 */

import { boxTop } from '../cloth/grip.js';
import { DEFAULTS } from '../cloth/solver.js';
import { withPosition } from './body.js';
import { outlineFor, coversLocal } from './outline.js';
import { rotateZ } from '../scene/geometry.js';

const REACH = 1; // cloth counts from this far beyond the outline; a collider only where it lies beneath it
const SETTLED = 0.01;
const BODY = 'body:'; // the colliders of other bodies are named body:<id>
const NONE = Object.freeze([]);
const NUDGE = 1e-6; // a collider's corner is sampled this little way in from it

/** Could collider c reach the body's footprint? (A cheap test on bounding circles, before sampling.) */
function mayReach({ center, axes, half }, { position: [x, y], footprint: [w, d] }) {
  const spread = axes.reduce((r, a, k) => r + half[k] * Math.hypot(a[0], a[1]), 0);
  return Math.hypot(center[0] - x, center[1] - y) <= spread + Math.hypot(w, d) / 2 + REACH;
}

/** The lowest point of an oriented box. */
const bottomOf = ({ center, axes, half }) => center[2] - axes.reduce((s, a, k) => s + half[k] * Math.abs(a[2]), 0);

/** Collider c in the body's own frame: from the body's centre, turned back by its rotation. */
function toLocal({ center, axes, half }, { position: [x, y], rotate }) {
  const turn = (v) => rotateZ(v, -rotate);
  const [lx, ly] = turn([center[0] - x, center[1] - y, 0]);
  return { center: [lx, ly, center[2]], axes: axes.map(turn), half };
}

/**
 * The top of collider c (in the body's own frame) beneath the outline, or −∞
 * where none of it is. A collider's top is flat or planar over each of its
 * faces, so its highest point beneath the outline lies on the outline's edge
 * or at one of its own corners inside the outline: only those are sampled.
 * The edge's points lie half a unit apart, closer than any wall is thick.
 */
function topUnder(c, outline) {
  const { center, axes, half } = c;
  const [sx, sy] = [0, 1].map((xy) => axes.reduce((s, a, k) => s + half[k] * Math.abs(a[xy]), 0));
  const { edge, footprint: [w, d] } = outline;
  if (Math.abs(center[0]) > sx + w / 2 || Math.abs(center[1]) > sy + d / 2) return -Infinity; // nowhere near the footprint
  let top = -Infinity;
  for (let k = 0; k < edge.length; k += 2) {
    if (Math.abs(edge[k] - center[0]) <= sx && Math.abs(edge[k + 1] - center[1]) <= sy) top = Math.max(top, boxTop(c, edge[k], edge[k + 1], 0));
  }
  for (let n = 0; n < 8; n += 1) {
    const signs = [n & 1, n & 2, n & 4].map((bit) => (bit ? 1 : -1));
    const [x, y] = [0, 1].map((xy) => center[xy] + axes.reduce((s, a, k) => s + signs[k] * half[k] * a[xy], 0));
    if (coversLocal(outline, x, y)) top = Math.max(top, boxTop(c, x + (center[0] - x) * NUDGE, y + (center[1] - y) * NUDGE, 0));
  }
  return top;
}

/**
 * The highest cloth surface beneath the body's outline (grown by REACH): a
 * particle's centre plus a thickness, as grip.supportUnder counts cloth.
 * Only cloth below `middle` counts. In the hand's view (`moving: false`)
 * cloth that is awake does not count either: cloth that lay on the held body
 * was woken when it was picked up.
 */
function clothTop(world, body, outline, moving, middle) {
  if (!world.count) return 0;
  const { pos, garmentOf, thickness, awake } = world;
  const [cx, cy] = body.position;
  const radius = Math.hypot(...body.footprint) / 2 + REACH;
  let top = 0;
  for (let i = 0; i < world.count; i += 1) {
    const pz = pos[3 * i + 2];
    if (pz >= middle || pz + thickness <= top || (!moving && awake[garmentOf[i]])) continue;
    const [dx, dy] = [pos[3 * i] - cx, pos[3 * i + 1] - cy];
    if (Math.abs(dx) > radius || Math.abs(dy) > radius) continue;
    const [lx, ly] = rotateZ([dx, dy, 0], -body.rotate);
    if (coversLocal(outline, lx, ly, REACH)) top = pz + thickness;
  }
  return top;
}

/**
 * Where `body` would rest were it centred at (x, y): `support`, the highest
 * collider top or cloth surface beneath its outline, never its own collider;
 * and `under`, the other bodies among what holds it up.
 *
 * Resting (`moving: true`), what lies below the body's middle holds it up,
 * and so do the bodies in `under` (what it rested on last frame), however
 * high they are lifted: what lies on a lifted body rides up with it. Cloth
 * lying on top of the body, or a body held above it, does not. In the hand's
 * view (`moving: false`) everything beneath the held body counts, however
 * high, except the bodies lying on it.
 */
export function restingOn(body, [x, y], { world, colliders, moving = true, under = NONE }) {
  const at = withPosition(body, [x, y, body.position[2]]);
  const outline = outlineFor(body);
  const own = `${BODY}${body.id}`;
  const middle = moving ? at.position[2] + body.height / 2 : Infinity;
  const top = at.position[2] + body.height;
  let support = 0;
  const holding = [];
  colliders.forEach((c) => {
    const isBody = c.name.startsWith(BODY);
    if (c.name === own || !mayReach(c, at) || (!moving && isBody && bottomOf(c) >= top - SETTLED)) return;
    const t = topUnder(toLocal(c, at), outline);
    if (t === -Infinity || (t > middle && !under.includes(c.name))) return;
    support = Math.max(support, t);
    if (isBody) holding.push(c.name);
  });
  return {
    support: Math.max(support, clothTop(world, at, outline, moving, middle)),
    under: holding.length > 0 ? Object.freeze(holding) : NONE,
  };
}

/** The support alone (see restingOn). */
export const supportOf = (body, xy, options) => restingOn(body, xy, options).support;

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

/**
 * The garments resting on `body`: those with a core particle over its inset
 * footprint, higher than a thickness below its top. When the body moves
 * away, they must wake and fall.
 */
export function clothOn(world, body) {
  const { pos, garmentOf, core, thickness } = world;
  const [cx, cy, z] = body.position;
  const [hw, hd] = body.footprint.map((v) => (v / 2) * (1 - body.inset));
  const above = z + body.height - thickness;
  const found = new Set();
  for (let i = 0; i < world.count; i += 1) {
    if ((core && !core[i]) || pos[3 * i + 2] <= above || found.has(garmentOf[i])) continue;
    const [lx, ly] = rotateZ([pos[3 * i] - cx, pos[3 * i + 1] - cy, 0], -body.rotate);
    if (Math.abs(lx) <= hw && Math.abs(ly) <= hd) found.add(garmentOf[i]);
  }
  return [...found].sort((a, b) => a - b);
}
