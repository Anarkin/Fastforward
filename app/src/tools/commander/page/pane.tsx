import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { iconUrl, type IconSource } from '../shared/icons';
import { commanderKeymap } from '../shared/keymap';
import { clicked, keymap, letterTyped } from '../../../shell/shared/keymap';
import { parentFolder, type Side } from '../shared/protocol';
import { formatSize } from './format';
import {
  filteredRows,
  filteredSelection,
  opens,
  passedKeys,
  rangeKeys,
  type Row,
} from './listing';
import { filterStep, PaneFilter } from './paneFilter';
import { filterWords } from '../../../shared/fileFilter';
import { HighlightWords } from '../../../ui/highlight';
import { SearchButton, SearchRow } from '../../../ui/search';
import { columnFocusOf } from '../../../ui/columnFocus';
import { ColumnHeader } from './columnHeader';
import type { ColumnWidths, SizedColumn, SortColumn } from '../shared/settings';
import type { PaneView } from './view';
import { DateFormat, formatDate } from '../../../ui/dates';
import {
  BackIcon,
  FileIcon,
  FolderIcon,
  ForwardIcon,
  ShieldIcon,
} from '../../../ui/icons';
import { listMoveOf, moveInList } from '../../../ui/listMoves';
import { MenuButton } from '../../../ui/menu';
import { keyPressed } from '../../../ui/shortcuts';
import { VirtualRows } from '../../../ui/virtualRows';
import { strings } from '../../../shared/strings';

declare module 'react' {
  interface CSSProperties {
    readonly '--commander-extension'?: string;
    readonly '--commander-size'?: string;
    readonly '--commander-date'?: string;
  }
}

const noRows: readonly Row[] = [];

export function driveOf(
  folder: string,
  drives: readonly string[],
): string | undefined {
  return drives.find((drive) =>
    folder.toUpperCase().startsWith(drive.toUpperCase()),
  );
}

