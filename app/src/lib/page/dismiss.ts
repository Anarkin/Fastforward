import { useEffect } from 'react';
import { keymap } from './keymap';
import { scrollbarCoverClass } from './scrollbars';
import { isKeyPress, keyPressed } from './shortcuts';

export interface DismissOptions {
  readonly onScroll?: boolean;
  readonly ignore?: string;
  readonly byKeyOnly?: boolean;
}

const layers: object[] = [];

function isNode(target: EventTarget | null): target is Node {
  return target !== null && 'nodeType' in target;
}

function isElement(target: EventTarget | null): target is Element {
  return isNode(target) && 'closest' in target;
}

export function listenForDismiss(
  target: EventTarget,
  element: { readonly current: Pick<Node, 'contains'> | null },
  onClose: () => void,
  { onScroll = false, ignore, byKeyOnly = false }: DismissOptions = {},
): () => void {
  const layer = {};
  layers.push(layer);
  const onPointerDown = (event: Event) => {
    const clicked = event.target;
    const inside =
      (isNode(clicked) && element.current?.contains(clicked)) ||
      (isElement(clicked) &&
        clicked.closest(`.${scrollbarCoverClass}`) !== null) ||
      (ignore !== undefined &&
        isElement(clicked) &&
        clicked.closest(ignore) !== null);
    if (!inside) {
      onClose();
    }
  };
  const onWheel = (event: Event) => {
    const { target: scrolled } = event;
    if (!(isNode(scrolled) && element.current?.contains(scrolled))) {
      onClose();
    }
  };
  const onKeyDown = (event: Event) => {
    if (
      isKeyPress(event) &&
      keyPressed(keymap.close, event) &&
      layers.at(-1) === layer
    ) {
      event.stopPropagation();
      onClose();
    }
  };
  target.addEventListener('keydown', onKeyDown, { capture: true });
  if (!byKeyOnly) {
    target.addEventListener('pointerdown', onPointerDown, { capture: true });
    target.addEventListener('blur', onClose);
  }
  if (onScroll) {
    target.addEventListener('wheel', onWheel, { capture: true });
  }
  return () => {
    const index = layers.indexOf(layer);
    if (index !== -1) {
      layers.splice(index, 1);
    }
    target.removeEventListener('pointerdown', onPointerDown, { capture: true });
    target.removeEventListener('keydown', onKeyDown, { capture: true });
    target.removeEventListener('blur', onClose);
    target.removeEventListener('wheel', onWheel, { capture: true });
  };
}

export function useDismiss(
  element: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  { onScroll = false, ignore, byKeyOnly = false }: DismissOptions = {},
): void {
  useEffect(
    () =>
      listenForDismiss(window, element, onClose, {
        onScroll,
        ignore,
        byKeyOnly,
      }),
    [element, onClose, onScroll, ignore, byKeyOnly],
  );
}
