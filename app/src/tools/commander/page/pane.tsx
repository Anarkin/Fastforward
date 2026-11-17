import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type Side } from '../shared/sides';
import { menuTargetOf } from './fileMenu';
import { copiedText } from './copiedText';
import { fileMenuItems, type Copied } from '../../../lib/page/fileMenu';
import { type Row } from './listing';
import { goesInto } from './rowKeys';
import { filterStep, keptFiles, steppedFile } from './filterSteps';
import { PaneFilter } from './paneFilter';
import { searchFilter } from '../../../lib/shared/filter';
import { plainSearch } from '../../../lib/shared/searchOptions';
import { columnFocusOf } from '../../../lib/page/columnFocus';
import { useFocusKeeper } from '../../../lib/page/viewFocus';
import { clickPairs } from './clickPairs';
import { ColumnHeader } from './columnHeader';
import { readingKey } from './received';
import { shownColumns, shownRowsOf } from './shownRows';
import { filterOf } from './sideFilters';
import { useCommander, useCommanderActions } from './store';
import { useShell, useShellActions } from '../../../shell/page/store';
import { useFileDrop } from './dropping';
import { ShieldIcon } from '../../../lib/page/icons';
import { VirtualRows } from '../../../lib/page/virtualRows';
import { strings } from '../../../lib/shared/strings';
import { PathTitle } from '../../../lib/page/pathTitle';
import { menuOfClick, paneKey, type PaneAct } from './paneKeys';
import { actOnPane } from './paneActs';
import { useTiles } from './paneTiles';
import { PaneLine, PaneTile } from './paneRows';
import { PaneStatus } from './paneStatus';
import { goesOn } from './sideStatus';
import { folderLooks } from './headerLooks';
import { PaneTitle } from './paneHeader';
declare module 'react' {
  interface CSSProperties {
    readonly '--commander-extension'?: string;
    readonly '--commander-size'?: string;
    readonly '--commander-date'?: string;
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
  const paneShown = useCommander(
    (state) => state.view.panes[side] !== undefined,
  );
  const paneFolder = useCommander((state) => state.view.panes[side]?.folder);
  const archive = useCommander((state) => state.view.panes[side]?.archive);
  const hidden = useCommander((state) => state.view.panes[side]?.hidden);
  const marked = useCommander((state) => state.view.panes[side]?.marked);
  const selectedName = useCommander(
    (state) => state.view.panes[side]?.selected,
  );
  const inRepository = useCommander(
    (state) => state.view.panes[side]?.inRepository === true,
  );
  const elevated = useCommander(
    (state) => state.view.panes[side]?.elevated === true,
  );
  const parentShown = useCommander(
    (state) => state.view.panes[side]?.parent === true,
  );
  const restored = useCommander(
    (state) => state.view.panes[side]?.restored === true,
  );
  const flatShown = useCommander(
    (state) => state.view.panes[side]?.flat !== undefined,
  );
  const duplicatesShown = useCommander(
    (state) => state.view.panes[side]?.duplicates !== undefined,
  );
  const reading = useCommander((state) => goesOn(state.view.panes[side]));
  const told = useCommander((state) =>
    state.readingSides.has(readingKey(state.view.tab, side)),
  );
  const layout = useCommander((state) => state.view.layouts[side]);
  const columns = useCommander(shownColumns);
  const actions = useCommanderActions();
  const onSelect = (key: string) => actions.select(side, key);
  const onOpen = (name: string) => actions.open(side, name);
  const onActivate = () => actions.activate(side);
  const onShellMenu = (
    names: readonly string[],
    at: { readonly x: number; readonly y: number },
    extended: boolean,
  ) => actions.shellMenu(side, names, at, extended);
  const filter = useCommander((state) => filterOf(state, side));
  const { rows } = useCommander((state) => shownRowsOf(state, side));
  const setFilter = (query: string | undefined) =>
    actions.filterSide(side, query);
  const filtering = filter !== undefined;
  const query = filter?.query ?? '';
  const options = filter?.options ?? plainSearch;
  const matching = useMemo(
    () => searchFilter(query, options),
    [query, options],
  );
  const filterInput = useRef<HTMLInputElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);
  useFocusKeeper(section, (focus) =>
    actions.dispatch({ type: 'focus', focus }),
  );
  const [focusAsks, setFocusAsks] = useState({ count: 0, select: true });
  const [pairsClick] = useState(clickPairs);
  const { dropInto, onDragOver, onDragLeave, onDrop } = useFileDrop(side);
  const { showMenu, copyText } = useShellActions();
  const platform = useCommander((state) => state.view.platform);
  const gitMissing = useCommander((state) => state.view.gitMissing);
  const copyItems = (copied: Copied, names: readonly string[]) => {
    if (paneShown) {
      copyText(copiedText(copied, paneFolder ?? '', names, platform));
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
  const scrolling = useShell((state) => state.scrolling);
  const listed = useMemo(
    () => ({
      count: rows.length,
      keyOf: (index: number) => rows[index].key,
      indexOf: (key: string) => rows.findIndex((row) => row.key === key),
    }),
    [rows],
  );
  const selectedIndex = listed.indexOf(selectedName ?? '');
  const openMenu = (
    key: string | undefined,
    at: { readonly x: number; readonly y: number },
  ) => {
    const target = menuTargetOf(rows, key, marked, inRepository);
    if (target === undefined) {
      return;
    }
    const inArchive = archive !== undefined;
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
      { inArchive, gitMissing },
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

  const scrollKey = `${tab ?? ''} ${side} ${paneFolder ?? ''} ${layout}`;
  const keptScroll = actions.scrollOf(scrollKey);
  const { tiled, across, shownList, tileTextRow, fillScrolledTo, tileRows } =
    useTiles(body, side, rows, scrollKey);
  const scrolledTo = (offset: number) => {
    actions.keepScroll(scrollKey, offset);
    fillScrolledTo(offset);
  };
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

  const itemOf = (row: Row, index: number) => ({
    side,
    row,
    index,
    filter: matching,
    dropInto,
    pairsClick,
    onMenu: openMenu,
  });

  const renderRow = (index: number) => (
    <PaneLine {...itemOf(rows[index], index)} />
  );

  const renderTiles = (gridRow: number) => (
    <div className="commander-tiles">
      {rows
        .slice(gridRow * across, (gridRow + 1) * across)
        .map((row, offset) => (
          <PaneTile key={row.key} {...itemOf(row, gridRow * across + offset)} />
        ))}
    </div>
  );

  const act = (action: PaneAct) =>
    actOnPane(action, side, actions, {
      query,
      copyItems,
      openMenu: (key) => {
        const row =
          key === undefined
            ? null
            : body.current?.querySelector('.commander-row.selected');
        const box = (row ?? body.current)?.getBoundingClientRect();
        if (box !== undefined) {
          openMenu(key, {
            x: box.left,
            y: row ? box.bottom : box.top,
          });
        }
      },
      openFilter,
      focusFilter: () =>
        setFocusAsks(({ count }) => ({ count: count + 1, select: false })),
    });

  return (
    <section
      ref={section}
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
          <PaneFilter
            side={side}
            query={query}
            options={options}
            found={keptFiles(rows, selectedName)}
            input={filterInput}
            onQuery={filterTo}
            onOptions={(chosen) => actions.filterSide(side, query, chosen)}
            onStep={(step) => {
              const next = steppedFile(rows, selectedName, step);
              if (next !== undefined) {
                onSelect(next);
              }
            }}
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
        </header>
      ) : (
        <PaneTitle
          side={side}
          driveTrigger={driveTrigger}
          bookmarkTrigger={bookmarkTrigger}
          onChosen={focusList}
          onFilter={openFilter}
        />
      )}
      <div
        className="commander-path commander-line"
        onContextMenu={openFolderMenu}
      >
        <span className="commander-icon">
          {elevated && (
            <span
              className="elevated-mark"
              title={strings.commander.readAsAdministrator}
            >
              <ShieldIcon />
            </span>
          )}
        </span>
        <PathTitle
          path={paneFolder ?? ''}
          looks={folderLooks(hidden ?? [], archive)}
          flat={flatShown}
          duplicates={duplicatesShown}
          goTo={() => actions.askGoTo(side)}
        />
      </div>
      {!tiled && <ColumnHeader side={side} />}
      <div
        className={`column-body${dropInto === null ? ' drop-target' : ''}`}
        ref={body}
        onContextMenu={openFolderMenu}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {shownList !== undefined && (
          <VirtualRows
            key={`${shownList} ${tab ?? ''}`}
            placeKey={scrollKey}
            initialOffset={keptScroll}
            revealAtStart={!restored || keptScroll === 0}
            onScrolled={scrolledTo}
            rows={tiled ? tileRows : listed}
            renderRow={tiled ? renderTiles : renderRow}
            selectedKey={selectedName}
            label={strings.commander.sides[side]}
            wholeRows
            wheelStep={tiled ? tileTextRow : undefined}
            notchRows={tiled ? 1 : undefined}
            overscan={tiled ? 2 : undefined}
            scrolling={scrolling}
            onKeyDown={(event, visible) => {
              const pressed = paneKey(event, {
                rows,
                selected: selectedName,
                selectedIndex,
                marked,
                filtering,
                reading: told || reading,
                parent: parentShown,
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
      <PaneStatus
        side={side}
        selected={selectedIndex === -1 ? undefined : rows[selectedIndex]}
      />
      {resizer}
    </section>
  );
}
