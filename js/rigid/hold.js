/**
 * The visitor's hand for rigid bodies: the figurine and the food. It holds
 * one body at a time and only ever moves it — the body never turns, tips or
 * bends. Like the cloth hand (js/cloth/hand.js) it carries what it holds LIFT
 * above whatever lies beneath, rising at once over anything taller and
 * sinking back smoothly afterwards, either following the pointer or on a
 * keyboard carry. Pure — no DOM; the controller passes in the pointer's line
 * of sight, the viewport and what lies beneath a footprint.
 */

import { onPlane } from '../cloth/grip.js';
import { BOX } from '../scene/geometry.js';
import { WALL } from '../scene/solids.js';
import { withPosition, footprintCorners } from './body.js';

export const LIFT = 12; // held just clear of what lies beneath, as the cloth hand holds a garment
export const SCREEN_MARGIN = 24; // px: the pointer is followed only this far inside the screen's edge
export const LOWER_RATE = 5; // per second: how quickly the hand sinks back after clearing something tall
export const AIR = 0.5; // a body kept inside the box keeps this much air between itself and a wall
export const REACH = Object.freeze({ min: [-600, -500], max: [1100, 900] }); // where the hand may carry a body

const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** A centre for `body` moved just far enough that its whole footprint stays inside the walls. */
export function keepInside(body, [x, y]) {
  const corners = footprintCorners(withPosition(body, [x, y, 0]), { inset: 0 });
  const [xs, ys] = [0, 1].map((k) => corners.map((c) => c[k]));
  const margin = WALL + AIR;
  const shift = (lo, hi, size) => Math.max(0, margin - lo) + Math.min(0, size - margin - hi);
  return [x + shift(Math.min(...xs), Math.max(...xs), BOX.width), y + shift(Math.min(...ys), Math.max(...ys), BOX.depth)];
}

/**
 * @param {{ray: (sx: number, sy: number) => {origin: number[], dir: number[]},
 *          viewport: () => {width: number, height: number},
 *          supportAt: (body: object, xy: number[]) => number}} options
 *   supportAt: what `body`, at the height it is held, would rest on were it centred at xy
 *   (rest.supportOf in the hand's view: neither cloth that moves nor the bodies lying on it count).
 */
export function createRigidHand({ ray, viewport, supportAt }) {
  let held = null; // { body, offset: [dx, dy, dz], height, want, xy, sx, sy, script }

  /** Where the body's centre goes for (x, y): inside the walls if it must stay there, within reach. */
  function confine([x, y]) {
    const [cx, cy] = held.body.keepIn ? keepInside(held.body, [x, y]) : [x, y];
    return [clamp(cx, REACH.min[0], REACH.max[0]), clamp(cy, REACH.min[1], REACH.max[1])];
  }

  /** What lies beneath the held body, were it centred at xy at the height it is held. */
  const beneath = (xy) => supportAt(withPosition(held.body, [...xy, held.height]), xy);

  /** The centre for (x, y), the hand rising at once if what lies beneath wants it higher. */
  function moveTo(point) {
    const xy = confine(point);
    const want = beneath(xy) + LIFT;
    if (want > held.height) held.height = want;
    held.want = want;
    held.xy = xy;
  }

  /** Put the body where the pointer's line of sight meets the grab point's height. */
  function aim() {
    const sight = ray(held.sx, held.sy);
    const centreOn = (z) => {
      const p = onPlane(sight, z + held.offset[2]);
      return p && confine([p[0] - held.offset[0], p[1] - held.offset[1]]);
    };
    let xy = centreOn(held.height);
    if (!xy) return;
    const want = beneath(xy) + LIFT;
    if (want > held.height) {
      held.height = want;
      xy = centreOn(want) ?? xy;
    }
    held.want = want;
    held.xy = xy;
  }

  /** Let go at once, whatever the hand was doing; a carry in progress resolves. */
  function drop() {
    if (!held) return;
    const done = held.script?.done;
    held = null;
    done?.();
  }

  function take(body, point) {
    drop();
    const [x, y, z] = body.position;
    held = {
      body,
      offset: [point[0] - x, point[1] - y, point[2] - z],
      height: z,
      want: z,
      xy: [x, y],
      sx: 0,
      sy: 0,
      script: null,
    };
  }

  return {
    /** The id of the body being held, or null. */
    get id() { return held ? held.body.id : null; },

    /** Pick up `body` by the parcel point `point` on it, with the pointer at screen point (sx, sy). */
    grab(body, point, sx, sy) {
      take(body, point);
      held.sx = sx;
      held.sy = sy;
      aim();
    },

    /** Follow the pointer, kept SCREEN_MARGIN inside the screen so nothing is carried out of sight. */
    dragTo(sx, sy) {
      if (!held || held.script) return;
      const { width, height } = viewport();
      held.sx = clamp(sx, SCREEN_MARGIN, width - SCREEN_MARGIN);
      held.sy = clamp(sy, SCREEN_MARGIN, height - SCREEN_MARGIN);
      aim();
    },

    /** The pointer lets go: the body stays where it is and comes to rest from there. */
    release() {
      if (!held || held.script) return;
      drop();
    },

    drop,

    /** Lift `body`, carry it in a straight line to centre (x, y) and let go there. Resolves on letting go. */
    carry(body, to, { duration }) {
      return new Promise((resolve) => {
        take(body, [...body.position.slice(0, 2), body.position[2] + body.height]);
        held.script = { from: held.xy, to: confine(to), duration: Math.max(duration, 1e-3), t: 0, arrived: false, done: resolve };
        moveTo(held.xy);
      });
    },

    /**
     * One animation frame. Following the pointer, the hand sinks back after
     * clearing something tall and re-aims (the view may have moved under a
     * still pointer). On a carry it moves on along its path; once the body
     * has been put at the end, it lets go.
     */
    advance(elapsed) {
      if (!held) return;
      if (held.height > held.want + 0.01) held.height -= (held.height - held.want) * Math.min(1, elapsed * LOWER_RATE);
      const { script } = held;
      if (!script) {
        aim();
        return;
      }
      if (script.arrived) {
        drop();
        return;
      }
      script.t += elapsed;
      const k = smooth(Math.min(1, script.t / script.duration));
      moveTo(script.from.map((v, c) => v + (script.to[c] - v) * k));
      script.arrived = script.t >= script.duration;
    },

    /** `body` where the hand holds it, if it is the held one; any other body comes back unchanged. */
    place(body) {
      if (!held || body.id !== held.body.id) return body;
      return withPosition(body, [...held.xy, held.height]);
    },
  };
}
