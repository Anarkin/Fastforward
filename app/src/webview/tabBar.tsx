import { useEffect, useMemo, useRef } from 'react';
import { type TabInfo } from '../shared/protocol';
import { CloseIcon } from './icons';
import { MenuButton } from './menu';
import { clicked, keymap } from '../shared/keymap';
import { strings } from '../shared/strings';
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
        strings.log.layout(
          window.innerWidth,
          window.innerHeight,
          window.devicePixelRatio,
          elementWidth(document.body),
          elementWidth(bar.current),
          elementWidth(list.current),
        ),
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
              title={strings.common.close}
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
          title={strings.actions.openRepository}
          onClick={onAdd}
        >
          {strings.symbols.add}
        </button>
      </div>
      <MenuButton
        title={strings.tabs.settings}
        items={[
          { label: strings.tabs.sort, onClick: onSort },
          { separator: true },
          {
            label: strings.tabs.openDefaultSettings,
            onClick: onOpenDefaultSettings,
          },
          { label: strings.tabs.openUserSettings, onClick: onOpenSettings },
          { separator: true },
          { label: strings.tabs.keyboardShortcuts, onClick: onShowShortcuts },
        ]}
      />
    </nav>
  );
}

function elementWidth(element: Element | null): number {
  return element ? Math.round(element.getBoundingClientRect().width) : 0;
}
