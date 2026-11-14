import {
  compareKeymap,
  diffGroups,
  gitGroups,
  gitKeymap,
} from '../../tools/git/page/keymap';
import {
  everywhereGroups,
  shellKeymap,
  shortcutGroupsOf,
  type ShortcutGroup,
} from '../shared/keymap';
import { keymap } from '../../lib/shared/keymap';
import { strings } from '../../lib/shared/strings';
import type { ToolId } from '../shared/tools';
import {
  commanderGroups,
  editorGroups,
  editorKeymap,
  viewerGroups,
  viewerKeymap,
  commanderKeymap,
} from '../../tools/commander/page/keymap';
import {
  terminalGroups,
  terminalKeymap,
} from '../../tools/terminal/page/keymap';

export type ShortcutEntryId =
  ToolId | 'viewer' | 'diff' | 'editor' | 'everywhere';

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
    id: 'diff',
    title: strings.shortcuts.diff,
    groups: shortcutGroupsOf(diffGroups, titles, compareKeymap),
  },
  {
    id: 'editor',
    title: strings.shortcuts.editor,
    groups: shortcutGroupsOf(editorGroups, titles, editorKeymap),
  },
  {
    id: 'git',
    title: strings.tools.git,
    groups: shortcutGroupsOf(gitGroups, titles, gitKeymap),
  },
  {
    id: 'terminal',
    title: strings.tools.terminal,
    groups: shortcutGroupsOf(terminalGroups, titles, terminalKeymap),
  },
  {
    id: 'everywhere',
    title: strings.shortcuts.everywhere,
    groups: shortcutGroupsOf(everywhereGroups, titles, {
      ...shellKeymap,
      ...keymap,
    }),
  },
];
