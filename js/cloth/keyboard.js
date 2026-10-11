/**
 * Keyboard and screen-reader access to the clothes: one button per garment,
 * laid over the garment on screen so its focus ring outlines it. Tab goes
 * through the pile from the top down; Enter or Space carries the garment
 * out of the box (clothes.moveAside). Mouse and touch never reach these
 * buttons — they pick the cloth itself.
 */

/**
 * @param {{host: HTMLElement, clothes: object, text: object, announce: (message: string) => void}} options
 * @returns {{enable(): void, disable(): void, layout(): void, first(): HTMLElement | null}}
 */
export function createClothesKeys({ host, clothes, text, announce }) {
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

  /** Lay each button over its garment's outline on screen. */
  function layout() {
    if (!enabled) return;
    buttons.forEach((button, g) => {
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
    } finally {
      busy = false;
    }
    if (!enabled) return; // restarted meanwhile
    const rest = shown();
    const next = rest[(rest.indexOf(buttons[g]) + 1) % rest.length];
    if (next && next !== buttons[g] && document.activeElement === buttons[g]) next.focus({ preventScroll: true });
    buttons[g].hidden = true;
    announce(text.movedAside.replace('{garment}', label(g)));
  }

  function onResize() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(layout);
  }
  addEventListener('resize', onResize);

  return {
    /** Show a button per garment, in pile order from the top down. */
    enable() {
      enabled = true;
      const height = Object.fromEntries(clothes.status().garments.map(({ id, centre }) => [id, centre[2]]));
      const order = clothes.garments.map((garment, g) => g)
        .sort((a, b) => height[clothes.garments[b].id] - height[clothes.garments[a].id]);
      host.replaceChildren(...order.map((g) => buttons[g]));
      buttons.forEach((button) => { button.hidden = false; });
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
