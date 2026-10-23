/**
 * Bootstrap: read the owner's config, preload, build the scene and wire the
 * story together. See flow.js for the stage-by-stage behaviour.
 */

import { createMachine, isBusyState } from './core/state-machine.js';
import { hasFinePointer, prefersReducedMotion, storage, cssUrl } from './core/env.js';
import { BOX } from './scene/geometry.js';
import { buildParcel, applyArt } from './scene/parcel.js';
import { createCamera } from './scene/camera.js';
import { createTapeView } from './tape/tape-view.js';
import { createCutting } from './tape/cutting.js';
import { createSound } from './audio/sound.js';
import { preload, loadHandwritingFont } from './loader/preload.js';
import { createBookView } from './book/book-view.js';
import { createFlyer } from './book/flyer.js';
import { createControls } from './ui/controls.js';
import { createFlow } from './flow.js';
import { createClothes } from './cloth/layer.js';
import { createClothesInput } from './cloth/interaction.js';
import { createClothesKeys } from './cloth/keyboard.js';

/** Built-in art used whenever a configured file cannot be loaded. */
const FALLBACK = {
  boxFront: 'assets/art/box-front.svg',
  boxSide: 'assets/art/box-side.svg',
  flapLong: 'assets/art/flap-long.svg',
  flapShort: 'assets/art/flap-short.svg',
  boxInside: 'assets/art/box-inside.svg',
  boxFloor: 'assets/art/box-floor.svg',
  bookCover: 'assets/art/manual-cover.svg',
  endpaper: 'assets/art/manual-endpaper.svg',
  questionMark: 'assets/placeholders/question-mark.svg',
  desiccant: 'assets/art/desiccant.webp',
};

const $ = (id) => document.getElementById(id);

function showFatal(message) {
  const box = $('fatal');
  box.textContent = message;
  box.hidden = false;
  $('loader').hidden = true;
}

async function loadConfig() {
  try {
    return (await import('../content/site.js')).default;
  } catch (err) {
    showFatal('The parcel could not be prepared: content/site.js has an error (often a missing comma or quote).');
    throw err;
  }
}

function applyRootStyles(config) {
  const root = document.documentElement.style;
  const { cursors, textures } = config;
  root.setProperty('--cursor-knife', `${cssUrl(cursors.knife)} 3 29, ${cssUrl(cursors.knifeFallback)} 3 29, crosshair`);
  root.setProperty('--cursor-knife-pressed', `${cssUrl(cursors.knifePressed)} 3 29, ${cssUrl(cursors.knifeFallback)} 3 29, crosshair`);
  root.setProperty('--cursor-hand', `${cssUrl(cursors.hand)} 11 2, ${cssUrl(cursors.handFallback)} 11 2, pointer`);
  if (cursors.grab) root.setProperty('--cursor-grab', `${cssUrl(cursors.grab)} 16 16, ${cssUrl(cursors.grabFallback ?? cursors.grab)} 16 16, grab`);
  if (cursors.grabbing) {
    root.setProperty('--cursor-grabbing', `${cssUrl(cursors.grabbing)} 16 16, ${cssUrl(cursors.grabbingFallback ?? cursors.grabbing)} 16 16, grabbing`);
  }
  root.setProperty('--tex-paper', cssUrl(textures.paper));
  root.setProperty('--tex-grain', cssUrl(textures.grain));
}

function applyText(config, dom) {
  const { text, meta } = config;
  document.title = meta.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description);
  $('loader-text').textContent = text.loading;
  dom.clothesHint.textContent = text.clothesHint ?? '';
  dom.slider.setAttribute('aria-label', text.tapeLabel);
  $('slider-text').textContent = text.keyboardCut;
  $('reader-close').setAttribute('aria-label', text.closeBook);
  $('reader-prev').setAttribute('aria-label', text.previousPage);
  $('reader-next').setAttribute('aria-label', text.nextPage);
  $('reader-hint').textContent = hasFinePointer() ? text.readerHint : (text.readerHintTouch ?? text.readerHint);
  dom.reader.setAttribute('aria-label', text.bookTitle);
}

function createAnnouncer(node) {
  return (message) => {
    node.textContent = '';
    requestAnimationFrame(() => { node.textContent = message; });
  };
}

const isDraft = (alt) => !alt || alt.startsWith('[');

