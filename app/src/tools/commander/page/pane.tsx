import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { tileColumns, tileWidthOf } from './tiles';
import { type IconSource } from '../shared/icons';
import { useThumbnailFill } from './thumbnailFills';
import { commanderKeymap } from './keymap';
import { clicked } from '../../../lib/shared/keymap';
import { parentFolder, type Side } from '../shared/protocol';
import { fileMenuItems, menuTargetOf } from './fileMenu';
import { copiedText, type Copied } from './naming';
import { goesInto, opens, pointedKeys, rangeKeys, type Row } from './listing';
import { filterStep } from './filterSteps';
import { PaneFilter } from './paneFilter';
import { filterWords } from '../../../lib/page/fileFilter';
import { HighlightWords } from '../../../lib/page/highlight';
import { SearchButton, SearchRow } from '../../../lib/page/search';
import { columnFocusOf } from '../../../lib/page/columnFocus';
import { clickPairs } from './clickPairs';
import { ColumnHeader } from './columnHeader';
import { type Layout } from '../shared/settings';
import { readingKey } from './commanderReceived';
import { filterOf, shownColumns, shownRowsOf } from './shownRows';
import { useCommander, useCommanderActions } from './store';
import { formatDate } from '../../../lib/page/dates';
import { useShell, useShellActions } from '../../../shell/page/store';
import { dropTargetOf } from './dropping';
import { whatOf } from './transferring';
import { BackIcon, ForwardIcon, ShieldIcon } from '../../../lib/page/icons';
import { MenuButton } from '../../../lib/page/menu';
import { estimatedRowHeight } from '../../../lib/page/listRows';
import { VirtualRows } from '../../../lib/page/virtualRows';
import { plainOf, strings } from '../../../lib/shared/strings';
import { fileColorOf } from './fileColors';
import { PathTitle } from './pathTitle';
import { driveMenu } from './driveMenu';
import { menuOfClick, paneKey, type PaneAct } from './paneKeys';

import {
  driveOf,
  dropIntoOf,
  fillDelay,
  thumbnailFills,
  tileRowsOf,
} from './paneTiles';
import {
  RowIcon,
  ExtensionCell,
  MarkBox,
  NameCell,
  SizeCell,
  TileImage,
} from './paneCells';
import {
  FlatButton,
  ReadingStatus,
  DuplicatesStatus,
  CountingStatus,
  FlatStatus,
} from './paneStatus';
import { layoutMenu, archivePart } from './paneLayoutMenu';
import { BookmarkButton } from './paneHeader';
declare module 'react' {
  interface CSSProperties {
    readonly '--commander-extension'?: string;
    readonly '--commander-size'?: string;
    readonly '--commander-date'?: string;
    readonly '--file-color'?: string;
  }
}

