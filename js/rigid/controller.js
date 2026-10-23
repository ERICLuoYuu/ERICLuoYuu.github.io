/**
 * The rigid scene: the figurine and the food as bodies, the hand that moves
 * them, how they come to rest, and how the cloth world sees them. Each frame
 * the held body follows the hand and every other body settles onto what lies
 * beneath it; whenever a body moves, the cloth world's colliders are rebuilt
 * and cloth that lay on the body where it was is woken to fall. The layer
 * steps the cloth; this module never does. Pure — no DOM.
 */

import { setColliders, wake } from '../cloth/solver.js';
import { createBody, withPosition, bodyCollider } from './body.js';
import { outlineOf } from './outline.js';
import { supportOf, restingOn, settle, isResting, clothOn } from './rest.js';
import { createRigidHand } from './hold.js';
import { pickBody } from './heightfield.js';

const HIGH = 1e6; // a body put somewhere at once is lowered from far above onto what lies there
const NONE = Object.freeze([]);

/**
 * @param {{defs: object[], samplers: {alpha: Function, relief: Function}[], world: object,
 *          staticColliders: object[], ray: Function, viewport: Function}} options
 *   samplers[i]: body i's picture opacity and relief (0…1) at picture coordinates (u, v).
 */
export function createRigid({ defs, samplers, world, staticColliders, ray, viewport }) {
  const shaped = defs.map((def, i) => Object.freeze({ ...def, outline: outlineOf(def, samplers[i].alpha) }));
  let bodies = shaped.map(createBody);
  let supports = bodies.map(() => 0);
  let under = bodies.map(() => NONE); // the bodies each one rests on: they hold it up even while lifted beneath it
  let checking = false; // something beneath may have changed: re-check every support next frame

  const collidersOf = (list) => [...staticColliders, ...list.map(bodyCollider)];

  /** The colliders of the bodies lying on body `id`, and of those lying on them, and so on. */
  function ridersOf(id) {
    const riders = new Set([`body:${id}`]);
    let size;
    do {
      size = riders.size;
      bodies.forEach((b, i) => { if (under[i].some((name) => riders.has(name))) riders.add(`body:${b.id}`); });
    } while (riders.size > size);
    riders.delete(`body:${id}`);
    return riders;
  }

  /** The colliders the hand sees beneath the held body `id`: not the bodies riding on it, which it lifts. */
  const handColliders = (list, id) => {
    const riders = ridersOf(id);
    return collidersOf(list).filter((c) => !riders.has(c.name));
  };
  const supportAt = (body, xy) => supportOf(body, xy, { world, colliders: handColliders(bodies, body.id), moving: false });
  const hand = createRigidHand({ ray, viewport, supportAt });

  /** Wake the sleeping cloth lying on `body` (as it is now), so it falls when the body leaves. */
  function wakeClothOn(body) {
    clothOn(world, body).forEach((g) => { if (!world.awake[g]) wake(world, g); });
  }

  /** Take on `next` bodies: rebuild the colliders and wake the cloth on any that moved. */
  function commit(next) {
    const moved = next.some((b, i) => b !== bodies[i]);
    if (moved) {
      next.forEach((b, i) => { if (b !== bodies[i]) wakeClothOn(bodies[i]); });
      bodies = next;
      setColliders(world, collidersOf(bodies));
    }
    return moved;
  }

  /** Every body that is not held straight onto its support (at creation and reset). */
  function standAll() {
    const colliders = collidersOf(bodies);
    const rests = bodies.map((b) => restingOn(b, b.position.slice(0, 2), { world, colliders }));
    supports = rests.map((r) => r.support);
    under = rests.map((r) => r.under);
    bodies = bodies.map((b, i) => settle(b, supports[i], 0));
    setColliders(world, collidersOf(bodies));
  }

  standAll();

  return {
    get bodies() { return bodies; },
    /** The support under each body this frame (for the contact shadows). */
    get supports() { return supports; },
    get heldId() { return hand.id; },

    /** The nearest body hit along the line of sight, or null. */
    pick(sight) {
      return bodies.reduce((best, body, index) => {
        const hit = pickBody(sight, body, samplers[index]);
        return hit && (!best || hit.t < best.t) ? { kind: 'rigid', index, id: body.id, ...hit } : best;
      }, null);
    },

    grab(hit, sx, sy) {
      const body = bodies[hit.index];
      wakeClothOn(body);
      hand.grab(body, hit.point, sx, sy);
      checking = true;
    },
    dragTo: (sx, sy) => hand.dragTo(sx, sy),
    release() {
      hand.release();
      checking = true;
    },
    drop() {
      hand.drop();
      checking = true;
    },

    /** Carry body `index` back to its starting place (at once with `instant`); resolves when it is let go there. */
    carryHome(index, { duration = 1, instant = false } = {}) {
      const body = bodies[index];
      const home = defs[index].start;
      wakeClothOn(body);
      checking = true;
      if (!instant) return hand.carry(body, home, { duration });
      if (hand.id === body.id) hand.drop();
      const lifted = withPosition(body, [...home, HIGH]);
      const rest = restingOn(lifted, home, { world, colliders: collidersOf(bodies) });
      commit(bodies.map((b, i) => (i === index ? withPosition(body, [...home, rest.support]) : b)));
      supports = supports.map((s, i) => (i === index ? rest.support : s));
      under = under.map((u, i) => (i === index ? rest.under : u));
      return Promise.resolve();
    },

    /** One animation frame: the held body follows the hand, the rest settle. Returns whether any body moved. */
    advance(elapsed) {
      hand.advance(elapsed);
      const held = hand.id;
      const placed = bodies.map((b) => (b.id === held ? hand.place(b) : b));
      if (!checking && held === null) return commit(placed);
      const colliders = collidersOf(placed);
      const rests = placed.map((b, i) => (b.id === held
        ? restingOn(b, b.position.slice(0, 2), { world, colliders: handColliders(placed, held), moving: false })
        : restingOn(b, b.position.slice(0, 2), { world, colliders, under: under[i] })));
      supports = rests.map((r) => r.support);
      under = rests.map((r, i) => (placed[i].id === held ? NONE : r.under));
      const next = placed.map((b, i) => (b.id === held ? b : settle(b, supports[i], elapsed)));
      // while something is held, keep checking: the hand may let go on its own (a carry arriving)
      checking = held !== null || next.some((b, i) => b.id !== held && !isResting(b, supports[i]));
      return commit(next);
    },

    /** Held, carried, falling or waiting for a re-check. */
    active: () => hand.id !== null || checking,
    /** Something beneath may have changed (the cloth moved, or was put somewhere at once). */
    disturb() { checking = true; },

    /** Every body back at its start, resting; nothing held. */
    reset() {
      hand.drop();
      bodies = shaped.map(createBody);
      under = bodies.map(() => NONE);
      standAll();
      checking = false;
    },

    colliders: () => bodies.map(bodyCollider),

    status: () => bodies.map((b, i) => ({
      id: b.id,
      centre: [b.position[0], b.position[1], b.position[2] + b.height / 2].map(Math.round),
      base: Math.round(b.position[2] * 10) / 10,
      resting: b.id !== hand.id && isResting(b, supports[i]),
    })),
  };
}