function reportPlaceholders(config, resolved, bookView) {
  const pending = Object.keys(FALLBACK).filter((key) => String(resolved[key] ?? '').includes('/placeholders/'));
  if (config.text.ownerName.startsWith('[')) pending.push('text.ownerName');
  if (isDraft(config.figurine?.alt)) pending.push('figurine.alt');
  (config.food ?? []).filter(({ alt }) => isDraft(alt)).forEach(({ id }) => pending.push(`food.${id}.alt`));
  if (bookView.hasPlaceholders()) pending.push('content/book.md');
  if (pending.length) {
    console.info(`[parcel] Placeholders still in use: ${pending.join(', ')}.\nSee README.md → "Make it yours".`);
  }
}

function imagePlan(config) {
  const art = Object.entries(config.art)
    .filter(([key]) => FALLBACK[key])
    .map(([key, src]) => ({ key, src: src || FALLBACK[key], fallback: FALLBACK[key] }));
  const extras = [
    { key: 'paper', src: config.textures.paper },
    { key: 'grain', src: config.textures.grain },
  ];
  if (config.art.instruction) extras.push({ key: 'instruction', src: config.art.instruction });
  extras.push(...(config.books ?? []).map(({ id, cover }) => ({ key: `book:${id}`, src: cover })));
  if (config.figurine) {
    extras.push({ key: 'solid:figurine', src: config.figurine.src }, { key: 'solid:figurine-wrap', src: config.figurine.wrap });
  }
  extras.push(...(config.food ?? []).map(({ id, src }) => ({ key: `solid:${id}`, src })));
  return [...art, ...extras];
}

/** The still pictures of the figurine and the food: their files and what they show. */
function applySolids({ figurine, food }, config, resolved) {
  if (config.figurine) {
    figurine.img.alt = config.figurine.alt;
    if (resolved['solid:figurine']) figurine.img.src = resolved['solid:figurine'];
    if (resolved['solid:figurine-wrap']) figurine.wrap.src = resolved['solid:figurine-wrap'];
  }
  (config.food ?? []).forEach(({ id, alt }) => {
    const item = food[id];
    if (!item) {
      console.warn(`[parcel] content/site.js lists a food "${id}" that the box has no place for.`);
      return;
    }
    item.img.alt = alt;
    if (resolved[`solid:${id}`]) item.img.src = resolved[`solid:${id}`];
  });
}

/** The still pictures' elements: while the clothes layer draws the bodies, these step aside. */
const solidElements = ({ figurine, food }) => [figurine.el, ...Object.values(food).map((f) => f.el)];

function fontsTask() {
  if (!document.fonts?.load) return Promise.resolve();
  return Promise.all([
    '500 32px Caveat', '700 32px Caveat', '400 18px "Noto Sans"', '700 18px "Noto Sans"',
  ].map((f) => document.fonts.load(f)));
}

function setInstruction(config, resolved, node) {
  const message = hasFinePointer() ? config.text.instruction : config.text.instructionTouch;
  node.replaceChildren();
  if (resolved.instruction) {
    const img = document.createElement('img');
    img.src = resolved.instruction;
    img.alt = message;
    node.append(img);
  } else {
    node.textContent = message;
  }
}

function trackInputModality() {
  let keyboard = false;
  addEventListener('keydown', (e) => { if (!e.metaKey && !e.ctrlKey) keyboard = true; }, true);
  addEventListener('pointerdown', () => { keyboard = false; }, true);
  return () => keyboard;
}

