import { useRef } from 'react';
import { keymap } from '../shared/keymap';
import type { UpdateStatus } from '../shared/protocol';
import { strings } from '../../shared/strings';
import { MenuButton } from '../../ui/menu';
import { useBinding } from '../../ui/shortcuts';
import { AppIcon } from './titleBar';
import { useShell, useShellActions } from './store';

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

export function AppMenu() {
  const update = useShell((state) => state.update);
  const installsCommand = useShell((state) => state.installsCommand);
  const {
    openSettings: onOpenSettings,
    openDefaultSettings: onOpenDefaultSettings,
    showPopup,
    checkForUpdates: onCheckForUpdates,
    installUpdate: onInstallUpdate,
    installTerminalCommand,
  } = useShellActions();
  const onShowShortcuts = () => showPopup('shortcuts', true);
  const onShowAbout = () => showPopup('about', true);
  const onInstallCommand = installsCommand ? installTerminalCommand : undefined;
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
          label: strings.tabs.openDefaultSettings,
          onClick: onOpenDefaultSettings,
        },
        { label: strings.tabs.openUserSettings, onClick: onOpenSettings },
        { separator: true },
        {
          label: updateLabel(update),
          onClick: installs ? onInstallUpdate : onCheckForUpdates,
        },
        { separator: true },
        ...(onInstallCommand
          ? [{ label: strings.tabs.installCommand, onClick: onInstallCommand }]
          : []),
        { label: strings.shortcuts.title, onClick: onShowShortcuts },
        { label: strings.tabs.about, onClick: onShowAbout },
      ]}
    />
  );
}
