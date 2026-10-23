import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMesh } from '../../js/cloth/mesh.js';
import { createWorld, setPositions, sleepAll } from '../../js/cloth/solver.js';
import { boxColliders } from '../../js/scene/solids.js';
import { FIGURINE, FOOD } from '../../js/scene/geometry.js';
import { createRigid } from '../../js/rigid/controller.js';

// A phone runs this about 3–5 times slower than a desktop; a frame has 16 ms
// in all, most of it the cloth's. These budgets are for a desktop.
const DRAG_BUDGET = 2; // ms per frame dragging the figurine
const CHECK_BUDGET = 1; // ms per frame re-checking where every body rests

const read = (name) => JSON.parse(readFileSync(new URL(`../../assets/clothes/${name}`, import.meta.url)));
const ray = (sx, sy) => ({ origin: [sx, sy, 3000], dir: [0, 0, -1] });
const DEFS = [FIGURINE, ...FOOD];

/** The real pile asleep in the box, around the figurine and the food. */
function pileScene() {
  const { garments } = read('garments.json');
  const pile = read('pile.json');
  const world = createWorld({
    garments: garments.map((g) => ({ mesh: buildMesh(g), material: g.material })),
    colliders: boxColliders(),
    bounds: { min: [-700, -600, 0], max: [1200, 1000, 700] },
    thickness: pile.thickness,
  });
  pile.garments.forEach(({ positions }, g) => setPositions(world, g, Float32Array.from(positions)));
  sleepAll(world);
  return createRigid({
    defs: DEFS, samplers: DEFS.map(() => ({ alpha: () => 1, relief: () => 1 })), world, staticColliders: boxColliders(), ray, viewport: () => ({ width: 1280, height: 800 }),
  });
}

/** ms per call of `frame`: the fastest of five runs, the one least disturbed by whatever else the machine is doing. */
function msPerFrame(frame, frames = 20) {
  let k = 0;
  const runs = Array.from({ length: 5 }, () => {
    const start = performance.now();
    for (let f = 0; f < frames; f += 1, k += 1) frame(k);
    return (performance.now() - start) / frames;
  });
  return Math.min(...runs);
}

test(`a frame dragging the figurine over the pile takes under ${DRAG_BUDGET} ms`, () => {
  const rigid = pileScene();
  rigid.grab(rigid.pick(ray(68, 150)), 68, 150);
  const ms = msPerFrame((k) => {
    rigid.dragTo(68 + 40 * Math.sin(k / 5), 150 + 20 * Math.cos(k / 7));
    rigid.advance(1 / 60);
  });
  assert.ok(ms < DRAG_BUDGET, `${ms.toFixed(2)} ms`);
});

test(`a frame re-checking where every body rests takes under ${CHECK_BUDGET} ms`, () => {
  const rigid = pileScene();
  const ms = msPerFrame(() => {
    rigid.disturb();
    rigid.advance(1 / 60);
  });
  assert.ok(ms < CHECK_BUDGET, `${ms.toFixed(2)} ms`);
});
