import type { EditorState } from '@codemirror/state';
import { strings } from '../../../lib/shared/strings';
import { cellWidthsOf, withTabSize } from '../../../lib/page/textWidths';
import { graphemes } from '../../../lib/page/graphemes';
import { drawnTabSize } from './indent';
import { columnsAlong } from '../../../lib/page/columns';
import { type CellTable } from '../../../lib/page/cellTable';

const countedCharacters = 1_000_000;

function charactersIn(text: string): number {
  return text.length > countedCharacters
    ? text.length
    : [...graphemes.segment(text)].length;
}

export function statusOf(state: EditorState, table: CellTable): string {
  const { main, ranges } = state.selection;
  const line = state.doc.lineAt(main.head);
  const column =
    columnsAlong(
      line.text,
      withTabSize(cellWidthsOf(table), drawnTabSize(state)),
    )(main.head - line.from) + 1;
  const characters = ranges.reduce(
    (count, range) =>
      count + charactersIn(state.sliceDoc(range.from, range.to)),
    0,
  );
  return [
    strings.editor.column(column),
    characters > 0 ? strings.editor.selected(characters) : undefined,
    ranges.length > 1 ? strings.editor.cursors(ranges.length) : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(strings.editor.between);
}
