/**
 * The light and the per-vertex shading terms for the clothes layer: the
 * shadow map's matrix, smooth normals, and a "cavity" term that darkens the
 * creases of folded cloth. Pure — no DOM, no WebGL — so it is tested in Node.
 *
 * vertexNormals and cavity fill caller-owned typed arrays in place, every
 * frame a garment moves; that is deliberate (see solver.js).
 */

const normalise = (v) => {
  const length = Math.hypot(...v);
  return v.map((c) => c / length);
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Towards the light: high, a little to the left and the back, so shadows fall towards the visitor's lower right. */
export const LIGHT_DIR = Object.freeze(normalise([-0.35, -0.45, 1]));

/** Parcel-space box the shadow map covers: the box, its open flaps and some table around it. */
export const SHADOW_VOLUME = Object.freeze({ min: [-200, -200, -10], max: [620, 500, 330] });

/**
 * Column-major orthographic matrix from parcel space to the light's clip
 * space. Depth grows away from the light.
 */
export function lightMatrix(dir = LIGHT_DIR, { min, max } = SHADOW_VOLUME) {
  const w = normalise(dir);
  const u = normalise(cross([0, 1, 0], w));
  const v = cross(w, u);
  const corners = [min[0], max[0]].flatMap((x) => [min[1], max[1]].flatMap((y) => [min[2], max[2]].map((z) => [x, y, z])));
  const range = (axis) => {
    const values = corners.map((c) => dot(c, axis));
    return [Math.min(...values), Math.max(...values)];
  };
  const rows = [[u, ...range(u), 1], [v, ...range(v), 1], [w, ...range(w), -1]].map(([axis, lo, hi, sign]) => {
    const s = (2 / (hi - lo)) * sign; // the light's own axis is flipped: nearer the light, smaller depth
    return [axis[0] * s, axis[1] * s, axis[2] * s, sign > 0 ? -1 - lo * s : 1 - lo * s];
  });
  const m = new Float32Array(16);
  rows.forEach(([x, y, z, t], r) => {
    m[r] = x;
    m[4 + r] = y;
    m[8 + r] = z;
    m[12 + r] = t;
  });
  m[15] = 1;
  return m;
}

/**
 * Smooth normals for one garment: the area-weighted sum of its triangles'
 * normals at each vertex. `pos` may hold every garment; the garment's
 * vertices start at particle `offset`. Writes 3 numbers per vertex to `out`.
 */
export function vertexNormals(pos, offset, tris, out) {
  out.fill(0);
  const base = 3 * offset;
  for (let k = 0; k < tris.length; k += 3) {
    const a = 3 * tris[k];
    const b = 3 * tris[k + 1];
    const c = 3 * tris[k + 2];
    const ex = pos[base + b] - pos[base + a];
    const ey = pos[base + b + 1] - pos[base + a + 1];
    const ez = pos[base + b + 2] - pos[base + a + 2];
    const fx = pos[base + c] - pos[base + a];
    const fy = pos[base + c + 1] - pos[base + a + 1];
    const fz = pos[base + c + 2] - pos[base + a + 2];
    const nx = ey * fz - ez * fy;
    const ny = ez * fx - ex * fz;
    const nz = ex * fy - ey * fx;
    for (const v of [a, b, c]) {
      out[v] += nx;
      out[v + 1] += ny;
      out[v + 2] += nz;
    }
  }
  for (let v = 0; v < out.length; v += 3) {
    const length = Math.sqrt(out[v] * out[v] + out[v + 1] * out[v + 1] + out[v + 2] * out[v + 2]);
    if (length > 0) {
      out[v] /= length;
      out[v + 1] /= length;
      out[v + 2] /= length;
    } else {
      out[v + 2] = 1;
    }
  }
}

/** Each vertex's edge neighbours as compact lists: neighbours of i are ids[start[i] .. start[i + 1]). */
export function neighbourLists({ count, stretch }) {
  const lists = Array.from({ length: count }, () => []);
  stretch.forEach(({ a, b }) => {
    lists[a].push(b);
    lists[b].push(a);
  });
  const start = new Int32Array(count + 1);
  lists.forEach((l, i) => { start[i + 1] = start[i] + l.length; });
  return { start, ids: Int32Array.from(lists.flat()) };
}

export const CREASE = 0.035; // darkening per unit a vertex sits below its neighbours
const DARKEST = 0.72;
const BRIGHTEST = 1.06;

/**
 * Ambient darkening per vertex: cloth lying lower than its neighbours sits
 * in a crease and gets less light. Writes one factor (about 0.72…1.06) per
 * vertex to `out`; flat cloth gets exactly 1. `crease` scales the darkening —
 * a finer mesh needs more, since a crease's depth below its neighbours
 * shrinks with the square of their spacing.
 */
export function cavity(pos, offset, { start, ids }, out, { crease = CREASE } = {}) {
  const base = 3 * offset;
  for (let i = 0; i < out.length; i += 1) {
    let sum = 0;
    for (let k = start[i]; k < start[i + 1]; k += 1) sum += pos[base + 3 * ids[k] + 2];
    const n = start[i + 1] - start[i];
    const depth = n > 0 ? pos[base + 3 * i + 2] - sum / n : 0;
    out[i] = depth === 0 ? 1 : Math.min(BRIGHTEST, Math.max(DARKEST, 1 + depth * crease));
  }
}
