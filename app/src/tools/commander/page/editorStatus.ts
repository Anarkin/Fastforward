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
  const parts = [strings.editor.position(line.number, column)];
  if (ranges.length > 1) {
    parts.push(strings.editor.cursors(ranges.length));
  } else if (!main.empty) {
    parts.push(
      strings.editor.selected(
        state.doc.lineAt(main.to).number -
          state.doc.lineAt(main.from).number +
          1,
        charactersIn(state.sliceDoc(main.from, main.to)),
      ),
    );
  }
  return parts.join(strings.editor.between);
}
