import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { tileColumns, tileWidthOf } from './tiles';
import { iconUrl, thumbnailUrl, type IconSource } from '../shared/icons';
import { imageType, maxImageSize, vectorType } from '../../../shared/images';
import {
  ThumbnailImage,
  useThumbnailFill,
  type FillItem,
} from '../../../ui/thumbnails';
import { commanderKeymap } from '../shared/keymap';
import { clicked } from '../../../shell/shared/keymap';
import type { Entry, Side } from '../shared/protocol';
import { formatSize } from './format';
import {
  filteredRows,
  filteredSelection,
  goesInto,
  opens,
  menuKeys,
  rangeKeys,
  type Row,
} from './listing';
import { filterStep, PaneFilter } from './paneFilter';
import { filterWords } from '../../../shared/fileFilter';
import { HighlightWords } from '../../../ui/highlight';
import { SearchButton, SearchRow } from '../../../ui/search';
import { columnFocusOf } from '../../../ui/columnFocus';
import { ColumnHeader } from './columnHeader';
import { layouts, type Layout } from '../shared/settings';
import {
  filterOf,
  shownColumns,
  useCommander,
  useCommanderActions,
} from './store';
import { formatDate } from '../../../ui/dates';
import { useShell } from '../../../shell/page/store';
import {
  BackIcon,
  FileIcon,
  FolderIcon,
  ForwardIcon,
  ShieldIcon,
  ToolIcon,
} from '../../../ui/icons';
import { MenuButton } from '../../../ui/menu';
import type { ContextMenuItem } from '../../../ui/contextMenu';
import { estimatedRowHeight, VirtualRows } from '../../../ui/virtualRows';
import { strings } from '../../../shared/strings';
import { fileColorOf } from './fileColors';
import { PathTitle } from './pathTitle';
import { paneKey, type PaneAct } from './paneKeys';

