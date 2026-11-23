import { labelTip, tip } from './tips';
import { pathMenuClass } from './pathMenu';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { keymap } from './keymap';
import { letterTyped, pressedAlone } from '../shared/keymap';
import {
  menuRows,
  menuScrolls,
  onMenuKeyDown,
  useMenuFocus,
} from './menuControls';
import type { ContextMenuItem } from './contextMenuItem';
import { useDismiss } from './dismiss';
import { MenuItems } from './menuItems';
import { DropdownIcon, MoreIcon } from './icons';
import { NamedPath } from './name';
import { keyPressed } from './shortcuts';
import { filteredItems } from './menuFilter';
import { searchFilter } from '../shared/filter';
import { noSearch } from '../shared/searchOptions';
import { SearchBar } from './searchBar';
import type { ScrollSettings } from './scrollSettings';
import { useWholeRows } from './wholeRows';
import { menuFit, type MenuFit } from './menuFit';

function thenChosen(
  items: readonly ContextMenuItem[],
  onChosen: () => void,
): readonly ContextMenuItem[] {
  return items.map((item) => {
    if ('separator' in item) {
      return item;
    }
    const { onClick, submenu } = item;
    return {
      ...item,
      ...(onClick !== undefined && {
        onClick: () => {
          onClick();
          onChosen();
        },
      }),
      ...(submenu !== undefined && { submenu: thenChosen(submenu, onChosen) }),
    };
  });
}

export function MenuButton({
  title,
  keys,
  items,
  marked = false,
  icon = <MoreIcon />,
  arrow = false,
  label,
  path = false,
  trigger,
  filter,
  onChosen,
  scrolling,
  disabled = false,
}: {
  title: string;
  keys?: string | undefined;
  items: readonly ContextMenuItem[];
  marked?: boolean;
  icon?: React.ReactNode;
  arrow?: boolean;
  label?: string;
  path?: boolean;
  trigger?: React.Ref<HTMLButtonElement>;
  filter?: string;
  onChosen?: () => void;
  scrolling: ScrollSettings;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const shown = onChosen === undefined ? items : thenChosen(items, onChosen);

  return (
    <div
      className="menu-button"
      ref={container}
      onBlur={(event) => {
        const to = event.relatedTarget;
        if (
          to instanceof Element &&
          !event.currentTarget.contains(to) &&
          to.closest(`.${pathMenuClass}`) === null
        ) {
          close();
        }
      }}
    >
      <button
        ref={trigger}
        className={`nav-button menu-button-trigger${label === undefined ? '' : ' labelled'}${arrow ? ' arrowed' : ''}${open ? ' open' : ''}`}
        {...(label === undefined
          ? labelTip(title, { keys })
          : tip(title, { keys }))}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {label === undefined ? (
          icon
        ) : (
          <span className="menu-button-label">
            {path ? <NamedPath path={label} /> : label}
          </span>
        )}
        {(label !== undefined || arrow) && <DropdownIcon />}
        {marked && <span className="menu-mark" />}
      </button>
      {open &&
        !disabled &&
        (filter === undefined ? (
          <Dropdown
            container={container}
            items={shown}
            scrolling={scrolling}
            onClose={close}
          />
        ) : (
          <FilteredDropdown
            container={container}
            items={shown}
            placeholder={filter}
            scrolling={scrolling}
            onClose={close}
          />
        ))}
    </div>
  );
}

function Dropdown({
  container,
  items,
  scrolling,
  onClose,
}: {
  container: React.RefObject<HTMLElement | null>;
  items: readonly ContextMenuItem[];
  scrolling: ScrollSettings;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<MenuFit>();
  const scrolled = menuScrolls(items);
  useLayoutEffect(() => {
    const element = menu.current;
    if (element) {
      const next = menuFit(
        fit,
        element.getBoundingClientRect(),
        element.scrollHeight,
        scrolled,
        {
          width: window.innerWidth,
          height: window.innerHeight,
          ratio: window.devicePixelRatio,
        },
      );
      if (next !== undefined) {
        setFit(next);
      }
    }
  }, [scrolled, fit]);
  const tallest = fit?.tallest;
  useDismiss(container, onClose);
  useMenuFocus(menu);
  useWholeRows(menu, tallest === undefined ? undefined : menuRows, scrolling);
  return (
    <div
      className={tallest === undefined ? 'menu' : 'menu scrolls'}
      style={{
        maxHeight: tallest,
        marginLeft: fit && fit.moved > 0 ? -fit.moved : undefined,
      }}
      role="menu"
      ref={menu}
      onKeyDown={(event) => onMenuKeyDown(event)}
    >
      <MenuItems items={items} scrolling={scrolling} onClose={onClose} />
    </div>
  );
}

function FilteredDropdown({
  container,
  items,
  placeholder,
  scrolling,
  onClose,
}: {
  container: React.RefObject<HTMLElement | null>;
  items: readonly ContextMenuItem[];
  placeholder: string;
  scrolling: ScrollSettings;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [{ query, options }, setSearch] = useState(noSearch);
  const [current, setCurrent] = useState(0);
  const filter = searchFilter(query, options);
  const shown = filteredItems(items, filter);
  useDismiss(container, onClose);
  useMenuFocus(menu, false, input);
  useWholeRows(menu, menuRows, scrolling);
  useLayoutEffect(() => {
    const element = menu.current;
    if (element) {
      element.style.minWidth = `${element.getBoundingClientRect().width}px`;
    }
  }, []);
  const firstItem = () =>
    menu.current?.querySelector<HTMLButtonElement>(
      ':scope > .menu-entry > .menu-item:not(:disabled)',
    );
  const itemsShown = () =>
    Array.from(
      menu.current?.querySelectorAll(':scope > .menu-entry > .menu-item') ?? [],
    );
  return (
    <div
      className="menu filtered-menu"
      role="menu"
      ref={menu}
      onFocus={(event) => {
        setCurrent(Math.max(0, itemsShown().indexOf(event.target)));
      }}
      onKeyDown={(event) => {
        if (event.target === input.current) {
          return;
        }
        const typed = pressedAlone(event) && letterTyped(event) !== undefined;
        const back =
          keyPressed(keymap.menuItem, event) === 'previous' &&
          document.activeElement === firstItem();
        if (typed || back) {
          input.current?.focus();
          if (back) {
            event.preventDefault();
          }
          event.stopPropagation();
          return;
        }
        onMenuKeyDown(event);
      }}
    >
      <SearchBar
        font="proportional"
        compact
        query={query}
        options={options}
        found={{
          current,
          matches: shown.filter((item) => !('separator' in item)).length,
        }}
        placeholder={placeholder}
        input={input}
        onQuery={(next) => setSearch({ query: next, options })}
        onOptions={(next) => setSearch({ query, options: next })}
        onKeyDown={(event) => {
          const wanted = keyPressed(keymap.menuFilter, event);
          if (wanted === 'items') {
            event.preventDefault();
            firstItem()?.focus();
          } else if (wanted === 'first') {
            event.preventDefault();
            firstItem()?.click();
          }
          event.stopPropagation();
        }}
      />
      <MenuItems
        items={shown}
        filter={filter}
        scrolling={scrolling}
        onClose={onClose}
      />
    </div>
  );
}
