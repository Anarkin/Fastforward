import {
  maxColumnWidth,
  sizedColumns,
  type ColumnWidths,
  type SizedColumn,
  type Sort,
  type SortColumn,
} from '../shared/settings';
import { followDrag } from '../../../ui/followDrag';
import { strings } from '../../../shared/strings';

const columnLabels: Readonly<Record<SortColumn, string>> = {
  name: strings.commander.name,
  extension: strings.commander.extension,
  size: strings.commander.size,
  date: strings.commander.date,
};

export function draggedWidth(
  start: number,
  advance: number,
  widened: number,
): number {
  return Math.min(
    maxColumnWidth,
    Math.max(1, Math.round(start + widened / advance)),
  );
}

function SortButton({
  column,
  sort,
  onSort,
}: {
  column: SortColumn;
  sort: Sort | undefined;
  onSort: (column: SortColumn) => void;
}) {
  return (
    <button className="commander-sort" onClick={() => onSort(column)}>
      {columnLabels[column]}
      {sort?.column === column &&
        (sort.descending
          ? strings.symbols.descending
          : strings.symbols.ascending)}
    </button>
  );
}

export function ColumnHeader({
  sort,
  columns,
  onSort,
  onResize,
  onResized,
  onReset,
}: {
  sort: Sort | undefined;
  columns: ColumnWidths;
  onSort: (column: SortColumn) => void;
  onResize: (column: SizedColumn, width: number) => void;
  onResized: (column: SizedColumn, width: number) => void;
  onReset: (column: SizedColumn) => void;
}) {
  const startResizing = (
    column: SizedColumn,
    event: React.PointerEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const cell = event.currentTarget.parentElement;
    const start = columns[column];
    const advance = (cell?.getBoundingClientRect().width ?? start) / start;
    const startX = event.clientX;
    let width = start;
    followDrag(
      window,
      (move: PointerEvent) => {
        width = draggedWidth(start, advance, startX - move.clientX);
        onResize(column, width);
      },
      () => {
        document.body.classList.remove('resizing');
        if (width !== start) {
          onResized(column, width);
        }
      },
    );
    document.body.classList.add('resizing');
  };

  return (
    <div className="commander-header commander-line">
      <span className="commander-icon" />
      <span className="commander-heading commander-name">
        <SortButton column="name" sort={sort} onSort={onSort} />
      </span>
      {sizedColumns.map((column) => (
        <span key={column} className={`commander-heading commander-${column}`}>
          <span
            className="column-handle"
            onPointerDown={(event) => startResizing(column, event)}
            onDoubleClick={() => onReset(column)}
          />
          <SortButton column={column} sort={sort} onSort={onSort} />
        </span>
      ))}
    </div>
  );
}
