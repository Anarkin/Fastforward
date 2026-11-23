import { Facet, type Extension } from '@codemirror/state';
import { type CellTable } from '../../../lib/page/cellTable';
import { editorCells } from './cells';
import { colorsShown } from './colors';
import { marksShown } from './cellMarks';
import { endingAfter, endingsField } from './endings';
import { strings } from '../../../lib/shared/strings';
import type { LineEnding } from '../shared/textMarks';

const { carriageReturn, lineFeed } = strings.symbols;

const endingSigns: Readonly<Record<LineEnding, string>> = {
  lf: lineFeed,
  crlf: `${carriageReturn}${lineFeed}`,
  cr: carriageReturn,
};

export const blanksShown = Facet.define<boolean, boolean>({
  combine: (shown) => shown.some((each) => each),
});

export function appTextLook(table: CellTable): Extension {
  return editorCells(table, (view) => {
    const colors = colorsShown(view);
    const marks = marksShown(view);
    const endings = view.state.field(endingsField, false);
    const { doc } = view.state;
    return {
      showWhitespace: view.state.facet(blanksShown),
      colorsOf: colors.rangesOf,
      endingOf: (line) =>
        line.number === doc.lines
          ? undefined
          : endingSigns[
              endings === undefined ? 'lf' : endingAfter(endings, line.to)
            ],
      marks,
      selected: view.state.selection.ranges.filter(
        ({ from, to }) =>
          !marks.some(
            (mark) =>
              mark.current === true && mark.from === from && mark.to === to,
          ),
      ),
      stamp: [doc, colors.stamp, marks, endings],
    };
  });
}
