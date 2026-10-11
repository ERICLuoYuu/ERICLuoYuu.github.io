/**
 * Keyboard and screen-reader access to the clothes: one button per garment,
 * laid over the garment on screen so its focus ring outlines it. Tab goes
 * through the pile from the top down; Enter or Space carries the garment
 * out of the box (clothes.moveAside). Mouse and touch never reach these
 * buttons — they pick the cloth itself.
 */

import { BOX } from '../scene/geometry.js';

/** Is a garment centred inside the box, seen from above? */
const inBox = ([x, y]) => x > 0 && x < BOX.width && y > 0 && y < BOX.depth;

/**
 * @param {{host: HTMLElement, clothes: object, text: object, announce: (message: string) => void,
 *          afterLast?: () => HTMLElement | null}} options
 *   `afterLast` gives the element focus moves on to once no garment is left in the box.
 * @returns {{enable(): void, disable(): void, layout(): void, first(): HTMLElement | null}}
 */
export function createClothesKeys({ host, clothes, text, announce, afterLast = () => null }) {
  const label = (g) => clothes.garments[g].label;
  const buttons = clothes.garments.map((_, g) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'clothes-key';
    button.hidden = true;
    button.setAttribute('aria-label', text.moveAside.replace('{garment}', label(g)));
    button.addEventListener('click', () => move(g));
    return button;
  });
  let enabled = false;
  let busy = false;
  let frame = 0;

  const shown = () => [...host.children].filter((b) => !b.hidden); // in tab order

  /** Hide a button; if it has focus, focus moves on to the next garment, or past the last one. */
  function hide(button) {
    if (document.activeElement === button) {
      const list = shown();
      const next = list.length > 1 ? list[(list.indexOf(button) + 1) % list.length] : afterLast();
      next?.focus({ preventScroll: true });
    }
    button.hidden = true;
  }

  /**
   * Lay each button over its garment's outline on screen. Only garments in
   * the box have one: a garment dragged out with the mouse loses its button,
   * and one dragged back in gets it again.
   */
  function layout() {
    if (!enabled) return;
    const centre = Object.fromEntries(clothes.status().garments.map((g) => [g.id, g.centre]));
    buttons.forEach((button, g) => {
      const inside = inBox(centre[clothes.garments[g].id]);
      if (!inside) {
        if (!button.hidden) hide(button);
        return;
      }
      button.hidden = false;
      const box = clothes.screenBox(g);
      if (!box) return;
      Object.assign(button.style, {
        left: `${box.left.toFixed(1)}px`,
        top: `${box.top.toFixed(1)}px`,
        width: `${box.width.toFixed(1)}px`,
        height: `${box.height.toFixed(1)}px`,
      });
    });
  }

  async function move(g) {
    if (!enabled || busy || buttons[g].hidden) return;
    busy = true;
    try {
      await clothes.moveAside(g);
    } catch (err) {
      console.warn(`[parcel] The ${label(g)} could not be moved aside:`, err);
      announce(text.moveFailed.replace('{garment}', label(g)));
      return;
    } finally {
      busy = false;
    }
    if (!enabled) return; // restarted meanwhile
    hide(buttons[g]);
    announce(text.movedAside.replace('{garment}', label(g)));
  }

  function onResize() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(layout);
  }
  addEventListener('resize', onResize);

  return {
    /** Show a button per garment in the box, in pile order from the top down. */
    enable() {
      enabled = true;
      const height = Object.fromEntries(clothes.status().garments.map(({ id, centre }) => [id, centre[2]]));
      const order = Array.from(clothes.garments.keys())
        .sort((a, b) => height[clothes.garments[b].id] - height[clothes.garments[a].id]);
      host.replaceChildren(...order.map((g) => buttons[g]));
      layout();
    },
    disable() {
      enabled = false;
      buttons.forEach((button) => { button.hidden = true; });
    },
    layout,
    /** The first garment button still showing, or null. */
    first: () => shown()[0] ?? null,
  };
}
