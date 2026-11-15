import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';
import { useFocusKeeper, type KeptFocus } from '../../../lib/page/keptFocus';
import { useGitActions } from './store';

const givenUpAfter = 2000;

const ownMoves = ['pointerdown', 'keydown'] as const;

export function useTabFocus({
  container,
  scope,
  focusPart,
  fallback,
}: {
  readonly container: RefObject<HTMLElement | null>;
  readonly scope: string | undefined;
  readonly focusPart: (kept: KeptFocus) => boolean;
  readonly fallback: () => void;
}): RefObject<KeptFocus | undefined> {
  const { keptFocusOf, keepFocus } = useGitActions();
  const pending = useRef<KeptFocus>(undefined);
  const shown = useRef<string>(undefined);
  useFocusKeeper(container, (focus) => {
    const element = container.current;
    if (
      scope !== undefined &&
      shown.current === scope &&
      pending.current === undefined &&
      element?.contains(element.ownerDocument.activeElement)
    ) {
      keepFocus(scope, focus);
    }
  });
  const giveUp = useEffectEvent(() => {
    if (pending.current !== undefined) {
      pending.current = undefined;
      fallback();
    }
  });
  useLayoutEffect(() => {
    shown.current = scope;
    pending.current = scope === undefined ? undefined : keptFocusOf(scope);
    if (pending.current === undefined) {
      return undefined;
    }
    const timer = setTimeout(giveUp, givenUpAfter);
    const moved = () => {
      pending.current = undefined;
    };
    for (const move of ownMoves) {
      window.addEventListener(move, moved, { capture: true });
    }
    return () => {
      clearTimeout(timer);
      for (const move of ownMoves) {
        window.removeEventListener(move, moved, { capture: true });
      }
    };
  }, [scope, keptFocusOf]);
  useEffect(() => {
    const kept = pending.current;
    if (kept !== undefined && focusPart(kept)) {
      pending.current = undefined;
    }
  });
  return pending;
}
