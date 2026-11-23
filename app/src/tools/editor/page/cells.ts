import type { Extension } from '@codemirror/state';
import {
  ViewPlugin,
  type EditorView,
  type PluginValue,
} from '@codemirror/view';
import {
  groundBehind,
  layerOf,
  lookWithin,
  probedRow,
} from '../../../components/cells/page/cellLook';
import type {
  Band,
  RowPart,
  ShownRows,
} from '../../../components/cells/page/cellPainting';
import {
  CellView,
  viewKey,
  type CellLooks,
} from '../../../components/cells/page/cellView';
import { shownWithin } from '../../../components/cells/page/columns';
import {
  gpuDevice,
  gpuGeneration,
  watchGpu,
} from '../../../components/cells/page/gpuDevice';
import {
  wrappedRows,
  type ScreenRow,
  type TextLine,
} from '../../../components/cells/page/lines';
import {
  seenPlaces,
  seenRows,
  type SeenRow,
} from '../../../components/cells/page/seen';
import type { TextLook } from '../../../components/cells/page/textCells';
import { fontDotLook } from '../../../lib/page/dotLook';
import { lineHeightOf } from '../../../lib/page/lineHeight';
import {
  elementWidths,
  fontOf,
  spacingOf,
  type TextWidths,
} from '../../../lib/page/textWidths';
import type { CellTable } from '../../../lib/page/cellTable';
import {
  linesMarked,
  selectionsOf,
  type LinesMarked,
  type LinesShown,
} from './cellLines';
import { scrolledAcross, textAdvance, textStart, wrapColumnsOf } from './rows';

const rowClass = 'cm-line';

const mostCanvas = 8192;

const layoutUnits = 64;

const beyondAscii = /[^\0-\x7f]/;

const noRowsAhead: readonly never[] = [];

function backed(from: Element | null): Element | null {
  let at = from;
  while (at !== null && layerOf(at)[3] === 0) {
    at = at.parentElement;
  }
  return at;
}

function lookOf(host: Element): TextLook {
  const row = probedRow(host, rowClass);
  const look = lookWithin(row, groundBehind(backed(host.parentElement)));
  const border = document.createElement('span');
  border.style.background = 'var(--color-border)';
  row.append(border);
  const line = groundBehind(border);
  row.remove();
  return { ...look, line };
}

const looks: CellLooks = {
  rowClass,
  lookOf,
  pressedAs: () => undefined,
};

interface Windowed {
  readonly top: number;
  readonly bottom: number;
}

interface Painted {
  readonly cells: ShownRows;
  readonly text: number;
  readonly advance: number;
  readonly row: number;
}

export type ShownOf = (view: EditorView) => LinesShown;

class EditorCells implements PluginValue {
  private readonly host: HTMLDivElement;
  private readonly unwatched: () => void;
  private readonly lines = new Map<number, TextLine>();
  private cells: CellView | undefined;
  private drawn: Windowed | undefined;
  private painted: Painted | undefined;
  private widths: TextWidths | undefined;
  private marked:
    | { readonly stamp: readonly unknown[]; readonly lines: LinesMarked }
    | undefined;
  private gone = false;
  private anew = true;
  private across = 0;

  constructor(
    private readonly view: EditorView,
    private readonly table: CellTable,
    private readonly shownOf: ShownOf,
  ) {
    this.host = view.dom.ownerDocument.createElement('div');
    this.host.className = 'editor-cells cell-rows';
    this.host.seenRows = () => this.seen();
    this.host.seenPlaces = (row) =>
      this.painted === undefined ? [] : seenPlaces(this.painted.cells, row);
    view.scrollDOM.append(this.host);
    view.scrollDOM.addEventListener('scroll', this.scrolled, {
      passive: true,
    });
    this.unwatched = watchGpu(() => this.later(true));
    this.later(true);
  }

  update(): void {
    this.later(true);
  }

  destroy(): void {
    this.gone = true;
    this.view.scrollDOM.removeEventListener('scroll', this.scrolled);
    this.unwatched();
    this.cells?.dispose();
    this.host.remove();
  }

  private readonly scrolled = () => this.later(false);

  private readonly showing = {
    key: this,
    read: () => {
      if (this.gone) {
        return;
      }
      const again = this.anew;
      this.anew = false;
      this.show(again);
    },
  };

  private later(anew: boolean): void {
    this.anew ||= anew;
    if (!this.gone) {
      this.view.requestMeasure(this.showing);
    }
  }

