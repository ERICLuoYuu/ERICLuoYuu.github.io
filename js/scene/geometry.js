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
  // The owner's vacuum pack, flat along the left wall, the full depth of the box.
  pack: Object.freeze({ x: 6, y: 5, width: 181, height: 290, thickness: 4, rotate: 0 }),
  // The booklet, upper right, where the clothes pile hides it.
  book: Object.freeze({ x: 252, y: 11, width: 96, height: 134, thickness: 8, rotate: 4 }),
  // The silica-gel packet, tucked into the front-right corner.
  desiccant: Object.freeze({ x: 387, y: 260, width: 24, height: 34, thickness: 3, rotate: 8 }),
});

/**
 * The owner's books, lying in the lower right (tools/generate_books.py draws
 * their covers). `on` names the book an item lies on; otherwise it lies on
 * the floor.
 */
export const BOOKS = Object.freeze([
  Object.freeze({ id: 'dictionary', x: 202, y: 184, width: 70, height: 96, thickness: 20, rotate: -6 }),
  Object.freeze({ id: 'hunter-x-hunter', x: 212, y: 192, width: 50, height: 78, thickness: 7, rotate: 7, on: 'dictionary' }),
  Object.freeze({ id: 'solitude', x: 282, y: 174, width: 58, height: 88, thickness: 10, rotate: 4 }),
  Object.freeze({ id: 'siddhartha', x: 352, y: 166, width: 56, height: 86, thickness: 8, rotate: -5 }),
]);

/** Height of the surface an item lies on: the top of the book its `on` names, or the floor. */
export function baseOf({ on }) {
  if (!on) return 0;
  const below = BOOKS.find((b) => b.id === on);
  if (!below) throw new Error(`nothing called "${on}" to lie on`);
  return baseOf(below) + below.thickness;
}

/** How far each flap swings open (CSS rotateX, degrees). parcel.js hands these to scene.css. */
export const FLAP_OPEN = Object.freeze({ front: -156, back: -116, left: -134, right: -147 });

const RAD = Math.PI / 180;

/** CSS rotateX(deg) applied to a point (x right, y down, z toward the viewer). */
export function rotateX([x, y, z], deg) {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return [x, y * c - z * s, y * s + z * c];
}

/** CSS rotateZ(deg) applied to a point: clockwise on screen. */
export function rotateZ([x, y, z], deg) {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return [x * c - y * s, x * s + y * c, z];
}

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