function wireReader(app, flow) {
  const { machine, bookView, dom } = app;
  $('reader-close').addEventListener('click', flow.closeBook);
  $('reader-prev').addEventListener('click', bookView.prev);
  $('reader-next').addEventListener('click', bookView.next);
  bookView.onFlip((visible) => {
    if (visible[0] > 1) dom.reader.classList.add('has-turned');
  });
  const keys = {
    ArrowRight: bookView.next,
    PageDown: bookView.next,
    ArrowLeft: bookView.prev,
    PageUp: bookView.prev,
    Home: () => bookView.goTo('start'),
    End: () => bookView.goTo('end'),
    Escape: flow.closeBook,
  };
  addEventListener('keydown', (e) => {
    if (machine.state !== 'reading' || !keys[e.key] || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    keys[e.key]();
  });
}

/** States in which the clothes are in view; during the reveal they appear once the light starts to rise. */
const CLOTHES_VISIBLE = new Set(['overhead', 'lifting', 'reading', 'closing']);
const CLOTHES_REVEAL_DELAY = 600;
const NO_KEYS = Object.freeze({ enable() {}, disable() {}, layout() {}, first: () => null });

/** Pointer and keyboard input for the clothes, and when they are shown. */
function wireClothes(app, flow) {
  const { machine, clothes, dom } = app;
  const input = clothes.enabled
    ? createClothesInput({ stage: dom.stage, clothes, canInteract: () => machine.state === 'overhead' })
    : { cancel() {} };
  app.clothesKeys = clothes.enabled
    ? createClothesKeys({
      host: $('clothes-controls'), clothes, text: app.text, announce: app.announce, afterLast: () => app.scene.book.button,
    })
    : NO_KEYS;
  flow.attachClothes();
  let shown = false;
  let lost = false;
  /** The layer draws the bodies while it shows and has its graphics; otherwise the still pictures do. */
  const handOver = () => {
    const on = clothes.rigidEnabled && shown && !lost;
    solidElements(app.scene.solids).forEach((el) => el.classList.toggle('is-handed-over', on));
  };
  clothes.onLost((isLost) => {
    lost = isLost;
    handOver();
  });
  const showClothes = (on) => {
    clothes.show(on);
    shown = on;
    handOver();
  };
  let timer = 0;
  machine.subscribe((to) => {
    clearTimeout(timer);
    if (to !== 'overhead') input.cancel();
    if (to === 'revealing') {
      timer = setTimeout(() => showClothes(true), prefersReducedMotion() ? 0 : CLOTHES_REVEAL_DELAY);
      return;
    }
    showClothes(CLOTHES_VISIBLE.has(to));
    if (to === 'sealed') clothes.reset();
  });
}

function wireResize(app, flow) {
  let frame = 0;
  let timer = 0;
  addEventListener('resize', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!app.machine.isBusy()) app.camera.refit();
    });
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (app.machine.state === 'reading') {
        app.bookView.relayout(flow.layoutNow()).catch((err) => console.error('[parcel] relayout failed:', err));
      }
    }, 220);
  });
}