  private left(): void {
    this.cells?.dispose();
    this.cells = undefined;
    this.drawn = undefined;
    this.painted = undefined;
    this.host.style.display = 'none';
  }

  private lineOf(
    number: number,
    text: string,
    ending: string | undefined,
  ): TextLine {
    const kept = this.lines.get(number);
    if (kept?.text === text && kept.ending === ending) {
      return kept;
    }
    const line = { start: number, end: number + 1, text, ending };
    this.lines.set(number, line);
    return line;
  }

  private show(anew: boolean): void {
    const { view, host } = this;
    const device = gpuDevice();
    const char = view.contentDOM.isConnected ? textAdvance(view) : 0;
    if (device === undefined || !(char > 0)) {
      this.left();
      return;
    }
    const scroller = view.scrollDOM;
    const lineHeight = lineHeightOf(view.contentDOM, 0, devicePixelRatio);
    const top = scroller.scrollTop;
    const height = scroller.clientHeight;
    const total = view.contentHeight;
    if (!(lineHeight > 0) || !(height > 0)) {
      this.left();
      return;
    }
    const ratio = devicePixelRatio;
    const guard = height / 2;
    const within = scroller.getBoundingClientRect();
    const content = view.contentDOM.getBoundingClientRect();
    const across = Math.max(
      0,
      Math.min(
        scroller.scrollLeft,
        content.right -
          within.left +
          scroller.scrollLeft -
          scroller.clientWidth,
      ),
    );
    const { drawn: before } = this;
    if (
      !anew &&
      before !== undefined &&
      (before.top === 0 || top - guard >= before.top) &&
      (before.bottom >= total || top + height + guard <= before.bottom) &&
      this.across === across &&
      this.painted?.cells.first === this.firstColumn(char)
    ) {
      return;
    }
    this.across = across;
    const margin = Math.max(
      0,
      Math.min(height, (mostCanvas / ratio - height) / 2 - lineHeight),
    );
    const drawn = {
      top: Math.max(0, Math.floor((top - margin) / lineHeight) * lineHeight),
      bottom: Math.min(
        total,
        Math.ceil((top + height + margin) / lineHeight) * lineHeight,
      ),
    };
    if (!(drawn.bottom > drawn.top)) {
      this.left();
      return;
    }
    this.drawn = drawn;
    if (this.widths === undefined || this.widths.char !== char) {
      this.widths = elementWidths(view.contentDOM, this.table);
    }
    const { widths } = this;
    if (widths === undefined) {
      this.left();
      return;
    }
    const family = fontOf(view.contentDOM);
    const font = { char, family, spacing: spacingOf(view.contentDOM) };
    const dotLook = fontDotLook(family, char, 1 / ratio);
    const generation = gpuGeneration();
    const key = viewKey({ font, dotLook }, ratio, generation);
    const hostLeft = within.left - scroller.scrollLeft + across;
    const left = Math.round(hostLeft * ratio);
    const width = Math.round((hostLeft + scroller.clientWidth) * ratio) - left;
    const tall = Math.round((drawn.bottom - drawn.top) * ratio);
    host.style.display = '';
    const start = textStart(view);
    const onPixel = Math.round(start);
    host.style.left = `${across + (start - onPixel) / ratio}px`;
    host.style.top = `${drawn.top}px`;
    host.style.width = `${width / ratio}px`;
    host.style.height = `${tall / ratio}px`;
    if (this.cells?.key !== key) {
      this.cells?.dispose();
      this.cells = new CellView(
        device,
        generation,
        host,
        host,
        { font, dotLook },
        looks,
        {
          origin: () => {
            const at = host.getBoundingClientRect();
            return { left: at.left, top: at.top + scroller.scrollTop };
          },
          area: () => scroller.getBoundingClientRect(),
        },
      );
    }
    const text = onPixel - left;
    this.paint(drawn, text, width, tall, char, lineHeight, widths);
  }

  private firstColumn(char: number): number {
    return scrolledAcross(this.view) / Math.round(char * devicePixelRatio);
  }

