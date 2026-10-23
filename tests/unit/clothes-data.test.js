import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { buildMesh } from '../../js/cloth/mesh.js';

const ROOT = new URL('../../', import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, ROOT), 'utf8'));

/** Width and height of a WebP file, read from its header. */
function webpSize(buffer) {
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + buffer.readUIntLE(24, 3), 1 + buffer.readUIntLE(27, 3)];
  if (chunk === 'VP8 ') return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  throw new Error(`not a WebP file (${chunk})`);
}

const EXPECTED = ['qipao', 'blouse', 'mamianqun', 'tee-white', 'tee-breton', 'slip-skirt', 'ruched-top', 'floral-skirt'];
// How long each garment is on the owner's figure (spec Revision B, B2), in parcel units.
const LENGTH = {
  qipao: 158, blouse: 83, mamianqun: 127, 'tee-white': 83, 'tee-breton': 83, 'slip-skirt': 103, 'ruched-top': 55, 'floral-skirt': 103,
};

test('garments.json lists the eight garments with textures, grids and materials', async () => {
  const data = await readJson('assets/clothes/garments.json');
  const { garments } = data;
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

test('pile.json is a settled pile that hides the booklet and leaves the figurine and food bare', async () => {
  const { createWorld, setPositions } = await import('../../js/cloth/solver.js');
  const { bookCoverage, coverageOf, isExposed } = await import('../../js/cloth/coverage.js');
  const { particleNear } = await import('../../js/cloth/mesh.js');
  const { CONTENTS, FIGURINE, FOOD } = await import('../../js/scene/geometry.js');
  const { createBody, areaOf, bodyCollider } = await import('../../js/rigid/body.js');
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
  const seen = data.garments.filter(({ signature, size }, g) => signature && isExposed(world,
    world.offsets[g] + particleNear(meshes[g], [signature[0] * size[0], signature[1] * size[1]])));
  assert.ok(seen.length >= 6, `signatures in view: ${seen.map((g) => g.id).join(', ')}`);
  assert.ok(bookCoverage(world, CONTENTS.book) >= 0.85, 'the booklet is hidden');
  const bodies = [FIGURINE, ...FOOD].map(createBody);
  bodies.forEach((b) => assert.ok(coverageOf(world, areaOf(b), b.height) <= 0.08, `${b.id} stays uncovered`));
  bodies.map(bodyCollider).forEach((c) => {
    for (let i = 0; i < world.count; i += 1) {
      const p = world.pos.subarray(3 * i, 3 * i + 3);
      const inside = c.axes.every((a, k) => Math.abs((p[0] - c.center[0]) * a[0] + (p[1] - c.center[1]) * a[1] + (p[2] - c.center[2]) * a[2]) < c.half[k] - 0.5);
      assert.ok(!inside, `particle ${i} lies inside ${c.name}`);
    }
  });
});

test('the clothes data hold garments only: the pack is gone', async () => {
  const data = await readJson('assets/clothes/garments.json');
  const pile = await readJson('assets/clothes/pile.json');
  assert.deepEqual(data.garments.map((g) => g.id), EXPECTED);
  assert.ok(data.garments.every((g) => g.kind === undefined && g.hold === undefined));
  assert.deepEqual(pile.garments.map((g) => g.id), EXPECTED);
});

test("every garment fits the owner's figure", async () => {
  const data = await readJson('assets/clothes/garments.json');
  data.garments.forEach((g) => {
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

test('redrawn garments have an aligned relief map, a signature and core cells inside their cloth', async () => {
  const data = await readJson('assets/clothes/garments.json');
  const redrawn = data.garments.filter((g) => g.relief);
  assert.equal(redrawn.length, data.garments.length, 'every garment is drawn with relief');
  await Promise.all(redrawn.map(async (g) => {
    const [colour, relief] = await Promise.all([g.texture, g.relief].map((p) => readFile(new URL(p, ROOT))));
    assert.deepEqual(webpSize(relief), webpSize(colour), `${g.id}: relief and colour line up`);
    webpSize(colour).forEach((px, k) => assert.ok(Math.abs(px - g.size[k] * g.pxPerUnit) <= 1, `${g.id}: ${g.pxPerUnit} px per unit`));
    g.signature.forEach((v) => assert.ok(v >= 0 && v <= 1, `${g.id}: signature inside the picture`));
    assert.equal(g.grid.core.length, g.grid.cells.length);
    [...g.grid.core].forEach((c, k) => assert.ok(c === '0' || g.grid.cells[k] === '1', `${g.id}: core cell ${k} is cloth`));
    assert.ok(Number.isFinite(g.material.bump), `${g.id}.bump`);
  }));
});

test('all garment pictures together stay within 3 MB', async () => {
  const data = await readJson('assets/clothes/garments.json');
  const paths = data.garments.flatMap((g) => [g.texture, g.relief].filter(Boolean));
  const sizes = await Promise.all(paths.map(async (p) => (await stat(new URL(p, ROOT))).size));
  const total = sizes.reduce((a, b) => a + b, 0);
  assert.ok(total <= 3 * 2 ** 20, `${(total / 2 ** 20).toFixed(2)} MB`);
});
