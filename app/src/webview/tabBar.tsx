import { useEffect, useMemo, useRef } from 'react';
import { type TabInfo, type UpdateStatus } from '../shared/protocol';
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

export function updateLabel(status: UpdateStatus): string {
  switch (status.kind) {
    case 'idle':
      return strings.tabs.checkForUpdates;
    case 'checking':
      return strings.tabs.checkForUpdatesWith(strings.tabs.checking);
    case 'upToDate':
      return strings.tabs.checkForUpdatesWith(strings.tabs.upToDate);
    case 'downloading':
      return strings.tabs.checkForUpdatesWith(
        strings.tabs.downloading(status.version, status.percent),
      );
    case 'failed':
      return strings.tabs.checkForUpdatesWith(strings.tabs.failed);
    case 'ready':
      return strings.tabs.restartToUpdate(status.version);
    case 'available':
      return strings.tabs.download(status.version);
    default:
      return status satisfies never;
  }
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
  update,
  onCheckForUpdates,
  onInstallUpdate,
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
  update: UpdateStatus;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
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

  const installs = update.kind === 'ready' || update.kind === 'available';
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
        marked={installs}
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
          { separator: true },
          {
            label: updateLabel(update),
            onClick: installs ? onInstallUpdate : onCheckForUpdates,
          },
        ]}
      />
    </nav>
  );
}

function elementWidth(element: Element | null): number {
  return element ? Math.round(element.getBoundingClientRect().width) : 0;
}
