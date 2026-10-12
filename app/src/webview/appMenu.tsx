import type { UpdateStatus } from '../shared/protocol';
import { strings } from '../shared/strings';
import { MenuIcon } from './icons';
import { MenuButton } from './menu';

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
  onSort,
  onOpenSettings,
  onOpenDefaultSettings,
  onShowShortcuts,
  onCheckForUpdates,
  onInstallUpdate,
  onShowAbout,
}: {
  update: UpdateStatus;
  onSort: () => void;
  onOpenSettings: () => void;
  onOpenDefaultSettings: () => void;
  onShowShortcuts: () => void;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onShowAbout: () => void;
}) {
  const installs = update.kind === 'ready' || update.kind === 'available';
  return (
    <MenuButton
      title={strings.tabs.settings}
      icon={<MenuIcon />}
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
        { label: strings.tabs.about, onClick: onShowAbout },
      ]}
    />
  );
}
