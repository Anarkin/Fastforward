import {
  compareGroups,
  compareKeymap,
  gitGroups,
  gitKeymap,
} from '../../tools/git/shared/keymap';
import { shortcutGroupsOf, type ShortcutGroup } from '../shared/keymap';
import { strings } from '../../shared/strings';
import type { ToolId } from '../shared/tools';
import { CommanderTool } from '../../tools/commander/page/tool';
import {
  commanderGroups,
  viewerGroups,
  viewerKeymap,
  commanderKeymap,
} from '../../tools/commander/shared/keymap';
import { TerminalTool } from '../../tools/terminal/page/tool';
import {
  terminalGroups,
  terminalKeymap,
} from '../../tools/terminal/shared/keymap';
import { GitTool } from '../../tools/git/page/tool';
import { activeTabOf, useShell, useShellActions } from './store';

export const toolShortcuts: Readonly<Record<ToolId, readonly ShortcutGroup[]>> =
  {
    terminal: shortcutGroupsOf(
      terminalGroups,
      strings.shortcuts.groups,
      terminalKeymap,
    ),
    commander: shortcutGroupsOf(
      commanderGroups,
      strings.shortcuts.groups,
      commanderKeymap,
    ),
    git: shortcutGroupsOf(gitGroups, strings.shortcuts.groups, gitKeymap),
  };

export const compareShortcuts: readonly ShortcutGroup[] = shortcutGroupsOf(
  compareGroups,
  strings.shortcuts.groups,
  compareKeymap,
);

export const viewerShortcuts: readonly ShortcutGroup[] = shortcutGroupsOf(
  viewerGroups,
  strings.shortcuts.groups,
  viewerKeymap,
);

export function ToolViews() {
  const active = useShell((state) => activeTabOf(state)?.tool);
  const { channels } = useShellActions();
  return (
    <>
      <TerminalTool
        active={active === 'terminal'}
        post={channels.terminal.post}
        listen={channels.terminal.listen}
      />
      <CommanderTool
        active={active === 'commander'}
        post={channels.commander.post}
        listen={channels.commander.listen}
        dropFiles={channels.commander.dropFiles}
      />
      <GitTool
        active={active === 'git'}
        post={channels.git.post}
        listen={channels.git.listen}
      />
    </>
  );
}
