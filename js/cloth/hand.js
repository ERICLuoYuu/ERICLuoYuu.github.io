/**
 * The visitor's hand. It holds one garment at a time and carries it, either
 * following the pointer or along a scripted path: a keyboard move, or the
 * short toss that takes a garment clear of the rim when it is let go
 * outside the box. Pure — no DOM; the layer passes in `ray(sx, sy)`, the
 * pointer's line of sight for a screen point.
 *
 * The hand rides a horizontal plane LIFT units above whatever lies beneath
 * it (grip.js), rising at once when something taller passes underneath and
 * sinking back smoothly afterwards.
 */

import {
  grab as hold, moveGrip, release as letGo, centroid, setPositions, wake,
} from './solver.js';
import { supportHeight, gripCluster, onPlane } from './grip.js';
import { BOX } from '../scene/geometry.js';

const LIFT = 45; // the hand holds cloth this far above what lies beneath
const MIN_HEIGHT = 60;
const LOWER_RATE = 5; // per second: how quickly the hand sinks back after clearing something tall
const GRIP_RADIUS = 11; // particles this close to the hold point are held
const REACH = { min: [-600, -500], max: [1100, 900] }; // where the hand may carry a garment
// Out of the box, cloth must go past the open flaps onto the table: the
// flaps lean outwards at 24–64° above level and cloth left on them slides
// back down into the box. The flap tips reach at most 137 beyond a wall.
const CLEAR = 290; // past this distance beyond a wall, cloth lies on the table
const TOSS_TIME = 0.6; // let go beyond the rim, the hand carries on out to CLEAR in this many seconds
const DWELL = 0.3; // at the end of a scripted carry the hand waits this long, so the garment swings in beneath it
const OVERTIME = 1.5; // a scripted carry lets go at the latest this long after its path ends

const smooth = (t) => t * t * (3 - 2 * t);
const isOutside = ([x, y]) => x < 0 || x > BOX.width || y < 0 || y > BOX.depth;
const clampReach = ([x, y, z]) => [
  Math.min(REACH.max[0], Math.max(REACH.min[0], x)),
  Math.min(REACH.max[1], Math.max(REACH.min[1], y)),
  z,
];

/** The highest particle of garment g: where a hand picks it up. */
export function topParticle(world, g) {
  let top = world.offsets[g];
  for (let i = top; i < world.offsets[g] + world.counts[g]; i += 1) {
    if (world.pos[3 * i + 2] > world.pos[3 * top + 2]) top = i;
  }
  return top;
}

/**
 * Where a keyboard move takes garment g: over the nearer of the two gentle
 * flaps, right or front, onto the table beyond. Never left, where the
 * owner's pack lies, nor over the steep back flap.
 */
export function asideTarget(world, g) {
  const [x, y] = centroid(world, g);
  return BOX.width - x <= BOX.depth - y ? [BOX.width + CLEAR, y] : [x, BOX.depth + CLEAR];
}

/**
 * Put garment g down at (x, y) straight away (a move without motion): its
 * shape kept, its lowest point just above what lies there. Everything wakes,
 * so cloth that lay on it settles into the gap.
 */
export function dropAt(world, colliders, g, [x, y]) {
  const [cx, cy] = centroid(world, g);
  const from = 3 * world.offsets[g];
  const to = from + 3 * world.counts[g];
  let low = Infinity;
  for (let v = from + 2; v < to; v += 3) low = Math.min(low, world.pos[v]);
  const floor = supportHeight(world, colliders, x, y, { skip: g }) + world.thickness;
  const shift = [x - cx, y - cy, floor - low];
  setPositions(world, g, Float32Array.from(world.pos.subarray(from, to), (v, k) => v + shift[k % 3]));
  world.awake.forEach((_, other) => wake(world, other));
}

/**
 * @param {{world: object, colliders: object[], ray: (sx: number, sy: number) => {origin: number[], dir: number[]}}} options
 */
