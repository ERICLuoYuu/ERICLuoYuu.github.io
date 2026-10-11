/**
 * The camera looking at the parcel. One tween moves tilt, spin, zoom,
 * perspective and the interior light together, so the change of viewpoint and
 * the brightening read as one continuous motion.
 */

import { frameFor } from './geometry.js';
import { tween, lerp, easings } from '../core/tween.js';

const smoothstep = (a, b, t) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

export function createCamera({ stage, camera, parcel }) {
  let view = 'threeQuarter';
  let current = frameFor(view, innerWidth, innerHeight);
  const listeners = new Set();

  const apply = (f) => {
    current = f;
    listeners.forEach((fn) => fn(current));
    stage.style.perspective = `${f.perspective.toFixed(1)}px`;
    camera.style.setProperty('--tilt', f.tilt.toFixed(3));
    camera.style.setProperty('--spin', f.spin.toFixed(3));
    camera.style.transform = `translate3d(${f.panX.toFixed(2)}px, ${f.panY.toFixed(2)}px, 0) `
      + `scale3d(${f.zoom}, ${f.zoom}, ${f.zoom}) rotateX(${f.tilt}deg) rotateZ(${f.spin}deg)`;
    parcel.style.setProperty('--light', f.light.toFixed(3));
  };

  /** Jump straight to a view (used for restart, resize and reduced motion). */
  const set = (name) => {
    view = name;
    apply(frameFor(name, innerWidth, innerHeight));
  };

  /** Animate to a view; the light follows a slightly delayed curve. */
  const move = (name, { duration }) => {
    const from = current;
    const to = frameFor(name, innerWidth, innerHeight);
    view = name;
    return tween({
      duration,
      easing: easings.easeInOutCubic,
      onUpdate: (t, raw) => {
        const keys = ['tilt', 'spin', 'zoom', 'panX', 'panY', 'perspective'];
        const frame = Object.fromEntries(keys.map((k) => [k, lerp(from[k], to[k], t)]));
        apply({ ...frame, light: lerp(from.light, to.light, smoothstep(0.12, 0.8, raw)) });
      },
    });
  };

  /** Re-frame for a new screen size without changing the view. */
  const refit = () => apply({ ...frameFor(view, innerWidth, innerHeight), light: current.light });

  apply(current);
  return {
    set,
    move,
    refit,
    get view() { return view; },
    /** The frame last applied (tilt, spin, zoom, pan, perspective, light). */
    frame: () => current,
    /** Call fn with every new frame; returns an unsubscribe function. */
    onChange: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
