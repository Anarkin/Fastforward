import { keyLabels, type Binding } from '../../lib/shared/keymap';
import type { TabInfo } from '../shared/protocol';
import type { ToolId } from '../shared/tools';
import {
  shortcutEntries,
  type ShortcutEntry,
  type ShortcutEntryId,
} from './toolShortcuts';
import { strings } from '../../lib/shared/strings';
import { filterWords } from '../../lib/page/fileFilter';
import { folded, matchesIn } from '../../lib/shared/textMatches';

interface ShortcutMatch {
  readonly words: readonly string[];
  readonly keys: ReadonlySet<string>;
}

interface ShortcutRow {
  readonly binding: Binding<unknown>;
  readonly match: ShortcutMatch;
}

interface ShownGroup {
  readonly key: string;
  readonly title: string;
  readonly rows: readonly ShortcutRow[];
}

export interface ShownEntry {
  readonly id: ShortcutEntryId;
  readonly title: string;
  readonly groups: readonly ShownGroup[];
  readonly count: number;
}

interface Section {
  readonly key: string;
  readonly top: number;
  readonly bottom: number;
}

export interface PaneView {
  readonly first: string | undefined;
  readonly cut: boolean;
  readonly atStart: boolean;
  readonly atEnd: boolean;
}

const unmatched: ShortcutMatch = { words: [], keys: new Set() };

function keysFound(labels: readonly string[], word: string): readonly string[] {
  const { joiner } = strings.shortcuts;
  if (word.includes(joiner)) {
    return labels.join(joiner).startsWith(word) ? labels : [];
  }
  return labels.filter(
    (label) => label === word || (word.length >= 3 && label.startsWith(word)),
  );
}

function shortcutMatch(
  binding: Binding<unknown>,
  words: readonly string[],
): ShortcutMatch | undefined {
  const said: string[] = [];
  const keys = new Set<string>();
  for (const word of words) {
    const inAction = matchesIn(binding.action, word, 1).length > 0;
    if (inAction) {
      said.push(word);
    }
    const found = Object.keys(binding.keys).flatMap((combo) =>
      keysFound(keyLabels(combo).map(folded), folded(word)),
    );
    for (const label of found) {
      keys.add(label);
    }
    if (!inAction && found.length === 0) {
      return undefined;
    }
  }
  return { words: said, keys };
}

export function shownEntries(
  entries: readonly ShortcutEntry[],
  query: string,
): ShownEntry[] {
  const words = filterWords(query);
  return entries.map((entry) => {
    const groups = entry.groups.map((group) => ({
      key: `${entry.id}/${group.title}`,
      title: group.title,
      rows: group.bindings.flatMap((binding) => {
        const match =
          words.length === 0 ? unmatched : shortcutMatch(binding, words);
        return match ? [{ binding, match }] : [];
      }),
    }));
    return {
      id: entry.id,
      title: entry.title,
      groups,
      count: groups.reduce((sum, group) => sum + group.rows.length, 0),
    };
  });
}

export function entryFor(
  tool: ToolId | undefined,
  kind: Pick<TabInfo, 'view' | 'edit' | 'compare'> = {},
  focused?: string,
): ShortcutEntryId {
  if (tool === undefined) {
    return 'everywhere';
  }
  const focusedEntry = shortcutEntries.find((each) => each.id === focused);
  if (focusedEntry !== undefined) {
    return focusedEntry.id;
  }
  if (tool === 'git' && kind.compare === true) {
    return 'diff';
  }
  return tool === 'commander' && kind.view === true
    ? 'viewer'
    : tool === 'commander' && kind.edit === true
      ? 'editor'
      : tool;
}

export function groupsInView(
  sections: readonly Section[],
  from: number,
  to: number,
): string[] {
  return sections
    .filter((section) => section.top < to - 1 && section.bottom > from + 1)
    .map((section) => section.key);
}

export function steppedEntry(
  from: ShortcutEntryId,
  step: 1 | -1,
): ShortcutEntryId {
  const ids = shortcutEntries.map((entry) => entry.id);
  return ids[(ids.indexOf(from) + step + ids.length) % ids.length] ?? from;
}

function keysWithMatches(entries: readonly ShownEntry[]): string[] {
  return entries.flatMap((entry) =>
    entry.groups
      .filter((group) => group.rows.length > 0)
      .map((group) => group.key),
  );
}

export function steppedGroup(
  entries: readonly ShownEntry[],
  open: ShortcutEntryId,
  view: PaneView,
  step: 1 | -1,
): string | undefined {
  const openAt = entries.findIndex((entry) => entry.id === open);
  const own = keysWithMatches(entries.slice(openAt, openAt + 1));
  const at = view.first === undefined ? -1 : own.indexOf(view.first);
  if (at !== -1 && step === 1 && !view.atEnd) {
    const next = own[at + 1];
    if (next !== undefined) {
      return next;
    }
  }
  if (at !== -1 && step === -1 && !view.atStart) {
    const back = view.cut ? view.first : own[at - 1];
    if (back !== undefined) {
      return back;
    }
  }
  return step === 1
    ? keysWithMatches(entries.slice(openAt + 1)).at(0)
    : keysWithMatches(entries.slice(0, openAt)).at(-1);
}