async function start() {
  const config = await loadConfig();
  const dom = {
    stage: $('stage'), experience: $('experience'), reader: $('reader'), slider: $('cut-slider'),
    instruction: $('instruction'), clothesHint: $('clothes-hint'),
  };
  applyRootStyles(config);
  applyText(config, dom);

  const machine = createMachine();
  machine.subscribe((to) => { document.body.dataset.state = to; });
  const sound = createSound({ files: config.sounds, storage });
  const scene = buildParcel($('camera'), { text: config.text });
  const camera = createCamera({ stage: dom.stage, camera: $('camera'), parcel: scene.parcel });
  const tapeView = createTapeView({ svgs: scene.tapeSvgs, length: BOX.width, width: BOX.tapeWidth });
  const bookView = createBookView({
    mount: $('reader-book'),
    measureHost: $('measure'),
    ui: {
      prev: $('reader-prev'),
      next: $('reader-next'),
      indicatorVisual: $('indicator-visual'),
      indicatorSpoken: $('indicator-spoken'),
      fallbackFocus: $('reader'),
    },
    text: config.text,
    sound,
    reducedMotion: prefersReducedMotion,
  });
  const flyer = createFlyer({ root: $('flyer'), text: config.text });

  const app = {
    config, machine, scene, camera, sound, bookView, flyer, dom, text: config.text,
    announce: createAnnouncer($('announcer')),
    isKeyboardUser: trackInputModality(),
  };
  const flow = createFlow(app);
  let resolved = {};
  // A resize during an animation is ignored until the beat ends; catch up then.
  machine.subscribe((to) => {
    if (isBusyState(to)) return;
    camera.refit();
    if (to === 'reading') bookView.relayout(flow.layoutNow()).catch((err) => console.error('[parcel] relayout failed:', err));
  });
  app.resetInstruction = () => setInstruction(config, resolved, dom.instruction);

  app.cutting = createCutting({
    stage: dom.stage,
    parcel: scene.parcel,
    probes: scene.tapeProbes,
    view: tapeView,
    sound,
    slider: dom.slider,
    knifeMarker: $('knife-marker'),
    canCut: () => machine.state === 'sealed' || machine.state === 'cutting',
    onStart: () => { if (machine.state === 'sealed') machine.send('CUT_START'); },
    onProgress: (p) => { if (p > 0.35) dom.instruction.textContent = config.text.keepGoing; },
    onComplete: flow.openBox,
  });

  scene.question.addEventListener('click', flow.reveal);
  scene.book.button.addEventListener('click', flow.openBook);
  wireReader(app, flow);
  wireResize(app, flow);
  createControls({
    muteButton: $('mute'), restartButton: $('restart'), sound, text: config.text, machine, onRestart: flow.restart,
  });
  ['pointerdown', 'pointerup', 'keydown', 'touchend'].forEach((type) => {
    addEventListener(type, sound.unlock, { capture: true, passive: true });
  });

  const progressBar = $('loader-progress');
  const clothesTask = createClothes({ // always resolves
    canvas: $('clothes'), camera, reducedMotion: prefersReducedMotion, solids: { figurine: config.figurine, food: config.food },
  });
  resolved = await preload({
    images: imagePlan(config),
    tasks: [
      fontsTask(), loadHandwritingFont(config.handwriting.font), bookView.load(config.book.source), clothesTask,
      ...sound.prefetch(),
    ],
    onProgress: (f) => { progressBar.style.transform = `scaleX(${f.toFixed(3)})`; },
  });
  app.clothes = await clothesTask;
  wireClothes(app, flow);
  if (config.handwriting.font) document.documentElement.classList.add('owner-hand');

  applyArt(scene.parcel, { ...config.art, ...resolved }, { grain: resolved.grain });
  document.documentElement.style.setProperty('--art-book-cover', cssUrl(resolved.bookCover));
  document.documentElement.style.setProperty('--art-endpaper', cssUrl(resolved.endpaper));
  scene.questionImg.src = resolved.questionMark;
  scene.desiccant.src = resolved.desiccant;
  (config.books ?? []).forEach(({ id, alt }) => {
    const tome = scene.books[id];
    if (!tome) {
      console.warn(`[parcel] content/site.js lists a book "${id}" that the box has no place for.`);
      return;
    }
    tome.cover.alt = alt;
    if (resolved[`book:${id}`]) tome.cover.src = resolved[`book:${id}`];
    else tome.cover.hidden = true; // the block keeps its board colour
  });
  applySolids(scene.solids, config, resolved);
  app.resetInstruction();
  reportPlaceholders(config, resolved, bookView);

  $('loader').classList.add('is-done');
  machine.send('LOADED');
  setTimeout(() => { $('loader').hidden = true; }, 700);

  const jump = new URLSearchParams(location.search).get('jump');
  if (jump) await flow.fastForward(jump);

  globalThis.__parcel = {
    get state() { return machine.state; },
    progress: () => app.cutting.progress(),
    sound: () => sound.status(),
    book: () => bookView.status(),
    clothes: () => ({ ...app.clothes.status(), reachable: flow.bookReachable() }),
    /** The id of the body (a garment, the figurine or a food item) on top at screen point (x, y), or null. */
    pick: (x, y) => app.clothes.pickAt(x, y)?.id ?? null,
    /** What lies on top at (x, y): its id, the texture point and the picture's opacity there. */
    hit: (x, y) => {
      const hit = app.clothes.pickAt(x, y);
      return hit ? { id: hit.id, uv: hit.uv, opacity: hit.opacity } : null;
    },
    /** Any body's outline on screen (the name is older than the figurine and the food). */
    garmentBox: (id) => app.clothes.screenBox(app.clothes.bodies.findIndex((b) => b.id === id)),
    /** Where a rigid body's top at picture point (u, v) is on screen. */
    bodyScreen: (id, uv) => app.clothes.bodyScreen(id, uv),
    /** Every garment off to the side of the box. */
    clearAside: () => app.clothes.clearAside(),
    project: (point) => app.clothes.project(point),
    pixel: (x, y) => app.clothes.pixelAt(x, y),
  };
}

start().catch((err) => {
  console.error('[parcel] failed to start:', err);
  if ($('fatal').hidden) showFatal('Something went wrong while unpacking. Please reload the page.');
});