declare module 'react' {
  interface CSSProperties {
    readonly '--commander-extension'?: string;
    readonly '--commander-size'?: string;
    readonly '--commander-date'?: string;
    readonly '--file-color'?: string;
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

function SystemIcon({
  source,
  generic,
  onDropIcon,
  onFailed,
}: {
  source: IconSource;
  generic: React.ReactNode;
  onDropIcon: (ticket: string) => void;
  onFailed: () => void;
}) {
  const ticket = useId();
  const came = useRef(false);
  const [shown, setShown] = useState(false);
  useEffect(
    () => () => {
      if (!came.current) {
        onDropIcon(ticket);
      }
    },
    [ticket, onDropIcon],
  );
  return (
    <>
      {!shown && generic}
      <img
        className={`system-icon${shown ? '' : ' loading'}`}
        src={iconUrl(source, ticket)}
        alt=""
        draggable={false}
        onLoad={() => {
          came.current = true;
          setShown(true);
        }}
        onError={() => {
          came.current = true;
          onFailed();
        }}
      />
    </>
  );
}

export function RowIcon({
  row,
  source,
  onDropIcon,
}: {
  row: Row;
  source: IconSource | undefined;
  onDropIcon: (ticket: string) => void;
}) {
  const [failed, setFailed] = useState(false);
  const generic =
    row.entry === undefined || row.entry.folder ? <FolderIcon /> : <FileIcon />;
  if (source !== undefined && !failed) {
    return (
      <SystemIcon
        key={iconUrl(source)}
        source={source}
        generic={generic}
        onDropIcon={onDropIcon}
        onFailed={() => setFailed(true)}
      />
    );
  }
  return generic;
}

export function ExtensionCell({
  row,
  words,
  onOpenRepository,
}: {
  row: Row;
  words: readonly string[];
  onOpenRepository: (name: string) => void;
}) {
  return (
    <span className="commander-extension">
      {row.repository ? (
        <button
          className="commander-mark"
          title={strings.commander.openRepository}
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            onOpenRepository(row.key);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <ToolIcon tool="git" />
        </button>
      ) : (
        <HighlightWords text={row.extension} words={words} />
      )}
    </span>
  );
}

function tileThumbnailUrl(source: IconSource, entry: Entry): string {
  return thumbnailUrl(source, `${entry.size ?? ''}:${entry.modified ?? ''}`);
}

const fillDelay = 250;

function TileImage({
  row,
  source,
  box,
  onMade,
  onDropIcon,
}: {
  row: Row;
  source: IconSource | undefined;
  box: number;
  onMade: (made: Blob, pixelRatio: number) => void;
  onDropIcon: (ticket: string) => void;
}) {
  const icon = (
    <span className="commander-icon">
      <RowIcon row={row} source={source} onDropIcon={onDropIcon} />
    </span>
  );
  const type = imageType(row.key);
  if (source === undefined || row.entry === undefined || type === undefined) {
    return icon;
  }
  return (
    <ThumbnailImage
      url={tileThumbnailUrl(source, row.entry)}
      box={box}
      vector={type === vectorType}
      fallback={icon}
      onMade={onMade}
    />
  );
}

export function layoutMenu({
  layout,
  groupByColor,
  canGroupByColor,
  onLayout,
  onGroupByColor,
}: {
  readonly layout: Layout;
  readonly groupByColor: boolean;
  readonly canGroupByColor: boolean;
  readonly onLayout: (layout: Layout) => void;
  readonly onGroupByColor: () => void;
}): ContextMenuItem[] {
  return [
    ...layouts.map((each) => ({
      label: strings.commander.layouts[each],
      checked: each === layout,
      onClick: () => onLayout(each),
    })),
    { separator: true },
    {
      label: strings.commander.groupByColor,
      checked: groupByColor && canGroupByColor,
      disabled: !canGroupByColor,
      onClick: onGroupByColor,
    },
  ];
}

export function Pane({
  side,
  driveTrigger,
  resizer,
}: {
  side: Side;
  driveTrigger: React.Ref<HTMLButtonElement>;
  resizer: React.ReactNode;
}) {
  const tab = useCommander((state) => state.view.tab);
  const active = useCommander((state) => state.view.active === side);
  const pane = useCommander((state) => state.view.panes[side]);
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
  const onThumbnail = (
    name: string,
    box: number,
    pixelRatio: number,
    made: Blob,
  ) => void actions.saveThumbnail(side, name, box, pixelRatio, made);
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
  const onDelete = (names: readonly string[], permanently: boolean) =>
    actions.askDelete(side, names, permanently);
  const onShellMenu = (
    names: readonly string[],
    at: { readonly x: number; readonly y: number },
    extended: boolean,
  ) => actions.shellMenu(side, names, at, extended);
  const onCompare = actions.compare;
  const allRows = pane?.rows ?? noRows;
  const filter = useCommander((state) => filterOf(state, side));
  const setFilter = (query: string | undefined) =>
    actions.filterSide(side, query);
  const filtering = filter !== undefined;
  const query = filter ?? '';
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
      setFilter('');
    }
    setFocusAsks(({ count }) => ({ count: count + 1, select: true }));
  };
  const focusList = () => columnFocusOf(body.current)?.focus();
  const closeFilter = () => {
    focusList();
    setFilter(undefined);
  };
  const filterTo = (next: string) => {
    setFilter(next);
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

  const [bodyWidth, setBodyWidth] = useState(0);
  useLayoutEffect(() => {
    const element = body.current;
    if (!element) {
      return undefined;
    }
    const measure = () => setBodyWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const tileWidth = tileWidthOf(thumbnailSize);
  const across = tileColumns(bodyWidth, tileWidth);
  const tiled = layout === 'thumbnails';
  const tileTextRow = () =>
    body.current?.querySelector('.commander-tile-name')?.getBoundingClientRect()
      .height || estimatedRowHeight;
  const scrollKey = `${tab ?? ''} ${side} ${pane?.folder ?? ''} ${layout}`;
  const shownList = tiled
    ? bodyWidth > 0
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
      rows.flatMap((row, index): (FillItem & { readonly index: number })[] => {
        const type = imageType(row.key);
        if (
          tab === undefined ||
          shownFolder === undefined ||
          row.entry === undefined ||
          row.entry.folder ||
          type === undefined ||
          type === vectorType ||
          (row.entry.size ?? 0) > maxImageSize
        ) {
          return [];
        }
        return [
          {
            url: tileThumbnailUrl(
              { tab, side, folder: shownFolder, name: row.key },
              row.entry,
            ),
            name: row.key,
            index,
          },
        ];
      }),
    [rows, tab, side, shownFolder],
  );
  useThumbnailFill(
    fillItems,
    Math.max(
      0,
      fillItems.findIndex((item) => item.index >= fillFrom),
    ),
    thumbnailSize,
    tiled && shownList !== undefined,
    (name, made, pixelRatio) =>
      onThumbnail(name, thumbnailSize, pixelRatio, made),
  );
  useLayoutEffect(() => {
    const focused = document.activeElement;
    if (
      shownList !== undefined &&
      active &&
      (focused === null || focused === document.body)
    ) {
      columnFocusOf(body.current)?.focus();
    }
  }, [shownList, active]);
  const tileRows = useMemo(
    () => ({
      count: Math.ceil(rows.length / across),
      keyOf: (index: number) => rows[index * across].key,
      indexOf: (key: string) => {
        const at = rows.findIndex((row) => row.key === key);
        return at === -1 ? -1 : Math.floor(at / across);
      },
    }),
    [rows, across],
  );

  const fileColor = (row: Row) =>
    row.entry === undefined ? undefined : fileColorOf(row.entry, fileColors);
  const rowClass = (row: Row) =>
    `row commander-row${row.key === pane?.selected ? ' selected' : ''}${marked?.has(row.key) ? ' marked' : ''}${row.entry?.hidden ? ' hidden' : ''}${fileColor(row) === undefined ? '' : ' colored'}`;
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
    onClick: (event: React.MouseEvent) => {
      const marking = clicked(commanderKeymap.markClick, event);
      if (marking === 'toggle') {
        onMark([row.key], !marked?.has(row.key));
      } else if (marking === 'range' && selectedIndex !== -1) {
        onMark(rangeKeys(rows, selectedIndex, index), true);
      }
      onSelect(row.key);
    },
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const extended = clicked(commanderKeymap.systemMenu, event);
      const names = menuKeys(rows, row.key, marked);
      if (extended === undefined || names.length === 0) {
        return;
      }
      onSelect(row.key);
      onShellMenu(names, { x: event.clientX, y: event.clientY }, extended);
    },
    onDoubleClick: () => {
      if (opens(row)) {
        onOpen(row.key);
      }
    },
  });

  const renderRow = (index: number) => {
    const row = rows[index];
    const { entry } = row;
    return (
      <div
        className={`${rowClass(row)} commander-line`}
        style={colorStyle(row)}
        {...itemEvents(row, index)}
      >
        <span className="commander-icon">
          <RowIcon row={row} source={iconSource(row)} onDropIcon={onDropIcon} />
        </span>
        <span className="commander-name">
          <HighlightWords text={row.base} words={words} />
        </span>
        <ExtensionCell
          row={row}
          words={words}
          onOpenRepository={onOpenRepository}
        />
        <span className="commander-size">{formatSize(entry?.size)}</span>
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
      <div className="commander-thumbnail" style={{ height: thumbnailSize }}>
        <TileImage
          row={row}
          source={iconSource(row)}
          box={thumbnailSize}
          onMade={(made, pixelRatio) =>
            onThumbnail(row.key, thumbnailSize, pixelRatio, made)
          }
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
      <div className="commander-tile-size">{formatSize(row.entry?.size)}</div>
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
      case 'delete':
        onDelete(action.names, action.permanently);
        return;
      case 'menu': {
        const box = body.current
          ?.querySelector('.commander-row.selected')
          ?.getBoundingClientRect();
        if (box !== undefined) {
          onShellMenu(
            action.names,
            { x: box.left, y: box.bottom },
            action.extended,
          );
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
      case 'switchSide':
        onSwitchSide();
        return;
      case 'compare':
        onCompare();
        return;
      case 'view':
        onView(action.name);
        return;
      case 'openOnSide':
        onOpenOnSide(action.side, action.name);
        return;
      case 'open':
        onOpen(action.name);
        return;
      case 'openRepository':
        onOpenRepository(action.name);
        return;
      case 'mark':
        onMark(action.keys, action.marked);
        onSelect(action.select);
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
              <div onClickCapture={onDrivesOpening}>
                <MenuButton
                  title={strings.commander.chooseDrive}
                  label={(current ?? '').replace(/\\$/, '')}
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
          <PathTitle path={pane?.folder ?? ''} hidden={pane?.hidden ?? []}>
            {pane?.elevated && (
              <span
                className="elevated-mark"
                title={strings.commander.readAsAdministrator}
              >
                <ShieldIcon />
              </span>
            )}
          </PathTitle>
          <div className="column-actions">
            <div className="commander-layout">
              <MenuButton
                title={strings.commander.layout}
                label={strings.commander.layouts[layout]}
                items={layoutMenu({
                  layout,
                  groupByColor: pane?.sort.groupByColor ?? false,
                  canGroupByColor,
                  onLayout,
                  onGroupByColor,
                })}
              />
            </div>
            <SearchButton
              title={strings.commander.filterFolder}
              onClick={openFilter}
            />
          </div>
        </header>
      )}
      {!tiled && <ColumnHeader side={side} />}
      <div
        className="column-body"
        ref={body}
        onContextMenu={(event) => event.preventDefault()}
      >
        {shownList !== undefined && (
          <VirtualRows
            key={shownList}
            initialOffset={actions.scrollOf(scrollKey)}
            onScrolled={scrolledTo}
            rows={tiled ? tileRows : listed}
            renderRow={tiled ? renderTiles : renderRow}
            selectedKey={pane?.selected}
            label={strings.commander.sides[side]}
            wholeRows
            wheelStep={tiled ? tileTextRow : undefined}
            notchRows={tiled ? 1 : undefined}
            scrolling={scrolling}
            onKeyDown={(event, visible) => {
              const pressed = paneKey(event, {
                rows,
                selected: pane?.selected,
                selectedIndex,
                marked,
                filtering,
                parent: pane?.parent === true,
                tiled,
                across,
                visible,
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
      {resizer}
    </section>
  );
}
