import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useFocusKeeper, type KeptFocus } from '../../../lib/page/keptFocus';
import { useRestore } from '../../../lib/page/restore';
import { useGitActions } from './store';

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
  const shown = useRef<string>(undefined);
  const pending = useRestore(
    scope === undefined ? undefined : keptFocusOf(scope),
    () => container.current !== null,
    focusPart,
    { key: scope, watch: container, late: fallback },
  );
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
  useLayoutEffect(() => {
    shown.current = scope;
  }, [scope]);
  return pending;
}
