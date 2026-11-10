import {
  compareKeymap,
  gitGroups,
  gitKeymap,
} from '../../tools/git/shared/keymap';
import {
  everywhereGroups,
  keymap,
  shortcutGroupsOf,
  type ShortcutGroup,
} from '../shared/keymap';
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

export type ShortcutEntryId = ToolId | 'viewer' | 'everywhere';

export interface ShortcutEntry {
  readonly id: ShortcutEntryId;
  readonly title: string;
  readonly groups: readonly ShortcutGroup[];
}

const titles = strings.shortcuts.groups;

export const shortcutEntries: readonly ShortcutEntry[] = [
  {
    id: 'commander',
    title: strings.tools.commander,
    groups: shortcutGroupsOf(commanderGroups, titles, commanderKeymap),
  },
  {
    id: 'viewer',
    title: strings.shortcuts.viewer,
    groups: shortcutGroupsOf(viewerGroups, titles, viewerKeymap),
  },
  {
    id: 'git',
    title: strings.tools.git,
    groups: shortcutGroupsOf(gitGroups, titles, {
      ...gitKeymap,
      closeCompare: compareKeymap.closeCompare,
    }),
  },
  {
    id: 'terminal',
    title: strings.tools.terminal,
    groups: shortcutGroupsOf(terminalGroups, titles, terminalKeymap),
  },
  {
    id: 'everywhere',
    title: strings.shortcuts.everywhere,
    groups: shortcutGroupsOf(everywhereGroups, titles, keymap),
  },
];

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