function RowIcon({
  row,
  source,
}: {
  row: Row;
  source: IconSource | undefined;
}) {
  const [failed, setFailed] = useState(false);
  if (source !== undefined && !failed) {
    return (
      <img
        className="system-icon"
        src={iconUrl(source)}
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }
  return row.entry === undefined || row.entry.folder ? (
    <FolderIcon />
  ) : (
    <FileIcon />
  );
}

export function Pane({
  tab,
  side,
  active,
  pane,
  columns,
  drives,
  driveTrigger,
  onSelect,
  onMark,
  onOpen,
  onSort,
  onActivate,
  onSwitchSide,
  onDrive,
  onDrivesOpening,
  onStep,
  onOpenOnSide,
  onView,
  onCompare,
  onResize,
  onResized,
  onReset,
  resizer,
}: {
  tab: string | undefined;
  side: Side;
  active: boolean;
  pane: PaneView | undefined;
  columns: ColumnWidths;
  drives: readonly string[];
  driveTrigger: React.Ref<HTMLButtonElement>;
  onSelect: (key: string) => void;
  onMark: (keys: readonly string[], marked: boolean) => void;
  onOpen: (name: string) => void;
  onSort: (column: SortColumn) => void;
  onActivate: () => void;
  onSwitchSide: () => void;
  onDrive: (drive: string) => void;
  onDrivesOpening: () => void;
  onStep: (step: -1 | 1) => void;
  onOpenOnSide: (target: Side, name: string) => void;
  onView: (name: string) => void;
  onCompare: () => void;
  onResize: (column: SizedColumn, width: number) => void;
  onResized: (column: SizedColumn, width: number) => void;
  onReset: (column: SizedColumn) => void;
  resizer: React.ReactNode;
}) {
  const allRows = pane?.rows ?? noRows;
  const [filter, setFilter] = useState<{
    readonly folder: string | undefined;
    readonly query: string;
  }>();
  const [filteredFolder, setFilteredFolder] = useState(pane?.folder);
  if (filteredFolder !== pane?.folder) {
    setFilteredFolder(pane?.folder);
    setFilter(undefined);
  }
  const filtering = filter !== undefined && filter.folder === pane?.folder;
  const query = filtering ? filter.query : '';
  const words = useMemo(() => filterWords(query), [query]);
  const rows = useMemo(() => filteredRows(allRows, words), [allRows, words]);
  const filterInput = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [focusAsks, setFocusAsks] = useState({ count: 0, select: true });
  useEffect(() => {
    if (focusAsks.count > 0) {
      filterInput.current?.focus();
      if (focusAsks.select) {
        filterInput.current?.select();
      }
    }
  }, [focusAsks]);
  const openFilter = () => {
    if (!filtering) {
      setFilter({ folder: pane?.folder, query: '' });
    }
    setFocusAsks(({ count }) => ({ count: count + 1, select: true }));
  };
  const focusList = () => columnFocusOf(body.current)?.focus();
  const closeFilter = () => {
    focusList();
    setFilter(undefined);
  };
  const filterTo = (next: string) => {
    setFilter({ folder: pane?.folder, query: next });
    const selection = filteredSelection(
      filteredRows(allRows, filterWords(next)),
      pane?.selected,
    );
    if (
      filterWords(next).length > 0 &&
      selection !== undefined &&
      selection !== pane?.selected
    ) {
      onSelect(selection);
    }
  };
  const dateFormat = useContext(DateFormat);
  const listed = useMemo(
    () => ({
      count: rows.length,
      keyOf: (index: number) => rows[index].key,
      indexOf: (key: string) => rows.findIndex((row) => row.key === key),
    }),
    [rows],
  );
  const selectedIndex = listed.indexOf(pane?.selected ?? '');
  const marked = pane?.marked;
  const current = pane && driveOf(pane.folder, drives);

  const renderRow = (index: number) => {
    const row = rows[index];
    const { entry } = row;
    return (
      <div
        className={`row commander-row commander-line${row.key === pane?.selected ? ' selected' : ''}${marked?.has(row.key) ? ' marked' : ''}${entry?.hidden ? ' hidden' : ''}`}
        onClick={(event) => {
          const marking = clicked(commanderKeymap.markClick, event);
          if (marking === 'toggle') {
            onMark([row.key], !marked?.has(row.key));
          } else if (marking === 'range' && selectedIndex !== -1) {
            onMark(rangeKeys(rows, selectedIndex, index), true);
          }
          onSelect(row.key);
        }}
        onDoubleClick={() => {
          if (opens(row)) {
            onOpen(row.key);
          }
        }}
      >
        <span className="commander-icon">
          <RowIcon
            row={row}
            source={
              tab === undefined ||
              pane === undefined ||
              row.entry === undefined ||
              row.entry.folder
                ? undefined
                : { tab, side, folder: pane.folder, name: row.key }
            }
          />
        </span>
        <span className="commander-name">
          <HighlightWords text={row.base} words={words} />
        </span>
        <span className="commander-extension">
          <HighlightWords text={row.extension} words={words} />
        </span>
        <span className="commander-size">{formatSize(entry?.size)}</span>
        <span className="commander-date">
          {entry?.modified === undefined
            ? ''
            : formatDate(entry.modified, dateFormat)}
        </span>
      </div>
    );
  };

  return (
    <section
      className={`column commander-pane${active ? '' : ' inactive'}`}
      aria-label={strings.commander.sides[side]}
      onPointerDown={onActivate}
      onFocus={onActivate}
      style={{
        '--commander-extension': String(columns.extension),
        '--commander-size': String(columns.size),
        '--commander-date': String(columns.date),
      }}
    >
      {filtering ? (
        <header className="column-title searching">
          <SearchRow onClose={closeFilter}>
            <PaneFilter
              query={query}
              shown={rows.filter((row) => row.entry !== undefined).length}
              total={allRows.filter((row) => row.entry !== undefined).length}
              input={filterInput}
              onQuery={filterTo}
              onMove={(move) => {
                if (rows.length === 0) {
                  return;
                }
                const rowHeight =
                  body.current
                    ?.querySelector('.commander-row')
                    ?.getBoundingClientRect().height ?? 1;
                const page = Math.max(
                  1,
                  Math.floor((body.current?.clientHeight ?? 0) / rowHeight) - 1,
                );
                const next = filterStep(
                  move,
                  Math.max(0, selectedIndex),
                  rows.length,
                  page,
                );
                onSelect(rows[next].key);
              }}
              onLeave={() => {
                const row =
                  selectedIndex === -1 ? undefined : rows[selectedIndex];
                focusList();
                if (row !== undefined && opens(row)) {
                  onOpen(row.key);
                }
              }}
              onClose={closeFilter}
            />
          </SearchRow>
        </header>
      ) : (
        <header className="column-title">
          <div className="column-start nav-buttons">
            <button
              className="nav-button"
              title={strings.commander.back}
              disabled={pane?.back !== true}
              onClick={() => onStep(-1)}
            >
              <BackIcon />
            </button>
            <button
              className="nav-button"
              title={strings.commander.forward}
              disabled={pane?.forward !== true}
              onClick={() => onStep(1)}
            >
              <ForwardIcon />
            </button>
            {drives.length > 0 && (
              <div onClickCapture={onDrivesOpening}>
                <MenuButton
                  title={strings.commander.chooseDrive}
                  icon={
                    <span className="drive-label">
                      {(current ?? '').replace(/\\$/, '')}
                    </span>
                  }
                  trigger={driveTrigger}
                  items={drives.map((drive) => ({
                    label: drive,
                    accessKey: drive.charAt(0),
                    checked: drive === current,
                    onClick: () => onDrive(drive),
                  }))}
                />
              </div>
            )}
          </div>
          <span className="column-name">
            {pane?.elevated && (
              <span
                className="elevated-mark"
                title={strings.commander.readAsAdministrator}
              >
                <ShieldIcon />
              </span>
            )}
            {pane?.folder}
          </span>
          <div className="column-actions">
            <SearchButton
              title={strings.commander.filterFolder}
              onClick={openFilter}
            />
          </div>
        </header>
      )}
      <ColumnHeader
        sort={pane?.sort}
        columns={columns}
        onSort={onSort}
        onResize={onResize}
        onResized={onResized}
        onReset={onReset}
      />
      <div className="column-body" ref={body}>
        <VirtualRows
          rows={listed}
          renderRow={renderRow}
          selectedKey={pane?.selected}
          label={strings.commander.sides[side]}
          wholeRows
          onKeyDown={(event, visible) => {
            const letter =
              keyPressed(keymap.mainMenu, event) === undefined &&
              keyPressed(commanderKeymap.filterLetter, event) !== undefined
                ? letterTyped(event)
                : undefined;
            if (letter !== undefined) {
              event.preventDefault();
              filterTo(query + letter);
              setFocusAsks(({ count }) => ({
                count: count + 1,
                select: false,
              }));
              return;
            }
            if (keyPressed(commanderKeymap.filter, event) !== undefined) {
              event.preventDefault();
              openFilter();
              return;
            }
            if (
              filtering &&
              keyPressed(commanderKeymap.stopFiltering, event) !== undefined
            ) {
              event.preventDefault();
              setFilter(undefined);
              return;
            }
            if (keyPressed(commanderKeymap.side, event) !== undefined) {
              event.preventDefault();
              onSwitchSide();
              return;
            }
            if (keyPressed(commanderKeymap.compare, event) !== undefined) {
              event.preventDefault();
              onCompare();
              return;
            }
            if (keyPressed(commanderKeymap.view, event) !== undefined) {
              event.preventDefault();
              const row =
                selectedIndex === -1 ? undefined : rows[selectedIndex];
              if (row?.entry !== undefined && !row.entry.folder) {
                onView(row.key);
              }
              return;
            }
            const onSide = keyPressed(commanderKeymap.openOnSide, event);
            if (onSide !== undefined) {
              event.preventDefault();
              const row =
                selectedIndex === -1 ? undefined : rows[selectedIndex];
              if (row !== undefined) {
                onOpenOnSide(onSide, row.key);
              }
              return;
            }
            if (keyPressed(commanderKeymap.parentFolder, event) !== undefined) {
              event.preventDefault();
              if (pane?.parent) {
                onOpen(parentFolder);
              }
              return;
            }
            if (keyPressed(commanderKeymap.openFolder, event) !== undefined) {
              const row =
                selectedIndex === -1 ? undefined : rows[selectedIndex];
              if (row !== undefined && opens(row)) {
                event.preventDefault();
                onOpen(row.key);
              }
              return;
            }
            const marking = keyPressed(commanderKeymap.markMoving, event);
            if (marking !== undefined) {
              event.preventDefault();
              if (selectedIndex === -1) {
                return;
              }
              const next =
                moveInList(marking, selectedIndex, rows.length, visible) ??
                selectedIndex;
              onMark(
                passedKeys(rows, selectedIndex, next),
                !marked?.has(rows[selectedIndex].key),
              );
              onSelect(rows[next].key);
              return;
            }
            if (keyPressed(commanderKeymap.toggleMark, event) !== undefined) {
              event.preventDefault();
              if (selectedIndex === -1) {
                return;
              }
              const { key } = rows[selectedIndex];
              onMark([key], !marked?.has(key));
              onSelect(rows[Math.min(selectedIndex + 1, rows.length - 1)].key);
              return;
            }
            const move = listMoveOf(event);
            if (move === undefined) {
              return;
            }
            event.preventDefault();
            const next = moveInList(
              move,
              selectedIndex === -1 ? undefined : selectedIndex,
              rows.length,
              visible,
            );
            if (next !== undefined) {
              onSelect(rows[next].key);
            }
          }}
        />
      </div>
      {resizer}
    </section>
  );
}
