import { labelled, tip } from './tips';
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
  submenuPlace,
  useMenuFocus,
} from './menuControls';
import type { ContextMenuItem, MenuIcon } from './contextMenuItem';
import { narrows, noFilter, searchFilter, type Filter } from '../shared/filter';
import { filteredItems, leavesOf } from './menuFilter';
import { SearchBar } from './searchBar';
import { letterTyped, pressedAlone } from '../shared/keymap';
import { noSearch } from '../shared/searchOptions';
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
    case 'canvas':
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
                const active = document.activeElement;
                if (
                  active !== event.currentTarget &&
                  !(
                    active !== null &&
                    event.currentTarget.parentElement?.contains(active)
                  )
                ) {
                  event.currentTarget.focus({ preventScroll: true });
                }
              }}
              className={`menu-item ${item.submenu ? 'has-submenu' : ''}`}
              role={
                item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'
              }
              aria-checked={item.checked}
              data-access-key={item.accessKey}
              aria-keyshortcuts={item.accessKey}
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
              {item.details?.map((detail, at) => (
                <span key={at} className="menu-detail">
                  <HighlightWords text={detail} filter={filter} />
                </span>
              ))}
              {item.sentence !== undefined && item.struck === true ? (
                <span className="menu-struck">
                  <Words filter={filter}>{item.sentence}</Words>
                </span>
              ) : item.sentence !== undefined ? (
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
                {...(item.removeTitle !== undefined &&
                  labelled(item.removeTitle))}
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
                filtered={item.filtered === true}
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
  filtered,
  scrolling,
  onClose,
  focusFirst,
  onBack,
}: {
  items: readonly ContextMenuItem[];
  filtered: boolean;
  scrolling: ScrollSettings;
  onClose: () => void;
  focusFirst: boolean;
  onBack: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [{ query, options }, setSearch] = useState(noSearch);
  const filter = searchFilter(query, options);
  const shown = narrows(filter)
    ? filteredItems(leavesOf(items), filter)
    : items;
  useMenuFocus(element, focusFirst, filtered ? input : undefined);
  useWholeRows(element, menuRows, scrolling);
  const [place, setPlace] = useState<{
    left: number;
    top: number;
    height: number;
  }>();
  useLayoutEffect(() => {
    const menu = element.current;
    if (!menu) {
      return undefined;
    }
    const placed = () => {
      const box = menu.getBoundingClientRect();
      const entry = menu.parentElement?.getBoundingClientRect();
      if (!entry) {
        return;
      }
      const next = submenuPlace(
        entry,
        { width: box.width, height: menu.scrollHeight },
        { width: window.innerWidth, height: window.innerHeight },
      );
      setPlace((before) =>
        before?.left === next.left &&
        before.top === next.top &&
        before.height === next.height
          ? before
          : next,
      );
    };
    placed();
    const observer = new ResizeObserver(placed);
    observer.observe(menu);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={element}
      className={`menu submenu${filtered ? ' filtered-menu' : ''}`}
      style={
        place === undefined
          ? { opacity: 0 }
          : { left: place.left, top: place.top, maxHeight: place.height }
      }
      role="menu"
      onKeyDown={(event) => {
        if (
          filtered &&
          event.target !== input.current &&
          pressedAlone(event) &&
          letterTyped(event) !== undefined
        ) {
          input.current?.focus();
          event.stopPropagation();
          return;
        }
        onMenuKeyDown(event, onBack);
      }}
    >
      {filtered && (
        <SearchBar
          font="proportional"
          compact
          query={query}
          options={options}
          found={{
            current: -1,
            matches: shown.filter((item) => !('separator' in item)).length,
          }}
          placeholder={strings.search.placeholder}
          input={input}
          onQuery={(next) => setSearch({ query: next, options })}
          onOptions={(next) => setSearch({ query, options: next })}
          onKeyDown={(event) => {
            const wanted = keyPressed(keymap.menuFilter, event);
            const first = element.current?.querySelector<HTMLButtonElement>(
              ':scope > .menu-entry > .menu-item:not(:disabled)',
            );
            if (wanted === 'items') {
              event.preventDefault();
              first?.focus();
            } else if (wanted === 'first') {
              event.preventDefault();
              first?.click();
            }
            event.stopPropagation();
          }}
        />
      )}
      <MenuItems
        items={shown}
        filter={filter}
        scrolling={scrolling}
        onClose={onClose}
      />
    </div>
  );
}
