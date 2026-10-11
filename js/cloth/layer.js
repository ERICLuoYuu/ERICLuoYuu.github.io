/**
 * The clothes layer: a transparent WebGL2 canvas over the CSS-3D parcel, the
 * cloth world behind it, and the loop that steps and draws them — only while
 * something moves or the view changes.
 *
 * createClothes() always resolves. Without WebGL2, or when the clothes data
 * cannot be loaded, it resolves a disabled layer whose methods do nothing,
 * and the rest of the site carries on as if there were no clothes.
 */

import { buildMesh } from './mesh.js';
import {
  createWorld, step, isSettled, setPositions, sleepAll, centroid,
} from './solver.js';
import { pick } from './pick.js';
import { bookCoverage } from './coverage.js';
import { createHand, asideTarget, dropAt } from './hand.js';
import { createRenderer } from './render.js';
import { floorPixelsPerUnit, textureScale } from './budget.js';
import { boxColliders, occluderQuads } from '../scene/solids.js';
import { CONTENTS } from '../scene/geometry.js';
import { cameraMatrix, projectPoint, screenRay } from '../scene/projection.js';

const DATA = 'assets/clothes/garments.json';
const PILE = 'assets/clothes/pile.json';
const STEP = 1 / 60; // fixed simulation step
const MAX_STEPS = 2; // per animation frame; a slower device sees slow motion rather than a stutter
const BOUNDS = { min: [-700, -600, 0], max: [1200, 1000, 700] }; // the table, roughly; nothing is flung into the void
const CARRY_SPEED = 320; // units a second for a keyboard move...
const CARRY_TIME = [0.8, 1.6]; // ...taking between these many seconds
const CLEAR_SHIFT = 700; // clearAside(): far enough right to be off the box
const FILM_PICK = 0.02; // the pack is picked up wherever there is any film
const CONTEXT = { alpha: true, premultipliedAlpha: true, antialias: true, depth: true, stencil: false };