  private paint(
    drawn: Windowed,
    text: number,
    width: number,
    height: number,
    char: number,
    lineHeight: number,
    widths: TextWidths,
  ): void {
    const { view, cells } = this;
    if (cells === undefined) {
      return;
    }
    const ratio = devicePixelRatio;
    const advance = Math.round(char * ratio);
    const row = Math.round(lineHeight * ratio);
    const gap =
      parseFloat(
        getComputedStyle(view.contentDOM).getPropertyValue('--line-number-gap'),
      ) || 0;
    const columns = view.lineWrapping ? wrapColumnsOf(view) : undefined;
    const first = this.firstColumn(char);
    const inSight = Math.ceil((width - text) / advance) + 1;
    const shown = this.shownOf(view);
    const { doc } = view.state;
    const rows: ScreenRow[] = [];
    const tops: number[] = [];
    const parts: (RowPart | undefined)[] = [];
    const bands: Band[] = [];
    for (
      let block = view.lineBlockAtHeight(drawn.top);
      block.top < drawn.bottom;
      block = view.lineBlockAt(block.to + 1)
    ) {
      const at = doc.lineAt(block.from);
      const line = this.lineOf(at.number, at.text, shown.endingOf(at));
      const wrapped = wrappedRows(
        line,
        columns,
        beyondAscii.test(line.text) ? widths : undefined,
      );
      for (const [index, part] of wrapped.entries()) {
        const y = block.top + index * lineHeight;
        if (y + lineHeight <= drawn.top || y >= drawn.bottom) {
          continue;
        }
        rows.push(part);
        tops.push(Math.round((y - drawn.top) * ratio));
        parts.push(
          columns === undefined
            ? shownWithin(
                line.text,
                0,
                line.text.length,
                Math.max(0, Math.floor(first) - 1),
                Math.floor(first) + inSight,
                beyondAscii.test(line.text) ? widths : undefined,
              )
            : { from: part.from, to: part.to, column: part.indent },
        );
      }
      const starts = block.top >= drawn.top - lineHeight;
      const above = Math.max(block.top, drawn.top - lineHeight);
      const below = Math.min(
        block.top + wrapped.length * lineHeight,
        drawn.bottom + lineHeight,
      );
      bands.push({
        top: Math.round((above - drawn.top) * ratio),
        height: Math.round((below - above) * ratio),
        numbers: starts ? [String(at.number)] : undefined,
      });
      if (block.to >= doc.length) {
        break;
      }
    }
    const marked = this.markedBy(shown);
    const shownRows: ShownRows = {
      rows,
      parts,
      tops,
      bands,
      wrapAt: columns,
      segmentsOf: marked.segmentsOf,
      marksOf: marked.marksOf,
      selections: selectionsOf(shown.selected, doc),
      showWhitespace: shown.showWhitespace,
      widths,
      first,
      left: text,
      gutter: {
        rights: [text - Math.round(2 * gap * ratio)],
        line: text - Math.round(gap * ratio) - Math.max(1, Math.round(ratio)),
      },
    };
    this.painted = { cells: shownRows, text, advance, row };
    this.host.toggleAttribute('data-rows', rows.length > 0);
    this.host.toggleAttribute(
      'data-colored',
      rows.some(
        (each) =>
          marked
            .segmentsOf?.(each.row)
            ?.some(({ kind }) => kind !== undefined) === true,
      ),
    );
    cells.show({
      shown: shownRows,
      columns: 0,
      ahead: noRowsAhead,
      held: noRowsAhead,
      size: { width, height, clip: text },
      events: {
        chosen: () => undefined,
        move: () => undefined,
      },
    });
  }

  private markedBy(shown: LinesShown): LinesMarked {
    const kept = this.marked;
    if (
      kept?.stamp.length === shown.stamp.length &&
      kept.stamp.every((part, at) => Object.is(part, shown.stamp[at]))
    ) {
      return kept.lines;
    }
    const lines = linesMarked(shown, this.view.state.doc);
    this.marked = { stamp: shown.stamp, lines };
    return lines;
  }

  private seen(): SeenRow[] {
    const { painted, host } = this;
    if (painted === undefined) {
      return [];
    }
    const ratio = devicePixelRatio;
    const box = host.getBoundingClientRect();
    const fine = ratio * layoutUnits;
    return seenRows(painted.cells, {
      left: Math.round((box.left + painted.text / ratio) * fine) / fine,
      top: Math.round(box.top * fine) / fine,
      advance: painted.advance / ratio,
      rowHeight: painted.row / ratio,
      scale: ratio,
    });
  }
}

export const editorCells = (table: CellTable, shownOf: ShownOf): Extension =>
  ViewPlugin.define((view) => new EditorCells(view, table, shownOf));
