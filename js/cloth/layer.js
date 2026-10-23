/**
 * The clothes layer: a transparent WebGL2 canvas over the CSS-3D parcel, the
 * cloth world behind it, the rigid bodies (the figurine and the food) lying
 * in it, and the loop that moves and draws them — only while something moves
 * or the view changes.
 *
 * createClothes() always resolves. Without WebGL2, or when the clothes data
 * cannot be loaded, it resolves a disabled layer whose methods do nothing,
 * and the rest of the site carries on as if there were no clothes. When only
 * the bodies' pictures fail, the clothes work and the bodies stay the CSS
 * pictures (rigidEnabled is false).
 */

import { buildMesh } from './mesh.js';
import {
  createWorld, step, isSettled, setPositions, sleepAll, centroid, setColliders,
} from './solver.js';
import { pick } from './pick.js';
import { bookCoverage } from './coverage.js';
import { createHand, asideTarget, dropAt } from './hand.js';
import { createRenderer } from './render.js';
import { floorPixelsPerUnit, textureScale } from './budget.js';
import { boxColliders, occluderQuads } from '../scene/solids.js';
import { CONTENTS, FIGURINE, FOOD } from '../scene/geometry.js';
import { cameraMatrix, projectPoint, screenRay } from '../scene/projection.js';
import { createRigid } from '../rigid/controller.js';
import { loadSolids } from '../rigid/load.js';
import { createRigidRenderer, partsFor } from '../rigid/render.js';
import {
  createBody, bodyCollider, footprintCorners, fromRect, overlapXY,
} from '../rigid/body.js';
import { surfacePoint } from '../rigid/heightfield.js';

const DATA = 'assets/clothes/garments.json';
const PILE = 'assets/clothes/pile.json';
const STEP = 1 / 60; // fixed simulation step
const MAX_STEPS = 2; // per animation frame; a slower device sees slow motion rather than a stutter
const BOUNDS = { min: [-700, -600, 0], max: [1200, 1000, 700] }; // the table, roughly; nothing is flung into the void
const CARRY_SPEED = 320; // units a second for a keyboard move...
const CARRY_TIME = [0.8, 1.6]; // ...taking between these many seconds
const CLEAR_SHIFT = 700; // clearAside(): far enough right to be off the box
const CONTEXT = { alpha: true, premultipliedAlpha: true, antialias: true, depth: true, stencil: false };
const BODY_PX = 4; // pixels a unit in the figurine's and the food's pictures
const BOOK = fromRect({ ...CONTENTS.book, id: 'booklet' }, 0.6); // the booklet as a body: .book3d sits at translateZ(.6px)
const COVER_TOP = BOOK.position[2] + BOOK.height;
/** Does a body lie over the booklet: over its cover, and no lower than the cover? */
const overBook = (body) => overlapXY(body, BOOK) && body.position[2] >= COVER_TOP - 1;

const DISABLED = Object.freeze({
  enabled: false,
  rigidEnabled: false,
  garments: Object.freeze([]),
  solids: Object.freeze([]),
  bodies: Object.freeze([]),
  show() {},
  reset() {},
  clearAside() {},
  pickAt: () => null,
  pixelAt: () => null,
  grab() {},
  dragTo() {},
  release() {},
  moveAside: async () => {},
  moveBodyHome: async () => {},
  screenBox: () => null,
  bodyScreen: () => null,
  coverage: () => 0,
  onSettle: () => () => {},
  onLost: () => () => {},
  status: () => ({ enabled: false }),
  project: () => null,
});

function disabled(reason) {
  console.warn(`[parcel] The clothes are skipped: ${reason}`);
  return DISABLED;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return response.json();
}

async function loadImage(src) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

/** A garment's relief map, or null (it is then drawn as plain fabric) when it has none or it fails to load. */
async function loadRelief({ id, relief }) {
  if (!relief) return null;
  try {
    return await loadImage(relief);
  } catch (err) {
    console.warn(`[parcel] The ${id}'s relief (${relief}) could not be loaded; it is drawn without it.`, err);
    return null;
  }
}

