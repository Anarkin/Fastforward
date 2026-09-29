import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { Bookmark } from '../shared/protocol';

export type MenuTarget =
  | { readonly kind: 'ref'; readonly ref: Bookmark }
  | { readonly kind: 'commit'; readonly hash: string };

export type ContextMenuItem =
  | {
      readonly label: string;
      readonly onClick?: () => void;
      readonly submenu?: readonly ContextMenuItem[];
      readonly disabled?: boolean;
      readonly checked?: boolean;
      readonly radio?: boolean;
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
      (ignore !== undefined &&
        isElement(clicked) &&
        clicked.closest(ignore) !== null);
    if (!inside) {
      onClose();
    }
  };
  const onKeyDown = (event: Event) => {
    if ('key' in event && event.key === 'Escape' && layers.at(-1) === layer) {
      event.stopPropagation();
      onClose();
    }
  };
  target.addEventListener('pointerdown', onPointerDown, true);
  target.addEventListener('keydown', onKeyDown, true);
  target.addEventListener('blur', onClose);
  if (onScroll) {
    target.addEventListener('wheel', onClose, true);
  }
  return () => {
    const index = layers.indexOf(layer);
    if (index !== -1) {
      layers.splice(index, 1);
    }
    target.removeEventListener('pointerdown', onPointerDown, true);
    target.removeEventListener('keydown', onKeyDown, true);
    target.removeEventListener('blur', onClose);
    target.removeEventListener('wheel', onClose, true);
  };
}

export function useDismiss(
  element: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  {
    onScroll = false,
    ignore,
    enabled = true,
  }: DismissOptions & { readonly enabled?: boolean } = {},
): void {
  useEffect(() => {
    if (!enabled) {
      return () => {};
    }
    return listenForDismiss(window, element, onClose, { onScroll, ignore });
  }, [element, onClose, onScroll, ignore, enabled]);
}

export function MenuItems({
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
          <div key={index} className="menu-separator" />
        ) : (
          <div
            key={index}
            className="menu-entry"
            onMouseEnter={() =>
              setOpenSubmenu(item.submenu ? index : undefined)
            }
          >
            <button
              className={`menu-item ${item.submenu ? 'has-submenu' : ''}`}
              role={
                item.checked === undefined
                  ? 'menuitem'
                  : item.radio
                    ? 'menuitemradio'
                    : 'menuitemcheckbox'
              }
              aria-checked={item.checked}
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
              {item.checked !== undefined && (
                <span className="menu-check">{item.checked ? '✓' : ''}</span>
              )}
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

export const OpenContextMenu = createContext<
  (event: React.MouseEvent, target: MenuTarget) => void
>(() => {});

export function useContextMenu(target: MenuTarget) {
  const open = useContext(OpenContextMenu);
  return {
    onContextMenu: (event: React.MouseEvent) => open(event, target),
  };
}
