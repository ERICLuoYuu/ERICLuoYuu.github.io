/**
 * A smoother surface to draw than the one the cloth simulates. Pure — no DOM.
 *
 * Every simulated cell is drawn as 2 × 2 quads. The new points — edge
 * midpoints and cell centres — come from the four-point interpolating
 * scheme, (−p₀ + 9p₁ + 9p₂ − p₃) / 16, along rows and then columns. Where a
 * neighbour is missing at the cloth's edge, it is extrapolated in a straight
 * line; a neighbour across a gap (a sleeve beside the body) is treated as
 * missing. The surface passes through every particle, so what is drawn
 * still matches what collides and what is picked.
 *
 * Each new point is a fixed weighted sum of particles: the weights are
 * worked out once, and each frame is a sparse sum (evaluate).
 */

/** Weights of a, b, c, d for the point halfway between b and c; a or d may be missing. */
export function halfway(hasA, hasD) {
  if (hasA && hasD) return [-1 / 16, 9 / 16, 9 / 16, -1 / 16];
  if (hasD) return [0, 7 / 16, 10 / 16, -1 / 16]; // a extrapolated as 2b − c
  if (hasA) return [-1 / 16, 10 / 16, 7 / 16, 0]; // d extrapolated as 2c − b
  return [0, 1 / 2, 1 / 2, 0];
}

const covered = ({ cols, rows, cells }, i, j) => i >= 0 && j >= 0 && i < cols && j < rows && cells[j * cols + i] === '1';
const corner = ({ cols, rows, at }, i, j) => (i < 0 || j < 0 || i > cols || j > rows ? -1 : at[j * (cols + 1) + i]);
/** Is the lattice line from corner (i, j) to (i + 1, j) part of the cloth? */
const rowEdge = (L, i, j) => covered(L, i, j - 1) || covered(L, i, j);
/** Is the lattice line from corner (i, j) to (i, j + 1) part of the cloth? */
const colEdge = (L, i, j) => covered(L, i - 1, j) || covered(L, i, j);

/** Stencil (particle → weight) of the point halfway from p to q, with neighbours a before p and d after q. */
function lineMid(a, p, q, d) {
  const [wa, wb, wc, wd] = halfway(a >= 0, d >= 0);
  const stencil = new Map();
  [[a, wa], [p, wb], [q, wc], [d, wd]].forEach(([id, w]) => {
    if (id >= 0 && w !== 0) stencil.set(id, (stencil.get(id) ?? 0) + w);
  });
  return stencil;
}

const rowMid = (L, i, j) => lineMid(
  rowEdge(L, i - 1, j) ? corner(L, i - 1, j) : -1, corner(L, i, j), corner(L, i + 1, j),
  rowEdge(L, i + 1, j) ? corner(L, i + 2, j) : -1,
);
const colMid = (L, i, j) => lineMid(
  colEdge(L, i, j - 1) ? corner(L, i, j - 1) : -1, corner(L, i, j), corner(L, i, j + 1),
  colEdge(L, i, j + 1) ? corner(L, i, j + 2) : -1,
);

/** Centre of cell (i, j): the column scheme over the row midpoints of the cells above, of this one, and below. */
function centre(L, i, j) {
  const [wa, wb, wc, wd] = halfway(covered(L, i, j - 1), covered(L, i, j + 1));
  const stencil = new Map();
  [[j - 1, wa], [j, wb], [j + 1, wc], [j + 2, wd]].forEach(([r, w]) => {
    if (w === 0) return;
    rowMid(L, i, r).forEach((x, id) => stencil.set(id, (stencil.get(id) ?? 0) + x * w));
  });
  return stencil;
}

/** Stencil of fine lattice point (I, J): a corner, an edge midpoint or a cell centre. */
function stencilAt(L, I, J) {
  const i = I >> 1;
  const j = J >> 1;
  if (I % 2 === 0 && J % 2 === 0) return new Map([[corner(L, i, j), 1]]);
  if (J % 2 === 0) return rowMid(L, i, j);
  if (I % 2 === 0) return colMid(L, i, j);
  return centre(L, i, j);
}

function uniqueEdges(tris) {
  const seen = new Map();
  for (let k = 0; k < tris.length; k += 3) {
    [[tris[k], tris[k + 1]], [tris[k + 1], tris[k + 2]], [tris[k + 2], tris[k]]].forEach(([p, q]) => {
      const a = Math.min(p, q);
      const b = Math.max(p, q);
      seen.set(`${a},${b}`, { a, b });
    });
  }
  return [...seen.values()];
}

/** Fine points and triangles: every covered cell as 2 × 2 quads, diagonals alternating. */
function fineLattice(L) {
  const width = 2 * L.cols + 1;
  const index = new Map();
  const points = [];
  const at = (I, J) => {
    const key = J * width + I;
    if (!index.has(key)) {
      index.set(key, points.length);
      points.push([I, J]);
    }
    return index.get(key);
  };
  const tris = [];
  for (let j = 0; j < L.rows; j += 1) {
    for (let i = 0; i < L.cols; i += 1) {
      if (!covered(L, i, j)) continue;
      for (let dj = 0; dj < 2; dj += 1) {
        for (let di = 0; di < 2; di += 1) {
          const I = 2 * i + di;
          const J = 2 * j + dj;
          const [a, b, c, d] = [at(I, J), at(I + 1, J), at(I + 1, J + 1), at(I, J + 1)];
          tris.push(...((I + J) % 2 === 0 ? [a, b, c, a, c, d] : [a, b, d, b, c, d]));
        }
      }
    }
  }
  return { points, tris };
}

/**
 * @param {{lattice:{cols:number, rows:number, at:Int32Array, cells:string}}} mesh  from buildMesh
 */
export function createSmoother(mesh) {
  const L = mesh.lattice;
  const { points, tris } = fineLattice(L);
  const stencils = points.map(([I, J]) => stencilAt(L, I, J));
  const count = points.length;
  const start = new Uint32Array(count + 1);
  stencils.forEach((s, v) => { start[v + 1] = start[v] + s.size; });
  const ids = new Uint32Array(start[count]);
  const weights = new Float32Array(start[count]);
  stencils.forEach((s, v) => {
    let k = start[v];
    s.forEach((w, id) => {
      ids[k] = id;
      weights[k] = w;
      k += 1;
    });
  });
  const uv = new Float32Array(points.flatMap(([I, J]) => [I / (2 * L.cols), J / (2 * L.rows)]));

  /** Drawn positions from particle positions; the garment's particles start at `offset` in `pos`. */
  function evaluate(pos, offset, out) {
    for (let v = 0; v < count; v += 1) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (let k = start[v]; k < start[v + 1]; k += 1) {
        const p = 3 * (offset + ids[k]);
        const w = weights[k];
        x += w * pos[p];
        y += w * pos[p + 1];
        z += w * pos[p + 2];
      }
      out[3 * v] = x;
      out[3 * v + 1] = y;
      out[3 * v + 2] = z;
    }
    return out;
  }

  return Object.freeze({ count, uv, tris: Uint32Array.from(tris), edges: uniqueEdges(tris), start, ids, weights, evaluate });
}
