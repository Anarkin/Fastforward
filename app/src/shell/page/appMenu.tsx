import { useRef } from 'react';
import { shellKeymap } from '../shared/keymap';
import { strings } from '../../lib/shared/strings';
import { MenuButton } from '../../lib/page/menu';
import { useBinding } from '../../lib/page/shortcuts';
import { AppIcon } from './titleBar';
import { useShell, useShellActions } from './store';
import { updateLabel } from './updateLabel';

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
    newWindow: onNewWindow,
  } = useShellActions();
  const onShowShortcuts = () => showPopup('shortcuts', true);
  const onShowAbout = () => showPopup('about', true);
  const onInstallCommand = installsCommand ? installTerminalCommand : undefined;
  const installs = update.kind === 'ready' || update.kind === 'available';
  const trigger = useRef<HTMLButtonElement>(null);
  useBinding(shellKeymap.mainMenu, () => trigger.current?.click());
  return (
    <MenuButton
      trigger={trigger}
      title={strings.tabs.settings}
      icon={<AppIcon />}
      marked={installs}
      items={[
        { label: strings.tabs.newWindow, onClick: onNewWindow },
        { separator: true },
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
