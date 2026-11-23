import type { CellFont } from '../../cells/page/cellLook';
import type {
  Band,
  RowPart,
  RowTints,
  ShownRows,
} from '../../cells/page/cellPainting';
import { CellView, viewKey, type CellLooks } from '../../cells/page/cellView';
import { shownWithin } from '../../cells/page/columns';
import { gpuDevice, gpuGeneration, watchGpu } from '../../cells/page/gpuDevice';
import {
  wrappedRows,
  type ScreenRow,
  type TextLine,
} from '../../cells/page/lines';
import type { FindMark } from '../../cells/page/marks';
import { seenRows, type SeenRow } from '../../cells/page/seen';
import type { SyntaxRange } from '../../syntax/page/engine';
import type { ColoredSegment } from '../../syntax/page/lineColors';
import type { DotLook } from '../../../lib/page/dotLook';
import type { TextWidths } from '../../../lib/page/textWidths';
import { clicked } from '../../../lib/shared/keymap';
import type { FindRange } from './find';
import { diffKeymap } from './keymap';
import { paneLine, paneOf } from './paneLines';
import { beyondAscii, type WrapColumns } from './rowMeasures';
import type { DiffRow } from './rows';
import { codePadding, numberWidth } from './textLayout';
import { bandTint, diffLookOf, lineClass, rowTints } from './tints';
import type { WordRanges } from './wordDiff';

export interface PaneBox {
  readonly left: number;
  readonly right: number;
  readonly code: number;
}

interface Placed {
  readonly start: number;
  readonly size: number;
}

export interface CellsShown {
  readonly rows: readonly DiffRow[];
  readonly keys: readonly (readonly string[])[];
  readonly wrapping: WrapColumns | undefined;
  readonly widths: TextWidths;
  readonly font: CellFont;
  readonly dotLook: DotLook | undefined;
  readonly lineHeight: number;
  readonly showWhitespace: boolean;
  readonly syntax: Pick<ReadonlyMap<string, readonly SyntaxRange[]>, 'get'>;
  readonly words: WordRanges;
  readonly finds: Pick<ReadonlyMap<string, readonly FindRange[]>, 'get'>;
  readonly foundKey: string | undefined;
  readonly found: FindRange | undefined;
  readonly copiesOf: ((text: string) => readonly FindRange[]) | undefined;
  readonly placeOf: (index: number) => Placed | undefined;
  readonly boxes: () => readonly PaneBox[];
  readonly sideways: () => number;
  readonly chosen: (copy: string | undefined) => void;
  readonly sized: (index: number, height: number) => void;
  readonly stamp: readonly unknown[];
}

interface Windowed {
  readonly first: number;
  readonly last: number;
  readonly top: number;
  readonly bottom: number;
}

const looks: CellLooks = {
  rowClass: lineClass,
  textClass: 'code',
  lookOf: diffLookOf,
  pressedAs: (press) => clicked(diffKeymap.selectText, press),
};

const mostCanvas = 8192;

const noMarks: readonly FindMark[] = [];

const noRowsAhead: readonly never[] = [];

const numberPadding = 6;

