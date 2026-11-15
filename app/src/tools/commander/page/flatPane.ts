import type { FlatProgress } from '../shared/protocol';
import type { Sort } from '../shared/sorts';
import { parentRow, type Row } from './listing';
import { filteredSelection, selectionAfter } from './rowSelection';
import {
  inRepositoryKept,
  marksKept,
  noMarks,
  noRepositories,
  selectionIn,
  type FlatShown,
  type Listed,
  type PaneView,
} from './paneView';

const startedReading: FlatProgress = {
  reading: true,
  stopped: false,
  folders: 0,
  failed: 0,
};

export function flatListed(
  pane: PaneView | undefined,
  sort: Sort,
  {
    folder,
    hidden,
    parent,
    back,
    forward,
    elevated,
    binOff,
    archive,
    selected,
    flat,
  }: Listed & { readonly selected: string | undefined; readonly flat: number },
): PaneView {
  const listed = {
    folder,
    hidden,
    entries: [],
    parent,
    back,
    forward,
    elevated,
    ...(binOff && { binOff }),
    ...(archive !== undefined && { archive }),
  };
  if (pane?.flat?.walk === flat && pane.folder === folder) {
    return {
      ...pane,
      ...listed,
      selected:
        selected !== undefined && pane.rows.some((row) => row.key === selected)
          ? selected
          : pane.selected,
    };
  }
  const rows = parent ? [parentRow] : [];
  const selectedFile =
    pane?.folder === folder
      ? pane.rows.find(
          (row) =>
            row.key === pane.selected &&
            row.entry !== undefined &&
            !row.entry.folder,
        )?.key
      : undefined;
  return {
    ...listed,
    sort,
    rows,
    selected:
      selectedFile ?? selectionAfter(selectionIn(pane), folder, rows, selected),
    marked: noMarks,
    repositories: noRepositories,
    inRepository: inRepositoryKept(pane, folder),
    flat: { walk: flat, progress: startedReading, shown: undefined },
    counting: 0,
  };
}

function flatSelection(
  pane: PaneView,
  rows: readonly Row[],
  shown: FlatShown | undefined,
  complete: boolean,
): string | undefined {
  const { selected } = pane;
  if (shown !== undefined) {
    return filteredSelection(shown.rows, selected);
  }
  if (selected !== undefined && rows.some((row) => row.key === selected)) {
    return selected;
  }
  const before = selectionIn(pane);
  if (before === undefined || before.index !== -1) {
    return selectionAfter(before, pane.folder, rows, undefined);
  }
  return pane.flat?.progress.reading === true || !complete
    ? selected
    : rows.at(0)?.key;
}

export function folderOfSelected(pane: PaneView): string | undefined {
  const row = pane.rows.find((each) => each.key === pane.selected);
  const under = row?.under ?? '';
  return under === '' ? row?.key : under.slice(0, under.search(/[\\/]/));
}

export function withFlatRows(
  pane: PaneView,
  rows: readonly Row[],
  shown: FlatShown | undefined,
  complete: boolean,
): PaneView {
  return {
    ...pane,
    rows,
    selected: flatSelection(pane, rows, shown, complete),
    marked: marksKept(pane, pane.folder, rows),
    flat: pane.flat && { ...pane.flat, shown },
  };
}
