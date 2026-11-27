import { strings } from '../../../lib/shared/strings';
import {
  occurrencesOf,
  type FindMark,
} from '../../../components/cells/page/marks';
import type { ScreenRow } from '../../../components/cells/page/lines';
import type { LineRanges } from '../../../components/syntax/page/engine';
import type { ColoredSegment } from '../../../components/syntax/page/lineColors';
import type { DotLook } from '../../../lib/page/dotLook';
import type { TextWidths } from '../../../lib/page/textWidths';
import type { TextRow } from '../shared/protocol';
import type { CellFont } from '../../../components/cells/page/cellLook';
import type {
  SegmentsOf,
  ShownRows,
} from '../../../components/cells/page/cellPainting';
import { seenRows, type SeenRow } from '../../../components/cells/page/seen';
import { CellView } from '../../../components/cells/page/cellView';
import {
  cellWindow,
  holds,
  type CellWindow,
} from '../../../components/cells/page/cellWindow';
import { rowLooks } from './rowLooks';
import { codeSegments } from '../../../components/syntax/page/codeSegments';
import { columnsOf, shownWithin } from '../../../lib/page/columns';

const lineBreak = '\n';

const margin = { rows: 24, columns: 48 };

const noRowsAhead: readonly never[] = [];

export interface CodeLook {
  readonly font: CellFont;
  readonly dotLook: DotLook | undefined;
  readonly widths: TextWidths;
  readonly showWhitespace: boolean;
  readonly marking: boolean;
}

interface Shown {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export function codeRows(text: string): ScreenRow[] {
  const lines = text.split(lineBreak);
  if (lines.length > 1 && lines.at(-1) === '') {
    lines.pop();
  }
  const ended = text.endsWith(lineBreak);
  let start = 0;
  return lines.map((line, at) => {
    const end = start + line.length + 1;
    const row: ScreenRow = {
      start,
      end,
      row: {
        start,
        end,
        text: line,
        ...((ended || at < lines.length - 1) && {
          ending: strings.symbols.lineFeed,
        }),
      },
      index: 0,
      from: 0,
      to: line.length,
      indent: 0,
      breakAt: undefined,
      hanging: [],
    };
    start = end;
    return row;
  });
}

export function lineSegments(
  rows: readonly ScreenRow[],
  lines: LineRanges,
): SegmentsOf {
  const colored = new Map<number, readonly ColoredSegment[]>(
    rows.map((row, line) => [
      row.start,
      codeSegments(row.row.text, [lines[line] ?? []]),
    ]),
  );
  return (row: TextRow) => colored.get(row.start);
}

export class CodeCells {
  private readonly block: HTMLElement;
  private readonly host: HTMLElement;
  private readonly rows: readonly ScreenRow[];
  private readonly columns: number;
  private view: CellView | undefined;
  private drawn: CellWindow | undefined;
  private segmentsOf: SegmentsOf | undefined;
  private copiesIn = occurrencesOf(undefined);
  private finds: ReadonlyMap<number, readonly FindMark[]> | undefined;
  private readonly lineAt: ReadonlyMap<number, number>;

  constructor(
    private readonly code: HTMLElement,
    text: string,
    private look: CodeLook,
    private readonly on: {
      readonly began: (cells: CodeCells) => void;
      readonly scroller: () => Element | null;
    },
  ) {
    this.rows = codeRows(text);
    this.lineAt = new Map(this.rows.map((row, line) => [row.start, line]));
    this.columns = Math.max(
      1,
      ...this.rows.map(
        (row) =>
          columnsOf(row.row.text, look.widths) +
          (row.row.ending === undefined ? 0 : 1),
      ),
    );
    const page = code.ownerDocument;
    this.block = page.createElement('div');
    this.block.className = 'code-cells';
    this.block.style.width = `calc(${this.columns} * var(--text-advance))`;
    this.block.style.height = `calc(${this.rows.length} * var(--viewer-row-height))`;
    this.host = page.createElement('div');
    this.host.className = 'cell-rows';
    this.host.seenRows = () => this.seen();
    this.block.append(this.host);
    code.replaceChildren(this.block);
  }

  private left(): void {
    this.view?.dispose();
    this.view = undefined;
    this.drawn = undefined;
  }

  private current(): ShownRows & { readonly columns: number } {
    const drawn = this.drawn ?? {
      row: 0,
      rows: this.rows.length,
      column: 0,
      columns: this.columns,
    };
    const { look } = this;
    const rows = this.rows.slice(drawn.row, drawn.row + drawn.rows);
    return {
      rows,
      parts: rows.map((row) =>
        shownWithin(
          row.row.text,
          0,
          row.row.text.length,
          drawn.column,
          drawn.column + drawn.columns,
          look.widths,
        ),
      ),
      wrapAt: undefined,
      segmentsOf: this.segmentsOf,
      marksOf: (row) =>
        this.finds === undefined
          ? this.copiesIn(row.row.text)
          : (this.finds.get(this.lineAt.get(row.start) ?? -1) ?? []),
      showWhitespace: look.showWhitespace,
      widths: look.widths,
      first: drawn.column,
      columns: drawn.columns,
    };
  }

