import type { ComparedFile, Side } from '../shared/protocol';
import type { PaneView } from './view';

function markedFiles(pane: PaneView): string[] {
  return pane.rows
    .filter(
      (row) =>
        row.entry !== undefined &&
        !row.entry.folder &&
        pane.marked.has(row.key),
    )
    .map((row) => row.key);
}

function fileOf(pane: PaneView | undefined): string | undefined {
  if (pane === undefined) {
    return undefined;
  }
  const marked = markedFiles(pane);
  if (marked.length === 1) {
    return marked[0];
  }
  const selected = pane.rows.find((row) => row.key === pane.selected);
  return selected?.entry !== undefined && !selected.entry.folder
    ? selected.key
    : undefined;
}

export function filesToCompare(
  active: Side,
  panes: Readonly<Record<Side, PaneView | undefined>>,
): readonly [ComparedFile, ComparedFile] | undefined {
  const own = panes[active];
  const pair = own === undefined ? [] : markedFiles(own);
  if (pair.length === 2) {
    return [
      { side: active, name: pair[0] },
      { side: active, name: pair[1] },
    ];
  }
  const left = fileOf(panes.left);
  const right = fileOf(panes.right);
  return left === undefined || right === undefined
    ? undefined
    : [
        { side: 'left', name: left },
        { side: 'right', name: right },
      ];
}
