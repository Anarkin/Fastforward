import { labelTip, tip } from './tips';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  CloseIcon,
  ImageIcon,
  SevenZipIcon,
  SubmenuIcon,
  ToolIcon,
} from './icons';
import { NamedPath, Words } from './name';
import { HighlightWords } from './highlight';
import { keymap } from './keymap';
import { strings } from '../shared/strings';
import { keyPressed } from './shortcuts';
import {
  menuRows,
  onMenuKeyDown,
  openedSubmenu,
  shownKey,
  submenuPlacement,
  useMenuFocus,
} from './menuControls';
import type { ContextMenuItem, MenuIcon } from './contextMenuItem';
import { noFilter, type Filter } from '../shared/filter';
import type { ScrollSettings } from './scrollSettings';
import { useWholeRows } from './wholeRows';

function MenuIconOf({ icon }: { icon: MenuIcon }) {
  switch (icon) {
    case 'sevenZip':
      return <SevenZipIcon />;
    case 'image':
      return <ImageIcon />;
    case 'terminal':
    case 'commander':
    case 'git':
    case 'viewer':
    case 'diff':
    case 'editor':
      return <ToolIcon tool={icon} />;
    default:
      return icon satisfies never;
  }
}

export function MenuItems({
  items,
  filter = noFilter,
  scrolling,
  onClose,
}: {
  items: readonly ContextMenuItem[];
  filter?: Filter;
  scrolling: ScrollSettings;
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
                  event.currentTarget.focus({ preventScroll: true });
                }
              }}
              className={`menu-item ${item.submenu ? 'has-submenu' : ''}`}
              role={
                item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'
              }
              aria-checked={item.checked}
              data-access-key={item.accessKey}
              aria-keyshortcuts={shownKey(item)}
              {...tip(item.title)}
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
              {item.details?.map((detail, at) => (
                <span key={at} className="menu-detail">
                  <HighlightWords text={detail} filter={filter} />
                </span>
              ))}
              {item.sentence !== undefined ? (
                <Words filter={filter}>{item.sentence}</Words>
              ) : item.path === true ? (
                <NamedPath path={item.label} filter={filter} />
              ) : (
                <HighlightWords text={item.label} filter={filter} />
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
                {...labelTip(item.removeTitle)}
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
                scrolling={scrolling}
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
  scrolling,
  onClose,
  focusFirst,
  onBack,
}: {
  items: readonly ContextMenuItem[];
  scrolling: ScrollSettings;
  onClose: () => void;
  focusFirst: boolean;
  onBack: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  useMenuFocus(element, focusFirst);
  useWholeRows(element, menuRows, scrolling);
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
      <MenuItems items={items} scrolling={scrolling} onClose={onClose} />
    </div>
  );
}
