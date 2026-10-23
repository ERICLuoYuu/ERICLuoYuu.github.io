/**
 * The figurine's and the food's pictures, loaded for the WebGL layer: each
 * body's colour and relief, the figurine's bag, and samplers that read a
 * picture's opacity and relief at (u, v) for picking and placing the pointer.
 */

import { FIGURINE, FOOD } from '../scene/geometry.js';

export const CLEARANCE = 2; // units the bag lies over the figure (tools/prepare_figurine.py)
const SAMPLE_SCALE = 0.5; // the samplers read a half-size copy of each picture

async function loadImage(src) {
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
  } catch {
    throw new Error(`${src} is missing or could not be loaded`);
  }
  return image;
}

/** Every path loaded, in order; throws naming the first that fails (in this order, not the first to fail in time). */
async function loadAll(paths) {
  const results = await Promise.allSettled(paths.map(loadImage));
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) throw failed.reason;
  return results.map((r) => r.value);
}

/** (u, v) → one channel of the picture, 0…1, from a reduced copy. */
function channelSampler(image, channel) {
  const width = Math.max(1, Math.round(image.naturalWidth * SAMPLE_SCALE));
  const height = Math.max(1, Math.round(image.naturalHeight * SAMPLE_SCALE));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const values = new Uint8Array(width * height);
  for (let i = 0; i < values.length; i += 1) values[i] = data[4 * i + channel];
  const clamp = (v, n) => Math.min(n - 1, Math.max(0, Math.floor(v * n)));
  return (u, v) => values[clamp(v, height) * width + clamp(u, width)] / 255;
}

/** The config's food, checked against FOOD in js/scene/geometry.js: the same ids, in the same order. */
function checkFood(food) {
  const ids = FOOD.map((f) => f.id);
  const given = (food ?? []).map((f) => f.id);
  const wrong = ids.findIndex((id, i) => given[i] !== id);
  if (wrong >= 0 || given.length !== ids.length) {
    throw new Error(`content/site.js food must list ${ids.join(', ')} in that order (found ${given.join(', ') || 'none'})`);
  }
}

/**
 * @param {{figurine: {src, relief, wrap, wrapRelief}, food: {id, src, relief}[]}} config  content/site.js
 * @returns {Promise<{defs: object[], images: HTMLImageElement[], reliefs: HTMLImageElement[],
 *          wraps: ({image, relief, level}|null)[], samplers: {alpha: Function, relief: Function}[]}>}
 *   in the order FIGURINE, ...FOOD; wraps[i] is the figurine's bag (level: its height 0…1 at (u, v)), null for food.
 */
export async function loadSolids({ figurine, food }) {
  if (!figurine) throw new Error('content/site.js has no figurine');
  checkFood(food);
  const items = [figurine, ...food];
  const paths = [...items.flatMap((i) => [i.src, i.relief]), figurine.wrap, figurine.wrapRelief];
  const loaded = await loadAll(paths);
  const images = items.map((_, i) => loaded[2 * i]);
  const reliefs = items.map((_, i) => loaded[2 * i + 1]);
  const [wrapImage, wrapRelief] = loaded.slice(-2);
  return {
    defs: [FIGURINE, ...FOOD],
    images,
    reliefs,
    wraps: items.map((_, i) => (i === 0 ? { image: wrapImage, relief: wrapRelief, level: channelSampler(wrapRelief, 0) } : null)),
    samplers: items.map((_, i) => ({ alpha: channelSampler(images[i], 3), relief: channelSampler(reliefs[i], 0) })),
  };
}
