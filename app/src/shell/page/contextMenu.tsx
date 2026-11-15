import { useLayoutEffect, useRef, useState } from 'react';
import { MenuItems } from '../../lib/page/menuItems';
import { onMenuKeyDown, useMenuFocus } from '../../lib/page/menuControls';
import type { ContextMenuItem, OpenMenu } from '../../lib/page/contextMenuItem';
import { useDismiss } from '../../lib/page/dismiss';

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
