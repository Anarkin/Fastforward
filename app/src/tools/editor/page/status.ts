import type { EditorState } from '@codemirror/state';
import { strings } from '../../../lib/shared/strings';
import { cellWidthsOf } from '../../../lib/page/textWidths';
import { columnsOf } from '../../../lib/page/textColumns';
import { type CellTable } from '../../../lib/page/cellTable';

const graphemes = new Intl.Segmenter(undefined, {
  granularity: 'grapheme',
});

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
    columnsOf(line.text, cellWidthsOf(table))(main.head - line.from) + 1;
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
