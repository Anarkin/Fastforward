import { useLayoutEffect, useRef, useState } from 'react';
import { MenuItems } from '../../lib/page/menuItems';
import {
  menuRows,
  menuScrolls,
  onMenuKeyDown,
  useMenuFocus,
} from '../../lib/page/menuControls';
import type { OpenMenu } from '../../lib/page/contextMenuItem';
import { useDismiss } from '../../lib/page/dismiss';
import { useWholeRows } from '../../lib/page/wholeRows';
import { useShell } from './store';

export function ContextMenu({
  menu,
  onClose,
  className,
}: {
  menu: OpenMenu;
  onClose: () => void;
  className?: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const scrolling = useShell((state) => state.scrolling);
  const scrolled = menuScrolls(menu.items);
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
  useWholeRows(element, scrolled ? menuRows : undefined, scrolling);

  return (
    <div
      ref={element}
      className={`menu context-menu${scrolled ? ' scrolls' : ''}${className === undefined ? '' : ` ${className}`}`}
      role="menu"
      style={position}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => onMenuKeyDown(event)}
    >
      <MenuItems items={menu.items} scrolling={scrolling} onClose={onClose} />
    </div>
  );
}