  private seen(): SeenRow[] {
    const { columns, ...shown } = this.current();
    const box = this.host.getBoundingClientRect();
    return seenRows(
      { ...shown, selection: this.view?.selection },
      {
        left: box.left,
        top: box.top,
        advance: box.width / Math.max(1, columns),
        rowHeight: box.height / Math.max(1, shown.rows.length),
      },
    );
  }

  private show(): void {
    const { view } = this;
    if (view === undefined) {
      return;
    }
    const { columns, ...shown } = this.current();
    view.show({
      shown,
      columns,
      ahead: noRowsAhead,
      held: this.rows,
      events: {
        chosen: (copy) => {
          this.copiesIn = occurrencesOf(this.look.marking ? copy : undefined);
          this.show();
        },
        move: (by) => {
          const box = this.block.getBoundingClientRect();
          this.on.scroller()?.scrollBy(0, (by * box.height) / this.rows.length);
        },
        began: () => this.on.began(this),
      },
    });
  }

  shown(
    device: GPUDevice | undefined,
    generation: number,
    within: Shown | undefined,
    anew = false,
  ): void {
    const pre = this.code.parentElement?.getBoundingClientRect();
    const box = this.block.getBoundingClientRect();
    if (
      device === undefined ||
      within === undefined ||
      pre === undefined ||
      box.width === 0
    ) {
      this.left();
      return;
    }
    const block = {
      left: box.left,
      top: box.top,
      rows: this.rows.length,
      columns: this.columns,
    };
    const cell = {
      advance: box.width / this.columns,
      rowHeight: box.height / this.rows.length,
    };
    const sight = {
      left: Math.max(within.left, pre.left),
      top: Math.max(within.top, pre.top),
      right: Math.min(within.right, pre.right),
      bottom: Math.min(within.bottom, pre.bottom),
    };
    if (
      !anew &&
      this.view !== undefined &&
      holds(this.drawn, block, cell, sight)
    ) {
      return;
    }
    const drawn = cellWindow(block, cell, sight, margin);
    if (drawn === undefined) {
      this.left();
      return;
    }
    this.drawn = drawn;
    const { style } = this.host;
    style.left = `calc(${drawn.column} * var(--text-advance))`;
    style.top = `calc(${drawn.row} * var(--viewer-row-height))`;
    style.width = `calc(${drawn.columns} * var(--text-advance))`;
    style.height = `calc(${drawn.rows} * var(--viewer-row-height))`;
    this.view ??= new CellView(
      device,
      generation,
      this.host,
      this.code,
      { font: this.look.font, dotLook: this.look.dotLook },
      rowLooks,
      {
        origin: () => {
          const at = this.host.getBoundingClientRect();
          const scroller = this.on.scroller();
          return {
            left:
              at.left +
              (this.code.parentElement?.scrollLeft ?? 0) +
              (scroller?.scrollLeft ?? 0),
            top: at.top + (scroller?.scrollTop ?? 0),
          };
        },
        area: () => this.on.scroller()?.getBoundingClientRect(),
      },
    );
    this.show();
  }

  colored(lines: LineRanges): void {
    this.segmentsOf = lineSegments(this.rows, lines);
    this.show();
  }

  looked(look: CodeLook): void {
    const refont =
      look.font.char !== this.look.font.char ||
      look.font.family !== this.look.font.family ||
      look.font.spacing !== this.look.font.spacing;
    this.look = look;
    if (!look.marking) {
      this.copiesIn = occurrencesOf(undefined);
    }
    if (refont) {
      this.left();
    } else {
      this.show();
    }
  }

  found(finds: ReadonlyMap<number, readonly FindMark[]> | undefined): void {
    this.finds = finds;
    this.show();
  }

  boxOf(line: number, start: number, end: number): DOMRect {
    const box = this.block.getBoundingClientRect();
    const advance = box.width / this.columns;
    const height = box.height / this.rows.length;
    const text = this.rows[line]?.row.text ?? '';
    const from = columnsOf(text.slice(0, start), this.look.widths);
    const to = columnsOf(text.slice(0, end), this.look.widths);
    return new DOMRect(
      box.left + from * advance,
      box.top + line * height,
      Math.max(1, to - from) * advance,
      height,
    );
  }

  clearSelection(): void {
    this.view?.clearSelection();
  }

  dispose(): void {
    this.left();
  }
}
