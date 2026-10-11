import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { buildMesh } from '../../js/cloth/mesh.js';

const ROOT = new URL('../../', import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, ROOT), 'utf8'));

const EXPECTED = ['qipao', 'blouse', 'mamianqun', 'tee-white', 'tee-breton', 'slip-skirt', 'ruched-top', 'floral-skirt'];
// How long each garment is on the figure in the pack (spec Revision B, B2), in parcel units.
const LENGTH = {
  qipao: 158, blouse: 83, mamianqun: 127, 'tee-white': 83, 'tee-breton': 83, 'slip-skirt': 103, 'ruched-top': 55, 'floral-skirt': 103,
};

test('garments.json lists the eight garments with textures, grids and materials', async () => {
  const data = await readJson('assets/clothes/garments.json');
  const garments = data.garments.filter((g) => g.kind !== 'film');
  assert.equal(data.spacing, 6);
  assert.deepEqual(garments.map((g) => g.id), EXPECTED);
  await Promise.all(garments.map(async (g) => {
    const { size } = await stat(new URL(g.texture, ROOT));
    assert.ok(size > 1000, `${g.texture} exists`);
    assert.equal(g.grid.cols, Math.ceil(g.size[0] / data.spacing));
    assert.equal(g.grid.rows, Math.ceil(g.size[1] / data.spacing));
    assert.equal(g.grid.cells.length, g.grid.cols * g.grid.rows);
    const covered = [...g.grid.cells].filter((c) => c === '1').length / g.grid.cells.length;
    assert.ok(covered > 0.4, `${g.id} is mostly cloth (${covered.toFixed(2)})`);
    assert.doesNotMatch(`${g.id} ${g.label}`, /zara|h&m|mango|ikea/i);
    ['stretchCompliance', 'bendCompliance', 'friction', 'sheen'].forEach((k) => assert.ok(Number.isFinite(g.material[k]), `${g.id}.${k}`));
    assert.ok(buildMesh(g).count > 60, `${g.id} has a usable mesh`); // the cropped ruched top: about 100
  }));
});

test('pile.json is a settled pile that hides the booklet and leaves the pack in view', async () => {
  const { createWorld, setPositions } = await import('../../js/cloth/solver.js');
  const { bookCoverage } = await import('../../js/cloth/coverage.js');
  const { CONTENTS } = await import('../../js/scene/geometry.js');
  const data = await readJson('assets/clothes/garments.json');
  const pile = await readJson('assets/clothes/pile.json');
  assert.equal(pile.version, 1);
  assert.deepEqual(pile.garments.map((g) => g.id), data.garments.map((g) => g.id));

  const meshes = data.garments.map(buildMesh);
  const world = createWorld({
    garments: meshes.map((mesh, i) => ({ mesh, material: data.garments[i].material })),
    bounds: { min: [-900, -900, 0], max: [1300, 1300, 900] },
    thickness: pile.thickness,
  });
  pile.garments.forEach(({ positions }, g) => {
    assert.equal(positions.length, 3 * meshes[g].count, `${pile.garments[g].id} has one position per particle`);
    for (let i = 0; i < positions.length; i += 3) {
      const [x, y, z] = positions.slice(i, i + 3);
      const where = `${pile.garments[g].id} particle ${i / 3} at (${x}, ${y}, ${z})`;
      // the walls' inner faces are 2 units in: no cloth may poke through them
      assert.ok(x > 2 && x < 418 && y > 2 && y < 298, `${where} is inside the walls`);
      assert.ok(z >= 0 && z < 220, `${where} is below the rim`);
    }
    setPositions(world, g, Float32Array.from(positions));
  });
  assert.ok(bookCoverage(world, CONTENTS.book) >= 0.85, 'the booklet is hidden');
  assert.ok(bookCoverage(world, CONTENTS.pack) <= 0.25, 'the pack stays mostly visible');
});

test('every garment fits the figure in the pack', async () => {
  const data = await readJson('assets/clothes/garments.json');
  data.garments.filter((g) => g.kind !== 'film').forEach((g) => {
    const target = LENGTH[g.id];
    assert.ok(Math.abs(g.size[1] - target) <= 0.1 * target, `${g.id}: ${g.size[1]} long, the figure wants ${target}`);
    assert.ok(Number.isFinite(g.pxPerUnit) && g.pxPerUnit > 0, `${g.id}.pxPerUnit`);
  });
});

test('simulating everything at once costs no more than the spec allows', async () => {
  const { DEFAULTS } = await import('../../js/cloth/solver.js');
  const data = await readJson('assets/clothes/garments.json');
  const particles = data.garments.map(buildMesh).reduce((sum, m) => sum + m.count, 0);
  // spec B3: within 10 % of 5,000 particles × 10 substeps
  assert.ok(particles * DEFAULTS.substeps <= 55000, `${particles} particles × ${DEFAULTS.substeps} substeps`);
});

test('the pack is the last body: a heavy, stiff film the size of the pack in the box', async () => {
  const { CONTENTS } = await import('../../js/scene/geometry.js');
  const data = await readJson('assets/clothes/garments.json');
  const pile = await readJson('assets/clothes/pile.json');
  const pack = data.garments.at(-1);
  assert.deepEqual([pack.id, pack.kind], ['pack', 'film']);
  assert.equal(data.garments.filter((g) => g.kind === 'film').length, 1, 'one film body');
  assert.deepEqual(pack.size, [CONTENTS.pack.width, CONTENTS.pack.height]);
  assert.ok(pack.material.mass >= 4, 'heavy');
  assert.ok(pack.material.bendCompliance <= 1e-6, 'stiff');
  assert.deepEqual(pack.hold, { radius: 30, lift: 6 });
  const gap = Math.hypot(pack.size[0] / pack.grid.cols, pack.size[1] / pack.grid.rows) / 2;
  assert.ok(gap < pile.thickness, `a cell's middle lies ${gap.toFixed(2)} from its particles`);
  for (const path of [pack.texture, pack.relief]) assert.ok((await stat(new URL(path, ROOT))).size > 1000, `${path} exists`);
});
