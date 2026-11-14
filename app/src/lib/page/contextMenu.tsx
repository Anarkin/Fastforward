import { useLayoutEffect, useRef, useState } from 'react';
import {
  CloseIcon,
  ImageIcon,
  SevenZipIcon,
  SubmenuIcon,
  ToolIcon,
} from './icons';
import { Name, Words } from './name';
import { keymap } from '../shared/keymap';
import { strings } from '../shared/strings';
import { keyPressed } from './shortcuts';
import {
  onMenuKeyDown,
  openedSubmenu,
  shownKey,
  submenuPlacement,
  useDismiss,
  useMenuFocus,
  type ContextMenuItem,
  type MenuIcon,
  type OpenMenu,
} from './menuControls';

function MenuIconOf({ icon }: { icon: MenuIcon }) {
  switch (icon) {
    case 'sevenZip':
      return <SevenZipIcon />;
    case 'image':
      return <ImageIcon />;
    case 'terminal':
    case 'commander':
    case 'git':
      return <ToolIcon tool={icon} />;
    default:
      return icon satisfies never;
  }
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

  useDismiss(element, onClose, { onScroll: true, ignore: menu.trigger });
  useMenuFocus(element);

  return (
    <div
      ref={element}
      className={`menu context-menu${scrolls(menu.items) ? ' scrolls' : ''}`}
      role="menu"
      style={position}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => onMenuKeyDown(event)}
    >
      <MenuItems items={menu.items} onClose={onClose} />
    </div>
  );
}

function scrolls(items: readonly ContextMenuItem[]): boolean {
  return items.every((item) => 'separator' in item || !item.submenu);
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
  const removedAt = useRef<number>(undefined);
  const keyed = items.some(
    (item) => !('separator' in item) && shownKey(item) !== undefined,
  );
  useLayoutEffect(() => {
    const removed = removedAt.current;
    removedAt.current = undefined;
    if (removed !== undefined) {
      entries.current
        .slice(0, removed + 1)
        .findLast((entry) => entry?.isConnected)
        ?.focus();
    }
  });
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
              onMouseMove={(event) => {
                if (document.activeElement !== event.currentTarget) {
                  event.currentTarget.focus();
                }
              }}
              className={`menu-item ${item.submenu ? 'has-submenu' : ''}`}
              role={
                item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'
              }
              aria-checked={item.checked}
              data-access-key={item.accessKey}
              aria-keyshortcuts={shownKey(item)}
              title={item.title}
              aria-haspopup={item.submenu ? 'menu' : undefined}
              aria-expanded={item.submenu ? openSubmenu === index : undefined}
              disabled={item.disabled}
              onKeyDown={(event) => {
                if (item.onRemove && keyPressed(keymap.removeItem, event)) {
                  event.preventDefault();
                  removedAt.current = index;
                  item.onRemove();
                }
              }}
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
              <span className="menu-check">
                {item.icon === undefined ? (
                  item.checked ? (
                    strings.symbols.checked
                  ) : (
                    ''
                  )
                ) : (
                  <MenuIconOf icon={item.icon} />
                )}
              </span>
              {keyed && (
                <span className="menu-access-key" aria-hidden="true">
                  {shownKey(item)}
                </span>
              )}
              {item.sentence !== undefined ? (
                <Words>{item.sentence}</Words>
              ) : item.name ? (
                <Name>{item.label}</Name>
              ) : (
                item.label
              )}
              {item.submenu && (
                <span className="submenu-arrow">
                  <SubmenuIcon />
                </span>
              )}
            </button>
            {item.onRemove && (
              <button
                className="menu-remove"
                title={item.removeTitle}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  item.onRemove?.();
                }}
              >
                <CloseIcon />
              </button>
            )}
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