const DISABLED = Object.freeze({
  enabled: false,
  garments: Object.freeze([]),
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
  screenBox: () => null,
  coverage: () => 0,
  onSettle: () => () => {},
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
  const kinds = data.garments.map((g) => g.kind ?? 'garment');
  if (kinds.indexOf('film') >= 0 && kinds.slice(kinds.indexOf('film')).some((k) => k !== 'film')) {
    throw new Error('garments.json: the film body (the pack) must come after the garments');
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

/**
 * @param {{canvas: HTMLCanvasElement, camera: {frame(): object, onChange(fn): Function}}} options
 * @returns {Promise<object>} the layer (see the object returned at the end of createLayer)
 */
export async function createClothes({ canvas, camera, reducedMotion = () => false }) {
  const gl = canvas.getContext('webgl2', CONTEXT);
  if (!gl) return disabled('this browser has no WebGL2.');
  let assets;
  try {
    assets = await loadAssets();
  } catch (err) {
    return disabled(`the clothes could not be loaded (${err.message}).`);
  }
  try {
    return createLayer({ canvas, gl, camera, assets, reducedMotion });
  } catch (err) {
    return disabled(`the clothes could not be drawn (${err.message}).`);
  }
}

function createLayer({ canvas, gl, camera, assets, reducedMotion }) {
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
  const alphaAt = images.map(alphaSampler);
  const isFilm = data.garments.map((g) => g.kind === 'film');
  // Garments are picked where their picture is mostly opaque; the pack's clear film wherever there is any.
  const pickable = (g, u, v) => (isFilm[g] ? Number(alphaAt[g](u, v) > FILM_PICK) : alphaAt[g](u, v));
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
      film: isFilm[i],
    };
  });
  const makeRenderer = () => createRenderer(gl, { meshes, looks, occluders: occluderQuads() });
  let renderer = makeRenderer();
  const all = data.garments.map((_, g) => g);
  const stale = new Set(all); // garments whose shape the GPU has not seen yet
  const settleListeners = new Set();
  let visible = false;
  let lost = false;
  let dirty = true;
  let frameId = 0;
  let last = 0;
  let backlog = 0;
  let substeps = world.settings.substeps;
  let cost = 0; // smoothed milliseconds per step

  const viewport = () => ({ width: canvas.clientWidth || innerWidth, height: canvas.clientHeight || innerHeight });
  const hand = createHand({
    world, colliders, ray: (sx, sy) => screenRay(camera.frame(), viewport(), sx, sy), holds: data.garments.map((g) => g.hold),
  });
  const active = () => world.grip !== null || !isSettled(world);

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

  /** One animation frame. Without a graphics context the cloth still moves (a carry still ends); only drawing waits. */
  function tick(now) {
    frameId = 0;
    if (active()) {
      const elapsed = last ? Math.min(0.25, (now - last) / 1000) : STEP;
      last = now;
      hand.advance(elapsed);
      backlog += elapsed;
      let steps = 0;
      while (backlog >= STEP && steps < MAX_STEPS) {
        simulate();
        backlog -= STEP;
        steps += 1;
      }
      if (backlog >= STEP) backlog = 0; // could not keep up: let the time go
      if (steps > 0) dirty = true;
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

  function grab(hit) {
    if (!hit) return;
    const { x, y } = projectPoint(camera.frame(), viewport(), hit.point);
    hand.grab(hit, x, y);
    schedule();
  }

  function dragTo(sx, sy) {
    hand.dragTo(sx, sy);
    schedule();
  }

  function release() {
    hand.release();
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
      dropAt(world, colliders, g, to);
      schedule();
      return Promise.resolve();
    }
    const [x, y] = centroid(world, g);
    const duration = Math.min(CARRY_TIME[1], Math.max(CARRY_TIME[0], Math.hypot(to[0] - x, to[1] - y) / CARRY_SPEED));
    const moved = hand.carry(g, to, { duration });
    schedule();
    return moved;
  }

  // ─── whole-pile changes ──────────────────────────────────────────────────

  function place(shift) {
    hand.drop();
    pile.garments.forEach(({ positions }, g) => {
      setPositions(world, g, Float32Array.from(positions, (v, i) => (i % 3 === 0 && !isFilm[g] ? v + shift : v)));
    });
    sleepAll(world);
    all.forEach((g) => stale.add(g));
    invalidate();
  }

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
  });
  canvas.addEventListener('webglcontextrestored', () => {
    try {
      renderer = makeRenderer();
      lost = false;
      all.forEach((g) => stale.add(g));
      invalidate();
    } catch (err) {
      console.warn('[parcel] The clothes could not be drawn again after the graphics reset:', err);
    }
  });
  resize();

  return {
    enabled: true,
    garments: Object.freeze(data.garments.filter((_, g) => !isFilm[g]).map(({ id, label }) => Object.freeze({ id, label }))),
    /** Every body: the garments, then the pack. */
    bodies: Object.freeze(data.garments.map(({ id, label, kind = 'garment' }) => Object.freeze({ id, label, kind }))),

    /** Show or hide the canvas. Hiding drops anything held. */
    show(on) {
      visible = Boolean(on);
      canvas.classList.toggle('is-visible', visible);
      if (!visible) hand.drop();
      if (visible) resize();
    },
    /** The packed pile, exactly as it was on arrival. */
    reset: () => place(0),
    /** Every garment off to the side of the box (previews and tests); the pack stays. */
    clearAside: () => place(CLEAR_SHIFT),

    /** The body under screen point (sx, sy), in CSS pixels, or null; its picture's opacity there as `opacity`. */
    pickAt(sx, sy) {
      if (!visible) return null;
      const hit = pick(world, meshes, screenRay(camera.frame(), viewport(), sx, sy), pickable);
      return hit && { ...hit, opacity: alphaAt[hit.garment](hit.uv[0], hit.uv[1]) };
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

    /** Garment g's outline on screen as a box in CSS pixels. */
    screenBox(g) {
      const frame = camera.frame();
      const view = viewport();
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      for (let i = world.offsets[g]; i < world.offsets[g] + world.counts[g]; i += 1) {
        const { x, y } = projectPoint(frame, view, world.pos.subarray(3 * i, 3 * i + 3));
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
      return { left, top, width: right - left, height: bottom - top };
    },
    /** Share of the booklet's cover under cloth, 0…1. */
    coverage: () => bookCoverage(world, CONTENTS.book),
    /** Call fn whenever everything has come to rest; returns an unsubscribe function. */
    onSettle(fn) {
      settleListeners.add(fn);
      return () => settleListeners.delete(fn);
    },
    status: () => ({
      enabled: true,
      visible,
      settled: !active(),
      held: hand.garment,
      grip: world.grip ? [...world.grip.to] : null,
      awake: world.awake.reduce((sum, a) => sum + a, 0),
      substeps,
      coverage: bookCoverage(world, CONTENTS.book),
      garments: data.garments.map(({ id }, g) => ({ id, awake: world.awake[g] === 1, centre: centroid(world, g).map(Math.round) })),
    }),
    /** Screen position of a parcel point (CSS pixels). */
    project: (point) => projectPoint(camera.frame(), viewport(), point),
  };
}
