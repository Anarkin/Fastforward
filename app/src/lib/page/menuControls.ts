import { useEffect, useLayoutEffect, useRef } from 'react';
import { keymap } from './keymap';
import { pressedAlone, type KeyPress } from '../shared/keymap';
import type { ContextMenuItem } from './contextMenuItem';
import { keyPressed } from './shortcuts';

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
