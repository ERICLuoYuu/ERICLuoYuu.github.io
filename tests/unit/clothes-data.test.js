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
