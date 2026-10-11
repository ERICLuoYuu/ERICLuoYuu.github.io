import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { buildMesh } from '../../js/cloth/mesh.js';

const ROOT = new URL('../../', import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, ROOT), 'utf8'));

const EXPECTED = ['qipao', 'blouse', 'mamianqun', 'tee-white', 'tee-breton', 'slip-skirt', 'ruched-top', 'floral-skirt'];

test('garments.json lists the eight garments with textures, grids and materials', async () => {
  const data = await readJson('assets/clothes/garments.json');
  assert.equal(data.spacing, 10);
  assert.deepEqual(data.garments.map((g) => g.id), EXPECTED);
  await Promise.all(data.garments.map(async (g) => {
    const { size } = await stat(new URL(g.texture, ROOT));
    assert.ok(size > 1000, `${g.texture} exists`);
    assert.equal(g.grid.cols, Math.ceil(g.size[0] / data.spacing));
    assert.equal(g.grid.rows, Math.ceil(g.size[1] / data.spacing));
    assert.equal(g.grid.cells.length, g.grid.cols * g.grid.rows);
    const covered = [...g.grid.cells].filter((c) => c === '1').length / g.grid.cells.length;
    assert.ok(covered > 0.4, `${g.id} is mostly cloth (${covered.toFixed(2)})`);
    assert.doesNotMatch(`${g.id} ${g.label}`, /zara|h&m|mango|ikea/i);
    ['stretchCompliance', 'bendCompliance', 'friction', 'sheen'].forEach((k) => assert.ok(Number.isFinite(g.material[k]), `${g.id}.${k}`));
    assert.ok(buildMesh(g).count > 100, `${g.id} has a usable mesh`);
  }));
});

test('pile.json is a settled pile that hides the booklet and leaves the photo in view', async () => {
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
  assert.ok(bookCoverage(world, { ...CONTENTS.photo, thickness: 1 }) <= 0.25, 'the photo stays mostly visible');
});