/** The image redrawn at `scale` of its size, or the image itself when that would hardly differ. */
function resized(image, scale) {
  if (!image || scale > 0.95) return image;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Opacity of a garment texture at (u, v), from a quarter-size copy of its alpha channel. */
function alphaSampler(image) {
  const width = Math.max(1, Math.round(image.naturalWidth / 4));
  const height = Math.max(1, Math.round(image.naturalHeight / 4));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = data[4 * i + 3];
  const clamp = (v, n) => Math.min(n - 1, Math.max(0, Math.floor(v * n)));
  return (u, v) => alpha[clamp(v, height) * width + clamp(u, width)] / 255;
}

async function loadAssets() {
  const [data, pile] = await Promise.all([fetchJson(DATA), fetchJson(PILE)]);
  const ids = data.garments.map((g) => g.id);
  if (pile.garments.length !== ids.length || pile.garments.some((g, i) => g.id !== ids[i])) {
    throw new Error('pile.json does not list the garments of garments.json; run npm run clothes');
  }
  const meshes = data.garments.map(buildMesh);
  pile.garments.forEach((g, i) => {
    if (g.positions.length !== 3 * meshes[i].count) throw new Error(`pile.json: ${g.id} has the wrong number of positions`);
  });
  const [images, reliefs] = await Promise.all([
    Promise.all(data.garments.map((g) => loadImage(g.texture))),
    Promise.all(data.garments.map(loadRelief)),
  ]);
  return { data, pile, meshes, images, reliefs };
}

/** The figurine's and the food's pictures, or null (with a warning) when they cannot be loaded. */
async function loadBodies(config) {
  if (!config) return null;
  try {
    return await loadSolids(config);
  } catch (err) {
    console.warn(`[parcel] The figurine and the food stay still pictures: ${err.message}.`);
    return null;
  }
}

/**
 * @param {{canvas: HTMLCanvasElement, camera: {frame(): object, onChange(fn): Function},
 *          reducedMotion?: () => boolean, solids?: {figurine: object, food: object[]}}} options
 *   solids: content/site.js's figurine and food
 * @returns {Promise<object>} the layer (see the object returned at the end of createLayer)
 */
export async function createClothes({
  canvas, camera, reducedMotion = () => false, solids: solidsConfig = null,
}) {
  const gl = canvas.getContext('webgl2', CONTEXT);
  if (!gl) return disabled('this browser has no WebGL2.');
  const bodiesTask = loadBodies(solidsConfig);
  let assets;
  try {
    assets = await loadAssets();
  } catch (err) {
    return disabled(`the clothes could not be loaded (${err.message}).`);
  }
  const solids = await bodiesTask;
  try {
    return createLayer({
      canvas, gl, camera, assets, solids, reducedMotion,
    });
  } catch (err) {
    return disabled(`the clothes could not be drawn (${err.message}).`);
  }
}

function createLayer({
  canvas, gl, camera, assets, solids, reducedMotion,
}) {
  const {
    data, pile, meshes, images, reliefs,
  } = assets;
  const colliders = boxColliders();
  const world = createWorld({
    garments: meshes.map((mesh, g) => ({ mesh, material: data.garments[g].material })),
    colliders,
    bounds: BOUNDS,
    thickness: pile.thickness,
  });
  const viewport = () => ({ width: canvas.clientWidth || innerWidth, height: canvas.clientHeight || innerHeight });
  const ray = (sx, sy) => screenRay(camera.frame(), viewport(), sx, sy);
  const rigid = solids && createRigid({
    defs: solids.defs, samplers: solids.samplers, world, staticColliders: colliders, ray, viewport,
  });
  // still pictures still keep the cloth off them
  if (!rigid) setColliders(world, [...colliders, ...[FIGURINE, ...FOOD].map((def) => bodyCollider(createBody(def)))]);
  const garmentCount = data.garments.length;
  const alphaAt = images.map(alphaSampler);
  // Garments are picked where their picture is mostly opaque.
  const pickable = (g, u, v) => alphaAt[g](u, v);
  // Upload only the resolution this screen can show (picking keeps the full-size alpha).
  const need = floorPixelsPerUnit(innerWidth, innerHeight, Math.min(devicePixelRatio || 1, 2));
  const looks = data.garments.map((g, i) => {
    const scale = textureScale(g.pxPerUnit ?? data.pxPerUnit, need);
    return {
      image: resized(images[i], scale),
      relief: resized(reliefs[i], scale),
      reliefTexel: reliefs[i] ? [1 / reliefs[i].naturalWidth, 1 / reliefs[i].naturalHeight] : [0, 0],
      sheen: g.material.sheen ?? 0.3,
      bump: g.material.bump ?? 0,
    };
  });
  const rigidParts = rigid && partsFor(solids, (image) => resized(image, textureScale(BODY_PX, need)));
  let rigidRenderer = null;
  const makeRenderer = () => {
    rigidRenderer = rigidParts ? createRigidRenderer(gl, { parts: rigidParts }) : null;
    rigidRenderer?.setPlacements(rigid.bodies, rigid.supports);
    return createRenderer(gl, {
      meshes, looks, occluders: occluderQuads(), rigid: rigidRenderer,
    });
  };
  let renderer = makeRenderer();
  const all = data.garments.map((_, g) => g);
  const stale = new Set(all); // garments whose shape the GPU has not seen yet
  const settleListeners = new Set();
  const lostListeners = new Set();
  let visible = false;
  let lost = false;
  let dirty = true;
  let frameId = 0;
  let last = 0;
  let backlog = 0;
  let substeps = world.settings.substeps;
  let cost = 0; // smoothed milliseconds per step

  const hand = createHand({ world, ray });
  const clothActive = () => world.grip !== null || !isSettled(world);
  const active = () => clothActive() || Boolean(rigid?.active());

  function schedule() {
    if (!frameId && visible) frameId = requestAnimationFrame(tick);
  }

  function invalidate() {
    dirty = true;
    schedule();
  }

  function resize() {
    const { width, height } = viewport();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(width * ratio));
    const h = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    invalidate();
  }

  /** One fixed step; trims the substeps on a slow device and restores them on a fast one. */
  function simulate() {
    world.awake.forEach((awake, g) => { if (awake) stale.add(g); });
    const started = performance.now();
    step(world, STEP, { substeps });
    cost = cost * 0.9 + (performance.now() - started) * 0.1;
    if (cost > 9 && substeps > 6) {
      substeps -= 1;
      cost = 6;
    } else if (cost < 3 && substeps < world.settings.substeps) {
      substeps += 1;
    }
  }

  function draw() {
    dirty = false;
    if (stale.size > 0) {
      renderer.update(world, [...stale]);
      stale.clear();
    }
    const frame = camera.frame();
    const view = viewport();
    renderer.draw({
      view: cameraMatrix(frame, view),
      eye: screenRay(frame, view, view.width / 2, view.height / 2).origin,
      light: frame.light ?? 1,
      width: canvas.width,
      height: canvas.height,
    });
  }

  /** A body moved: draw it there, and its shadow with it. */
  function bodiesMoved() {
    rigidRenderer?.setPlacements(rigid.bodies, rigid.supports);
    renderer.invalidateShadow();
    dirty = true;
  }

  /**
   * One animation frame: the hands, then the bodies, then the cloth. Without
   * a graphics context everything still moves (a carry still ends); only
   * drawing waits.
   */
  function tick(now) {
    frameId = 0;
    if (active()) {
      const elapsed = last ? Math.min(0.25, (now - last) / 1000) : STEP;
      last = now;
      hand.advance(elapsed);
      if (rigid?.advance(elapsed)) bodiesMoved();
      let steps = 0;
      if (clothActive()) {
        backlog += elapsed;
        while (backlog >= STEP && steps < MAX_STEPS) {
          simulate();
          backlog -= STEP;
          steps += 1;
        }
        if (backlog >= STEP) backlog = 0; // could not keep up: let the time go
      }
      if (steps > 0) {
        dirty = true;
        rigid?.disturb(); // what the bodies rest on may have moved
      }
      if (!active()) {
        last = 0;
        backlog = 0;
        settleListeners.forEach((fn) => fn());
      }
    }
    if (dirty && !lost) draw();
    if (active()) schedule();
  }

  // ─── the hand ────────────────────────────────────────────────────────────

  const holdingBody = () => Boolean(rigid) && rigid.heldId !== null;

  /** Pick up what `hit` (from pickAt) names: a garment or a body, never both at once. */
  function grab(hit) {
    if (!hit) return;
    const { x, y } = projectPoint(camera.frame(), viewport(), hit.point);
    if (hit.kind === 'rigid') {
      hand.drop();
      rigid.grab(hit, x, y);
    } else {
      if (holdingBody()) rigid.drop();
      hand.grab(hit, x, y);
    }
    schedule();
  }

  function dragTo(sx, sy) {
    if (holdingBody()) rigid.dragTo(sx, sy);
    else hand.dragTo(sx, sy);
    schedule();
  }

  function release() {
    hand.release();
    if (holdingBody()) rigid.release();
    schedule();
  }

  /**
   * Carry garment g out of the box, beyond the nearest of the right, front
   * and back walls (keyboard moves). With reduced motion it is simply put
   * down there. Resolves once it is let go.
   */
  function moveAside(g) {
    const to = asideTarget(world, g);
    if (reducedMotion()) {
      hand.drop();
      dropAt(world, g, to);
      schedule();
      return Promise.resolve();
    }
    const [x, y] = centroid(world, g);
    const duration = Math.min(CARRY_TIME[1], Math.max(CARRY_TIME[0], Math.hypot(to[0] - x, to[1] - y) / CARRY_SPEED));
    const moved = hand.carry(g, to, { duration });
    schedule();
    return moved;
  }

  /**
   * Carry rigid body `index` (its place in `solids`) back to where it started,
   * onto whatever lies there now. With reduced motion it is simply put there.
   * Resolves once it is let go.
   */
  function moveBodyHome(index) {
    if (!rigid) return Promise.resolve();
    hand.drop();
    const [x, y] = rigid.bodies[index].position;
    const [hx, hy] = solids.defs[index].start;
    const duration = Math.min(CARRY_TIME[1], Math.max(CARRY_TIME[0], Math.hypot(hx - x, hy - y) / CARRY_SPEED));
    const instant = reducedMotion();
    const moved = rigid.carryHome(index, { duration, instant });
    if (instant) bodiesMoved();
    schedule();
    return moved;
  }

  // ─── whole-pile changes ──────────────────────────────────────────────────

  function place(shift) {
    hand.drop();
    pile.garments.forEach(({ positions }, g) => {
      setPositions(world, g, Float32Array.from(positions, (v, i) => (i % 3 === 0 ? v + shift : v)));
    });
    sleepAll(world);
    all.forEach((g) => stale.add(g));
    rigid?.disturb();
    invalidate();
  }

  /** The pile as it arrived, and every body back in its place. */
  function reset() {
    place(0);
    if (rigid) {
      rigid.reset();
      bodiesMoved();
    }
  }

  /** Share of the booklet's cover under cloth, or under the figurine or food lying on it, 0…1. */
  function coverage() {
    return bookCoverage(world, CONTENTS.book, { solids: rigid ? rigid.colliders() : [] });
  }

  /** On-screen box (CSS pixels) around parcel points. */
  function outline(points) {
    const frame = camera.frame();
    const view = viewport();
    const box = points.reduce((b, point) => {
      const { x, y } = projectPoint(frame, view, point);
      return [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
    }, [Infinity, Infinity, -Infinity, -Infinity]);
    return {
      left: box[0], top: box[1], width: box[2] - box[0], height: box[3] - box[1],
    };
  }

  /** A body's box corners: its footprint at its base and at its top. */
  function bodyCorners(body) {
    const [base, top] = [body.position[2], body.position[2] + body.height];
    return footprintCorners(body, { inset: 0 }).flatMap(([x, y]) => [[x, y, base], [x, y, top]]);
  }

  const garmentPoints = (g) => Array.from({ length: world.counts[g] }, (_, k) => {
    const i = world.offsets[g] + k;
    return world.pos.subarray(3 * i, 3 * i + 3);
  });

  // ─── outside events ──────────────────────────────────────────────────────

  camera.onChange(() => { if (visible) invalidate(); });
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    last = 0;
    backlog = 0;
    if (!document.hidden) invalidate();
  });
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); // ask for it back
    lost = true;
    lostListeners.forEach((fn) => fn(true));
  });
  canvas.addEventListener('webglcontextrestored', () => {
    try {
      renderer = makeRenderer();
      lost = false;
      all.forEach((g) => stale.add(g));
      invalidate();
      lostListeners.forEach((fn) => fn(false));
    } catch (err) {
      console.warn('[parcel] The clothes could not be drawn again after the graphics reset:', err);
    }
  });
  resize();

  const solidList = rigid ? solids.defs.map(({ id, label }) => Object.freeze({ id, label })) : [];
  return {
    enabled: true,
    /** Whether the figurine and the food are drawn here and can be moved (false: they stay CSS pictures). */
    rigidEnabled: Boolean(rigid),
    garments: Object.freeze(data.garments.map(({ id, label }) => Object.freeze({ id, label }))),
    solids: Object.freeze(solidList),
    /** Every body that can be picked up: the garments, then the figurine and the food. */
    bodies: Object.freeze([
      ...data.garments.map(({ id, label }) => Object.freeze({ id, label, kind: 'garment' })),
      ...solidList.map(({ id, label }) => Object.freeze({ id, label, kind: id === FIGURINE.id ? 'figurine' : 'food' })),
    ]),

    /** Show or hide the canvas. Hiding drops anything held. */
    show(on) {
      visible = Boolean(on);
      canvas.classList.toggle('is-visible', visible);
      if (!visible) {
        hand.drop();
        if (holdingBody()) rigid.drop();
      }
      if (visible) resize();
    },
    /** The packed pile and the bodies, exactly as they were on arrival. */
    reset,
    /** Every garment off to the side of the box (previews and tests). */
    clearAside: () => place(CLEAR_SHIFT),

    /**
     * What lies on top at screen point (sx, sy), in CSS pixels, or null:
     * {kind: 'cloth'|'rigid', index (in garments or solids), id, point, t, uv,
     * opacity (its picture's there)}.
     */
    pickAt(sx, sy) {
      if (!visible) return null;
      const sight = ray(sx, sy);
      const found = pick(world, meshes, sight, pickable);
      const cloth = found && {
        ...found,
        kind: 'cloth',
        index: found.garment,
        id: data.garments[found.garment].id,
        opacity: alphaAt[found.garment](found.uv[0], found.uv[1]),
      };
      const body = rigid?.pick(sight) ?? null;
      if (!cloth || !body) return cloth || body;
      return body.t < cloth.t ? body : cloth;
    },
    /** The colour drawn at screen point (sx, sy) in CSS pixels: [r, g, b, a], premultiplied, 0–255 (tests). */
    pixelAt(sx, sy) {
      if (!visible || lost) return null;
      draw(); // read back in the same task, before the browser presents and clears the buffer
      const ratio = canvas.width / (canvas.clientWidth || innerWidth);
      const out = new Uint8Array(4);
      gl.readPixels(Math.round(sx * ratio), canvas.height - 1 - Math.round(sy * ratio), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return [...out];
    },
    grab,
    dragTo,
    release,
    moveAside,
    moveBodyHome,

    /** Body i's outline on screen as a box in CSS pixels (i indexes `bodies`). */
    screenBox(i) {
      if (i < 0) return null;
      if (i < garmentCount) return outline(garmentPoints(i));
      const body = rigid?.bodies[i - garmentCount];
      return body ? outline(bodyCorners(body)) : null;
    },
    /** Where the top of rigid body `id` at picture point (u, v) is on screen (CSS pixels), or null. */
    bodyScreen(id, uv) {
      const index = rigid ? rigid.bodies.findIndex((b) => b.id === id) : -1;
      if (index < 0) return null;
      return projectPoint(camera.frame(), viewport(), surfacePoint(rigid.bodies[index], solids.samplers[index].relief, uv));
    },
    coverage,
    /** Call fn whenever everything has come to rest; returns an unsubscribe function. */
    onSettle(fn) {
      settleListeners.add(fn);
      return () => settleListeners.delete(fn);
    },
    /** Call fn(true) when the graphics context is lost and fn(false) once it is back; returns an unsubscribe function. */
    onLost(fn) {
      lostListeners.add(fn);
      return () => lostListeners.delete(fn);
    },
    status: () => ({
      enabled: true,
      visible,
      settled: !active(),
      held: hand.garment,
      grip: world.grip ? [...world.grip.to] : null,
      awake: world.awake.reduce((sum, a) => sum + a, 0),
      substeps,
      coverage: coverage(),
      garments: data.garments.map(({ id }, g) => ({ id, awake: world.awake[g] === 1, centre: centroid(world, g).map(Math.round) })),
      rigid: rigid ? rigid.status().map((s, i) => ({ ...s, overBook: overBook(rigid.bodies[i]) })) : [],
      heldBody: hand.garment !== null ? data.garments[hand.garment].id : (rigid?.heldId ?? null),
    }),
    /** Screen position of a parcel point (CSS pixels). */
    project: (point) => projectPoint(camera.frame(), viewport(), point),
  };
}
