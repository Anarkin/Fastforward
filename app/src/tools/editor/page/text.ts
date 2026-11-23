import { Facet, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import { columnsOf } from '../../../components/cells/page/columns';
import { elementWidths, type TextWidths } from '../../../lib/page/textWidths';
import { type CellTable } from '../../../lib/page/cellTable';
import { wrapColumnsOf } from './rows';
import { gapHeights, rowsOfLine, type WrapMeasure } from './gapHeights';
import { editorCells } from './cells';
import { colorsShown } from './colors';
import { marksShown } from './cellMarks';
import { endingAfter, endingsField } from './endings';
import { strings } from '../../../lib/shared/strings';

export const blanksShown = Facet.define<boolean, boolean>({
  combine: (shown) => shown.some((each) => each),
});

const beyondAscii = /[^\0-\x7f]/;

const rowLines = new Map<number, Decoration>();

function rowsLine(rows: number): Decoration {
  let line = rowLines.get(rows);
  if (line === undefined) {
    line = Decoration.line({ attributes: { style: `--rows: ${rows}` } });
    rowLines.set(rows, line);
  }
  return line;
}

const columnsLine = (columns: number): Decoration =>
  Decoration.line({
    class: 'gridded',
    attributes: { style: `--columns: ${columns}` },
  });

class LineRows implements PluginValue {
  private widths: TextWidths | undefined;
  private columns: number | undefined;
  private wrapping: boolean;
  private apart: readonly number[];
  rows: DecorationSet;

  constructor(
    private readonly view: EditorView,
    private readonly table: CellTable,
  ) {
    this.wrapping = view.lineWrapping;
    this.apart = this.drawnApart();
    this.rows = this.build();
  }

  get wrapMeasure(): WrapMeasure | undefined {
    return this.wrapping && this.columns !== undefined
      ? { columns: this.columns, widths: this.widths }
      : undefined;
  }

  update(update: ViewUpdate): void {
    const measured = update.geometryChanged && this.measure();
    const rewrapped = this.wrapping !== this.view.lineWrapping;
    this.wrapping = this.view.lineWrapping;
    const apart = this.drawnApart();
    const moved =
      apart.length !== this.apart.length ||
      apart.some((from, at) => from !== this.apart[at]);
    this.apart = apart;
    if (
      measured ||
      rewrapped ||
      moved ||
      update.docChanged ||
      update.viewportChanged
    ) {
      this.rows = this.build();
    }
  }

  private drawnApart(): number[] {
    const { state, visibleRanges } = this.view;
    const { anchor, head } = state.selection.main;
    const starts = [anchor, head].map((at) => state.doc.lineAt(at).from);
    return [...new Set(starts)].filter(
      (start) =>
        !visibleRanges.some(({ from, to }) => from <= start && start <= to),
    );
  }

  private measure(): boolean {
    const { contentDOM } = this.view;
    if (!contentDOM.isConnected) {
      return false;
    }
    const widths = elementWidths(contentDOM, this.table);
    const columns = widths === undefined ? undefined : wrapColumnsOf(this.view);
    const changed =
      columns !== this.columns || widths?.char !== this.widths?.char;
    if (widths?.char !== this.widths?.char) {
      this.widths = widths && { char: widths.char, of: widths.of };
    }
    this.columns = columns;
    return changed;
  }

  private build(): DecorationSet {
    const measure = this.wrapMeasure;
    const { widths } = this;
    if (measure === undefined && (this.wrapping || widths === undefined)) {
      return Decoration.none;
    }
    const { state, visibleRanges } = this.view;
    const lines: Range<Decoration>[] = [];
    const seen = new Set<number>();
    const drawn = [
      ...visibleRanges,
      ...this.apart.map((from) => ({ from, to: from })),
    ];
    for (const { from, to } of drawn) {
      for (let at = from; at <= to;) {
        const line = state.doc.lineAt(at);
        at = line.to + 1;
        if (seen.has(line.number)) {
          continue;
        }
        seen.add(line.number);
        if (measure !== undefined) {
          const rows = rowsOfLine(line.text, measure);
          if (rows > 1) {
            lines.push(rowsLine(rows).range(line.from));
          }
        } else if (beyondAscii.test(line.text)) {
          lines.push(
            columnsLine(columnsOf(line.text, widths)).range(line.from),
          );
        }
      }
    }
    return Decoration.set(lines, true);
  }
}

export function appTextLook(table: CellTable): Extension {
  const look = ViewPlugin.define((view) => new LineRows(view, table), {
    decorations: (rows) => rows.rows,
  });
  return [
    EditorView.editorAttributes.of({ class: 'editor-text' }),
    editorCells(table, (view) => {
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
    }),
    gapHeights((view) => view.plugin(look)?.wrapMeasure),
    look,
  ];
}
