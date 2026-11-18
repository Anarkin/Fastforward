import { type CSSProperties } from 'react';
import { type IconSource } from '../shared/icons';
import { commanderKeymap } from './keymap';
import { clicked } from '../../../lib/shared/keymap';
import { parentFolder } from '../shared/protocol';
import { type Side } from '../shared/sides';
import { type Row } from './listing';
import { opens, pointedKeys, rangeKeys } from './rowKeys';
import { TileName } from './tileName';
import type { Filter } from '../../../lib/shared/filter';
import { shownRowsOf } from './shownRows';
import { useCommander, useCommanderActions, useCommanderNow } from './store';
import { formatDate } from '../../../lib/page/dates';
import { useShell } from '../../../shell/page/store';
import { fileColorOf } from '../../../lib/page/fileColors';
import { menuOfClick } from './paneKeys';
import { tileWidthOf } from './tiles';
import {
  RowIcon,
  ExtensionCell,
  MarkBox,
  NameCell,
  SizeCell,
  TileImage,
} from './paneCells';
declare module 'react' {
  interface CSSProperties {
    readonly '--file-color'?: string;
  }
}

interface PaneItemProps {
  side: Side;
  row: Row;
  index: number;
  filter: Filter;
  dropTarget: boolean;
  pairsClick: (key: string, count: number) => boolean;
  onMenu: (
    key: string | undefined,
    at: { readonly x: number; readonly y: number },
  ) => void;
}

function usePaneItem({
  side,
  row,
  index,
  dropTarget,
  pairsClick,
  onMenu,
}: PaneItemProps) {
  const actions = useCommanderActions();
  const onSelect = (key: string) => actions.select(side, key);
  const onMark = (keys: readonly string[], marked: boolean) =>
    actions.mark(side, keys, marked);
  const onOpen = (name: string) => actions.open(side, name);
  const now = useCommanderNow();
  const shown = () => {
    const state = now();
    const pane = state.view.panes[side];
    return {
      rows: shownRowsOf(state, side).rows,
      marked: pane?.marked,
      selected: pane?.selected,
    };
  };
  const tab = useCommander((state) => state.view.tab);
  const folder = useCommander((state) => state.view.panes[side]?.folder);
  const selected = useCommander(
    (state) => state.view.panes[side]?.selected === row.key,
  );
  const marked = useCommander(
    (state) => state.view.panes[side]?.marked?.has(row.key) === true,
  );
  const startsGroup = useCommander(
    (state) => shownRowsOf(state, side).starts?.has(row.key) === true,
  );
  const fileColors = useCommander((state) => state.view.fileColors);
  const dateFormat = useShell((state) => state.dateFormat);
  const fileColor =
    row.entry === undefined ? undefined : fileColorOf(row.entry, fileColors);
  const rowClass = `row commander-row${selected ? ' selected' : ''}${marked ? ' marked' : ''}${row.entry?.hidden ? ' hidden' : ''}${row.entry === undefined || row.entry.folder ? ' commander-folder' : ''}${dropTarget ? ' drop-target' : ''}${fileColor === undefined ? '' : ' colored'}${startsGroup ? ' group-start' : ''}`;
  const colorStyle: CSSProperties =
    fileColor === undefined ? {} : { '--file-color': fileColor };
  const iconSource: IconSource | undefined =
    tab === undefined ||
    folder === undefined ||
    row.entry === undefined ||
    row.entry.folder
      ? undefined
      : { tab, side, folder, name: row.key };
  const date =
    row.entry?.modified === undefined
      ? ''
      : formatDate(row.entry.modified, dateFormat);
  const itemEvents = {
    'data-drop':
      row.entry === undefined || row.entry.folder ? row.key : undefined,
    draggable: row.entry !== undefined,
    onDragStart: (event: React.DragEvent) => {
      event.preventDefault();
      const { rows, marked: marks } = shown();
      const names = pointedKeys(rows, row.key, marks);
      if (names.length > 0) {
        onSelect(row.key);
        actions.drag(side, names);
      }
    },
    onClick: (event: React.MouseEvent) => {
      const marking = clicked(commanderKeymap.markClick, event);
      const { rows, marked: marks, selected: selectedKey } = shown();
      if (marking === 'toggle') {
        onMark([row.key], !marks?.has(row.key));
      } else if (marking === 'range') {
        const selectedIndex = rows.findIndex(
          (each) => each.key === (selectedKey ?? ''),
        );
        if (selectedIndex !== -1) {
          onMark(rangeKeys(rows, selectedIndex, index), true);
        }
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
        const { rows, marked: marks } = shown();
        actions.shellMenu(
          side,
          row.key === parentFolder ? [] : pointedKeys(rows, row.key, marks),
          at,
          true,
        );
      } else {
        onMenu(row.key, at);
      }
    },
  };
  const toggleMark = () => onMark([row.key], !shown().marked?.has(row.key));
  return { rowClass, colorStyle, iconSource, date, itemEvents, toggleMark };
}

export function PaneLine(props: PaneItemProps) {
  const { side, row, filter } = props;
  const { entry } = row;
  const actions = useCommanderActions();
  const gitMissing = useCommander((state) => state.view.gitMissing);
  const onOpenRepository = gitMissing
    ? undefined
    : (name: string) => actions.openRepository(side, name);
  const { rowClass, colorStyle, iconSource, date, itemEvents, toggleMark } =
    usePaneItem(props);
  return (
    <div
      className={`${rowClass} commander-line`}
      style={colorStyle}
      {...itemEvents}
    >
      {row.entry !== undefined && <MarkBox onToggle={toggleMark} />}
      <span className="commander-icon">
        <RowIcon
          row={row}
          source={iconSource}
          onDropIcon={actions.dropIcon}
          tickets={actions}
        />
      </span>
      <NameCell row={row} filter={filter} />
      <ExtensionCell
        row={row}
        filter={filter}
        onOpenRepository={onOpenRepository}
      />
      <SizeCell entry={entry} />
      <span className="commander-date">{date}</span>
    </div>
  );
}

export function PaneTile(props: PaneItemProps) {
  const { row, filter } = props;
  const thumbnailSize = useCommander((state) => state.view.thumbnailSize);
  const actions = useCommanderActions();
  const tileWidth = tileWidthOf(thumbnailSize);
  const { rowClass, colorStyle, iconSource, date, itemEvents, toggleMark } =
    usePaneItem(props);
  return (
    <div
      className={`${rowClass} commander-tile`}
      style={{ ...colorStyle, width: tileWidth }}
      {...itemEvents}
    >
      {row.entry !== undefined && <MarkBox onToggle={toggleMark} />}
      <div className="commander-thumbnail" style={{ height: thumbnailSize }}>
        <TileImage
          row={row}
          source={iconSource}
          box={thumbnailSize}
          onMade={(made, pixelRatio) => {
            if (iconSource !== undefined) {
              void actions.saveThumbnail(
                iconSource,
                thumbnailSize,
                pixelRatio,
                made,
              );
            }
          }}
          onDropIcon={actions.dropIcon}
          tickets={actions}
        />
      </div>
      <TileName row={row} filter={filter} />
      <SizeCell entry={row.entry} tile />
      <div className="commander-tile-date">{date}</div>
    </div>
  );
}
