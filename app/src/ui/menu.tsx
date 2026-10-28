import { useCallback, useRef, useState } from 'react';
import {
  MenuItems,
  onMenuKeyDown,
  useDismiss,
  useMenuFocus,
  type ContextMenuItem,
} from './contextMenu';
import { MoreIcon } from './icons';

export function MenuButton({
  title,
  items,
  marked = false,
  icon = <MoreIcon />,
  trigger,
}: {
  title: string;
  items: readonly ContextMenuItem[];
  marked?: boolean;
  icon?: React.ReactNode;
  trigger?: React.Ref<HTMLButtonElement>;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="menu-button" ref={container}>
      <button
        ref={trigger}
        className={`nav-button menu-button-trigger ${open ? 'open' : ''}`}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {icon}
        {marked && <span className="menu-mark" />}
      </button>
      {open && <Dropdown container={container} items={items} onClose={close} />}
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
