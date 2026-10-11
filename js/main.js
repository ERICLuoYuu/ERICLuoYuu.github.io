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

/** Built-in art used whenever a configured file cannot be loaded. */
const FALLBACK = {
  boxFront: 'assets/art/box-front.svg',
  boxSide: 'assets/art/box-side.svg',
  flapLong: 'assets/art/flap-long.svg',
  flapShort: 'assets/art/flap-short.svg',
  boxInside: 'assets/art/box-inside.svg',
  boxFloor: 'assets/art/box-floor.svg',
  bookCover: 'assets/placeholders/book-cover.svg',
  endpaper: 'assets/placeholders/endpaper.svg',
  questionMark: 'assets/placeholders/question-mark.svg',
  desiccant: 'assets/art/desiccant.webp',
  photo: 'assets/placeholders/photo.svg',
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
  root.setProperty('--tex-paper', cssUrl(textures.paper));
  root.setProperty('--tex-grain', cssUrl(textures.grain));
}

function applyText(config, dom) {
  const { text, meta } = config;
  document.title = meta.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description);
  $('loader-text').textContent = text.loading;
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

function reportPlaceholders(config, resolved, bookView) {
  const pending = Object.keys(FALLBACK).filter((key) => String(resolved[key] ?? '').includes('/placeholders/'));
  if (!config.photo.alt || config.photo.alt.startsWith('[')) pending.push('photo.alt');
  if (config.text.ownerName.startsWith('[')) pending.push('text.ownerName');
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
    { key: 'photo', src: config.photo.src, fallback: FALLBACK.photo },
    { key: 'paper', src: config.textures.paper },
    { key: 'grain', src: config.textures.grain },
  ];
  if (config.art.instruction) extras.push({ key: 'instruction', src: config.art.instruction });
  return [...art, ...extras];
}

function fontsTask() {
  if (!document.fonts?.load) return Promise.resolve();
  return Promise.all([
    '500 32px Caveat', '700 32px Caveat', '400 18px Lora', 'italic 400 18px Lora', '600 18px Lora',
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
    instruction: $('instruction'),
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
  resolved = await preload({
    images: imagePlan(config),
    tasks: [fontsTask(), loadHandwritingFont(config.handwriting.font), bookView.load(config.book.source), ...sound.prefetch()],
    onProgress: (f) => { progressBar.style.transform = `scaleX(${f.toFixed(3)})`; },
  });
  if (config.handwriting.font) document.documentElement.classList.add('owner-hand');

  applyArt(scene.parcel, { ...config.art, ...resolved }, { grain: resolved.grain });
  document.documentElement.style.setProperty('--art-book-cover', cssUrl(resolved.bookCover));
  document.documentElement.style.setProperty('--art-endpaper', cssUrl(resolved.endpaper));
  scene.photo.img.src = resolved.photo;
  scene.photo.img.alt = config.photo.alt;
  scene.questionImg.src = resolved.questionMark;
  scene.desiccant.src = resolved.desiccant;
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
  };
}

start().catch((err) => {
  console.error('[parcel] failed to start:', err);
  if ($('fatal').hidden) showFatal('Something went wrong while unpacking. Please reload the page.');
});
