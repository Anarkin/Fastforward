import { useMemo } from 'react';
import { commanderKeymap } from '../shared/keymap';
import { parentFolder, type Side } from '../shared/protocol';
import { formatSize } from './format';
import { opens, type Row } from './listing';
import { ColumnHeader } from './columnHeader';
import type { ColumnWidths, SizedColumn, SortColumn } from '../shared/settings';
import type { PaneView } from './view';
import { formatDate } from '../../../ui/dates';
import { FileIcon, FolderIcon } from '../../../ui/icons';
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

function RowIcon({ row }: { row: Row }) {
  return row.entry === undefined || row.entry.folder ? (
    <FolderIcon />
  ) : (
    <FileIcon />
  );
}

export function Pane({
  side,
  pane,
  dateFormat,
  columns,
  drives,
  driveTrigger,
  onSelect,
  onOpen,
  onSort,
  onActivate,
  onSwitchSide,
  onDrive,
  onDrivesOpening,
  onResize,
  onResized,
  onReset,
  resizer,
}: {
  side: Side;
  pane: PaneView | undefined;
  dateFormat: string;
  columns: ColumnWidths;
  drives: readonly string[];
  driveTrigger: React.Ref<HTMLButtonElement>;
  onSelect: (key: string) => void;
  onOpen: (name: string) => void;
  onSort: (column: SortColumn) => void;
  onActivate: () => void;
  onSwitchSide: () => void;
  onDrive: (drive: string) => void;
  onDrivesOpening: () => void;
  onResize: (column: SizedColumn, width: number) => void;
  onResized: (column: SizedColumn, width: number) => void;
  onReset: (column: SizedColumn) => void;
  resizer: React.ReactNode;
}) {
  const rows = pane?.rows ?? noRows;
  const listed = useMemo(
    () => ({
      count: rows.length,
      keyOf: (index: number) => rows[index].key,
      indexOf: (key: string) => rows.findIndex((row) => row.key === key),
    }),
    [rows],
  );
  const selectedIndex = listed.indexOf(pane?.selected ?? '');
  const current = pane && driveOf(pane.folder, drives);

  const renderRow = (index: number) => {
    const row = rows[index];
    const { entry } = row;
    return (
      <div
        className={`row commander-row commander-line${row.key === pane?.selected ? ' selected' : ''}${entry?.hidden ? ' hidden' : ''}`}
        onClick={() => onSelect(row.key)}
        onDoubleClick={() => {
          if (opens(row)) {
            onOpen(row.key);
          }
        }}
      >
        <span className="commander-icon">
          <RowIcon row={row} />
        </span>
        <span className="commander-name">{row.base}</span>
        <span className="commander-extension">{row.extension}</span>
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
      className="column commander-pane"
      aria-label={strings.commander.sides[side]}
      onPointerDown={onActivate}
      onFocus={onActivate}
      style={{
        '--commander-extension': String(columns.extension),
        '--commander-size': String(columns.size),
        '--commander-date': String(columns.date),
      }}
    >
      <header className="column-title">
        {drives.length > 0 && (
          <div className="column-start" onClickCapture={onDrivesOpening}>
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
                checked: drive === current,
                onClick: () => onDrive(drive),
              }))}
            />
          </div>
        )}
        <span className="column-name">{pane?.folder}</span>
      </header>
      <ColumnHeader
        sort={pane?.sort}
        columns={columns}
        onSort={onSort}
        onResize={onResize}
        onResized={onResized}
        onReset={onReset}
      />
      <div className="column-body">
        <VirtualRows
          rows={listed}
          renderRow={renderRow}
          selectedKey={pane?.selected}
          label={strings.commander.sides[side]}
          onKeyDown={(event, visible) => {
            if (keyPressed(commanderKeymap.side, event) !== undefined) {
              event.preventDefault();
              onSwitchSide();
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
