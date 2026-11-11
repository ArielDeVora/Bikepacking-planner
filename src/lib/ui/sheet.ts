import { get, writable, type Readable } from 'svelte/store';
import { phone } from './phone';

export type Snap = 'peek' | 'half' | 'full';
const ORDER: Snap[] = ['peek', 'half', 'full'];

export interface SheetOptions {
  /** CSS variable on <html> that holds the sheet's current height, for things that sit above it. */
  cssVar: string;
  initial?: Snap;
  /** Height when collapsed, given the sheet and its handle. */
  peek: (node: HTMLElement, handle: HTMLElement) => number;
  /** Called once the sheet has settled at a height (not while dragging). */
  onSettle?: (height: number) => void;
}

export interface Sheet {
  snap: Readable<Snap>;
  snapTo(snap: Snap): void;
  /** Svelte action for the sheet; `handle` selects the part you drag (inside the sheet). */
  action(node: HTMLElement, handle: string): { destroy(): void };
}

const TAP_PX = 6;
const FLICK = 0.45; // px per ms

/**
 * A bottom sheet on phones: drag its handle between three heights, or tap it to open or close.
 * Does nothing on wider screens.
 */
export function createSheet(opts: SheetOptions): Sheet {
  const snap = writable<Snap>(opts.initial ?? 'peek');
  let apply: ((animate: boolean) => void) | null = null;

  function action(node: HTMLElement, selector: string) {
    const root = document.documentElement.style;
    let active = false;
    let height = 0;
    let settleTimer = 0;

    const handle = () => node.querySelector<HTMLElement>(selector) ?? node;
    const heights = (): Record<Snap, number> => {
      const vh = window.innerHeight;
      const top = parseFloat(getComputedStyle(node).getPropertyValue('--sheet-top')) || 56;
      const full = vh - top;
      const peek = Math.min(full, opts.peek(node, handle()));
      return { peek, half: Math.max(peek, Math.min(full, Math.round(vh * 0.5))), full };
    };

    const setHeight = (h: number) => {
      height = h;
      node.style.height = `${h}px`;
      root.setProperty(opts.cssVar, `${h}px`);
    };

    const settle = () => {
      clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => opts.onSettle?.(height), 220);
    };

    apply = (animate) => {
      if (!active) return;
      node.classList.toggle('sheet-animate', animate);
      setHeight(heights()[get(snap)]);
      settle();
    };

    function onDown(e: PointerEvent) {
      const h = handle();
      if (!active || e.button !== 0 || !h.contains(e.target as Node)) return;
      if ((e.target as HTMLElement).closest('button, input, select, textarea, a, label')) return;
      h.setPointerCapture(e.pointerId);
      const startY = e.clientY;
      const startH = height;
      const limits = heights();
      let lastY = startY;
      let lastT = e.timeStamp;
      let speed = 0;
      let moved = false;
      node.classList.remove('sheet-animate');

      const move = (ev: PointerEvent) => {
        if (Math.abs(ev.clientY - startY) > TAP_PX) moved = true;
        if (!moved) return;
        const dt = ev.timeStamp - lastT;
        if (dt > 0) speed = (ev.clientY - lastY) / dt;
        lastY = ev.clientY;
        lastT = ev.timeStamp;
        setHeight(Math.min(limits.full, Math.max(limits.peek, startH - (ev.clientY - startY))));
      };
      const up = () => {
        h.removeEventListener('pointermove', move);
        h.removeEventListener('pointercancel', up);
        let next: Snap;
        const current = get(snap);
        if (!moved) next = current === 'peek' ? 'half' : 'peek';
        else if (speed < -FLICK) next = ORDER[Math.min(2, ORDER.indexOf(nearest(limits, height)) + 1)]!;
        else if (speed > FLICK) next = ORDER[Math.max(0, ORDER.indexOf(nearest(limits, height)) - 1)]!;
        else next = nearest(limits, height);
        snap.set(next);
        apply?.(true);
      };
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', up, { once: true });
      h.addEventListener('pointercancel', up, { once: true });
    }

    const onResize = () => apply?.(false);

    const offPhone = phone.subscribe((isPhone) => {
      active = isPhone;
      if (isPhone) {
        requestAnimationFrame(() => apply?.(false));
      } else {
        node.style.height = '';
        node.classList.remove('sheet-animate');
        root.removeProperty(opts.cssVar);
      }
    });

    node.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', onResize);

    return {
      destroy() {
        offPhone();
        clearTimeout(settleTimer);
        node.removeEventListener('pointerdown', onDown);
        window.removeEventListener('resize', onResize);
        root.removeProperty(opts.cssVar);
        apply = null;
        if (active) opts.onSettle?.(0);
      },
    };
  }

  return {
    snap,
    snapTo(next) {
      snap.set(next);
      apply?.(true);
    },
    action,
  };
}

function nearest(limits: Record<Snap, number>, h: number): Snap {
  let best: Snap = 'peek';
  for (const s of ORDER) if (Math.abs(limits[s] - h) < Math.abs(limits[best] - h)) best = s;
  return best;
}
