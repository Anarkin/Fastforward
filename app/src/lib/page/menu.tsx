import { useCallback, useRef, useState } from 'react';
import { keymap, letterTyped, pressedAlone } from '../shared/keymap';
import {
  onMenuKeyDown,
  useDismiss,
  useMenuFocus,
  type ContextMenuItem,
} from './menuControls';
import { MenuItems } from './contextMenu';
import { DropdownIcon, MoreIcon } from './icons';
import { Name } from './name';
import { keyPressed } from './shortcuts';
import { filteredItems } from './menuFilter';

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
  items,
  marked = false,
  icon = <MoreIcon />,
  arrow = false,
  label,
  named = false,
  trigger,
  filter,
  onChosen,
}: {
  title: string;
  items: readonly ContextMenuItem[];
  marked?: boolean;
  icon?: React.ReactNode;
  arrow?: boolean;
  label?: string;
  named?: boolean;
  trigger?: React.Ref<HTMLButtonElement>;
  filter?: string;
  onChosen?: () => void;
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
        className={`nav-button menu-button-trigger${label === undefined ? '' : ' labelled'}${arrow ? ' arrowed' : ''}${open ? ' open' : ''}`}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label === undefined ? (
          icon
        ) : (
          <span className="menu-button-label">
            {named ? <Name>{label}</Name> : label}
          </span>
        )}
        {(label !== undefined || arrow) && <DropdownIcon />}
        {marked && <span className="menu-mark" />}
      </button>
      {open &&
        (filter === undefined ? (
          <Dropdown container={container} items={shown} onClose={close} />
        ) : (
          <FilteredDropdown
            container={container}
            items={shown}
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
  useMenuFocus(menu, false, input);
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
