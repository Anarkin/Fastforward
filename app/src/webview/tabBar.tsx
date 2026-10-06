import { useEffect, useMemo, useRef } from 'react';
import { type TabInfo } from '../shared/protocol';
import { CloseIcon } from './icons';
import { MenuButton } from './menu';
import { clicked, keymap } from '../shared/keymap';
import { useBinding } from './shortcuts';

export function adjacentTab(
  tabs: readonly TabInfo[],
  active: string | undefined,
  step: 1 | -1,
): string | undefined {
  if (tabs.length < 2) {
    return undefined;
  }
  const index = tabs.findIndex((tab) => tab.root === active);
  const next = index === -1 ? 0 : (index + step + tabs.length) % tabs.length;
  return tabs[next].root;
}

export const preloadDelay = 200;

export function resting(delay: number): {
  start: (action: () => void) => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => clearTimeout(timer);
  return {
    start: (action) => {
      cancel();
      timer = setTimeout(action, delay);
    },
    cancel,
  };
}

export function TabBar({
  tabs,
  active,
  onSelect,
  onPreload,
  onClose,
  onAdd,
  onSort,
  onOpenSettings,
  onOpenDefaultSettings,
  onShowShortcuts,
  onLog,
}: {
  tabs: readonly TabInfo[];
  active: string | undefined;
  onSelect: (root: string) => void;
  onPreload: (root: string) => void;
  onClose: (root: string) => void;
  onAdd: (event: React.MouseEvent) => void;
  onSort: () => void;
  onOpenSettings: () => void;
  onOpenDefaultSettings: () => void;
  onShowShortcuts: () => void;
  onLog: (message: string) => void;
}) {
  const bar = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);

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

  const rest = useMemo(() => resting(preloadDelay), []);
  useEffect(() => rest.cancel, [rest]);

  const add = useRef<HTMLButtonElement>(null);
  useBinding(keymap.openRepository, () => add.current?.click());
  useBinding(keymap.repository, (step) => {
    const root = adjacentTab(tabs, active, step);
    if (root !== undefined) {
      onSelect(root);
    }
  });

  return (
    <nav className="tabs" ref={bar}>
      <div className="tab-list" ref={list}>
        {tabs.map((tab) => (
          <div
            key={tab.root}
            className={`tab ${tab.root === active ? 'active' : ''}`}
            title={tab.root}
            onClick={() => {
              rest.cancel();
              onSelect(tab.root);
            }}
            onPointerEnter={() =>
              tab.root !== active && rest.start(() => onPreload(tab.root))
            }
            onPointerLeave={rest.cancel}
            onMouseDown={(event) =>
              clicked(keymap.closeRepository, event) && event.preventDefault()
            }
            onAuxClick={(event) =>
              clicked(keymap.closeRepository, event) && onClose(tab.root)
            }
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
              <CloseIcon />
            </button>
          </div>
        ))}
        <button
          ref={add}
          className="tab-add"
          title="Open a repository"
          onClick={onAdd}
        >
          +
        </button>
      </div>
      <MenuButton
        title="Settings"
        items={[
          { label: 'Sort A-Z', onClick: onSort },
          { separator: true },
          { label: 'Open Default Settings', onClick: onOpenDefaultSettings },
          { label: 'Open User Settings', onClick: onOpenSettings },
          { separator: true },
          { label: 'Keyboard Shortcuts', onClick: onShowShortcuts },
        ]}
      />
    </nav>
  );
}

function elementWidth(element: Element | null): number {
  return element ? Math.round(element.getBoundingClientRect().width) : 0;
}
