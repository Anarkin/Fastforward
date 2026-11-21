import { lineHeightOf } from '../../../lib/page/lineHeight';
import type { EditorState, Extension, Line } from '@codemirror/state';
import { layer, type EditorView, type LayerMarker } from '@codemirror/view';
import { keptWrapStarts } from '../../../lib/page/wrapStarts';
import { blankRuns, rowBreaksAt } from '../../../lib/page/rowBreaks';
import { columnsOf } from '../../../lib/page/textColumns';
import type { TextWidths } from '../../../lib/page/textWidths';
import { wrapIndent } from '../../../lib/page/wordWrap';
import { strings } from '../../../lib/shared/strings';
import { layerOrigin, textLeft } from './rows';

export interface WrapMeasure {
  readonly columns: number;
  readonly widths: TextWidths | undefined;
}

type MarkKind = 'break' | 'blank' | 'spaces';

const signs: Record<MarkKind, string> = {
  break: strings.symbols.breaks,
  blank: strings.symbols.tab,
  spaces: '',
};

class BreakMark implements LayerMarker {
  constructor(
    private readonly kind: MarkKind,
    private readonly left: number,
    private readonly column: number,
    private readonly top: number,
    private readonly columns: number,
  ) {}

  eq(other: LayerMarker): boolean {
    return (
      other instanceof BreakMark &&
      other.kind === this.kind &&
      other.left === this.left &&
      other.column === this.column &&
      other.top === this.top &&
      other.columns === this.columns
    );
  }

  draw(): HTMLElement {
    const mark = document.createElement('div');
    mark.className = `wrap-${this.kind}`;
    mark.textContent = signs[this.kind];
    this.place(mark);
    return mark;
  }

  update(mark: HTMLElement, previous: LayerMarker): boolean {
    if (!(previous instanceof BreakMark) || previous.kind !== this.kind) {
      return false;
    }
    this.place(mark);
    return true;
  }

  private place(mark: HTMLElement): void {
    mark.style.left = `calc(${this.left}px + ${this.column} * var(--text-advance))`;
    mark.style.top = `${this.top}px`;
    if (this.kind === 'spaces') {
      mark.style.width = `calc(${this.columns} * var(--text-advance))`;
    }
  }
}

interface Placing {
  readonly view: EditorView;
  readonly measure: WrapMeasure;
  readonly columnsIn: ((part: string) => (index: number) => number) | undefined;
  readonly origin: { readonly left: number; readonly top: number };
  readonly left: number;
  readonly top: number;
  readonly rowHeight: number;
  readonly blanksShown: boolean;
}

const firstStride = 64;

function drawnStarts(view: EditorView, from: number, to: number): number[] {
  const topAt = (pos: number) => view.coordsAtPos(pos, 1)?.top ?? Infinity;
  const starts = [from];
  for (let rowTop = topAt(from); rowTop < Infinity;) {
    const below = (pos: number) => topAt(pos) > rowTop + 1;
    let low = starts[starts.length - 1];
    let high = Math.min(low + firstStride, to);
    for (let stride = firstStride; high < to && !below(high);) {
      low = high;
      stride *= 2;
      high = Math.min(low + stride, to);
    }
    if (!below(high)) {
      break;
    }
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (below(middle)) {
        high = middle;
      } else {
        low = middle;
      }
    }
    starts.push(high);
    rowTop = topAt(high);
  }
  return starts;
}

function marksOfRows(
  placing: Placing,
  line: Line,
  starts: readonly number[],
  rowTop: (row: number) => number | undefined,
): LayerMarker[] {
  const { measure, columnsIn, left } = placing;
  const before = starts[0] > 0 ? [starts[0] - 1] : [];
  const breaks = rowBreaksAt(
    line.text,
    [...before, ...starts],
    measure.columns,
    columnsIn,
    wrapIndent(line.text, measure.columns),
  ).slice(before.length);
  return breaks.flatMap(({ end, blanks }, index) => {
    const y = rowTop(index);
    return y === undefined
      ? []
      : [
          new BreakMark('break', left, end, y, 1),
          ...(placing.blanksShown ? [] : blankRuns(blanks)).map(
            (run) =>
              new BreakMark(
                run.tab ? 'blank' : 'spaces',
                left,
                run.column,
                y,
                run.columns,
              ),
          ),
        ];
  });
}

function lineMarks(
  placing: Placing,
  line: Line,
  range: { readonly from: number; readonly to: number },
): LayerMarker[] {
  const { view, measure, origin, top, rowHeight } = placing;
  const block = view.lineBlockAt(line.from);
  if (block.height < rowHeight * 1.5) {
    return [];
  }
  if (range.from <= line.from && line.to <= range.to) {
    const indent = wrapIndent(line.text, measure.columns);
    const starts = keptWrapStarts(
      line.text,
      measure.columns,
      indent,
      measure.widths,
    );
    return marksOfRows(
      placing,
      line,
      starts,
      (row) => top + block.top + row * rowHeight,
    );
  }
  const drawn = drawnStarts(
    view,
    Math.max(range.from, line.from),
    Math.min(range.to, line.to),
  ).map((start) => start - line.from);
  return marksOfRows(placing, line, drawn, (row) => {
    const placed = view.coordsAtPos(line.from + drawn[row], 1);
    return placed === null ? undefined : placed.top - origin.top;
  });
}

function breakMarkers(
  view: EditorView,
  measure: WrapMeasure | undefined,
  blanksShown: boolean,
): LayerMarker[] {
  if (!view.lineWrapping || measure === undefined) {
    return [];
  }
  const { widths } = measure;
  const origin = layerOrigin(view);
  const placing: Placing = {
    view,
    measure,
    columnsIn: widths && ((part: string) => columnsOf(part, widths)),
    origin,
    left: textLeft(view) - origin.left,
    top: view.documentTop - origin.top,
    rowHeight: lineHeightOf(
      view.contentDOM,
      view.defaultLineHeight,
      devicePixelRatio,
    ),
    blanksShown,
  };
  const marks: LayerMarker[] = [];
  for (const range of view.visibleRanges) {
    for (let at = range.from; at <= range.to;) {
      const line = view.state.doc.lineAt(at);
      at = line.to + 1;
      marks.push(...lineMarks(placing, line, range));
    }
  }
  return marks;
}

export function breakMarks(
  measured: (view: EditorView) => WrapMeasure | undefined,
  shown: (state: EditorState) => boolean,
): Extension {
  return layer({
    above: true,
    class: 'break-mark-layer',
    markers: (view) => breakMarkers(view, measured(view), shown(view.state)),
    update: (update) =>
      update.docChanged ||
      update.viewportChanged ||
      update.geometryChanged ||
      shown(update.startState) !== shown(update.state),
  });
}
