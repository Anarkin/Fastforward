import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { keyLabels, keymap, type Binding } from '../shared/keymap';
import type { TabInfo } from '../shared/protocol';
import type { ToolId } from '../shared/tools';
import { KeyCombo } from '../../ui/keyCombo';
import { HighlightWords } from '../../ui/highlight';
import { activeTabOf, useShell, useShellActions } from './store';
import {
  shortcutEntries,
  type ShortcutEntry,
  type ShortcutEntryId,
} from './tools';
import { strings } from '../../shared/strings';
import { filterWords } from '../../shared/fileFilter';
import { folded, matchesIn } from '../../shared/textMatches';
import { useDismiss } from '../../ui/contextMenu';
import { CloseIcon, FileIcon, TabsIcon, ToolIcon } from '../../ui/icons';
import { useDialogDrag, useModalDialog } from '../../ui/modalDialog';
import { keyPressed } from '../../ui/shortcuts';

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
  kind: Pick<TabInfo, 'view' | 'compare'> = {},
): ShortcutEntryId {
  if (tool === undefined) {
    return 'everywhere';
  }
  return tool === 'commander' && kind.view === true ? 'viewer' : tool;
}

export function groupInView(
  sections: readonly Section[],
  scrollTop: number,
  atEnd: boolean,
): string | undefined {
  if (atEnd) {
    return sections.at(-1)?.key;
  }
  return (
    sections.findLast((section) => section.top <= scrollTop + 1)?.key ??
    sections.at(0)?.key
  );
}

export function steppedEntry(
  from: ShortcutEntryId,
  step: 1 | -1,
): ShortcutEntryId {
  const ids = shortcutEntries.map((entry) => entry.id);
  return ids[(ids.indexOf(from) + step + ids.length) % ids.length] ?? from;
}

export function steppedGroup(
  entries: readonly ShownEntry[],
  open: ShortcutEntryId,
  from: string | undefined,
  step: 1 | -1,
): string | undefined {
  const groups = entries.flatMap((entry, place) =>
    entry.groups
      .filter((group) => group.rows.length > 0)
      .map((group) => ({ key: group.key, place })),
  );
  const at = groups.findIndex((group) => group.key === from);
  if (at !== -1) {
    return groups[at + step]?.key;
  }
  const openAt = entries.findIndex((entry) => entry.id === open);
  return step === 1
    ? groups.find((group) => group.place >= openAt)?.key
    : groups.findLast((group) => group.place < openAt)?.key;
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
  if (id === 'viewer') {
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
  marked: string | undefined;
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
                      group.key === marked
                        ? 'shortcuts-group-link in-view'
                        : 'shortcuts-group-link'
                    }
                    tabIndex={-1}
                    disabled={group.rows.length === 0}
                    aria-current={group.key === marked ? 'location' : undefined}
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

function sectionsIn(pane: HTMLElement): Section[] {
  return [...pane.querySelectorAll<HTMLElement>('[data-group]')].map(
    (section) => ({ key: section.dataset.group ?? '', top: section.offsetTop }),
  );
}

export function ShortcutsPopup() {
  const tool = useShell((state) => activeTabOf(state)?.tool);
  const view = useShell((state) => activeTabOf(state)?.view);
  const compare = useShell((state) => activeTabOf(state)?.compare);
  const { showPopup } = useShellActions();
  const onClose = useCallback(() => showPopup('shortcuts', false), [showPopup]);
  const [open, setOpen] = useState(() => entryFor(tool, { view, compare }));
  const [query, setQuery] = useState('');
  const [inView, setInView] = useState<string>();
  const popup = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const pending = useRef<string>(undefined);
  const ownScroll = useRef<number>(undefined);
  useDismiss(popup, onClose, { byKeyOnly: true });
  const dialog = useModalDialog(popup);
  const drag = useDialogDrag(popup);
  useLayoutEffect(() => {
    field.current?.focus();
  }, []);
  const entries = useMemo(() => shownEntries(shortcutEntries, query), [query]);
  const entry = entries.find((each) => each.id === open);
  const marked =
    inView ?? entry?.groups.find((group) => group.rows.length > 0)?.key;
  const scrollPane = (key: string) => {
    const element = pane.current;
    if (!element) {
      return;
    }
    const section = sectionsIn(element).find((each) => each.key === key);
    const before = element.scrollTop;
    element.scrollTop = section?.top ?? 0;
    ownScroll.current =
      element.scrollTop === before ? undefined : element.scrollTop;
  };
  useLayoutEffect(() => {
    const key = pending.current;
    if (key !== undefined) {
      pending.current = undefined;
      scrollPane(key);
    }
  });
  const openEntry = (id: ShortcutEntryId) => {
    setInView(undefined);
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
    setInView(key);
    if (owner === undefined || owner.id === open) {
      scrollPane(key);
    } else {
      setOpen(owner.id);
      pending.current = key;
    }
  };
  const onQuery = (value: string) => {
    setQuery(value);
    setInView(undefined);
    pending.current = '';
  };
  const onScroll = () => {
    const element = pane.current;
    const own = ownScroll.current;
    ownScroll.current = undefined;
    if (
      !element ||
      (own !== undefined && Math.abs(element.scrollTop - own) < 1)
    ) {
      return;
    }
    const atEnd =
      element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
    setInView(groupInView(sectionsIn(element), element.scrollTop, atEnd));
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
      const key = steppedGroup(entries, open, marked, groupStep);
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
          <div className="shortcuts-pane" ref={pane} onScroll={onScroll}>
            {entry && <ShortcutsList entry={entry} />}
          </div>
        </div>
        <div className="shortcuts-note">{strings.shortcuts.note}</div>
      </div>
    </div>
  );
}
