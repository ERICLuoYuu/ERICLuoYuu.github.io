/**
 * Keyboard and screen-reader access to the clothes and the bodies: one
 * button per garment, and one per rigid body (the figurine and the food),
 * each laid over its body on screen so its focus ring outlines it. A garment
 * has its button while it is in the box, a rigid body only while it lies on
 * the booklet. Tab goes through the pile from the top down; Enter or Space
 * carries a garment out of the box (clothes.moveAside) and a rigid body back
 * to where it started (clothes.moveBodyHome). Mouse and touch never reach
 * these buttons — they pick the bodies themselves.
 */

import { BOX } from '../scene/geometry.js';

/** Is a garment centred inside the box, seen from above? */
const inBox = ([x, y]) => x > 0 && x < BOX.width && y > 0 && y < BOX.depth;

/**
 * @param {{host: HTMLElement, clothes: object, text: object, announce: (message: string) => void,
 *          afterLast?: () => HTMLElement | null}} options
 *   `afterLast` gives the element focus moves on to once no button is left.
 * @returns {{enable(): void, disable(): void, layout(): void, first(): HTMLElement | null}}
 */
export function createClothesKeys({ host, clothes, text, announce, afterLast = () => null }) {
  // in the order of clothes.bodies: the garments, then the rigid bodies
  const items = [
    ...clothes.garments.map(({ id, label }, index) => ({ kind: 'garment', index, id, label })),
    ...(clothes.solids ?? []).map(({ id, label }, index) => ({ kind: 'rigid', index, id, label })),
  ];
  const buttons = items.map((item, n) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clothes-key';
    button.hidden = true;
    button.setAttribute('aria-label', text.moveAside.replace('{garment}', item.label));
    button.addEventListener('click', () => move(n));
    return button;
  });
  let enabled = false;
  let busy = false;
  let frame = 0;

  const shown = () => [...host.children].filter((b) => !b.hidden); // in tab order

  /** Hide a button; if it has focus, focus moves on to the next one, or past the last one. */
  function hide(button) {
    if (document.activeElement === button) {
      const list = shown();
      const next = list.length > 1 ? list[(list.indexOf(button) + 1) % list.length] : afterLast();
      next?.focus({ preventScroll: true });
    }
    button.hidden = true;
  }

  /** Put the buttons in tab order from the top of the pile down, keeping focus where it is. */
  function order(height) {
    const sorted = [...buttons.keys()].sort((a, b) => height[b] - height[a]).map((n) => buttons[n]);
    if (sorted.every((button, i) => host.children[i] === button)) return;
    const focused = document.activeElement;
    host.replaceChildren(...sorted);
    if (sorted.includes(focused) && document.activeElement !== focused) focused.focus({ preventScroll: true });
  }

  /**
   * Lay each button over its body's outline on screen. Only garments in the
   * box have one: a garment dragged out with the mouse loses its button, and
   * one dragged back in gets it again. A rigid body has one only while it
   * lies on the booklet.
   */
  function layout() {
    if (!enabled) return;
    const status = clothes.status();
    const garments = Object.fromEntries(status.garments.map((g) => [g.id, g]));
    const rigid = Object.fromEntries((status.rigid ?? []).map((b) => [b.id, b]));
    const of = (item) => (item.kind === 'garment' ? garments[item.id] : rigid[item.id]);
    const showing = (item) => (item.kind === 'garment' ? inBox(of(item).centre) : Boolean(of(item)?.overBook));
    buttons.forEach((button, n) => {
      if (!showing(items[n])) {
        if (!button.hidden) hide(button);
        return;
      }
      button.hidden = false;
      const box = clothes.screenBox(n);
      if (!box) return;
      Object.assign(button.style, {
        left: `${box.left.toFixed(1)}px`,
        top: `${box.top.toFixed(1)}px`,
        width: `${box.width.toFixed(1)}px`,
        height: `${box.height.toFixed(1)}px`,
      });
    });
    order(items.map((item) => of(item)?.centre[2] ?? -Infinity));
  }

  async function move(n) {
    const { kind, index, label } = items[n];
    if (!enabled || busy || buttons[n].hidden) return;
    busy = true;
    try {
      await (kind === 'garment' ? clothes.moveAside(index) : clothes.moveBodyHome(index));
    } catch (err) {
      console.warn(`[parcel] The ${label} could not be moved aside:`, err);
      announce(text.moveFailed.replace('{garment}', label));
      return;
    } finally {
      busy = false;
    }
    if (!enabled) return; // restarted meanwhile
    hide(buttons[n]);
    announce(text.movedAside.replace('{garment}', label));
  }

  function onResize() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(layout);
  }
  addEventListener('resize', onResize);

  return {
    /** Show the buttons of the garments in the box and the bodies on the booklet, from the top of the pile down. */
    enable() {
      enabled = true;
      layout();
    },
    disable() {
      enabled = false;
      buttons.forEach((button) => { button.hidden = true; });
    },
    layout,
    /** The first button still showing, or null. */
    first: () => shown()[0] ?? null,
  };
}
