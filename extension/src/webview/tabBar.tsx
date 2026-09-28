import { useEffect, useRef } from 'react';
import { type TabInfo } from '../protocol';
import { MenuButton } from './menu';

// How long the pointer rests on a tab before it starts loading
const preloadDelay = 100;

export function TabBar({
  tabs,
  active,
  onSelect,
  onPreload,
  onClose,
  onAdd,
  onSort,
  onLog,
}: {
  tabs: readonly TabInfo[];
  active: string | undefined;
  onSelect: (root: string) => void;
  // The pointer rests on a tab
  onPreload: (root: string) => void;
  onClose: (root: string) => void;
  onAdd: () => void;
  onSort: () => void;
  onLog: (message: string) => void;
}) {
  const bar = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const hover = useRef<ReturnType<typeof setTimeout>>(undefined);

  // A tab the pointer rests on starts loading, so it's ready when clicked;
  // sweeping over the tabs doesn't load them all
  const startPreload = (root: string) => {
    clearTimeout(hover.current);
    if (root !== active) {
      hover.current = setTimeout(() => onPreload(root), preloadDelay);
    }
  };
  const stopPreload = () => clearTimeout(hover.current);
  // Nothing loads for a tab bar that is gone
  useEffect(() => {
    const timer = hover;
    return () => clearTimeout(timer.current);
  }, [hover]);

  // Reports the layout once, to find where space around the page comes from
  useEffect(() => {
    requestAnimationFrame(() => {
      onLog(
        `layout: window ${window.innerWidth}x${window.innerHeight}, ` +
          `dpr ${window.devicePixelRatio}, ` +
          `body ${elementWidth(document.body)}, ` +
          `tab bar ${elementWidth(bar.current)}, ` +
          `tab list ${elementWidth(list.current)}`,
      );
    });
  }, [onLog]);

  // The wheel scrolls the tabs sideways, because their scrollbar is hidden
  const onWheel = (event: React.WheelEvent) => {
    if (list.current && event.deltaY !== 0) {
      list.current.scrollLeft += event.deltaY;
    }
  };

  return (
    <nav className="tabs" ref={bar}>
      <div className="tab-list" ref={list} onWheel={onWheel}>
        {tabs.map((tab) => (
          <div
            key={tab.root}
            className={`tab ${tab.root === active ? 'active' : ''}`}
            title={tab.root}
            onClick={() => onSelect(tab.root)}
            onPointerEnter={() => startPreload(tab.root)}
            onPointerLeave={stopPreload}
            // Stops the browser's middle-button autoscroll, which would
            // otherwise swallow the middle click once the tabs overflow
            onMouseDown={(event) =>
              event.button === 1 && event.preventDefault()
            }
            onAuxClick={(event) => event.button === 1 && onClose(tab.root)}
          >
            <span className="tab-name">{tab.name}</span>
            <button
              className="tab-close"
              title="Close"
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab.root);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button className="tab-add" title="Open a repository" onClick={onAdd}>
          +
        </button>
      </div>
      <MenuButton
        title="Settings"
        items={[{ label: 'Sort A-Z', onClick: onSort }]}
      />
    </nav>
  );
}

export function elementWidth(element: Element | null): number {
  return element ? Math.round(element.getBoundingClientRect().width) : 0;
}
