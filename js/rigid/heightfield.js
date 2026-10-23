/**
 * A rigid body's shape for drawing and picking: a heightfield over its
 * footprint, raised by its relief map, built once in the body's own space and
 * moved into place by one matrix. Pure — no DOM.
 *
 * Body space: x across the footprint's width, y across its depth (v = 0 at
 * the back, like the top of its picture), z up from its base.
 */

import { rotateZ } from '../scene/geometry.js';

export const SPACING = 2; // units between heightfield points
const REFINE = 6; // halvings that place a pick on the surface between two march steps

/**
 * @param {{footprint: number[], height: number}} shape
 * @param {(u: number, v: number) => number} sample  the relief, 0…1, at picture coordinates (u, v)
 * @returns {{positions: Float32Array, normals: Float32Array, uv: Float32Array, indices: Uint16Array, count: number}}
 */
export function heightfieldMesh({ footprint: [w, d], height }, sample, spacing = SPACING) {
  const cols = Math.ceil(w / spacing) + 1;
  const rows = Math.ceil(d / spacing) + 1;
  const count = cols * rows;
  if (count > 65535) throw new Error(`a heightfield of ${count} points needs more than 16-bit indices`);
  const positions = new Float32Array(3 * count);
  const uv = new Float32Array(2 * count);
  const z = new Float32Array(count);
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const k = j * cols + i;
      const [u, v] = [i / (cols - 1), j / (rows - 1)];
      z[k] = height * sample(u, v);
      positions.set([(u - 0.5) * w, (v - 0.5) * d, z[k]], 3 * k);
      uv.set([u, v], 2 * k);
    }
  }
  const normals = new Float32Array(3 * count);
  const [dx, dy] = [w / (cols - 1), d / (rows - 1)];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const [i0, i1, j0, j1] = [Math.max(0, i - 1), Math.min(cols - 1, i + 1), Math.max(0, j - 1), Math.min(rows - 1, j + 1)];
      const gx = (z[j * cols + i1] - z[j * cols + i0]) / ((i1 - i0) * dx);
      const gy = (z[j1 * cols + i] - z[j0 * cols + i]) / ((j1 - j0) * dy);
      const length = Math.hypot(gx, gy, 1);
      normals.set([0 - gx / length, 0 - gy / length, 1 / length], 3 * (j * cols + i)); // 0 − g: never −0
    }
  }
  const indices = new Uint16Array(6 * (cols - 1) * (rows - 1));
  let n = 0;
  for (let j = 0; j < rows - 1; j += 1) {
    for (let i = 0; i < cols - 1; i += 1) {
      const a = j * cols + i;
      indices.set([a, a + 1, a + cols, a + 1, a + cols + 1, a + cols], n);
      n += 6;
    }
  }
  return { positions, normals, uv, indices, count };
}

/** Column-major 4 × 4 matrix from body space to parcel space: turned by `rotate` about z, then moved to `position`. */
export function modelMatrix({ position: [x, y, z], rotate }) {
  const [c, s] = [Math.cos((rotate * Math.PI) / 180), Math.sin((rotate * Math.PI) / 180)];
  return Float32Array.from([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

/** A parcel point in the body's picture coordinates (u, v) and its height above the base, or null off the footprint. */
function onBody(body, [px, py, pz]) {
  const [w, d] = body.footprint;
  const [lx, ly] = rotateZ([px - body.position[0], py - body.position[1], 0], -body.rotate);
  if (Math.abs(lx) > w / 2 || Math.abs(ly) > d / 2) return null;
  return { u: lx / w + 0.5, v: ly / d + 0.5, up: pz - body.position[2] };
}

/**
 * Where the line of sight first meets the body: marching from where it
 * enters the body's height down to its base, the first point over the
 * footprint, at or under the relief surface, where the picture is at least
 * half opaque. null when it misses (or meets only clear parts).
 *
 * @returns {{t: number, point: number[], uv: number[], opacity: number}|null}
 */
export function pickBody({ origin, dir }, body, { alpha, relief }, { steps = 48 } = {}) {
  if (Math.abs(dir[2]) < 1e-9) return null;
  const at = (t) => origin.map((o, k) => o + dir[k] * t);
  const [base, top] = [body.position[2], body.position[2] + body.height];
  const [ta, tb] = [(top - origin[2]) / dir[2], (base - origin[2]) / dir[2]];
  const [t0, t1] = [Math.max(0, Math.min(ta, tb)), Math.max(ta, tb)];
  if (t1 < 0) return null;
  const below = (t) => {
    const p = onBody(body, at(t));
    return p && p.up <= body.height * relief(p.u, p.v) + 1e-6 ? p : null;
  };
  let previous = t0;
  for (let k = 0; k <= steps; k += 1) {
    const t = t0 + ((t1 - t0) * k) / steps;
    const p = below(t);
    if (p && alpha(p.u, p.v) >= 0.5) {
      let [lo, hi] = [previous, t];
      for (let r = 0; k > 0 && r < REFINE; r += 1) {
        const mid = (lo + hi) / 2;
        if (below(mid)) hi = mid;
        else lo = mid;
      }
      const hit = onBody(body, at(hi)) ?? p;
      return { t: hi, point: at(hi), uv: [hit.u, hit.v], opacity: alpha(hit.u, hit.v) };
    }
    previous = t;
  }
  return null;
}
