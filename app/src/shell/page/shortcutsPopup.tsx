import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { keyLabels, keymap, type Binding } from '../shared/keymap';
import type { TabInfo } from '../shared/protocol';
import type { ToolId } from '../shared/tools';
import { KeyCombo } from '../../lib/page/keyCombo';
import { HighlightWords } from '../../lib/page/highlight';
import { activeTabOf, useShell, useShellActions } from './store';
import {
  shortcutEntries,
  type ShortcutEntry,
  type ShortcutEntryId,
} from './tools';
import { strings } from '../../lib/shared/strings';
import { filterWords } from '../../lib/page/fileFilter';
import { folded, matchesIn } from '../../lib/shared/textMatches';
import { useDismiss } from '../../lib/page/contextMenu';
import { CloseIcon, FileIcon, TabsIcon, ToolIcon } from '../../lib/page/icons';
import { useDialogDrag, useModalDialog } from '../../lib/page/modalDialog';
import { keyPressed, shortcutsEntryOf } from '../../lib/page/shortcuts';

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

interface ShownEntry {
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

interface PaneView {
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

export function ShortcutsList({ entry }: { entry: ShownEntry }) {
  if (entry.count === 0) {
    return <div className="shortcuts-empty">{strings.shortcuts.noMatches}</div>;
  }
  return entry.groups
    .filter((group) => group.rows.length > 0)
    .map((group) => (
      <section
        key={group.key}
        className="shortcuts-group"
        data-group={group.key}
      >
        <div className="shortcuts-heading">{group.title}</div>
        {group.rows.map(({ binding, match }) => (
          <div key={binding.action} className="shortcut-row">
            <span className="shortcut-keys">
              {Object.keys(binding.keys).map((keys) => (
                <KeyCombo key={keys} keys={keys} matched={match.keys} />
              ))}
            </span>
            <span>
              <HighlightWords text={binding.action} words={match.words} />
            </span>
          </div>
        ))}
      </section>
    ));
}

function EntryIcon({ id }: { id: ShortcutEntryId }) {
  if (id === 'viewer' || id === 'diff' || id === 'editor') {
    return <FileIcon />;
  }
  return id === 'everywhere' ? <TabsIcon /> : <ToolIcon tool={id} />;
}

function ShortcutsTree({
  entries,
  open,
  marked,
  filtering,
  onOpen,
  onGo,
}: {
  entries: readonly ShownEntry[];
  open: ShortcutEntryId;
  marked: readonly string[];
  filtering: boolean;
  onOpen: (id: ShortcutEntryId) => void;
  onGo: (key: string) => void;
}) {
  return (
    <nav
      className="shortcuts-tree"
      aria-label={strings.shortcuts.tools}
      onMouseDown={(event) => event.preventDefault()}
    >
      {entries.map((entry) => {
        const opened = entry.id === open;
        return (
          <div key={entry.id}>
            <button
              className={[
                'shortcuts-tool',
                opened && 'open',
                filtering && entry.count === 0 && 'empty',
              ]
                .filter(Boolean)
                .join(' ')}
              tabIndex={-1}
              aria-expanded={opened}
              onClick={() => onOpen(entry.id)}
            >
              <EntryIcon id={entry.id} />
              <span className="shortcuts-tool-name">{entry.title}</span>
              {filtering && (
                <span className="shortcuts-count">{entry.count}</span>
              )}
            </button>
            {opened && (
              <div className="shortcuts-groups">
                {entry.groups.map((group) => (
                  <button
                    key={group.key}
                    className={
                      marked.includes(group.key)
                        ? 'shortcuts-group-link in-view'
                        : 'shortcuts-group-link'
                    }
                    tabIndex={-1}
                    disabled={group.rows.length === 0}
                    aria-current={
                      group.key === marked[0] ? 'location' : undefined
                    }
                    onClick={() => onGo(group.key)}
                  >
                    {group.title}
                    {filtering && (
                      <span className="shortcuts-count">
                        {group.rows.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function groupsIn(pane: HTMLElement): HTMLElement[] {
  return [...pane.querySelectorAll<HTMLElement>('[data-group]')];
}

function paneView(
  pane: HTMLElement,
): PaneView & { readonly keys: readonly string[] } {
  const heading =
    pane.querySelector<HTMLElement>('.shortcuts-heading')?.offsetHeight ?? 0;
  const groups = groupsIn(pane);
  const keys = groupsInView(
    groups.map((group) => {
      const rows = [...group.querySelectorAll<HTMLElement>('.shortcut-row')];
      const last = rows.at(-1);
      return {
        key: group.dataset.group ?? '',
        top: rows.at(0)?.offsetTop ?? group.offsetTop,
        bottom: last
          ? last.offsetTop + last.offsetHeight
          : group.offsetTop + group.offsetHeight,
      };
    }),
    pane.scrollTop + heading,
    pane.scrollTop + pane.clientHeight,
  );
  const first = groups.find((group) => group.dataset.group === keys[0]);
  return {
    keys,
    first: keys[0],
    cut: first !== undefined && first.offsetTop < pane.scrollTop - 1,
    atStart: pane.scrollTop <= 0,
    atEnd: pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 1,
  };
}

const everything: PaneView = {
  first: undefined,
  cut: false,
  atStart: true,
  atEnd: true,
};

export function ShortcutsPopup() {
  const tool = useShell((state) => activeTabOf(state)?.tool);
  const view = useShell((state) => activeTabOf(state)?.view);
  const compare = useShell((state) => activeTabOf(state)?.compare);
  const edit = useShell((state) => activeTabOf(state)?.edit);
  const { showPopup } = useShellActions();
  const onClose = useCallback(() => showPopup('shortcuts', false), [showPopup]);
  const [open, setOpen] = useState(() =>
    entryFor(
      tool,
      { view, edit, compare },
      typeof document === 'undefined'
        ? undefined
        : shortcutsEntryOf(document.activeElement),
    ),
  );
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState<readonly string[]>();
  const popup = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const pending = useRef<string>(undefined);
  useDismiss(popup, onClose, { byKeyOnly: true });
  const dialog = useModalDialog(popup);
  const drag = useDialogDrag(popup);
  useLayoutEffect(() => {
    field.current?.focus();
  }, []);
  const entries = useMemo(() => shownEntries(shortcutEntries, query), [query]);
  const entry = entries.find((each) => each.id === open);
  const firstKey = entry?.groups.find((group) => group.rows.length > 0)?.key;
  const marked = visible ?? (firstKey === undefined ? [] : [firstKey]);
  const measure = () => {
    const element = pane.current;
    if (!element) {
      return;
    }
    const { keys } = paneView(element);
    setVisible((before) => (before?.join() === keys.join() ? before : keys));
  };
  const scrollPane = (key: string) => {
    const element = pane.current;
    if (element) {
      element.scrollTop =
        groupsIn(element).find((group) => group.dataset.group === key)
          ?.offsetTop ?? 0;
    }
  };
  useLayoutEffect(() => {
    const key = pending.current;
    if (key !== undefined) {
      pending.current = undefined;
      scrollPane(key);
    }
    measure();
  });
  const openEntry = (id: ShortcutEntryId) => {
    if (id === open) {
      scrollPane('');
    } else {
      setOpen(id);
      pending.current = '';
    }
  };
  const goTo = (key: string) => {
    const owner = entries.find((each) =>
      each.groups.some((group) => group.key === key),
    );
    if (owner === undefined || owner.id === open) {
      scrollPane(key);
    } else {
      setOpen(owner.id);
      pending.current = key;
    }
  };
  const onQuery = (value: string) => {
    setQuery(value);
    pending.current = '';
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    dialog.onKeyDown(event);
    const toolStep = keyPressed(keymap.shortcutsTool, event);
    const groupStep = keyPressed(keymap.shortcutsGroup, event);
    const pageStep = keyPressed(keymap.shortcutsPage, event);
    if (toolStep !== undefined) {
      event.preventDefault();
      openEntry(steppedEntry(open, toolStep));
    } else if (groupStep !== undefined) {
      event.preventDefault();
      const key = steppedGroup(
        entries,
        open,
        pane.current ? paneView(pane.current) : everything,
        groupStep,
      );
      if (key !== undefined) {
        goTo(key);
      }
    } else if (pageStep !== undefined && pane.current) {
      event.preventDefault();
      const heading =
        pane.current.querySelector<HTMLElement>('.shortcuts-heading')
          ?.offsetHeight ?? 0;
      pane.current.scrollTop +=
        pageStep * (pane.current.clientHeight - heading);
    }
  };
  return (
    <div
      className="backdrop"
      onMouseDown={(event) =>
        event.target === event.currentTarget && event.preventDefault()
      }
    >
      <div
        className="shortcuts-popup shortcuts-window"
        ref={popup}
        {...dialog}
        onKeyDown={onKeyDown}
        style={drag.style}
        aria-label={strings.shortcuts.title}
      >
        <div className="shortcuts-title" onPointerDown={drag.onPointerDown}>
          <span>{strings.shortcuts.title}</span>
          <button
            className="nav-button"
            title={strings.common.close}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="shortcuts-filter">
          <div className={query ? 'search-field active' : 'search-field'}>
            <input
              ref={field}
              className="search-input"
              placeholder={strings.shortcuts.filter}
              aria-label={strings.shortcuts.filter}
              spellCheck={false}
              value={query}
              onChange={(event) => onQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="shortcuts-main">
          <ShortcutsTree
            entries={entries}
            open={open}
            marked={marked}
            filtering={filterWords(query).length > 0}
            onOpen={openEntry}
            onGo={goTo}
          />
          <div className="shortcuts-pane" ref={pane} onScroll={measure}>
            {entry && <ShortcutsList entry={entry} />}
          </div>
        </div>
        <div className="shortcuts-note">{strings.shortcuts.note}</div>
      </div>
    </div>
  );
}
