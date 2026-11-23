import { Facet, type Extension } from '@codemirror/state';
import { type CellTable } from '../../../lib/page/cellTable';
import { editorCells } from './cells';
import { colorsShown } from './colors';
import { marksShown } from './cellMarks';
import { endingAfter, endingsField } from './endings';
import { strings } from '../../../lib/shared/strings';

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
        endings === undefined ||
        line.number === doc.lines ||
        endingAfter(endings, line.to) === 'lf'
          ? undefined
          : strings.symbols.carriageReturn,
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
