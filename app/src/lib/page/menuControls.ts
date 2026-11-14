import { useEffect, useLayoutEffect, useRef } from 'react';
import { keymap, pressedAlone, type KeyPress } from '../shared/keymap';
import type { Sentence } from '../shared/strings';
import { overlayScrollbarClass } from './overlayScrollbars';
import { isKeyPress, keyPressed } from './shortcuts';

export type MenuIcon = 'sevenZip' | 'image' | 'terminal' | 'commander' | 'git';

export type ContextMenuItem =
  | {
      readonly label: string;
      readonly sentence?: Sentence;
      readonly name?: boolean;
      readonly icon?: MenuIcon;
      readonly title?: string;
      readonly onClick?: () => void;
      readonly submenu?: readonly ContextMenuItem[];
      readonly disabled?: boolean;
      readonly checked?: boolean;
      readonly onRemove?: () => void;
      readonly removeTitle?: string;
      readonly accessKey?: string;
      readonly showAccessKey?: boolean;
      readonly keywords?: string;
    }
  | { readonly separator: true };

export interface OpenMenu {
  readonly x: number;
  readonly y: number;
  readonly items: readonly ContextMenuItem[];
  readonly trigger?: string;
}

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
        clicked.closest(`.${overlayScrollbarClass}`) !== null) ||
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

export function nextMenuItem(
  move: 'next' | 'previous' | 'first' | 'last',
  current: number,
  count: number,
): number | undefined {
  if (count === 0) {
    return undefined;
  }
  if (move === 'first') {
    return 0;
  }
  if (move === 'last') {
    return count - 1;
  }
  if (move === 'next') {
    return current === -1 ? 0 : (current + 1) % count;
  }
  return current === -1 ? count - 1 : (current - 1 + count) % count;
}

function menuItems(menu: Element | null): HTMLElement[] {
  return Array.from(
    menu?.querySelectorAll<HTMLElement>(
      ':scope > .menu-entry > .menu-item:not(:disabled)',
    ) ?? [],
  );
}

export function useMenuFocus(
  menu: React.RefObject<HTMLElement | null>,
  focusFirst = true,
  focusOnOpen?: React.RefObject<HTMLElement | null>,
): void {
  const before = useRef<Element | null>(null);
  useLayoutEffect(() => {
    if (focusOnOpen) {
      before.current = document.activeElement;
      focusOnOpen.current?.focus();
    }
  }, [focusOnOpen]);
  useEffect(() => {
    const element = menu.current;
    const previous = focusOnOpen ? before.current : document.activeElement;
    if (focusFirst && !focusOnOpen) {
      menuItems(element).at(0)?.focus();
    }
    return () => {
      const active = document.activeElement;
      if (
        previous instanceof HTMLElement &&
        (active === null ||
          active === document.body ||
          element?.contains(active))
      ) {
        previous.focus();
      }
    };
  }, [menu, focusFirst, focusOnOpen]);
}

export function accessKeyOf(press: KeyPress): string | undefined {
  return pressedAlone(press) && /^[\da-z]$/i.test(press.key)
    ? press.key.toUpperCase()
    : undefined;
}

export function onMenuKeyDown(
  event: React.KeyboardEvent<HTMLElement>,
  onBack?: () => void,
): void {
  const menu = event.currentTarget;
  if (
    !(event.target instanceof Element) ||
    event.target.closest('.menu') !== menu
  ) {
    return;
  }
  const items = menuItems(menu);
  const current = items.findIndex((item) => item === document.activeElement);
  const move = keyPressed(keymap.menuItem, event);
  const submenu = keyPressed(keymap.submenu, event);
  const next =
    move === undefined ? undefined : nextMenuItem(move, current, items.length);
  const accessKey = accessKeyOf(event);
  const accessed =
    accessKey === undefined
      ? undefined
      : items.find((item) => item.dataset.accessKey === accessKey);
  if (accessed !== undefined) {
    accessed.click();
  } else if (next !== undefined) {
    items[next].focus();
  } else if (submenu === 'open') {
    const item = items[current];
    if (item?.getAttribute('aria-haspopup') === 'menu') {
      item.click();
    }
  } else if (submenu === 'back' && onBack) {
    onBack();
  } else if (!claimsMenuKey(event)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

export function claimsMenuKey(
  event: Parameters<typeof keyPressed>[1],
): boolean {
  return (
    keyPressed(keymap.dialogFocus, event) !== undefined ||
    keyPressed(keymap.submenu, event) !== undefined ||
    keyPressed(keymap.move, event) !== undefined
  );
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

export function openedSubmenu(
  item: { readonly submenu?: readonly ContextMenuItem[] },
  detail: number,
): { readonly focusFirst: boolean } | undefined {
  return item.submenu ? { focusFirst: detail === 0 } : undefined;
}

export function shownKey(item: {
  readonly accessKey?: string;
  readonly showAccessKey?: boolean;
}): string | undefined {
  return item.showAccessKey === true ? item.accessKey : undefined;
}

export function submenuPlacement(
  box: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  },
  window: { readonly width: number; readonly height: number },
): { flipped: boolean; up: number } {
  return {
    flipped: box.right > window.width,
    up: Math.max(0, Math.min(box.bottom - window.height, box.top)),
  };
}
