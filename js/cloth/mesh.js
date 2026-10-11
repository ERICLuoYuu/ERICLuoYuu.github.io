/**
 * A garment's cloth mesh, built from its coverage grid (garments.json).
 * Pure — no DOM.
 *
 * Every covered cell of the grid becomes two triangles; vertices sit on the
 * cell corners and are shared between neighbouring cells. Triangle edges
 * become stretch constraints, and for every edge shared by two triangles the
 * two opposite corners are tied by a softer bending constraint (as in
 * Matthias Müller's Ten Minute Physics cloth).
 *
 * A grid may also mark `core` cells (mostly opaque in the picture). Particles
 * touching one are flagged in `core`: cloth there really hides what lies
 * under it, while the rest is a transparent margin around the outline.
 */

function validate({ id, grid }) {
  const { cols, rows, cells, core } = grid ?? {};
  const ok = Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0
    && typeof cells === 'string' && cells.length === cols * rows && /^[01]+$/.test(cells);
  if (!ok) throw new Error(`${id}: grid must have ${cols} × ${rows} cells written as 0 and 1`);
  if (!cells.includes('1')) throw new Error(`${id}: the grid has no covered cells`);
  const coreOk = core === undefined || (typeof core === 'string' && core.length === cells.length
    && /^[01]+$/.test(core) && [...core].every((c, k) => c === '0' || cells[k] === '1'));
  if (!coreOk) throw new Error(`${id}: grid.core must mark only covered cells, one 0 or 1 per cell`);
}

/** Two triangles per cell; the diagonal alternates like a chequerboard. */
function cellTriangles(i, j, at) {
  const a = at(i, j);
  const b = at(i + 1, j);
  const c = at(i + 1, j + 1);
  const d = at(i, j + 1);
  return (i + j) % 2 === 0 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
}

/** Unique edges, each with the corners facing it across its one or two triangles. */
function collectEdges(triangles) {
  const edges = new Map();
  triangles.forEach(([a, b, c]) => {
    [[a, b, c], [b, c, a], [c, a, b]].forEach(([p, q, opposite]) => {
      const key = p < q ? `${p},${q}` : `${q},${p}`;
      const edge = edges.get(key) ?? { a: Math.min(p, q), b: Math.max(p, q), opposite: [] };
      edges.set(key, { ...edge, opposite: [...edge.opposite, opposite] });
    });
  });
  return [...edges.values()];
}

/**
 * @param {{id:string, size:[number, number], grid:{cols:number, rows:number, cells:string, core?:string}}} garment
 * @returns {{count:number, rest:Float32Array, uv:Float32Array, tris:Uint32Array, core:Uint8Array,
 *            stretch:{a:number,b:number,rest:number}[], bend:{a:number,b:number,rest:number}[]}}
 */
export function buildMesh(garment) {
  validate(garment);
  const { size: [width, height], grid: { cols, rows, cells, core: coreCells = cells } } = garment;
  const cellW = width / cols;
  const cellH = height / rows;

  const index = new Map();
  const corners = [];
  const at = (i, j) => {
    const key = j * (cols + 1) + i;
    if (!index.has(key)) {
      index.set(key, corners.length);
      corners.push([i, j]);
    }
    return index.get(key);
  };

  const triangles = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      if (cells[j * cols + i] === '1') triangles.push(...cellTriangles(i, j, at));
    }
  }

  const core = new Uint8Array(corners.length);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      if (coreCells[j * cols + i] === '1') [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)].forEach((v) => { core[v] = 1; });
    }
  }

  const rest = new Float32Array(corners.flatMap(([i, j]) => [i * cellW, j * cellH, 0]));
  const uv = new Float32Array(corners.flatMap(([i, j]) => [i / cols, j / rows]));
  const length = (a, b) => Math.hypot(rest[3 * a] - rest[3 * b], rest[3 * a + 1] - rest[3 * b + 1]);

  const edges = collectEdges(triangles);
  const stretch = edges.map(({ a, b }) => ({ a, b, rest: length(a, b) }));
  const bend = edges
    .filter(({ opposite }) => opposite.length === 2)
    .map(({ opposite: [a, b] }) => ({ a, b, rest: length(a, b) }));

  return Object.freeze({
    count: corners.length, rest, uv, tris: new Uint32Array(triangles.flat()), core, stretch, bend,
  });
}
