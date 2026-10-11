/**
 * The CSS camera as plain maths, so a WebGL layer can draw in exactly the
 * same place as the CSS-3D parcel. Pure — no DOM.
 *
 * The CSS chain (scene.css, camera.js) is:
 *   .stage   perspective P, origin at the viewport centre
 *   .camera  translate3d(panX, panY, 0) scale3d(zoom) rotateX(tilt) rotateZ(spin)
 *   .parcel  offset by (−W/2, −D/2) so the floor centre sits on the camera origin
 * so a parcel point p ends up at t = pan + zoom · Rx(tilt) · Rz(spin) · (p − centre)
 * and on screen at centre + t.xy · P / (P − t.z).
 *
 * frame    = { tilt, spin, zoom, panX, panY, perspective } (see geometry.frameFor)
 * viewport = { width, height } in CSS pixels
 */

import { BOX, rotateX, rotateZ } from './geometry.js';

const CENTRE = [BOX.width / 2, BOX.depth / 2, 0];

/** Parcel point → camera space ("t"), before the perspective divide. */
function toCamera(frame, [x, y, z]) {
  const local = [x - CENTRE[0], y - CENTRE[1], z - CENTRE[2]];
  const [rx, ry, rz] = rotateX(rotateZ(local, frame.spin), frame.tilt);
  return [rx * frame.zoom + frame.panX, ry * frame.zoom + frame.panY, rz * frame.zoom];
}

/** Camera-space point or direction → parcel space (the inverse of toCamera). */
function fromCamera(frame, [x, y, z], isDirection = false) {
  const unpanned = isDirection ? [x, y, z] : [x - frame.panX, y - frame.panY, z];
  const scaled = unpanned.map((v) => v / frame.zoom);
  const [px, py, pz] = rotateZ(rotateX(scaled, -frame.tilt), -frame.spin);
  return isDirection ? [px, py, pz] : [px + CENTRE[0], py + CENTRE[1], pz + CENTRE[2]];
}

/** Screen position (CSS px) of a parcel point, plus its distance along the view axis. */
export function projectPoint(frame, viewport, point) {
  const [tx, ty, tz] = toCamera(frame, point);
  const scale = frame.perspective / (frame.perspective - tz);
  return { x: viewport.width / 2 + tx * scale, y: viewport.height / 2 + ty * scale, depth: frame.perspective - tz };
}

/** The pointer's line of sight in parcel space: from the eye through screen point (sx, sy). */
export function screenRay(frame, viewport, sx, sy) {
  const eye = [0, 0, frame.perspective];
  const onScreen = [sx - viewport.width / 2, sy - viewport.height / 2, 0];
  const dir = fromCamera(frame, onScreen.map((v, i) => v - eye[i]), true);
  const length = Math.hypot(...dir);
  return { origin: fromCamera(frame, eye), dir: dir.map((v) => v / length) };
}

/**
 * Column-major 4 × 4 matrix from parcel space to WebGL clip space.
 * Depth runs from `near` (closest to the eye) to `far` along the view axis.
 */
export function cameraMatrix(frame, viewport) {
  const P = frame.perspective;
  const near = Math.max(P * 0.02, P - 900 * frame.zoom);
  const far = P + 1200 * frame.zoom;
  const a = (far + near) / (far - near);
  const b = (2 * far * near) / (far - near);

  // Camera space is affine in the parcel point: t = base + x·ex + y·ey + z·ez.
  const base = toCamera(frame, [0, 0, 0]);
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((p) => toCamera(frame, p).map((v, i) => v - base[i]));

  // Clip rows as functions of t: x_c = 2tx/vw, y_c = −2ty/vh, z_c = (a(P − tz) − b)/P, w_c = (P − tz)/P.
  const rows = [
    [2 / viewport.width, 0, 0, 0],
    [0, -2 / viewport.height, 0, 0],
    [0, 0, -a / P, (a * P - b) / P],
    [0, 0, -1 / P, 1],
  ];
  const m = new Float32Array(16);
  rows.forEach(([rx, ry, rz, r0], r) => {
    const along = (t) => rx * t[0] + ry * t[1] + rz * t[2];
    m[r] = along(axes[0]);
    m[4 + r] = along(axes[1]);
    m[8 + r] = along(axes[2]);
    m[12 + r] = along(base) + r0;
  });
  return m;
}
