/**
 * Which garment is under the pointer? Cast the pointer's line of sight
 * (projection.screenRay) against every cloth triangle and keep the nearest
 * hit whose texture is actually opaque there. Pure — no DOM.
 */

const EPSILON = 1e-9;

/** Möller–Trumbore, both faces: distance along the ray and barycentrics, or null. */
function hitTriangle(origin, dir, pos, a, b, c) {
  const e1 = [pos[3 * b] - pos[3 * a], pos[3 * b + 1] - pos[3 * a + 1], pos[3 * b + 2] - pos[3 * a + 2]];
  const e2 = [pos[3 * c] - pos[3 * a], pos[3 * c + 1] - pos[3 * a + 1], pos[3 * c + 2] - pos[3 * a + 2]];
  const p = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < EPSILON) return null;
  const inv = 1 / det;
  const s = [origin[0] - pos[3 * a], origin[1] - pos[3 * a + 1], origin[2] - pos[3 * a + 2]];
  const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv;
  if (u < 0 || u > 1) return null;
  const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  const v = (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
  return t > EPSILON ? { t, u, v } : null;
}

/** Does the ray come within reach of garment g's bounding box at all? */
function mayHit(world, g, origin, dir) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = world.offsets[g]; i < world.offsets[g] + world.counts[g]; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      min[c] = Math.min(min[c], world.pos[3 * i + c]);
      max[c] = Math.max(max[c], world.pos[3 * i + c]);
    }
  }
  let near = -Infinity;
  let far = Infinity;
  for (let c = 0; c < 3; c += 1) {
    if (Math.abs(dir[c]) < EPSILON) {
      if (origin[c] < min[c] || origin[c] > max[c]) return false;
    } else {
      const t1 = (min[c] - origin[c]) / dir[c];
      const t2 = (max[c] - origin[c]) / dir[c];
      near = Math.max(near, Math.min(t1, t2));
      far = Math.min(far, Math.max(t1, t2));
    }
  }
  return far >= Math.max(near, 0);
}

/**
 * @param world   solver world
 * @param meshes  each garment's mesh (for triangles and UVs), in world order
 * @param ray     {origin, dir} in parcel space, dir normalised
 * @param alphaAt (garment, u, v) → opacity 0…1 of the garment's texture
 * @returns {{garment:number, ids:number[], point:number[], uv:number[], t:number} | null}
 */
export function pick(world, meshes, { origin, dir }, alphaAt) {
  let best = null;
  meshes.forEach((mesh, g) => {
    if (!mayHit(world, g, origin, dir)) return;
    const offset = world.offsets[g];
    for (let k = 0; k < mesh.tris.length; k += 3) {
      const [a, b, c] = [mesh.tris[k] + offset, mesh.tris[k + 1] + offset, mesh.tris[k + 2] + offset];
      const hit = hitTriangle(origin, dir, world.pos, a, b, c);
      if (!hit || (best && hit.t >= best.t)) continue;
      const weights = [1 - hit.u - hit.v, hit.u, hit.v];
      const local = [mesh.tris[k], mesh.tris[k + 1], mesh.tris[k + 2]];
      const uv = [0, 1].map((axis) => local.reduce((sum, id, n) => sum + mesh.uv[2 * id + axis] * weights[n], 0));
      if (alphaAt(g, uv[0], uv[1]) < 0.5) continue;
      best = { garment: g, ids: [a, b, c], point: origin.map((o, i) => o + dir[i] * hit.t), uv, t: hit.t };
    }
  });
  return best;
}