export function rowAt(
  count: number,
  placeOf: (index: number) => Placed | undefined,
  offset: number,
): number {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((placeOf(middle)?.start ?? Infinity) <= offset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return Math.max(0, low - 1);
}

export function windowAround(
  count: number,
  placeOf: (index: number) => Placed | undefined,
  top: number,
  view: number,
  margin: number,
  line: number,
): Windowed | undefined {
  const ends = placeOf(count - 1);
  if (count === 0 || ends === undefined || !(line > 0)) {
    return undefined;
  }
  const from = Math.max(0, Math.floor((top - margin) / line) * line);
  const to = Math.min(
    ends.start + ends.size,
    Math.ceil((top + view + margin) / line) * line,
  );
  return to > from
    ? {
        first: rowAt(count, placeOf, from),
        last: rowAt(count, placeOf, to - line / 2),
        top: from,
        bottom: to,
      }
    : undefined;
}

export function segmentsOfLine(
  text: string,
  ranges: readonly SyntaxRange[],
): ColoredSegment[] {
  const segments: ColoredSegment[] = [];
  let at = 0;
  for (const { start, end, kind } of ranges) {
    if (start > at) {
      segments.push({ text: text.slice(at, start) });
    }
    segments.push({ text: text.slice(start, end), kind });
    at = end;
  }
  if (at < text.length) {
    segments.push({ text: text.slice(at) });
  }
  return segments;
}

function kept<Found>(
  find: (line: TextLine) => Found,
): (line: TextLine) => Found {
  const known = new WeakMap<TextLine, { readonly found: Found }>();
  return (line) => {
    let had = known.get(line);
    if (had === undefined) {
      had = { found: find(line) };
      known.set(line, had);
    }
    return had.found;
  };
}

interface Derived {
  readonly from: readonly unknown[];
  readonly segmentsOf: (
    line: TextLine,
  ) => readonly ColoredSegment[] | undefined;
  readonly tintsOf: (line: TextLine) => RowTints | undefined;
  readonly marksOf: (row: ScreenRow) => readonly FindMark[];
}

function derived(shown: CellsShown): Derived {
  const { syntax, words, finds, foundKey, found, copiesOf } = shown;
  const marks = kept((line): readonly FindMark[] => {
    const key = paneOf(line)?.key;
    const ranges = key === undefined ? undefined : finds.get(key);
    if (ranges !== undefined && ranges.length > 0) {
      return ranges.map(({ start, end }) => ({
        start,
        end,
        current:
          key === foundKey && found?.start === start && found.end === end,
      }));
    }
    const copies = copiesOf?.(line.text) ?? noMarks;
    return copies.length === 0
      ? noMarks
      : copies.map(({ start, end }) => ({
          start,
          end,
          current: false,
          occurrence: true as const,
        }));
  });
  return {
    from: [syntax, words, finds, foundKey, found, copiesOf],
    segmentsOf: kept((line) => {
      const key = paneOf(line)?.key;
      const ranges = key === undefined ? undefined : syntax.get(key);
      return ranges === undefined || ranges.length === 0
        ? undefined
        : segmentsOfLine(line.text, ranges);
    }),
    tintsOf: kept((line) => {
      const lined = paneOf(line);
      return lined === undefined
        ? undefined
        : rowTints(
            lined.change,
            lined.key === undefined ? undefined : words.get(lined.key),
          );
    }),
    marksOf: (row) => marks(row.row),
  };
}

const sameFrom = (one: readonly unknown[], other: readonly unknown[]) =>
  one.length === other.length &&
  one.every((part, at) => Object.is(part, other[at]));

export class DiffCells {
  private readonly views: (CellView | undefined)[] = [];
  private readonly viewed: (HTMLElement | undefined)[] = [];
  private readonly painted: (
    | {
        readonly cells: ShownRows;
        readonly text: number;
        readonly advance: number;
        readonly row: number;
      }
    | undefined
  )[] = [];
  private readonly unwatched: () => void;
  private shown: CellsShown | undefined;
  private derived: Derived | undefined;
  private drawn: Windowed | undefined;
  private held: (readonly ScreenRow[] | undefined)[] = [];
  private frame = 0;

  constructor(
    private readonly list: HTMLElement,
    private readonly spacer: HTMLElement,
    private readonly hosts: readonly HTMLElement[],
  ) {
    list.addEventListener('scroll', this.later, { passive: true });
    this.unwatched = watchGpu(this.anew);
  }

  private readonly later = () => {
    if (this.frame === 0) {
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.update(false);
      });
    }
  };

  private readonly anew = () => {
    this.update(true);
  };

  show(shown: CellsShown): void {
    const before = this.shown;
    if (before?.rows !== shown.rows || before.keys !== shown.keys) {
      this.held = [];
    }
    this.shown = shown;
    const next = derived(shown);
    if (this.derived === undefined || !sameFrom(this.derived.from, next.from)) {
      this.derived = next;
    }
    this.update(before === undefined || !sameFrom(before.stamp, shown.stamp));
  }

  moved(): void {
    this.anew();
  }

  private left(): void {
    for (const view of this.views) {
      view?.dispose();
    }
    this.views.length = 0;
    this.viewed.length = 0;
    this.drawn = undefined;
  }

  private columnsOf(pane: number): number | undefined {
    const wrapping = this.shown?.wrapping;
    return wrapping === undefined
      ? undefined
      : pane === 0
        ? wrapping.left
        : wrapping.right;
  }

  private partsOf(pane: number, index: number): readonly ScreenRow[] {
    const { shown } = this;
    const lined =
      shown === undefined
        ? undefined
        : paneLine(shown.rows, shown.keys, pane, index);
    return lined === undefined || shown === undefined
      ? noRowsAhead
      : wrappedRows(
          lined.line,
          this.columnsOf(pane),
          beyondAscii.test(lined.line.text) ? shown.widths : undefined,
        );
  }

  private heldOf(pane: number): readonly ScreenRow[] {
    const { shown } = this;
    if (shown === undefined) {
      return noRowsAhead;
    }
    return (this.held[pane] ??= shown.rows.flatMap((_, index) => {
      const lined = paneLine(shown.rows, shown.keys, pane, index);
      return lined === undefined
        ? []
        : [
            {
              start: index,
              end: index + 1,
              row: lined.line,
              index: 0,
              from: 0,
              to: lined.line.text.length,
              indent: 0,
              breakAt: undefined,
              hanging: [],
            },
          ];
    }));
  }

  private resized(drawn: Windowed, panes: number): boolean {
    const { shown } = this;
    if (shown?.wrapping === undefined) {
      return false;
    }
    let changed = false;
    for (let index = drawn.first; index <= drawn.last; index++) {
      const most = Math.max(
        ...Array.from(
          { length: panes },
          (_, pane) => this.partsOf(pane, index).length,
        ),
      );
      const place = shown.placeOf(index);
      const height = most * shown.lineHeight;
      if (most > 0 && place !== undefined && place.size !== height) {
        shown.sized(index, height);
        changed = true;
      }
    }
    return changed;
  }

  private update(anew: boolean): void {
    const { shown, list } = this;
    const device = gpuDevice();
    const boxes = shown?.boxes() ?? [];
    if (
      shown === undefined ||
      device === undefined ||
      boxes.length === 0 ||
      !(shown.font.char > 0)
    ) {
      this.left();
      return;
    }
    const ratio = devicePixelRatio;
    const top = list.scrollTop;
    const view = list.clientHeight;
    const guard = view / 2;
    const { drawn: before } = this;
    const count = shown.rows.length;
    const total = shown.placeOf(count - 1);
    const end = total === undefined ? 0 : total.start + total.size;
    if (
      !anew &&
      before !== undefined &&
      (before.top === 0 || top - guard >= before.top) &&
      (before.bottom >= end || top + view + guard <= before.bottom)
    ) {
      return;
    }
    const margin = Math.max(
      0,
      Math.min(view, (mostCanvas / ratio - view) / 2 - shown.lineHeight),
    );
    const drawn = windowAround(
      count,
      shown.placeOf,
      top,
      view,
      margin,
      shown.lineHeight,
    );
    if (drawn === undefined) {
      this.left();
      return;
    }
    if (this.resized(drawn, boxes.length)) {
      return;
    }
    this.drawn = drawn;
    const generation = gpuGeneration();
    const key = viewKey(
      { font: shown.font, dotLook: shown.dotLook },
      ratio,
      generation,
    );
    const within = this.spacer.getBoundingClientRect();
    for (let pane = this.hosts.length; pane < this.views.length; pane++) {
      this.views[pane]?.dispose();
      this.views[pane] = undefined;
      this.viewed[pane] = undefined;
    }
    for (const [pane, host] of this.hosts.entries()) {
      const box = boxes[pane];
      if (box === undefined) {
        this.views[pane]?.dispose();
        this.views[pane] = undefined;
        this.viewed[pane] = undefined;
        host.style.display = 'none';
        continue;
      }
      const left = Math.round(box.left * ratio);
      const width = Math.round(box.right * ratio) - left;
      const height = Math.round((drawn.bottom - drawn.top) * ratio);
      host.style.display = '';
      host.style.left = `${left / ratio - within.left}px`;
      host.style.top = `${drawn.top}px`;
      host.style.width = `${width / ratio}px`;
      host.style.height = `${height / ratio}px`;
      if (this.views[pane]?.key !== key || this.viewed[pane] !== host) {
        this.views[pane]?.dispose();
        this.viewed[pane] = host;
        host.seenRows = () => this.seen(pane);
        this.views[pane] = new CellView(
          device,
          generation,
          host,
          this.spacer,
          { font: shown.font, dotLook: shown.dotLook },
          looks,
          {
            origin: () => {
              const at = host.getBoundingClientRect();
              return { left: at.left, top: at.top + list.scrollTop };
            },
            area: () => list.getBoundingClientRect(),
          },
        );
      }
      this.paint(pane, box, left, width, height, drawn);
    }
  }

  private paint(
    pane: number,
    box: PaneBox,
    left: number,
    width: number,
    height: number,
    drawn: Windowed,
  ): void {
    const { shown, derived: marked } = this;
    const view = this.views[pane];
    if (shown === undefined || marked === undefined || view === undefined) {
      return;
    }
    const ratio = devicePixelRatio;
    const text = Math.round((box.code + codePadding) * ratio) - left;
    const advance = Math.round(shown.font.char * ratio);
    const row = Math.round(shown.lineHeight * ratio);
    const columns = this.columnsOf(pane);
    const first =
      columns === undefined
        ? Math.round(shown.sideways() * ratio) / advance
        : 0;
    const inSight = Math.ceil((width - text) / advance) + 1;
    const rows: ScreenRow[] = [];
    const tops: number[] = [];
    const parts: (RowPart | undefined)[] = [];
    const bands: Band[] = [];
    for (let index = drawn.first; index <= drawn.last; index++) {
      const lined = paneLine(shown.rows, shown.keys, pane, index);
      const place = shown.placeOf(index);
      if (lined === undefined || place === undefined) {
        continue;
      }
      const wrapped = this.partsOf(pane, index);
      const line = shown.lineHeight;
      const from = Math.max(0, Math.floor((drawn.top - place.start) / line));
      const to = Math.min(
        wrapped.length,
        Math.ceil((drawn.bottom - place.start) / line),
      );
      for (let at = from; at < to; at++) {
        const part = wrapped[at];
        if (part === undefined) {
          continue;
        }
        rows.push(part);
        tops.push(Math.round((place.start + at * line - drawn.top) * ratio));
        parts.push(
          columns === undefined
            ? shownWithin(
                lined.line.text,
                0,
                lined.line.text.length,
                Math.max(0, Math.floor(first) - 1),
                Math.floor(first) + inSight,
                beyondAscii.test(lined.line.text) ? shown.widths : undefined,
              )
            : { from: part.from, to: part.to, column: part.indent },
        );
      }
      const starts = place.start >= drawn.top - line;
      const top = Math.max(place.start, drawn.top - line);
      const bottom = Math.min(place.start + place.size, drawn.bottom + line);
      bands.push({
        top: Math.round((top - drawn.top) * ratio),
        height: Math.round((bottom - top) * ratio),
        tint: bandTint(
          lined.change,
          lined.key === undefined ? undefined : shown.words.get(lined.key),
        ),
        numbers: starts
          ? lined.numbers.map((number) =>
              number === undefined ? undefined : String(number),
            )
          : undefined,
      });
    }
    const numbers = Math.round((box.code - box.left) / numberWidth);
    const line = text - Math.floor(codePadding * ratio);
    const cells: ShownRows = {
      rows,
      parts,
      tops,
      bands,
      wrapAt: columns,
      segmentsOf: marked.segmentsOf,
      marksOf: marked.marksOf,
      tintsOf: marked.tintsOf,
      showWhitespace: shown.showWhitespace,
      widths: shown.widths,
      first,
      left: text,
      gutter: {
        rights: Array.from(
          { length: numbers },
          (_, column) =>
            text -
            Math.round(
              (codePadding +
                numberPadding +
                (numbers - 1 - column) * numberWidth) *
                ratio,
            ),
        ),
        line,
      },
    };
    this.painted[pane] = { cells, text, advance, row };
    const host = this.viewed[pane];
    host?.toggleAttribute('data-rows', rows.length > 0);
    host?.toggleAttribute(
      'data-colored',
      rows.some(
        (each) =>
          marked
            .segmentsOf(each.row)
            ?.some(({ kind }) => kind !== undefined) === true,
      ),
    );
    view.show({
      shown: cells,
      columns: 0,
      ahead: noRowsAhead,
      held: () => this.heldOf(pane),
      size: { width, height, clip: text },
      events: {
        chosen: shown.chosen,
        move: (by) => this.list.scrollBy(0, by * shown.lineHeight),
        began: () => {
          for (const [other, each] of this.views.entries()) {
            if (other !== pane) {
              each?.clearSelection();
            }
          }
        },
      },
    });
  }

  private seen(pane: number): SeenRow[] {
    const painted = this.painted[pane];
    const host = this.viewed[pane];
    if (painted === undefined || host === undefined) {
      return [];
    }
    const ratio = devicePixelRatio;
    const box = host.getBoundingClientRect();
    return seenRows(
      { ...painted.cells, selection: this.views[pane]?.selection },
      {
        left: box.left + painted.text / ratio,
        top: box.top,
        advance: painted.advance / ratio,
        rowHeight: painted.row / ratio,
        scale: ratio,
      },
    );
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.list.removeEventListener('scroll', this.later);
    this.unwatched();
    this.left();
  }
}
