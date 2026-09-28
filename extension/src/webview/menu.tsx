import { useCallback, useRef, useState } from 'react';
import { MenuItems, useDismiss, type ContextMenuItem } from './contextMenu';

// A gear that opens a dropdown menu, with the same items as a context menu
export function MenuButton({
  title,
  items,
}: {
  title: string;
  items: readonly ContextMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="settings" ref={container}>
      <button
        className={`settings-button ${open ? 'open' : ''}`}
        title={title}
        onClick={() => setOpen(!open)}
      >
        ⚙
      </button>
      {open && <Dropdown container={container} items={items} onClose={close} />}
    </div>
  );
}

// Under the gear, closing like a context menu; clicks on the gear itself are
// inside the container, so they toggle it instead
function Dropdown({
  container,
  items,
  onClose,
}: {
  container: React.RefObject<HTMLElement | null>;
  items: readonly ContextMenuItem[];
  onClose: () => void;
}) {
  useDismiss(container, onClose);
  return (
    <div className="menu" role="menu">
      <MenuItems items={items} onClose={onClose} />
    </div>
  );
}
