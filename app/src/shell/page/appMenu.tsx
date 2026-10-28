import { useRef } from 'react';
import { keymap } from '../shared/keymap';
import type { UpdateStatus } from '../shared/protocol';
import { strings } from '../../shared/strings';
import { MenuIcon } from '../../ui/icons';
import { MenuButton } from '../../ui/menu';
import { useBinding } from '../../ui/shortcuts';

export function updateLabel(status: UpdateStatus): string {
  switch (status.kind) {
    case 'idle':
      return strings.tabs.checkForUpdates;
    case 'checking':
      return strings.tabs.checkingForUpdates;
    case 'upToDate':
      return strings.tabs.upToDate;
    case 'downloading':
      return strings.tabs.downloading(status.version, status.percent);
    case 'failed':
      return strings.tabs.checkFailed;
    case 'ready':
      return strings.tabs.restartToUpdate(status.version);
    case 'available':
      return strings.tabs.download(status.version);
    default:
      return status satisfies never;
  }
}

export function AppMenu({
  update,
  autoSortTabs,
  onAutoSortTabs,
  onSort,
  onOpenSettings,
  onOpenDefaultSettings,
  onShowShortcuts,
  onCheckForUpdates,
  onInstallUpdate,
  onShowAbout,
  onInstallCommand,
}: {
  update: UpdateStatus;
  autoSortTabs: boolean;
  onAutoSortTabs: (on: boolean) => void;
  onSort: () => void;
  onOpenSettings: () => void;
  onOpenDefaultSettings: () => void;
  onShowShortcuts: () => void;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onShowAbout: () => void;
  onInstallCommand?: () => void;
}) {
  const installs = update.kind === 'ready' || update.kind === 'available';
  const trigger = useRef<HTMLButtonElement>(null);
  useBinding(keymap.mainMenu, () => trigger.current?.click());
  return (
    <MenuButton
      trigger={trigger}
      title={strings.tabs.settings}
      icon={<MenuIcon />}
      marked={installs}
      items={[
        {
          label: strings.tabs.sortAutomatically,
          checked: autoSortTabs,
          onClick: () => onAutoSortTabs(!autoSortTabs),
        },
        ...(autoSortTabs
          ? []
          : [{ label: strings.tabs.sort, onClick: onSort }]),
        { separator: true },
        {
          label: strings.tabs.openDefaultSettings,
          onClick: onOpenDefaultSettings,
        },
        { label: strings.tabs.openUserSettings, onClick: onOpenSettings },
        { separator: true },
        { label: strings.shortcuts.title, onClick: onShowShortcuts },
        ...(onInstallCommand
          ? [{ label: strings.tabs.installCommand, onClick: onInstallCommand }]
          : []),
        { separator: true },
        {
          label: updateLabel(update),
          onClick: installs ? onInstallUpdate : onCheckForUpdates,
        },
        { label: strings.tabs.about, onClick: onShowAbout },
      ]}
    />
  );
}
