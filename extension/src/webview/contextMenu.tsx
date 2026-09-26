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

// An item runs onClick, or opens its submenu to the side; a separator is a line
export type ContextMenuItem =
  | {
      readonly label: string;
      readonly onClick?: () => void;
      readonly submenu?: readonly ContextMenuItem[];
      // Shown greyed out, like what is checked out already
      readonly disabled?: boolean;
    }
  | { readonly separator: true };

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
      <MenuItems items={menu.items} onClose={onClose} />
    </div>
  );
}

// The items of a menu or submenu; a submenu opens while its item is hovered
function MenuItems({
  items,
  onClose,
}: {
  items: readonly ContextMenuItem[];
  onClose: () => void;
}) {
  const [openSubmenu, setOpenSubmenu] = useState<number>();
  return (
    <>
      {items.map((item, index) =>
        'separator' in item ? (
          <div key={`separator-${index}`} className="menu-separator" />
        ) : (
          <div
            key={item.label}
            className="menu-entry"
            onMouseEnter={() =>
              setOpenSubmenu(item.submenu ? index : undefined)
            }
          >
            <button
              className={`menu-item ${item.submenu ? 'has-submenu' : ''}`}
              role="menuitem"
              aria-haspopup={item.submenu ? 'menu' : undefined}
              disabled={item.disabled}
              onClick={() => {
                if (item.submenu) {
                  setOpenSubmenu(index);
                } else {
                  onClose();
                  item.onClick?.();
                }
              }}
            >
              {item.label}
              {item.submenu && <span className="submenu-arrow">▸</span>}
            </button>
            {item.submenu && openSubmenu === index && (
              <Submenu items={item.submenu} onClose={onClose} />
            )}
          </div>
        ),
      )}
    </>
  );
}

// Next to its item, on the left instead when there's no room on the right
function Submenu({
  items,
  onClose,
}: {
  items: readonly ContextMenuItem[];
  onClose: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [flipped, setFlipped] = useState(false);
  useLayoutEffect(() => {
    const box = element.current?.getBoundingClientRect();
    if (box && box.right > window.innerWidth) {
      setFlipped(true);
    }
  }, []);
  return (
    <div
      ref={element}
      className={`menu submenu ${flipped ? 'flipped' : ''}`}
      role="menu"
    >
      <MenuItems items={items} onClose={onClose} />
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
