/**
 * Settle the clothes pile once, offline, so every visit starts from the same
 * natural-looking heap without spending the visitor's battery on it.
 *
 *   node tools/build-pile.mjs        (npm run clothes runs it after the art)
 *
 * Each garment is laid loosely with at most one fold, turned and dropped
 * onto the booklet in the upper right with the same solver the site uses,
 * among the box, the books and the figurine and the food at their starting
 * places (rigid bodies the cloth collides with).
 * The result goes to assets/clothes/pile.json. If the pile does not hide the
 * booklet, covers any of the figurine or the food, or shows fewer than six
 * signature features, the next random seed is tried.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { buildMesh, particleNear } from '../js/cloth/mesh.js';
import { createWorld, setPositions, sleep, step, centroid } from '../js/cloth/solver.js';
import { bookCoverage, coverageOf, isExposed } from '../js/cloth/coverage.js';
import { boxColliders } from '../js/scene/solids.js';
import { BOX, CONTENTS, FIGURINE, FOOD } from '../js/scene/geometry.js';
import { createBody, areaOf, bodyCollider } from '../js/rigid/body.js';

const ROOT = new URL('../', import.meta.url);
const THICKNESS = 4.5; // cells of at most 6: covers the 4.2-unit gap in the middle of a cell
const BOUNDS = { min: [-900, -900, 0], max: [1300, 1300, 900] };
// Where particle centres may be laid: the walls are 2 thick, plus a particle radius and a little air.
const INSIDE = { min: [8, 8], max: [BOX.width - 8, BOX.depth - 8] };
const PARKED_X = -3000; // garments wait far away until it is their turn
const TARGETS = { book: 0.88, bodies: 0.05, signatures: 6 };
const BODIES = [FIGURINE, ...FOOD].map(createBody); // where the figurine and the food lie at the start
const JITTER = { turn: 16, shift: 6 }; // degrees and units of random variation per seed
const DROP_GAP = 12; // each garment is dropped this far above the pile so far

/**
 * Bottom to top. Each garment lies loosely with at most one fold:
 * [axis, at, keep, side] folds everything on the far side of the line
 * axis = at (a share of the garment's width for 'x', of its length for 'y')
 * onto the kept side — 'x' folds left/right, 'y' up/down; keep
 * 'low' keeps the side below `at` — laying it 'over' (on top) or tucking it
 * 'under'. turn in degrees (0: collar or waist towards the back wall), centre
 * in parcel units. The horse-face skirt lies flat under everything, over the
 * booklet; the others fan out from it, each with its signature feature past
 * the skirt's edge (a collar left or right, the floral waistband right) or on
 * top (the slip skirt's lace, the ruched top's neckline, the qipao's collar).
 */
const PLAN = [
  { id: 'mamianqun', folds: [], turn: 90, centre: [300, 80] },
  { id: 'floral-skirt', folds: [], turn: 90, centre: [355, 48] },
  { id: 'tee-breton', folds: [], turn: -90, centre: [252, 56] },
  { id: 'tee-white', folds: [], turn: 90, centre: [360, 118] },
  { id: 'blouse', folds: [], turn: -90, centre: [248, 122] },
  { id: 'qipao', folds: [], turn: 30, centre: [304, 76] },
  { id: 'slip-skirt', folds: [], turn: -8, centre: [296, 88] },
  { id: 'ruched-top', folds: [], turn: 0, centre: [265, 35] },
];

/** Small seeded random numbers (mulberry32). */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fold flat positions over a line (see PLAN); the layer on top lies one thickness higher. */
function fold(positions, [axis, at, keep, side = 'over'], size) {
  const k = axis === 'x' ? 0 : 1;
  const line = at * size[k];
  const out = Float32Array.from(positions);
  for (let i = 0; i < out.length; i += 3) {
    const v = out[i + k];
    const far = keep === 'low' ? v > line : v < line;
    if (far) out[i + k] = 2 * line - v;
    if (far === (side === 'over')) out[i + 2] += THICKNESS;
  }
  return out;
}

/** Fold, turn about the middle, move to `centre`, lift to `height`. */
function lay(mesh, { folds, turn, centre }, height, rand, size) {
  const folded = folds.reduce((positions, f) => fold(positions, f, size), mesh.rest);
  const count = folded.length / 3;
  const mid = [0, 1].map((k) => folded.filter((_, i) => i % 3 === k).reduce((a, b) => a + b, 0) / count);
  const angle = ((turn + (rand() - 0.5) * JITTER.turn) * Math.PI) / 180;
  const shift = [centre[0] + (rand() - 0.5) * JITTER.shift, centre[1] + (rand() - 0.5) * JITTER.shift];
  const out = new Float32Array(folded.length);
  for (let i = 0; i < folded.length; i += 3) {
    const x = folded[i] - mid[0];
    const y = folded[i + 1] - mid[1];
    out[i] = shift[0] + x * Math.cos(angle) - y * Math.sin(angle);
    out[i + 1] = shift[1] + x * Math.sin(angle) + y * Math.cos(angle);
    out[i + 2] = folded[i + 2] + height;
  }
  return out;
}