export function createHand({ world, colliders, ray }) {
  let held = null; // { garment, base, height, want, xy, sx, sy, script }

  const wantAt = (x, y) => Math.max(held.base, supportHeight(world, colliders, x, y, { skip: held.garment, moving: false }) + LIFT);

  /** Move the hand to (x, y) at its height, rising first if something below is taller. */
  function place([x, y]) {
    const want = wantAt(x, y);
    if (want > held.height) held.height = want;
    held.want = want;
    held.xy = [x, y];
    moveGrip(world, clampReach([x, y, held.height]));
  }

  /** Put the hand where the pointer's line of sight meets its height. */
  function aim() {
    const sight = ray(held.sx, held.sy);
    let target = onPlane(sight, held.height);
    if (!target) return;
    const want = wantAt(target[0], target[1]);
    if (want > held.height) {
      held.height = want;
      target = onPlane(sight, want) ?? target;
    }
    held.want = want;
    held.xy = [target[0], target[1]];
    moveGrip(world, clampReach(target));
  }

  /** Let go at once, whatever the hand was doing. */
  function drop() {
    if (!held) return;
    const done = held.script?.done;
    letGo(world);
    held = null;
    done?.();
  }

  function take(garment, ids, point) {
    drop();
    hold(world, garment, gripCluster(world, { garment, ids, point }, GRIP_RADIUS), point);
    held = { garment, base: Math.max(point[2] + LIFT, MIN_HEIGHT), height: point[2], want: 0, xy: [point[0], point[1]], sx: 0, sy: 0, script: null };
  }

  function follow(from, to, duration, done) {
    held.script = { from, to, duration, t: 0, done };
  }

  return {
    /** The garment being held, or null. */
    get garment() { return held ? held.garment : null; },

    /** Pick up a pick() hit with the pointer at screen point (sx, sy). */
    grab(hit, sx, sy) {
      take(hit.garment, hit.ids, hit.point);
      held.sx = sx;
      held.sy = sy;
      aim();
    },

    dragTo(sx, sy) {
      if (!held || held.script) return;
      held.sx = sx;
      held.sy = sy;
      aim();
    },

    /**
     * The pointer lets go. Inside the box the garment drops where it is.
     * Beyond the rim the hand first carries on outwards, past the flap onto
     * the table: let go on the flap, the garment would slide back in, and
     * the part still trailing inside would pull it after.
     */
    release() {
      if (!held || held.script) return;
      if (!isOutside(held.xy)) {
        drop();
        return;
      }
      const [x, y] = held.xy;
      const out = (v, size) => (v < 0 ? Math.min(v, -CLEAR) : v > size ? Math.max(v, size + CLEAR) : v);
      follow(held.xy, [out(x, BOX.width), out(y, BOX.depth)], TOSS_TIME, null);
    },

    /** Pick garment g up by its highest point, carry it to (x, y) and let go there. Resolves on letting go. */
    carry(g, to, { duration }) {
      return new Promise((resolve) => {
        const top = topParticle(world, g);
        const point = [...world.pos.subarray(3 * top, 3 * top + 3)];
        take(g, [top], point);
        follow(held.xy, to, duration, resolve);
        place(held.xy);
      });
    },

    drop,

    /**
     * One animation frame, before the world steps. Following the pointer,
     * the hand sinks back after clearing something tall. On a scripted
     * carry it stays up: out past a flap, a lowered hand would drape the
     * trailing cloth over the flap's edge instead of over the table.
     */
    advance(elapsed) {
      if (!held) return;
      const { script } = held;
      if (!script) {
        if (held.height > held.want + 0.01) held.height -= (held.height - held.want) * Math.min(1, elapsed * LOWER_RATE);
        aim(); // the view may have moved under a still pointer
        return;
      }
      script.t += elapsed;
      const k = smooth(Math.min(1, script.t / script.duration));
      place(script.from.map((v, c) => v + (script.to[c] - v) * k));
      const { from, to } = world.grip;
      const caughtUp = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) < 1;
      if ((caughtUp && script.t >= script.duration + DWELL) || script.t > script.duration + OVERTIME) drop();
    },
  };
}
