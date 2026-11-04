import { useRef } from 'react';
import { keymap } from '../shared/keymap';
import { themes, type Theme, type UpdateStatus } from '../shared/protocol';
import { strings } from '../../shared/strings';
import { MenuButton } from '../../ui/menu';
import { useBinding } from '../../ui/shortcuts';
import { AppIcon } from './titleBar';

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
  theme,
  onTheme,
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
  theme: Theme;
  onTheme: (theme: Theme) => void;
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
      icon={<AppIcon />}
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
        {
          label: strings.tabs.theme,
          submenu: themes.map((each) => ({
            label: strings.tabs.themes[each],
            checked: each === theme,
            onClick: () => onTheme(each),
          })),
        },
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
