import { gitGroups, gitKeymap } from '../../tools/git/page/keymap';
import { compareKeymap, diffGroups } from '../../tools/git/page/compareKeymap';
import { everywhereGroups, shellKeymap } from '../shared/keymap';
import type { Binding } from '../../lib/shared/keymap';
import { keymap } from '../../lib/page/keymap';
import { strings } from '../../lib/shared/strings';
import type { ToolSection } from '../shared/tools';
import {
  commanderGroups,
  commanderKeymap,
} from '../../tools/commander/page/keymap';
import {
  viewerGroups,
  viewerKeymap,
} from '../../tools/viewer/page/viewerKeymap';
import {
  editorGroups,
  editorKeymap,
} from '../../tools/commander/page/editorKeymap';
import {
  terminalGroups,
  terminalKeymap,
} from '../../tools/terminal/page/keymap';

interface ShortcutGroup {
  readonly title: string;
  readonly bindings: readonly Binding<unknown>[];
}

function shortcutGroupsOf<const Group extends string>(
  groups: readonly Group[],
  titles: Readonly<Record<Group, string>>,
  bindings: Readonly<Record<string, Binding<unknown>>>,
): ShortcutGroup[] {
  return groups.map((group) => ({
    title: titles[group],
    bindings: Object.values(bindings).filter(
      (binding) => binding.group === group,
    ),
  }));
}

export type ShortcutEntryId = ToolSection | 'everywhere';

export interface ShortcutEntry {
  readonly id: ShortcutEntryId;
  readonly title: string;
  readonly groups: readonly ShortcutGroup[];
}

const titles = strings.shortcuts.groups;

export const shortcutEntries: readonly ShortcutEntry[] = [
  {
    id: 'everywhere',
    title: strings.shortcuts.everywhere,
    groups: shortcutGroupsOf(everywhereGroups, titles, {
      ...shellKeymap,
      ...keymap,
    }),
  },
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
];
