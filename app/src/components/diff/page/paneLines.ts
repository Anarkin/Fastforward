import { strings } from '../../../lib/shared/strings';
import type { TextLine } from '../../cells/page/lines';
import { lineKey } from './lines';
import type { Change, DiffRow } from './rows';

export interface PaneLine {
  readonly line: TextLine;
  readonly key: string | undefined;
  readonly change: Change | undefined;
  readonly numbers: readonly (number | undefined)[];
}

type Kept = (PaneLine | null | undefined)[];

const linesOfRows = new WeakMap<readonly DiffRow[], Kept[]>();

const paneOfLine = new WeakMap<TextLine, PaneLine>();

function made(
  row: DiffRow,
  key: string | undefined,
  pane: number,
  index: number,
): PaneLine | null {
  const lined = (
    { text, noNewline }: { readonly text: string; readonly noNewline?: true },
    change: Change | undefined,
    numbers: readonly (number | undefined)[],
    lineOf = key,
  ): PaneLine => ({
    line: {
      start: index,
      end: index + 1,
      text,
      ...(noNewline !== true && { ending: strings.symbols.lineFeed }),
    },
    key: lineOf,
    change,
    numbers,
  });
  switch (row.kind) {
    case 'line':
      return pane === 0
        ? lined(
            row.line,
            row.line.kind === 'context' ? undefined : row.line.kind,
            [row.line.oldNumber, row.line.newNumber],
          )
        : null;
    case 'wholeLine':
      return pane === 0 ? lined(row, undefined, [row.number]) : null;
    case 'split': {
      const cell = pane === 0 ? row.left : row.right;
      const change = pane === 0 ? 'removed' : 'added';
      return cell === undefined
        ? null
        : lined(
            cell.line,
            cell.line.kind === change ? change : undefined,
            [pane === 0 ? cell.line.oldNumber : cell.line.newNumber],
            lineKey(row.file, cell.index),
          );
    }
    default:
      return null;
  }
}

export function paneLine(
  rows: readonly DiffRow[],
  keys: readonly (readonly string[])[],
  pane: number,
  index: number,
): PaneLine | undefined {
  let panes = linesOfRows.get(rows);
  if (panes === undefined) {
    panes = [];
    linesOfRows.set(rows, panes);
  }
  const kept = (panes[pane] ??= []);
  let found = kept[index];
  if (found === undefined) {
    const row = rows[index];
    found = row === undefined ? null : made(row, keys[index]?.[0], pane, index);
    kept[index] = found;
    if (found !== null) {
      paneOfLine.set(found.line, found);
    }
  }
  return found ?? undefined;
}

export const paneOf = (line: TextLine): PaneLine | undefined =>
  paneOfLine.get(line);
