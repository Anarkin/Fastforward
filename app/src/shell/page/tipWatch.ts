import { tipOf, tipped, type Tip } from '../../lib/page/tips';

export interface ShownTip {
  readonly tip: Tip;
  readonly anchor: Element;
}

export interface TipClock {
  readonly now: () => number;
  readonly after: (wait: number, run: () => void) => () => void;
}

export interface TipWatch {
  readonly subscribe: (listener: () => void) => () => void;
  readonly shown: () => ShownTip | undefined;
  readonly stop: () => void;
}

export const warmFor = 300;

const hiding = [
  'pointerdown',
  'keydown',
  'wheel',
  'scroll',
  'dragstart',
  'contextmenu',
] as const;

const pageClock: TipClock = {
  now: () => performance.now(),
  after: (wait, run) => {
    const timer = setTimeout(run, wait);
    return () => clearTimeout(timer);
  },
};

const isCut = (element: Element) =>
  [element, ...element.querySelectorAll('*')].some(
    (part) => part.scrollWidth > part.clientWidth,
  );

const isElement = (target: EventTarget | null): target is Element =>
  target !== null && 'closest' in target;

export function watchTips(
  page: Document,
  delay: () => number,
  clock: TipClock = pageClock,
): TipWatch {
  const listeners = new Set<() => void>();
  let under: Element | undefined;
  let shown: ShownTip | undefined;
  let due: (() => void) | undefined;
  let hiddenAt = -Infinity;

  const hide = () => {
    due?.();
    due = undefined;
    if (shown !== undefined) {
      shown = undefined;
      hiddenAt = clock.now();
      listeners.forEach((listener) => listener());
    }
  };
  const show = (anchor: Element) => {
    due = undefined;
    const tip = tipOf(anchor);
    if (
      tip === undefined ||
      !anchor.isConnected ||
      (tip.cut && !isCut(anchor))
    ) {
      return;
    }
    shown = { tip, anchor };
    listeners.forEach((listener) => listener());
  };
  const over = (anchor: Element | undefined) => {
    if (anchor === under) {
      return;
    }
    const warm = shown !== undefined || clock.now() - hiddenAt < warmFor;
    hide();
    under = anchor;
    if (anchor === undefined) {
      return;
    }
    const wait = warm ? 0 : delay();
    if (wait > 0) {
      due = clock.after(wait, () => show(anchor));
    } else {
      show(anchor);
    }
  };
  const onOver = (event: Event) =>
    over(
      isElement(event.target)
        ? (event.target.closest(tipped) ?? undefined)
        : undefined,
    );
  const onOut = (event: Event) => {
    if ('relatedTarget' in event && event.relatedTarget === null) {
      over(undefined);
    }
  };
  const onMove = () => {
    if (shown !== undefined && !shown.anchor.isConnected) {
      hide();
    }
  };
  const view = page.defaultView;
  page.addEventListener('pointerover', onOver, true);
  page.addEventListener('pointerout', onOut, true);
  page.addEventListener('pointermove', onMove, true);
  for (const type of hiding) {
    page.addEventListener(type, hide, true);
  }
  view?.addEventListener('blur', hide);
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    shown: () => shown,
    stop: () => {
      hide();
      page.removeEventListener('pointerover', onOver, true);
      page.removeEventListener('pointerout', onOut, true);
      page.removeEventListener('pointermove', onMove, true);
      for (const type of hiding) {
        page.removeEventListener(type, hide, true);
      }
      view?.removeEventListener('blur', hide);
    },
  };
}
