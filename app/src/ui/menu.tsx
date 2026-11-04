import { useCallback, useEffect, useRef, useState } from 'react';
import { keymap, letterTyped, pressedAlone } from '../shell/shared/keymap';
import {
  MenuItems,
  onMenuKeyDown,
  useDismiss,
  useMenuFocus,
  type ContextMenuItem,
} from './contextMenu';
import { DropdownIcon, MoreIcon } from './icons';
import { keyPressed } from './shortcuts';

export function MenuButton({
  title,
  items,
  marked = false,
  icon = <MoreIcon />,
  label,
  trigger,
  filter,
}: {
  title: string;
  items: readonly ContextMenuItem[];
  marked?: boolean;
  icon?: React.ReactNode;
  label?: string;
  trigger?: React.Ref<HTMLButtonElement>;
  filter?: string;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div
      className="menu-button"
      ref={container}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          close();
        }
      }}
    >
      <button
        ref={trigger}
        className={`nav-button menu-button-trigger${label === undefined ? '' : ' labelled'}${open ? ' open' : ''}`}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label === undefined ? (
          icon
        ) : (
          <>
            <span className="menu-button-label">{label}</span>
            <DropdownIcon />
          </>
        )}
        {marked && <span className="menu-mark" />}
      </button>
      {open &&
        (filter === undefined ? (
          <Dropdown container={container} items={items} onClose={close} />
        ) : (
          <FilteredDropdown
            container={container}
            items={items}
            placeholder={filter}
            onClose={close}
          />
        ))}
    </div>
  );
}

function Dropdown({
  container,
  items,
  onClose,
}: {
  container: React.RefObject<HTMLElement | null>;
  items: readonly ContextMenuItem[];
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useDismiss(container, onClose);
  useMenuFocus(menu);
  return (
    <div
      className="menu"
      role="menu"
      ref={menu}
      onKeyDown={(event) => onMenuKeyDown(event)}
    >
      <MenuItems items={items} onClose={onClose} />
    </div>
  );
}

export function filteredItems(
  items: readonly ContextMenuItem[],
  query: string,
): readonly ContextMenuItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return items;
  }
  return items.filter((item) => {
    if ('separator' in item) {
      return false;
    }
    const text = `${item.label} ${item.keywords ?? ''}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

function FilteredDropdown({
  container,
  items,
  placeholder,
  onClose,
}: {
  container: React.RefObject<HTMLElement | null>;
  items: readonly ContextMenuItem[];
  placeholder: string;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  useDismiss(container, onClose);
  useMenuFocus(menu, false);
  useEffect(() => input.current?.focus(), []);
  const firstItem = () =>
    menu.current?.querySelector<HTMLButtonElement>(
      ':scope > .menu-entry > .menu-item:not(:disabled)',
    );
  return (
    <div
      className="menu filtered-menu"
      role="menu"
      ref={menu}
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
      <input
        ref={input}
        className="menu-filter"
        placeholder={placeholder}
        aria-label={placeholder}
        spellCheck={false}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
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
      <MenuItems items={filteredItems(items, query)} onClose={onClose} />
    </div>
  );
}
