import { closeLabel } from '../../lib/page/closeLabel';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { shellKeymap } from '../shared/keymap';
import { KeyCombo } from './keyCombo';
import { HighlightWords } from '../../lib/page/highlight';
import { activeTabOf } from './selectors';
import { useShell, useShellActions } from './store';
import { shortcutEntries, type ShortcutEntryId } from './toolShortcuts';
import { strings } from '../../lib/shared/strings';
import { narrows, searchFilter } from '../../lib/shared/filter';
import { noSearch, type Search } from '../../lib/shared/searchOptions';
import { SearchBar } from '../../lib/page/searchBar';
import { useDismiss } from '../../lib/page/dismiss';
import { CloseIcon, ImageIcon, ToolIcon } from '../../lib/page/icons';
import { AppIcon } from './appIcon';
import { useModalDialog } from '../../lib/page/modalDialog';
import { useDialogDrag } from '../../lib/page/dialogDrag';
import { keyPressed } from '../../lib/page/shortcuts';
import { shortcutsEntryOf } from '../../lib/page/shortcutsEntry';
import { useWholeRows } from '../../lib/page/wholeRows';
import {
  type ShownEntry,
  type PaneView,
  shownEntries,
  entryFor,
  groupsInView,
  steppedEntry,
  steppedGroup,
  groupAround,
  groupsFound,
  paneRows,
  treeRows,
} from './shortcutsList';

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
              <HighlightWords text={binding.action} filter={match.filter} />
            </span>
          </div>
        ))}
      </section>
    ));
}

function EntryIcon({ id }: { id: ShortcutEntryId }) {
  switch (id) {
    case 'everywhere':
      return <AppIcon className="icon" size={16} />;
    case 'paint':
      return <ImageIcon />;
    default:
      return <ToolIcon tool={id} />;
  }
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
  const tree = useRef<HTMLElement>(null);
  const scrolling = useShell((state) => state.scrolling);
  useWholeRows(tree, treeRows, scrolling);
  return (
    <nav
      ref={tree}
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

function headingHeight(pane: HTMLElement): number {
  return (
    pane.querySelector('.shortcuts-heading')?.getBoundingClientRect().height ??
    0
  );
}

function placesIn(
  pane: HTMLElement,
): (element: Element) => { readonly top: number; readonly bottom: number } {
  const origin =
    pane.getBoundingClientRect().top +
    (parseFloat(
      pane.ownerDocument.defaultView?.getComputedStyle(pane).borderTopWidth ??
        '',
    ) || 0) -
    pane.scrollTop;
  return (element) => {
    const { top, bottom } = element.getBoundingClientRect();
    return { top: top - origin, bottom: bottom - origin };
  };
}

function paneView(
  pane: HTMLElement,
): PaneView & { readonly keys: readonly string[] } {
  const heading = headingHeight(pane);
  const placed = placesIn(pane);
  const groups = groupsIn(pane);
  const keys = groupsInView(
    groups.map((group) => {
      const rows = [...group.querySelectorAll<HTMLElement>('.shortcut-row')];
      return {
        key: group.dataset.group ?? '',
        top: placed(rows.at(0) ?? group).top,
        bottom: placed(rows.at(-1) ?? group).bottom,
      };
    }),
    pane.scrollTop + heading,
    pane.scrollTop + pane.clientHeight,
  );
  const first = groups.find((group) => group.dataset.group === keys[0]);
  return {
    keys,
    first: keys[0],
    cut: first !== undefined && placed(first).top < pane.scrollTop - 1,
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
  const { showPopup } = useShellActions();
  const onClose = useCallback(() => showPopup('shortcuts', false), [showPopup]);
  const [focusedAtOpen] = useState(() =>
    typeof document === 'undefined'
      ? undefined
      : shortcutsEntryOf(document.activeElement),
  );
  const [chosen, setOpen] = useState<ShortcutEntryId>();
  const open = chosen ?? entryFor(tool, focusedAtOpen);
  const [{ query, options }, setSearch] = useState(noSearch);
  const [visible, setVisible] = useState<readonly string[]>();
  const popup = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const pending = useRef<string>(undefined);
  const scrolling = useShell((state) => state.scrolling);
  useWholeRows(pane, paneRows, scrolling);
  useDismiss(popup, onClose, { byKeyOnly: true });
  const dialog = useModalDialog(popup);
  const drag = useDialogDrag(popup);
  useLayoutEffect(() => {
    field.current?.focus();
  }, []);
  const filter = useMemo(() => searchFilter(query, options), [query, options]);
  const entries = useMemo(
    () => shownEntries(shortcutEntries, filter),
    [filter],
  );
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
    const group =
      element && groupsIn(element).find((each) => each.dataset.group === key);
    if (element) {
      element.scrollTop = group
        ? element.scrollTop +
          group.getBoundingClientRect().top -
          element.getBoundingClientRect().top -
          element.clientTop
        : 0;
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
  useLayoutEffect(() => {
    const element = pane.current;
    if (!element) {
      return undefined;
    }
    const resized = new ResizeObserver(() => {
      const { keys } = paneView(element);
      setVisible((before) => (before?.join() === keys.join() ? before : keys));
    });
    resized.observe(element);
    return () => resized.disconnect();
  }, []);
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
  const onSearch = (next: Search) => {
    setSearch(next);
    pending.current = '';
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    dialog.onKeyDown(event);
    const toolStep = keyPressed(shellKeymap.shortcutsTool, event);
    const groupStep = keyPressed(shellKeymap.shortcutsGroup, event);
    const pageStep = keyPressed(shellKeymap.shortcutsPage, event);
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
      pane.current.scrollTop +=
        pageStep * (pane.current.clientHeight - headingHeight(pane.current));
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
          <button className="nav-button" {...closeLabel} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="shortcuts-filter">
          <SearchBar
            font="proportional"
            query={query}
            options={options}
            found={groupsFound(entries, marked[0])}
            placeholder={strings.shortcuts.filter}
            input={field}
            onQuery={(next) => onSearch({ query: next, options })}
            onOptions={(next) => onSearch({ query, options: next })}
            onStep={(step) => {
              const key = groupAround(
                entries,
                open,
                pane.current ? paneView(pane.current) : everything,
                step,
              );
              if (key !== undefined) {
                goTo(key);
              }
            }}
          />
        </div>
        <div className="shortcuts-main">
          <ShortcutsTree
            entries={entries}
            open={open}
            marked={marked}
            filtering={narrows(filter)}
            onOpen={openEntry}
            onGo={goTo}
          />
          <div className="shortcuts-pane" ref={pane} onScroll={measure}>
            {entry && <ShortcutsList entry={entry} />}
          </div>
        </div>
      </div>
    </div>
  );
}
