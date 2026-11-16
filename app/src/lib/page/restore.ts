import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';

export const restoreWithin = 2000;

const handsOn = ['keydown', 'pointerdown', 'wheel', 'input'] as const;

export interface RestoreOptions {
  readonly within?: number;
  readonly on?: EventTarget;
  readonly watch?: (check: () => void) => () => void;
  readonly late?: () => void;
  readonly ended?: () => void;
}

export interface Restoring {
  readonly check: () => void;
  readonly stop: () => void;
  readonly pending: () => boolean;
}

export function restoreWhen<T>(
  wanted: T,
  ready: (wanted: T) => boolean,
  apply: (wanted: T) => boolean | void,
  {
    within = restoreWithin,
    on = window,
    watch,
    late,
    ended,
  }: RestoreOptions = {},
): Restoring {
  let pending = true;
  let unwatch: (() => void) | undefined;
  const stop = () => {
    if (!pending) {
      return;
    }
    pending = false;
    clearTimeout(timer);
    unwatch?.();
    for (const hand of handsOn) {
      on.removeEventListener(hand, stop, { capture: true });
    }
    ended?.();
  };
  const check = () => {
    if (pending && ready(wanted) && apply(wanted) !== false) {
      stop();
    }
  };
  const timer = Number.isFinite(within)
    ? setTimeout(() => {
        if (pending) {
          stop();
          late?.();
        }
      }, within)
    : undefined;
  for (const hand of handsOn) {
    on.addEventListener(hand, stop, { capture: true, passive: true });
  }
  check();
  if (pending && watch !== undefined) {
    unwatch = watch(check);
  }
  return { check, stop, pending: () => pending };
}

function watchedChanges(
  element: Element | null | undefined,
): ((check: () => void) => () => void) | undefined {
  const Observer = element?.ownerDocument.defaultView?.MutationObserver;
  if (element === null || element === undefined || Observer === undefined) {
    return undefined;
  }
  return (check) => {
    const observer = new Observer(check);
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  };
}

export function useRestore<T>(
  wanted: T | undefined,
  ready: (wanted: T) => boolean,
  apply: (wanted: T) => boolean | void,
  {
    within,
    late,
    watch,
    on,
    key,
    beforePaint = false,
  }: {
    readonly within?: number;
    readonly late?: () => void;
    readonly watch?: RefObject<Element | null>;
    readonly on?: RefObject<EventTarget | null>;
    readonly key?: unknown;
    readonly beforePaint?: boolean;
  } = {},
): RefObject<T | undefined> {
  const pending = useRef<T>(undefined);
  const restoring = useRef<Restoring>(undefined);
  const armed = useRef(beforePaint);
  const wantedNow = useEffectEvent(() => wanted);
  const isReady = useEffectEvent((value: T) => ready(value));
  const applied = useEffectEvent((value: T) => apply(value));
  const gaveUp = useEffectEvent(() => late?.());
  const started = key === undefined ? wanted : key;
  const start = useEffectEvent((by: unknown) => {
    const now = wantedNow();
    pending.current = now;
    if (by === undefined || now === undefined) {
      return undefined;
    }
    armed.current = beforePaint;
    const made = restoreWhen(
      now,
      (value) => armed.current && isReady(value),
      applied,
      {
        within,
        late: gaveUp,
        on: on?.current ?? window,
        watch: watchedChanges(watch?.current),
        ended: () => {
          if (pending.current === now) {
            pending.current = undefined;
          }
        },
      },
    );
    restoring.current = made;
    return () => {
      made.stop();
      if (restoring.current === made) {
        restoring.current = undefined;
      }
    };
  });
  useLayoutEffect(() => start(started), [started]);
  useLayoutEffect(() => {
    if (beforePaint) {
      restoring.current?.check();
    }
  });
  useEffect(() => {
    armed.current = true;
    restoring.current?.check();
  });
  return pending;
}
