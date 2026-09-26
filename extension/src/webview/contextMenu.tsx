import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { VipRef } from '../protocol';

// What was right-clicked; the menu's items depend on it, and more kinds, like
// a commit row, get their own items
export type MenuTarget =
  | { readonly kind: 'ref'; readonly ref: VipRef }
  | { readonly kind: 'commit'; readonly hash: string };

export interface ContextMenuItem {
  readonly label: string;
  readonly onClick: () => void;
}

export interface OpenMenu {
  readonly x: number;
  readonly y: number;
  readonly items: readonly ContextMenuItem[];
}

// A menu at the pointer; it stays inside the page, and closes on a click
// outside, Escape, scrolling or the window losing focus
export function ContextMenu({
  menu,
  onClose,
}: {
  menu: OpenMenu;
  onClose: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: menu.x, top: menu.y });

  // Flips to the other side of the pointer where it would overflow
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

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (
        !(event.target instanceof Node) ||
        !element.current?.contains(event.target)
      ) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onClose, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onClose, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={element}
      className="menu context-menu"
      role="menu"
      style={position}
      onContextMenu={(event) => event.preventDefault()}
    >
      {menu.items.map((item) => (
        <button
          key={item.label}
          className="menu-item"
          role="menuitem"
          onClick={() => {
            onClose();
            item.onClick();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// Opens the menu for what was right-clicked; any element can reach it without
// the handler being passed down through every component
export const OpenContextMenu = createContext<
  (event: React.MouseEvent, target: MenuTarget) => void
>(() => {});

// The props that open the menu for a target on right-click; a bubble inside a
// commit row handles it first, so the row's menu doesn't open instead
export function useContextMenu(target: MenuTarget) {
  const open = useContext(OpenContextMenu);
  return {
    onContextMenu: (event: React.MouseEvent) => open(event, target),
  };
}

export function sameRef(a: VipRef, b: VipRef): boolean {
  return a.kind === b.kind && a.name === b.name;
}