/**
 * Slide laid-out positions so the whole garment starts inside the walls. A
 * garment dropped straddling a wall would be pushed out through the nearest
 * face — often the outside.
 */
function fitInside(positions) {
  const out = Float32Array.from(positions);
  [0, 1].forEach((k) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = k; i < out.length; i += 3) {
      lo = Math.min(lo, out[i]);
      hi = Math.max(hi, out[i]);
    }
    const tooWide = hi - lo > INSIDE.max[k] - INSIDE.min[k];
    const shift = tooWide
      ? (INSIDE.min[k] + INSIDE.max[k] - lo - hi) / 2
      : Math.max(0, INSIDE.min[k] - lo) + Math.min(0, INSIDE.max[k] - hi);
    for (let i = k; i < out.length; i += 3) out[i] += shift;
  });
  return out;
}

const parked = (positions) => positions.map((v, i) => (i % 3 === 0 ? v + PARKED_X : v));

function highestPoint(world) {
  let top = 0;
  for (let i = 0; i < world.count; i += 1) {
    if (world.pos[3 * i] > -500) top = Math.max(top, world.pos[3 * i + 2]);
  }
  return top;
}

/** Run until everything sleeps; returns false if `seconds` ran out first. */
function settle(world, seconds) {
  for (let t = 0; t < seconds; t += 1 / 60) {
    if (!world.awake.some((a) => a)) return true;
    step(world, 1 / 60);
  }
  return !world.awake.some((a) => a);
}

function buildPile(garments, seed) {
  const rand = random(seed);
  const meshes = garments.map(buildMesh);
  const world = createWorld({
    garments: meshes.map((mesh, i) => ({ mesh, material: garments[i].material })),
    colliders: [...boxColliders(), ...BODIES.map(bodyCollider)],
    bounds: BOUNDS,
    thickness: THICKNESS,
  });
  garments.forEach((garment, g) => {
    setPositions(world, g, parked(meshes[g].rest));
    sleep(world, g);
  });
  PLAN.forEach((placement) => {
    const g = garments.findIndex((garment) => garment.id === placement.id);
    setPositions(world, g, fitInside(lay(meshes[g], placement, highestPoint(world) + DROP_GAP, rand, garments[g].size)));
    if (!settle(world, 8)) console.warn(`  ${placement.id} was still moving after 8 s; it is put to sleep where it is`);
  });
  world.counts.forEach((_, g) => { if (world.awake[g]) sleep(world, g); });
  return { world, meshes };
}

/** Ids of the garments whose signature feature can be seen from above. */
function visibleSignatures(world, garments, meshes) {
  return garments
    .filter(({ signature, size }, g) => signature
      && isExposed(world, world.offsets[g] + particleNear(meshes[g], [signature[0] * size[0], signature[1] * size[1]])))
    .map(({ id }) => id);
}

async function main() {
  const data = JSON.parse(await readFile(new URL('assets/clothes/garments.json', ROOT), 'utf8'));
  const order = data.garments.map((g) => g.id);
  if (PLAN.length !== order.length || !PLAN.every((p) => order.includes(p.id))) {
    throw new Error('PLAN must place every garment in garments.json exactly once');
  }
  for (let seed = 11; seed < 31; seed += 1) {
    const started = Date.now();
    const { world, meshes } = buildPile(data.garments, seed);
    const book = bookCoverage(world, CONTENTS.book);
    const bodies = Math.max(...BODIES.map((b) => coverageOf(world, areaOf(b), b.height)));
    const seen = visibleSignatures(world, data.garments, meshes);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`seed ${seed}: booklet ${(book * 100).toFixed(0)} % hidden, figurine and food at most ${(bodies * 100).toFixed(0)} % covered, `
      + `${seen.length} signatures in view (${seen.join(', ')}) (${seconds} s)`);
    if (book >= TARGETS.book && bodies <= TARGETS.bodies && seen.length >= TARGETS.signatures) {
      const garments = data.garments.map(({ id }, g) => ({
        id,
        positions: Array.from(world.pos.subarray(3 * world.offsets[g], 3 * (world.offsets[g] + world.counts[g])), (v) => Math.round(v * 10) / 10),
        centre: centroid(world, g).map((v) => Math.round(v)),
      }));
      const pile = { version: 1, seed, thickness: THICKNESS, garments };
      await writeFile(new URL('assets/clothes/pile.json', ROOT), `${JSON.stringify(pile)}\n`);
      console.log(`wrote assets/clothes/pile.json (seed ${seed})`);
      return;
    }
  }
  throw new Error('No seed produced a pile that hides the booklet, spares the figurine and the food and shows the garments; adjust PLAN.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
