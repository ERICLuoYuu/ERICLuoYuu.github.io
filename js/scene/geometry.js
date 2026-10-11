/**
 * Shared measurements for the parcel (in CSS pixels before camera zoom) and
 * how the camera frames it on a given screen. Pure — no DOM.
 */

export const BOX = Object.freeze({
  width: 420, // x — long side
  depth: 300, // y — short side
  height: 220, // z — walls
  flapDepth: 150, // every flap reaches half the depth (regular slotted carton)
  tapeWidth: 56,
  tapeDrop: 64, // how far the tape runs down the short walls
  longFlapLift: 1.6, // long flaps sit on top of the short flaps
  shortFlapLift: 0.6,
  tapeLift: 0.8,
});

/** Things lying on the floor of the box, in floor coordinates. */
export const CONTENTS = Object.freeze({
  photo: Object.freeze({ x: 24, y: 34, width: 148, height: 230, rotate: -6 }),
  book: Object.freeze({ x: 198, y: 28, width: 164, height: 228, thickness: 8, rotate: 4 }),
  desiccant: Object.freeze({ x: 368, y: 232, width: 42, height: 60, thickness: 3, rotate: -12 }),
});

/** Camera angles (degrees) and interior light for each view. */
export const VIEWS = Object.freeze({
  threeQuarter: Object.freeze({ tilt: 54, spin: -34, light: 0 }),
  overhead: Object.freeze({ tilt: 0, spin: -3, light: 1 }),
});


/** Perspective distance as a multiple of the zoomed wall height. */
const PERSPECTIVE_FACTOR = { threeQuarter: 6, overhead: 4.4 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** How much larger the rim looks than the floor, for a frame. */
export function rimMagnification({ zoom, perspective }) {
  return perspective / (perspective - BOX.height * zoom);
}

/**
 * @param {'threeQuarter'|'overhead'} view
 * @returns {{tilt:number, spin:number, light:number, zoom:number, panX:number, panY:number, perspective:number}}
 */
export function frameFor(view, vw, vh) {
  const angles = VIEWS[view];
  if (!angles) throw new Error(`Unknown view "${view}"`);
  const factor = PERSPECTIVE_FACTOR[view];
  const magnification = factor / (factor - 1);

  if (view === 'threeQuarter') {
    const zoom = clamp(Math.min(vw / 640, (vh - 150) / 520), 0.45, 1.5);
    return {
      ...angles,
      zoom,
      panX: 0,
      panY: BOX.height * 0.24 * zoom - Math.min(40, vh * 0.04),
      perspective: factor * BOX.height * zoom,
    };
  }

  const zoom = clamp(
    Math.min((vw * 0.94) / (BOX.width * magnification), ((vh - 96) * 0.92) / (BOX.depth * magnification)),
    0.4,
    3,
  );
  return { ...angles, zoom, panX: 0, panY: 0, perspective: factor * BOX.height * zoom };
}

/** Tape corners in parcel coordinates (TL, TR, BR, BL) — matches tape space (0,0)…(width,tapeWidth). */
export function tapeCorners() {
  const z = BOX.height + BOX.longFlapLift + BOX.tapeLift;
  const top = BOX.depth / 2 - BOX.tapeWidth / 2;
  const bottom = BOX.depth / 2 + BOX.tapeWidth / 2;
  return [
    { x: 0, y: top, z },
    { x: BOX.width, y: top, z },
    { x: BOX.width, y: bottom, z },
    { x: 0, y: bottom, z },
  ];
}
