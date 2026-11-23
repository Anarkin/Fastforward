import { memo, useState } from 'react';
import { iconUrl, type IconSource } from '../shared/icons';
import { commanderKeymap } from './keymap';
import { clicked } from '../../../lib/shared/keymap';
import { parentFolder } from '../shared/protocol';
import { type Side } from '../shared/sides';
import type { ColumnWidths } from '../shared/columnWidths';
import { type Row } from './listing';
import { opens, pointedKeys, rangeKeys } from './rowKeys';
import { TileName } from './tileName';
import type { Filter } from '../../../lib/shared/filter';
import { shownRowsOf } from './shownRows';
import { cutClass } from './cellFit';
import { useCommander, useCommanderActions, useCommanderNow } from './store';
import { formatDate } from '../../../lib/page/dates';
import { groupOfEntry, type FileColors } from '../../../lib/page/fileColors';
import { fileColorClass } from '../../../lib/shared/fileColors';
import { menuOfClick } from './paneKeys';
import { tileWidthOf } from './tiles';
import { formatSize } from './format';
import { overCheck, overCheckAttribute } from './lineCheck';
import { plainLine, type LineRoom } from './plainLine';
import {
  ExtensionCell,
  MarkBox,
  NameCell,
  SizeCell,
  SystemIcon,
  TileImage,
} from './paneCells';

export interface PaneLook {
  readonly tab: string | undefined;
  readonly folder: string | undefined;
  readonly fileColors: FileColors;
  readonly gitMissing: boolean;
  readonly columns: ColumnWidths;
  readonly room: LineRoom;
  readonly dateFormat: string;
  readonly filter: Filter;
}

export interface PaneItemProps {
  side: Side;
  row: Row;
  index: number;
  look: PaneLook;
  selected: boolean;
  marked: boolean;
  startsGroup: boolean;
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
  look,
  selected,
  marked,
  startsGroup,
  dropTarget,
  pairsClick,
  onMenu,
}: PaneItemProps) {
  const actions = useCommanderActions();
  const onSelect = (key: string) => actions.select(side, key);
  const onMark = (keys: readonly string[], marking: boolean) =>
    actions.mark(side, keys, marking);
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
  const { tab, folder } = look;
  const group =
    row.entry === undefined
      ? undefined
      : groupOfEntry(row.entry, look.fileColors);
  const rowClass = `row commander-row${selected ? ' selected' : ''}${marked ? ' marked' : ''}${row.entry?.hidden ? ' hidden' : ''}${row.entry === undefined || row.entry.folder ? ' commander-folder' : ''}${dropTarget ? ' drop-target' : ''}${group === undefined ? '' : ` colored ${fileColorClass(group)}`}${startsGroup ? ' group-start' : ''}`;
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
      : formatDate(row.entry.modified, look.dateFormat);
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
    onPointerDown: (event: React.PointerEvent) => {
      if (clicked(commanderKeymap.selectItem, event) !== undefined) {
        onSelect(row.key);
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
  return { rowClass, iconSource, date, itemEvents, toggleMark };
}

interface IconSettled {
  readonly url: string | undefined;
  readonly as: 'shown' | 'failed';
}

const pointCheck = (event: React.PointerEvent) =>
  event.currentTarget.toggleAttribute(overCheckAttribute, overCheck(event));

const leaveCheck = (event: React.PointerEvent) =>
  event.currentTarget.removeAttribute(overCheckAttribute);

export const PaneLine = memo(function PaneLine(props: PaneItemProps) {
  const { side, row, look } = props;
  const { entry } = row;
  const actions = useCommanderActions();
  const { rowClass, iconSource, date, itemEvents, toggleMark } =
    usePaneItem(props);
  const url = iconSource === undefined ? undefined : iconUrl(iconSource);
  const [settled, setSettled] = useState<IconSettled>();
  const icon =
    settled !== undefined && settled.url === url
      ? settled.as
      : url !== undefined && actions.iconTicketOf(url) !== undefined
        ? 'shown'
        : undefined;
  const onOpenRepository =
    look.gitMissing || !row.repository
      ? undefined
      : (name: string) => actions.openRepository(side, name);
  const folder = entry === undefined || entry.folder;
  const line =
    onOpenRepository !== undefined ||
    entry?.counting === true ||
    entry?.unreadFolders !== undefined
      ? undefined
      : plainLine(
          {
            name: folder ? `[${row.base}]` : row.base,
            extension: row.extension,
            size: formatSize(entry?.size),
            date,
          },
          look.room,
          look.filter,
        );
  const checked = entry !== undefined;
  return (
    <div
      className={`${rowClass} commander-line${icon === 'shown' ? '' : folder ? ' generic-folder' : ' generic-file'}${checked ? '' : ' up'}${line === undefined ? '' : ' plain'}`}
      {...itemEvents}
      onPointerDown={(event) => {
        if (!(checked && overCheck(event))) {
          itemEvents.onPointerDown(event);
        }
      }}
      onClick={(event) => {
        if (checked && overCheck(event)) {
          toggleMark();
        } else {
          itemEvents.onClick(event);
        }
      }}
      onPointerMove={checked ? pointCheck : undefined}
      onPointerLeave={checked ? leaveCheck : undefined}
    >
      {iconSource !== undefined && icon !== 'failed' && (
        <SystemIcon
          key={url}
          source={iconSource}
          generic={null}
          onDropIcon={actions.dropIcon}
          onShown={() => setSettled({ url, as: 'shown' })}
          onFailed={() => setSettled({ url, as: 'failed' })}
          tickets={actions}
        />
      )}
      {line ?? (
        <>
          <NameCell row={row} filter={look.filter} />
          <ExtensionCell
            row={row}
            filter={look.filter}
            columns={look.columns.extension}
            onOpenRepository={onOpenRepository}
          />
          <SizeCell entry={entry} columns={look.columns.size} />
          <span
            className={`commander-date${cutClass(date, look.columns.date)}`}
          >
            {date}
          </span>
        </>
      )}
    </div>
  );
});

export const PaneTile = memo(function PaneTile(props: PaneItemProps) {
  const { row, look } = props;
  const thumbnailSize = useCommander((state) => state.view.thumbnailSize);
  const actions = useCommanderActions();
  const tileWidth = tileWidthOf(thumbnailSize);
  const { rowClass, iconSource, date, itemEvents, toggleMark } =
    usePaneItem(props);
  return (
    <div
      className={`${rowClass} commander-tile`}
      style={{ width: tileWidth }}
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
      <TileName row={row} filter={look.filter} />
      <SizeCell entry={row.entry} tile />
      <div className="commander-tile-date">{date}</div>
    </div>
  );
});
