/**
 * Mouse and touch input for the clothes. Hovering a garment shows an open
 * hand; pressing grabs it (closed hand), moving carries it, letting go drops
 * it. Pointer events cover mouse, pen and touch alike; the stage already has
 * `touch-action: none`.
 *
 * Only one pointer carries a garment at a time. While it does, other
 * pointers are swallowed, and the click that ends a drag never reaches the
 * booklet underneath.
 */

const CLICK_GRACE = 400; // ms: how long after a drag the click it causes is swallowed

/**
 * @param {{stage: HTMLElement, clothes: object, canInteract: () => boolean, onDragEnd?: () => void}} options
 * @returns {{cancel(): void, dispose(): void}}
 */
export function createClothesInput({ stage, clothes, canInteract, onDragEnd = () => {} }) {
  let drag = null; // { pointerId } while a garment is held
  let hover = null; // last idle mouse position, waiting to be picked
  let hoverFrame = 0;
  let swallowClick = false;
  let swallowTimer = 0;

  const local = (event) => {
    const box = stage.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  };
  const setHover = (on) => stage.classList.toggle('over-garment', on);

  function checkHover() {
    hoverFrame = 0;
    if (!hover || drag) return;
    setHover(canInteract() && clothes.pickAt(hover[0], hover[1]) !== null);
  }

  function watchHover(event) {
    hover = local(event);
    if (!hoverFrame) hoverFrame = requestAnimationFrame(checkHover);
  }

  /** Let go of whatever is held. */
  function endDrag() {
    if (!drag) return;
    const { pointerId } = drag;
    drag = null;
    if (stage.hasPointerCapture?.(pointerId)) stage.releasePointerCapture(pointerId);
    clothes.release();
    stage.classList.remove('is-grabbing');
    swallowClick = true;
    clearTimeout(swallowTimer);
    swallowTimer = setTimeout(() => { swallowClick = false; }, CLICK_GRACE);
    onDragEnd();
  }

  function onDown(event) {
    if (drag) {
      if (event.pointerId !== drag.pointerId) { // a second finger or button while carrying
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (!event.isPrimary || !canInteract() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const [x, y] = local(event);
    const hit = clothes.pickAt(x, y);
    if (!hit) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {
      return; // the pointer is already gone
    }
    drag = { pointerId: event.pointerId };
    clothes.grab(hit);
    stage.classList.add('is-grabbing');
    setHover(false);
  }

  function onMove(event) {
    if (drag) {
      if (event.pointerId === drag.pointerId) clothes.dragTo(...local(event));
      return;
    }
    if (event.pointerType === 'mouse' && event.buttons === 0) watchHover(event);
  }

  function onEnd(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    endDrag();
    if (event.pointerType === 'mouse' && event.type === 'pointerup') watchHover(event);
  }

  function onLeave(event) {
    if (event.pointerType !== 'mouse' || drag) return;
    hover = null;
    setHover(false);
  }

  function onClick(event) {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  /** Drop anything held and forget the hover (the story moved on). */
  function cancel() {
    endDrag();
    hover = null;
    setHover(false);
  }

  const listeners = [
    [stage, 'pointerdown', onDown, { capture: true }],
    [stage, 'pointermove', onMove],
    [stage, 'pointerup', onEnd],
    [stage, 'pointercancel', onEnd],
    [stage, 'lostpointercapture', onEnd],
    [stage, 'pointerleave', onLeave],
    [globalThis, 'click', onClick, { capture: true }],
    [globalThis, 'blur', endDrag],
  ];
  listeners.forEach(([target, type, fn, options]) => target.addEventListener(type, fn, options));

  return {
    cancel,
    dispose() {
      cancel();
      cancelAnimationFrame(hoverFrame);
      clearTimeout(swallowTimer);
      listeners.forEach(([target, type, fn, options]) => target.removeEventListener(type, fn, options));
    },
  };
}
