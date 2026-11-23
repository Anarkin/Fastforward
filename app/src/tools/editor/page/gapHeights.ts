import type { Text } from '@codemirror/state';
import {
  ViewPlugin,
  type EditorView,
  type PluginValue,
  type ViewUpdate,
} from '@codemirror/view';
import { wrappedLines } from '../../../lib/page/wordWrap';
import type { TextWidths } from '../../../lib/page/textWidths';
import { wrapColumnsOf } from './rows';

export interface WrapMeasure {
  readonly columns: number;
  readonly widths: TextWidths | undefined;
}

const beyondAscii = /[^\0-\x7f]/;

const countedUpTo = 10_000_000;

export function rowsOfLine(line: string, measure: WrapMeasure): number {
  return line.length <= measure.columns &&
    !line.includes('\t') &&
    !beyondAscii.test(line)
    ? 1
    : wrappedLines(line, measure.columns, measure.widths);
}

export class RowCounts {
  private readonly totals = new WeakMap<Text, number>();

  constructor(readonly measure: WrapMeasure) {}

  between(doc: Text, from: number, to: number): number {
    return this.within(doc, 0, from, to);
  }

  private within(node: Text, start: number, from: number, to: number): number {
    if (from <= start && start + node.length <= to) {
      return this.total(node);
    }
    let rows = 0;
    let at = start;
    if (node.children === null) {
      for (const line of node.iterLines()) {
        if (at + line.length >= from && at <= to) {
          rows += rowsOfLine(line, this.measure);
        }
        at += line.length + 1;
      }
      return rows;
    }
    for (const child of node.children) {
      if (at + child.length >= from && at <= to) {
        rows += this.within(child, at, from, to);
      }
      at += child.length + 1;
    }
    return rows;
  }

  private total(node: Text): number {
    const known = this.totals.get(node);
    if (known !== undefined) {
      return known;
    }
    let rows = 0;
    if (node.children === null) {
      for (const line of node.iterLines()) {
        rows += rowsOfLine(line, this.measure);
      }
    } else {
      for (const child of node.children) {
        rows += this.total(child);
      }
    }
    this.totals.set(node, rows);
    return rows;
  }
}

interface HeightGuess {
  readonly doc: Text;
  readonly lineHeight: number;
  readonly lineWrapping: boolean;
  heightForGap: (from: number, to: number) => number;
}

function isGuess(value: unknown): value is HeightGuess {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'heightForGap') === 'function' &&
    typeof Reflect.get(value, 'lineHeight') === 'number' &&
    typeof Reflect.get(value, 'doc') === 'object'
  );
}

function guessOf(view: EditorView): HeightGuess | undefined {
  const state: unknown = Reflect.get(view, 'viewState');
  const guess: unknown =
    typeof state === 'object' && state !== null
      ? Reflect.get(state, 'heightOracle')
      : undefined;
  return isGuess(guess) ? guess : undefined;
}

const sameMeasure = (one: WrapMeasure, other: WrapMeasure) =>
  one.columns === other.columns && one.widths?.char === other.widths?.char;

function guessAgain(view: EditorView): void {
  const state: unknown = Reflect.get(view, 'viewState');
  if (typeof state === 'object' && state !== null) {
    Reflect.set(state, 'mustMeasureContent', 'refresh');
    view.requestMeasure();
  }
}

class GapHeights implements PluginValue {
  private counts: RowCounts | undefined;
  private drawn: WrapMeasure | undefined;

  constructor(
    private readonly view: EditorView,
    private readonly measureOf: (view: EditorView) => WrapMeasure | undefined,
  ) {
    const guess = guessOf(view);
    if (guess === undefined) {
      return;
    }
    const guessed = guess.heightForGap.bind(guess);
    guess.heightForGap = (from, to) => {
      const counts =
        guess.lineWrapping && guess.doc.length <= countedUpTo
          ? this.countsNow()
          : undefined;
      return counts === undefined
        ? guessed(from, to)
        : counts.between(guess.doc, from, to) * guess.lineHeight;
    };
  }

  update(update: ViewUpdate): void {
    if (update.geometryChanged) {
      this.drawn = undefined;
    }
    const measure = this.measureOf(update.view);
    if (
      measure !== undefined &&
      this.counts !== undefined &&
      !sameMeasure(this.counts.measure, measure)
    ) {
      this.counts = new RowCounts(measure);
      guessAgain(update.view);
    }
  }

  private countsNow(): RowCounts | undefined {
    const measure = this.measureOf(this.view) ?? this.measured();
    if (measure === undefined) {
      return undefined;
    }
    if (
      this.counts === undefined ||
      !sameMeasure(this.counts.measure, measure)
    ) {
      this.counts = new RowCounts(measure);
    }
    return this.counts;
  }

  private measured(): WrapMeasure | undefined {
    if (
      this.drawn === undefined &&
      this.view.dom.isConnected &&
      this.view.contentDOM.getBoundingClientRect().width > 0
    ) {
      this.drawn = { columns: wrapColumnsOf(this.view), widths: undefined };
    }
    return this.drawn;
  }
}

export function gapHeights(
  measureOf: (view: EditorView) => WrapMeasure | undefined,
): ViewPlugin<GapHeights> {
  return ViewPlugin.define((view) => new GapHeights(view, measureOf));
}
