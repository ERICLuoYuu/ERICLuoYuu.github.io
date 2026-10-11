/**
 * The story beats: open the box, reveal the inside, open and close the book,
 * restart. Each busy beat runs through machine.perform(), which refuses to
 * start while another beat is still running.
 *
 * Inside the box the clothes lie on the booklet. It stays out of reach — no
 * clicks, no hover lift, no tab stop — until the visitor has moved enough of
 * them aside (coverage.isBookUncovered), and is locked again if they pile
 * clothes back on it. The clothes arrive after the flow is created
 * (app.clothes, app.clothesKeys), so they are looked up when needed.
 */

import { prefersReducedMotion as reduced, motionMs } from './core/env.js';
import { wait } from './core/tween.js';
import { screenPoint } from './scene/parcel.js';
import { computeBookLayout } from './book/layout.js';
import { isBookUncovered } from './cloth/coverage.js';

const FLAP_SOUNDS = [0, 0.13, 0.4, 0.52];

export function createFlow(app) {
  const { machine, scene, camera, sound, bookView, flyer, dom, announce, text } = app;

  /** Fade the scene out and in around an instant change (reduced motion). */
  async function crossfade(change) {
    const out = dom.stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
    await out.finished;
    change();
    await dom.stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260 }).finished;
    out.cancel();
  }

  const focusIfKeyboard = (el) => {
    if (el && app.isKeyboardUser()) el.focus({ preventScroll: true });
  };

  // ─── the booklet under the clothes ───────────────────────────────────────

  const hasClothes = () => Boolean(app.clothes?.enabled);
  let reachable = true;

  /** Booklet reachable or not: its tab stop, hover lift, what screen readers hear and the hint follow. */
  function setReachable(on) {
    reachable = on;
    const overhead = machine.state === 'overhead';
    scene.book.el.classList.toggle('is-reachable', on);
    scene.book.button.tabIndex = on && overhead ? 0 : -1;
    scene.book.button.setAttribute('aria-disabled', String(!on));
    dom.clothesHint.hidden = on || !overhead || !hasClothes();
  }

  /** Looking down into the box: lock the booklet if the clothes hide it, and offer the keyboard moves. */
  function arrive() {
    if (!hasClothes()) {
      setReachable(true);
      return;
    }
    setReachable(isBookUncovered(app.clothes.coverage(), false));
    app.clothesKeys.enable();
  }

  /** After the clothes come to rest: has the booklet been uncovered, or buried again? */
  function updateBook() {
    if (!hasClothes() || machine.state !== 'overhead') return;
    app.clothesKeys.layout();
    const now = isBookUncovered(app.clothes.coverage(), reachable);
    if (now === reachable) return;
    setReachable(now);
    announce(now ? text.bookUncovered : text.clothesHint);
  }

  /** Called once the clothes layer exists. */
  function attachClothes() {
    reachable = !hasClothes();
    if (hasClothes()) app.clothes.onSettle(updateBook);
  }

  async function openBox() {
    const ran = await machine.perform('CUT_DONE', async () => {
      scene.parcel.classList.add('is-cut');
      await wait(motionMs(380));
      scene.parcel.classList.add('is-open');
      if (reduced()) {
        sound.play('flap');
        await crossfade(() => {});
      } else {
        FLAP_SOUNDS.forEach((delay, i) => sound.play('flap', { delay, rate: 0.9 + i * 0.06, volume: 0.8 }));
        await wait(1750);
      }
    }, 'OPENED');
    if (!ran) return;
    scene.question.tabIndex = 0;
    announce('The tape is cut and the box is open. It is dark inside, except for a question mark.');
    focusIfKeyboard(scene.question);
  }

  async function reveal() {
    const ran = await machine.perform('REVEAL', async () => {
      sound.unlock();
      sound.play('tap');
      sound.play('reveal', { volume: 0.6, delay: 0.25 });
      scene.question.tabIndex = -1;
      if (reduced()) await crossfade(() => camera.set('overhead'));
      else await camera.move('overhead', { duration: 2300 });
    }, 'REVEALED');
    if (!ran) return;
    arrive();
    if (hasClothes()) {
      announce('Looking down into the box: a photo, a pile of clothes, and something underneath.');
      focusIfKeyboard(reachable ? scene.book.button : app.clothesKeys.first());
    } else {
      announce('Looking down into the box: a photo and a little book.');
      focusIfKeyboard(scene.book.button);
    }
  }

  const bookQuad = () => scene.book.corners.map(screenPoint);
  const layoutNow = () => computeBookLayout({ width: innerWidth, height: innerHeight });

  async function openBook() {
    if (!reachable) { // only a screen reader's browsing can still press it
      announce(text.clothesHint);
      return;
    }
    const ran = await machine.perform('OPEN_BOOK', async () => {
      sound.unlock();
      sound.play('whoosh', { volume: 0.8 });
      const layout = layoutNow();
      const quad = bookQuad();
      bookView.prepare(layout);
      flyer.setPages(bookView.openingPages());
      scene.book.el.classList.add('is-away');
      document.body.classList.add('reader-open');
      dom.experience.inert = true;
      await flyer.lift(quad, layout, { reduced: reduced() });
      sound.play('page', { volume: 0.6, rate: 0.8 });
      await flyer.openCover({ reduced: reduced() });
      dom.reader.hidden = false;
      try {
        await bookView.show();
      } catch (err) {
        bookView.showError(text.bookError ?? 'This book could not be opened right now.');
        throw err;
      } finally {
        flyer.hide();
      }
    }, 'BOOK_OPENED');
    if (!ran) return;
    dom.reader.focus({ preventScroll: true });
    announce(`${text.bookTitle}: the book is open. Use the arrow keys or the page buttons to turn pages.`);
  }

  async function closeBook() {
    const ran = await machine.perform('CLOSE_BOOK', async () => {
      flyer.showOpen(bookView.layout, bookView.snapshot());
      dom.reader.hidden = true;
      bookView.destroy();
      sound.play('page', { volume: 0.5, rate: 0.85 });
      await flyer.closeCover({ reduced: reduced() });
      document.body.classList.remove('reader-open');
      sound.play('whoosh', { volume: 0.5, rate: 1.15 });
      await flyer.land(bookQuad(), { reduced: reduced() });
      scene.book.el.classList.remove('is-away');
      flyer.hide();
      dom.experience.inert = false;
    }, 'BOOK_CLOSED');
    if (!ran) return;
    scene.book.button.focus({ preventScroll: true });
    announce('The book is back in the box.');
    updateBook(); // clothes that came to rest while the book was open may have buried it again
  }

  function resetScene() {
    const { parcel } = scene;
    parcel.classList.add('no-anim');
    parcel.classList.remove('is-cut', 'is-open');
    scene.book.el.classList.remove('is-away');
    scene.question.tabIndex = -1;
    scene.book.button.tabIndex = -1;
    app.clothesKeys?.disable();
    camera.set('threeQuarter');
    app.cutting.reset();
    app.resetInstruction();
    void parcel.offsetWidth; // apply the closed flaps before re-enabling transitions
    requestAnimationFrame(() => parcel.classList.remove('no-anim'));
  }

  function restart() {
    if (!machine.can('RESTART')) return;
    if (bookView.isOpen()) bookView.destroy();
    dom.reader.hidden = true;
    dom.reader.classList.remove('has-turned');
    flyer.hide();
    document.body.classList.remove('reader-open');
    dom.experience.inert = false;
    resetScene();
    machine.send('RESTART');
    setReachable(!hasClothes()); // after RESTART, so no tab stop is left on the sealed parcel
    announce('A fresh, sealed parcel.');
    focusIfKeyboard(dom.slider);
  }

  /** Development preview: ?jump=dark | overhead | clear | book (clear and book move the clothes off the box first) */
  async function fastForward(target) {
    if (!['dark', 'overhead', 'clear', 'book'].includes(target)) return;
    scene.parcel.classList.add('no-anim', 'is-cut', 'is-open');
    app.cutting.markDone();
    ['CUT_START', 'CUT_DONE', 'OPENED'].forEach((e) => machine.send(e));
    scene.question.tabIndex = 0;
    if (target !== 'dark') {
      machine.send('REVEAL');
      camera.set('overhead');
      machine.send('REVEALED');
      scene.question.tabIndex = -1;
      if (target !== 'overhead') app.clothes?.clearAside();
      arrive();
    }
    void scene.parcel.offsetWidth;
    await new Promise(requestAnimationFrame);
    scene.parcel.classList.remove('no-anim');
    if (target === 'book') await openBook();
  }

  return {
    openBox, reveal, openBook, closeBook, restart, fastForward, layoutNow, attachClothes,
    bookReachable: () => reachable,
  };
}