export function Pane({
  side,
  driveTrigger,
  bookmarkTrigger,
  resizer,
}: {
  side: Side;
  driveTrigger: React.Ref<HTMLButtonElement>;
  bookmarkTrigger: React.Ref<HTMLButtonElement>;
  resizer: React.ReactNode;
}) {
  const tab = useCommander((state) => state.view.tab);
  const active = useCommander((state) => state.view.active === side);
  const pane = useCommander((state) => state.view.panes[side]);
  const readingArchive = useCommander((state) =>
    state.readingArchives.get(readingKey(state.view.tab, side)),
  );
  const layout = useCommander((state) => state.view.layouts[side]);
  const thumbnailSize = useCommander((state) => state.view.thumbnailSize);
  const fileColors = useCommander((state) => state.view.fileColors);
  const canGroupByColor = useCommander(
    (state) => state.view.fileColors.colors.length > 0,
  );
  const columns = useCommander(shownColumns);
  const drives = useCommander((state) => state.drives);
  const actions = useCommanderActions();
  const onLayout = (chosen: Layout) => actions.chooseLayout(side, chosen);
  const onGroupByColor = () => actions.groupByColor(side);
  const onDropIcon = actions.dropIcon;
  const onSelect = (key: string) => actions.select(side, key);
  const onMark = (keys: readonly string[], marked: boolean) =>
    actions.mark(side, keys, marked);
  const onOpen = (name: string) => actions.open(side, name);
  const onActivate = () => actions.activate(side);
  const onSwitchSide = actions.switchSide;
  const onDrive = (drive: string) => actions.drive(side, drive);
  const onDrivesOpening = actions.listDrives;
  const onStep = (step: -1 | 1) => actions.step(side, step);
  const onOpenOnSide = (target: Side, name: string) =>
    actions.openOnSide(side, target, name);
  const onOpenRepository = (name: string) => actions.openRepository(side, name);
  const onView = (name: string) => actions.viewFile(side, name);
  const onEdit = (name: string) => actions.editFile(side, name);
  const onDelete = (names: readonly string[], permanently: boolean) =>
    actions.askDelete(side, names, permanently);
  const onShellMenu = (
    names: readonly string[],
    at: { readonly x: number; readonly y: number },
    extended: boolean,
  ) => actions.shellMenu(side, names, at, extended);
  const onCompare = actions.compare;
  const filter = useCommander((state) => filterOf(state, side));
  const { rows, files, total, starts } = useCommander((state) =>
    shownRowsOf(state, side),
  );
  const setFilter = (query: string | undefined) =>
    actions.filterSide(side, query);
  const filtering = filter !== undefined;
  const query = filter ?? '';
  const words = useMemo(() => filterWords(query), [query]);
  const filterInput = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [focusAsks, setFocusAsks] = useState({ count: 0, select: true });
  const [pairsClick] = useState(clickPairs);
  const [dropInto, setDropInto] = useState<string | null>();
  const { showMenu, copyText } = useShellActions();
  const platform = useCommander((state) => state.view.platform);
  const copyItems = (copied: Copied, names: readonly string[]) => {
    if (pane !== undefined) {
      copyText(copiedText(copied, pane.folder, names, platform));
    }
  };
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
      setFilter('');
    }
    setFocusAsks(({ count }) => ({ count: count + 1, select: true }));
  };
  const focusList = () => columnFocusOf(body.current)?.focus();
  const closeFilter = () => {
    focusList();
    setFilter(undefined);
  };
  const filterTo = (next: string) => setFilter(next);
  const dateFormat = useShell((state) => state.dateFormat);
  const scrolling = useShell((state) => state.scrolling);
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
  const openMenu = (
    key: string | undefined,
    at: { readonly x: number; readonly y: number },
  ) => {
    const target = menuTargetOf(rows, key, marked, pane?.inRepository === true);
    if (target === undefined) {
      return;
    }
    const inArchive = pane?.archive !== undefined;
    const items = fileMenuItems(
      target,
      {
        onFolder: (command, name) => actions.folderCommand(side, name, command),
        onEnterArchive: (name) => actions.enterArchive(side, name),
        onCopy: copyItems,
        onGoTo: () => actions.askGoTo(side),
        onSystemMenu:
          platform === 'win32' && !inArchive
            ? (names) => onShellMenu(names, at, false)
            : undefined,
      },
      inArchive,
    );
    if (items.length > 0) {
      showMenu({ x: at.x, y: at.y, items });
    }
  };
  const openFolderMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    const at = { x: event.clientX, y: event.clientY };
    if (menuOfClick(event) === 'system') {
      onShellMenu([], at, true);
    } else {
      openMenu(undefined, at);
    }
  };

  const tileWidth = tileWidthOf(thumbnailSize);
  const [fitting, setFitting] = useState<number>();
  useLayoutEffect(() => {
    const element = body.current;
    if (!element) {
      return undefined;
    }
    const measure = () =>
      setFitting(
        element.clientWidth > 0
          ? tileColumns(element.clientWidth, tileWidth)
          : undefined,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [tileWidth]);
  const across = fitting ?? 1;
  const tiled = layout === 'thumbnails';
  const tileTextRow = () =>
    body.current?.querySelector('.commander-tile-name')?.getBoundingClientRect()
      .height || estimatedRowHeight;
  const scrollKey = `${tab ?? ''} ${side} ${pane?.folder ?? ''} ${layout}`;
  const shownList = tiled
    ? fitting !== undefined
      ? `tiles ${thumbnailSize}`
      : undefined
    : 'details';
  const [fillFrom, setFillFrom] = useState(0);
  const fillTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(fillTimer.current), []);
  const scrolledTo = (offset: number) => {
    actions.keepScroll(scrollKey, offset);
    if (!tiled) {
      return;
    }
    clearTimeout(fillTimer.current);
    fillTimer.current = setTimeout(() => {
      const height =
        body.current?.querySelector('.virtual-row')?.getBoundingClientRect()
          .height ?? 0;
      setFillFrom(height > 0 ? Math.floor(offset / height + 0.01) * across : 0);
    }, fillDelay);
  };
  const shownFolder = pane?.folder;
  const fillItems = useMemo(
    () =>
      tiled && tab !== undefined && shownFolder !== undefined
        ? thumbnailFills(rows, { tab, side, folder: shownFolder })
        : [],
    [tiled, rows, tab, side, shownFolder],
  );
  useThumbnailFill(
    fillItems,
    Math.max(
      0,
      fillItems.findIndex((item) => item.index >= fillFrom),
    ),
    thumbnailSize,
    tiled && shownList !== undefined,
    (item, made, pixelRatio) =>
      void actions.saveThumbnail(item.source, thumbnailSize, pixelRatio, made),
  );
  useLayoutEffect(() => {
    const focused = document.activeElement;
    if (
      tab !== undefined &&
      shownList !== undefined &&
      active &&
      (focused === null || focused === document.body)
    ) {
      columnFocusOf(body.current)?.focus();
    }
  }, [shownList, active, tab]);
  const tileRows = useMemo(() => tileRowsOf(rows, across), [rows, across]);

  const fileColor = (row: Row) =>
    row.entry === undefined ? undefined : fileColorOf(row.entry, fileColors);
  const rowClass = (row: Row) =>
    `row commander-row${row.key === pane?.selected ? ' selected' : ''}${marked?.has(row.key) ? ' marked' : ''}${row.entry?.hidden ? ' hidden' : ''}${row.entry === undefined || row.entry.folder ? ' commander-folder' : ''}${row.key === dropInto ? ' drop-target' : ''}${fileColor(row) === undefined ? '' : ' colored'}${starts?.has(row.key) === true ? ' group-start' : ''}`;
  const colorStyle = (row: Row): CSSProperties => {
    const color = fileColor(row);
    return color === undefined ? {} : { '--file-color': color };
  };
  const iconSource = (row: Row): IconSource | undefined =>
    tab === undefined ||
    pane === undefined ||
    row.entry === undefined ||
    row.entry.folder
      ? undefined
      : { tab, side, folder: pane.folder, name: row.key };
  const dateOf = (row: Row) =>
    row.entry?.modified === undefined
      ? ''
      : formatDate(row.entry.modified, dateFormat);
  const itemEvents = (row: Row, index: number) => ({
    'data-drop':
      row.entry === undefined || row.entry.folder ? row.key : undefined,
    draggable: row.entry !== undefined,
    onDragStart: (event: React.DragEvent) => {
      event.preventDefault();
      const names = pointedKeys(rows, row.key, marked);
      if (names.length > 0) {
        onSelect(row.key);
        actions.drag(side, names);
      }
    },
    onClick: (event: React.MouseEvent) => {
      const marking = clicked(commanderKeymap.markClick, event);
      if (marking === 'toggle') {
        onMark([row.key], !marked?.has(row.key));
      } else if (marking === 'range' && selectedIndex !== -1) {
        onMark(rangeKeys(rows, selectedIndex, index), true);
      }
      onSelect(row.key);
      if (pairsClick(row.key, event.detail) && opens(row)) {
        onOpen(row.key);
      }
    },
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const at = { x: event.clientX, y: event.clientY };
      onSelect(row.key);
      if (menuOfClick(event) === 'system') {
        onShellMenu(
          row.key === parentFolder ? [] : pointedKeys(rows, row.key, marked),
          at,
          true,
        );
      } else {
        openMenu(row.key, at);
      }
    },
  });

  const markBox = (row: Row) =>
    row.entry !== undefined && (
      <MarkBox onToggle={() => onMark([row.key], !marked?.has(row.key))} />
    );

  const renderRow = (index: number) => {
    const row = rows[index];
    const { entry } = row;
    return (
      <div
        className={`${rowClass(row)} commander-line`}
        style={colorStyle(row)}
        {...itemEvents(row, index)}
      >
        {markBox(row)}
        <span className="commander-icon">
          <RowIcon row={row} source={iconSource(row)} onDropIcon={onDropIcon} />
        </span>
        <NameCell row={row} words={words} />
        <ExtensionCell
          row={row}
          words={words}
          onOpenRepository={onOpenRepository}
        />
        <SizeCell entry={entry} />
        <span className="commander-date">{dateOf(row)}</span>
      </div>
    );
  };

  const renderTile = (row: Row, index: number) => (
    <div
      key={row.key}
      className={`${rowClass(row)} commander-tile`}
      style={{ ...colorStyle(row), width: tileWidth }}
      {...itemEvents(row, index)}
    >
      {markBox(row)}
      <div className="commander-thumbnail" style={{ height: thumbnailSize }}>
        <TileImage
          row={row}
          source={iconSource(row)}
          box={thumbnailSize}
          onMade={(made, pixelRatio) => {
            const source = iconSource(row);
            if (source !== undefined) {
              void actions.saveThumbnail(
                source,
                thumbnailSize,
                pixelRatio,
                made,
              );
            }
          }}
          onDropIcon={onDropIcon}
        />
      </div>
      <div className="commander-tile-name">
        <span className="commander-tile-base">
          <HighlightWords text={row.base} words={words} />
        </span>
        {row.extension !== '' && (
          <span className="commander-tile-extension">
            <HighlightWords text={`.${row.extension}`} words={words} />
          </span>
        )}
      </div>
      <SizeCell entry={row.entry} tile />
      <div className="commander-tile-date">{dateOf(row)}</div>
    </div>
  );

  const renderTiles = (gridRow: number) => (
    <div className="commander-tiles">
      {rows
        .slice(gridRow * across, (gridRow + 1) * across)
        .map((row, offset) => renderTile(row, gridRow * across + offset))}
    </div>
  );

  const act = (action: PaneAct) => {
    switch (action.kind) {
      case 'newFolder':
        actions.askNewFolder(side);
        return;
      case 'newFile':
        actions.askNewFile(side);
        return;
      case 'rename':
        actions.askRename(side, action.name);
        return;
      case 'pack':
        actions.askPack(side, action.names);
        return;
      case 'test':
        actions.testArchives(side, action.names);
        return;
      case 'enterArchive':
        actions.enterArchive(side, action.name);
        return;
      case 'copyToClipboard':
        actions.copyToClipboard(side, action.names);
        return;
      case 'paste':
        actions.paste(side);
        return;
      case 'copyText':
        copyItems(action.copied, action.names);
        return;
      case 'transfer':
        actions.askTransfer(side, action.names, action.move);
        return;
      case 'delete':
        onDelete(action.names, action.permanently);
        return;
      case 'menu': {
        const row =
          action.key === undefined
            ? null
            : body.current?.querySelector('.commander-row.selected');
        const box = (row ?? body.current)?.getBoundingClientRect();
        if (box !== undefined) {
          openMenu(action.key, {
            x: box.left,
            y: row ? box.bottom : box.top,
          });
        }
        return;
      }
      case 'filterLetter':
        filterTo(query + action.letter);
        setFocusAsks(({ count }) => ({ count: count + 1, select: false }));
        return;
      case 'openFilter':
        openFilter();
        return;
      case 'stopFiltering':
        setFilter(undefined);
        return;
      case 'stopReading':
        actions.stopReading(side);
        return;
      case 'switchSide':
        onSwitchSide();
        return;
      case 'compare':
        onCompare();
        return;
      case 'view':
        onView(action.name);
        return;
      case 'edit':
        onEdit(action.name);
        return;
      case 'openOnSide':
        onOpenOnSide(action.side, action.name);
        return;
      case 'open':
        onOpen(action.name);
        return;
      case 'mark':
        onMark(action.keys, action.marked);
        onSelect(action.select);
        if (action.count !== undefined) {
          actions.countSizes(side, action.count);
        }
        return;
      case 'countSizes':
        actions.countSizes(side, action.names);
        return;
      case 'markPattern':
        actions.askMarkPattern(side, action.mark, action.suggested);
        return;
      case 'invertMarks':
        onMark(action.marking, true);
        onMark(action.unmarking, false);
        return;
      case 'select':
        onSelect(action.key);
    }
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
              shown={files}
              total={total}
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
                if (row !== undefined && goesInto(row)) {
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
              <div className="drive-menu" onClickCapture={onDrivesOpening}>
                <MenuButton
                  title={strings.commander.chooseDrive}
                  label={(current ?? '').replace(/\\$/, '')}
                  named
                  trigger={driveTrigger}
                  onChosen={focusList}
                  items={driveMenu(drives, current, onDrive)}
                />
              </div>
            )}
            <BookmarkButton
              side={side}
              trigger={bookmarkTrigger}
              onChosen={focusList}
            />
          </div>
          <div className="column-actions">
            <div className="commander-layout">
              <MenuButton
                title={strings.commander.layout}
                label={strings.commander.layouts[layout]}
                onChosen={focusList}
                items={layoutMenu({
                  layout,
                  groupByColor: pane?.sort.groupByColor ?? false,
                  canGroupByColor,
                  onLayout,
                  onGroupByColor,
                })}
              />
            </div>
            <FlatButton side={side} />
            <SearchButton
              title={strings.commander.filterFolder}
              onClick={openFilter}
            />
          </div>
        </header>
      )}
      <div
        className="commander-path commander-line"
        onContextMenu={openFolderMenu}
      >
        <span className="commander-icon">
          {pane?.elevated && (
            <span
              className="elevated-mark"
              title={strings.commander.readAsAdministrator}
            >
              <ShieldIcon />
            </span>
          )}
        </span>
        <PathTitle
          path={pane?.folder ?? ''}
          hidden={pane?.hidden ?? []}
          {...(pane?.archive !== undefined &&
            archivePart(pane.archive, fileColors))}
          flat={pane?.flat !== undefined}
          duplicates={pane?.duplicates !== undefined}
        />
      </div>
      {!tiled && <ColumnHeader side={side} />}
      <div
        className={`column-body${dropInto === null ? ' drop-target' : ''}`}
        ref={body}
        onContextMenu={openFolderMenu}
        onDragOver={(event) => {
          if (
            !event.dataTransfer.types.includes('Files') ||
            pane?.archive !== undefined
          ) {
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          const into = dropIntoOf(event.target);
          if (into !== dropInto) {
            setDropInto(into);
          }
        }}
        onDragLeave={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          ) {
            setDropInto(undefined);
          }
        }}
        onDrop={(event) => {
          if (
            !event.dataTransfer.types.includes('Files') ||
            pane?.archive !== undefined
          ) {
            return;
          }
          event.preventDefault();
          setDropInto(undefined);
          const dropped = [...event.dataTransfer.files];
          const [first] = dropped;
          if (first === undefined || pane === undefined) {
            return;
          }
          const into = dropIntoOf(event.target) ?? undefined;
          const what = whatOf(dropped.length, first.name);
          const target = dropTargetOf(pane.folder, into, platform);
          showMenu({
            x: event.clientX,
            y: event.clientY,
            items: [
              {
                label: strings.commander.dropCopy,
                title: plainOf(strings.commander.dropCopyTitle(what, target)),
                onClick: () => actions.dropOn(side, dropped, into, false),
              },
              {
                label: strings.commander.dropMove,
                title: plainOf(strings.commander.dropMoveTitle(what, target)),
                onClick: () => actions.dropOn(side, dropped, into, true),
              },
            ],
          });
        }}
      >
        {shownList !== undefined && (
          <VirtualRows
            key={`${shownList} ${tab ?? ''}`}
            initialOffset={actions.scrollOf(scrollKey)}
            onScrolled={scrolledTo}
            rows={tiled ? tileRows : listed}
            renderRow={tiled ? renderTiles : renderRow}
            selectedKey={pane?.selected}
            label={strings.commander.sides[side]}
            wholeRows
            wheelStep={tiled ? tileTextRow : undefined}
            notchRows={tiled ? 1 : undefined}
            overscan={tiled ? 2 : undefined}
            scrolling={scrolling}
            onKeyDown={(event, visible) => {
              const pressed = paneKey(event, {
                rows,
                selected: pane?.selected,
                selectedIndex,
                marked,
                filtering,
                reading:
                  pane?.flat?.progress.reading === true ||
                  pane?.duplicates?.reading === true ||
                  readingArchive !== undefined ||
                  (pane?.counting ?? 0) > 0,
                parent: pane?.parent === true,
                tiled,
                across,
                visible,
                platform,
              });
              if (pressed === undefined) {
                return;
              }
              event.preventDefault();
              if (pressed.act !== undefined) {
                act(pressed.act);
              }
            }}
          />
        )}
      </div>
      <ReadingStatus side={side} />
      <DuplicatesStatus side={side} />
      <FlatStatus
        side={side}
        files={total}
        under={selectedIndex === -1 ? undefined : rows[selectedIndex].under}
      />
      <CountingStatus side={side} />
      {resizer}
    </section>
  );
}
