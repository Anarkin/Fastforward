import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { keymap } from '../shared/keymap';
import { isKeyPress, keyPressed } from './shortcuts';
import type { Bookmark, BookmarkRef } from '../shared/protocol';
import { refOf } from '../shared/refNames';
import { overlayScrollbarClass } from './overlayScrollbars';

export type MenuTarget =
  | { readonly kind: 'ref'; readonly ref: Bookmark }
  | { readonly kind: 'commit'; readonly hash: string };

export const refMenuTarget = (ref: BookmarkRef): MenuTarget => ({
  kind: 'ref',
  ref: refOf(ref),
});

export const commitMenuTarget = (hash: string): MenuTarget => ({
  kind: 'commit',
  hash,
});

export const commitBookmarkTarget = (hash: string): MenuTarget => ({
  kind: 'ref',
  ref: { kind: 'commit', name: hash },
});

export type ContextMenuItem =
  | {
      readonly label: string;
      readonly title?: string;
      readonly onClick?: () => void;
      readonly submenu?: readonly ContextMenuItem[];
      readonly disabled?: boolean;
      readonly checked?: boolean;
    }
  | { readonly separator: true };

export interface OpenMenu {
  readonly x: number;
  readonly y: number;
  readonly items: readonly ContextMenuItem[];
}

export function ContextMenu({
  menu,
  onClose,
}: {
  menu: OpenMenu;
  onClose: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: menu.x, top: menu.y });

  useLayoutEffect(() => {
    const box = element.current?.getBoundingClientRect();
    if (!box) {
      return;
    }
    setPosition({
      left:
        menu.x + box.width > window.innerWidth
          ? Math.max(0, menu.x - box.width)
          : menu.x,
      top:
        menu.y + box.height > window.innerHeight
          ? Math.max(0, menu.y - box.height)
          : menu.y,
    });
  }, [menu]);

  useDismiss(element, onClose, { onScroll: true });
  useMenuFocus(element);

  return (
    <div
      ref={element}
      className="menu context-menu"
      role="menu"
      style={position}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => onMenuKeyDown(event)}
    >
      <MenuItems items={menu.items} onClose={onClose} />
    </div>
  );
}

export interface DismissOptions {
  readonly onScroll?: boolean;
  readonly ignore?: string;
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
  { onScroll = false, ignore }: DismissOptions = {},
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
  target.addEventListener('pointerdown', onPointerDown, { capture: true });
  target.addEventListener('keydown', onKeyDown, { capture: true });
  target.addEventListener('blur', onClose);
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
): void {
  useEffect(() => {
    const element = menu.current;
    const previous = document.activeElement;
    if (focusFirst) {
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
  }, [menu, focusFirst]);
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
  if (next !== undefined) {
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

// A menu keeps the keys that would move between the columns or in a list
// behind it
export function claimsMenuKey(
  event: Parameters<typeof keyPressed>[1],
): boolean {
  return (
    keyPressed(keymap.column, event) !== undefined ||
    keyPressed(keymap.move, event) !== undefined
  );
}

export function useDismiss(
  element: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  { onScroll = false, ignore }: DismissOptions = {},
): void {
  useEffect(
    () => listenForDismiss(window, element, onClose, { onScroll, ignore }),
    [element, onClose, onScroll, ignore],
  );
}

export function openedSubmenu(
  item: { readonly submenu?: readonly ContextMenuItem[] },
  detail: number,
): { readonly focusFirst: boolean } | undefined {
  return item.submenu ? { focusFirst: detail === 0 } : undefined;
}

export function MenuItems({
  items,
  onClose,
}: {
  items: readonly ContextMenuItem[];
  onClose: () => void;
}) {
  const [openSubmenu, setOpenSubmenu] = useState<number>();
  const [submenuByKey, setSubmenuByKey] = useState(false);
  const entries = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <>
      {items.map((item, index) =>
        'separator' in item ? (
          <div key={index} className="menu-separator" />
        ) : (
          <div
            key={index}
            className="menu-entry"
            onMouseEnter={() => {
              setSubmenuByKey(false);
              setOpenSubmenu(item.submenu ? index : undefined);
            }}
          >
            <button
              ref={(button) => {
                entries.current[index] = button;
              }}
              onMouseEnter={(event) => event.currentTarget.focus()}
              className={`menu-item ${item.submenu ? 'has-submenu' : ''}`}
              role={
                item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'
              }
              aria-checked={item.checked}
              title={item.title}
              aria-haspopup={item.submenu ? 'menu' : undefined}
              disabled={item.disabled}
              onClick={(event) => {
                const opened = openedSubmenu(item, event.detail);
                if (opened) {
                  setSubmenuByKey(opened.focusFirst);
                  setOpenSubmenu(index);
                } else {
                  onClose();
                  item.onClick?.();
                }
              }}
            >
              {item.checked !== undefined && (
                <span className="menu-check">{item.checked ? '✓' : ''}</span>
              )}
              {item.label}
              {item.submenu && <span className="submenu-arrow">▸</span>}
            </button>
            {item.submenu && openSubmenu === index && (
              <Submenu
                items={item.submenu}
                onClose={onClose}
                focusFirst={submenuByKey}
                onBack={() => {
                  setOpenSubmenu(undefined);
                  entries.current[index]?.focus();
                }}
              />
            )}
          </div>
        ),
      )}
    </>
  );
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

function Submenu({
  items,
  onClose,
  focusFirst,
  onBack,
}: {
  items: readonly ContextMenuItem[];
  onClose: () => void;
  focusFirst: boolean;
  onBack: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  useMenuFocus(element, focusFirst);
  const [placement, setPlacement] = useState({ flipped: false, up: 0 });
  useLayoutEffect(() => {
    const box = element.current?.getBoundingClientRect();
    if (box) {
      setPlacement(
        submenuPlacement(box, {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      );
    }
  }, []);
  return (
    <div
      ref={element}
      className={`menu submenu ${placement.flipped ? 'flipped' : ''}`}
      style={{ marginTop: -placement.up }}
      role="menu"
      onKeyDown={(event) => onMenuKeyDown(event, onBack)}
    >
      <MenuItems items={items} onClose={onClose} />
    </div>
  );
}

export const OpenContextMenu = createContext<
  (event: React.MouseEvent, target: MenuTarget) => void
>(() => {});

export function useContextMenu(target: MenuTarget) {
  const open = useContext(OpenContextMenu);
  return {
    onContextMenu: (event: React.MouseEvent) => open(event, target),
  };
}
