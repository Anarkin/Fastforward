import type { ComparedFile } from '../shared/protocol';
import type { Side } from '../shared/sides';
import type { Row } from './listing';
import type { PaneView } from './paneView';

function markedFiles(
  rows: readonly Row[],
  marked: ReadonlySet<string>,
): string[] {
  return rows
    .filter(
      (row) =>
        row.entry !== undefined && !row.entry.folder && marked.has(row.key),
    )
    .map((row) => row.key);
}

function fileOf(
  pane: PaneView | undefined,
  rows: readonly Row[],
  showsCursor: boolean,
): string | undefined {
  if (pane === undefined) {
    return undefined;
  }
  const marked = markedFiles(rows, pane.marked);
  if (marked.length === 1) {
    return marked[0];
  }
  if (!showsCursor) {
    return undefined;
  }
  const selected = rows.find((row) => row.key === pane.selected);
  return selected?.entry !== undefined && !selected.entry.folder
    ? selected.key
    : undefined;
}

export function filesToCompare(
  active: Side,
  panes: Readonly<Record<Side, PaneView | undefined>>,
  shown: Readonly<Record<Side, readonly Row[]>>,
): readonly [ComparedFile, ComparedFile] | readonly [ComparedFile] | undefined {
  const own = panes[active];
  const pair = own === undefined ? [] : markedFiles(shown[active], own.marked);
  if (own !== undefined && pair.length === 2) {
    return [
      { side: active, folder: own.folder, name: pair[0] },
      { side: active, folder: own.folder, name: pair[1] },
    ];
  }
  const left = fileOf(panes.left, shown.left, active === 'left');
  const right = fileOf(panes.right, shown.right, active === 'right');
  if (panes.left !== undefined && panes.right !== undefined) {
    if (left !== undefined && right !== undefined) {
      return [
        { side: 'left', folder: panes.left.folder, name: left },
        { side: 'right', folder: panes.right.folder, name: right },
      ];
    }
  }
  const lone = active === 'left' ? left : right;
  return own === undefined || lone === undefined
    ? undefined
    : [{ side: active, folder: own.folder, name: lone }];
}
