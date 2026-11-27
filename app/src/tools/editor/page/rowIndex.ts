import type { Text } from '@codemirror/state';
import { columnsOf } from '../../../lib/page/columns';
import { wrappedLines } from '../../../lib/page/wordWrap';
import type { TextWidths } from '../../../lib/page/textWidths';

export interface WrapMeasure {
  readonly columns: number;
  readonly widths: TextWidths | undefined;
}

export interface RowPlace {
  readonly line: number;
  readonly row: number;
}

const beyondAscii = /[^\0-\x7f]/;

const onOneRow = (line: string, { columns, widths }: WrapMeasure): boolean =>
  !beyondAscii.test(line) && columnsOf(line, widths) <= columns;

export function rowsOfLine(line: string, measure: WrapMeasure): number {
  return onOneRow(line, measure)
    ? 1
    : wrappedLines(line, measure.columns, measure.widths);
}

const mostWrapsKept = 200_000;

export class RowIndex {
  private readonly sums = new WeakMap<Text, Uint32Array>();
  private readonly totals = new WeakMap<Text, number>();
  private readonly wraps = new Map<string, number>();

  constructor(readonly measure: WrapMeasure | undefined) {}

  rows(doc: Text): number {
    return this.measure === undefined ? doc.lines : this.total(doc);
  }

  above(doc: Text, line: number): number {
    const lines = Math.max(0, Math.min(doc.lines, line - 1));
    return this.measure === undefined ? lines : this.first(doc, lines);
  }

  of(doc: Text, line: number): number {
    if (this.measure === undefined) {
      return 1;
    }
    let node = doc;
    let within = Math.max(0, Math.min(doc.lines, line) - 1);
    while (node.children !== null) {
      let found: Text | undefined;
      for (const child of node.children) {
        if (within < child.lines) {
          found = child;
          break;
        }
        within -= child.lines;
      }
      if (found === undefined) {
        return 1;
      }
      node = found;
    }
    const sums = this.summed(node);
    return (sums[within] ?? 0) - (within > 0 ? (sums[within - 1] ?? 0) : 0);
  }

  at(doc: Text, row: number): RowPlace {
    const within = Math.max(0, Math.min(this.rows(doc) - 1, Math.floor(row)));
    return this.measure === undefined
      ? { line: within + 1, row: 0 }
      : this.holding(doc, within, 0);
  }

  private wrapped(line: string, measure: WrapMeasure): number {
    if (onOneRow(line, measure)) {
      return 1;
    }
    const known = this.wraps.get(line);
    if (known !== undefined) {
      return known;
    }
    const rows = wrappedLines(line, measure.columns, measure.widths);
    if (this.wraps.size >= mostWrapsKept) {
      this.wraps.clear();
    }
    this.wraps.set(line, rows);
    return rows;
  }

  private summed(leaf: Text): Uint32Array {
    const known = this.sums.get(leaf);
    if (known !== undefined) {
      return known;
    }
    const sums = new Uint32Array(leaf.lines);
    const { measure } = this;
    let rows = 0;
    let at = 0;
    for (const line of leaf.iterLines()) {
      rows += measure === undefined ? 1 : this.wrapped(line, measure);
      sums[at] = rows;
      at += 1;
    }
    this.sums.set(leaf, sums);
    return sums;
  }

  private total(node: Text): number {
    if (node.children === null) {
      return this.summed(node).at(-1) ?? 0;
    }
    const known = this.totals.get(node);
    if (known !== undefined) {
      return known;
    }
    let rows = 0;
    for (const child of node.children) {
      rows += this.total(child);
    }
    this.totals.set(node, rows);
    return rows;
  }

  private first(node: Text, lines: number): number {
    if (lines <= 0) {
      return 0;
    }
    if (lines >= node.lines) {
      return this.total(node);
    }
    if (node.children === null) {
      return this.summed(node)[lines - 1] ?? 0;
    }
    let rows = 0;
    let left = lines;
    for (const child of node.children) {
      if (left <= 0) {
        break;
      }
      rows += this.first(child, left);
      left -= child.lines;
    }
    return rows;
  }

  private holding(node: Text, row: number, before: number): RowPlace {
    if (node.children === null) {
      const sums = this.summed(node);
      const at = sums.findIndex((sum) => row < sum);
      const within = at === -1 ? sums.length - 1 : at;
      return {
        line: before + within + 1,
        row: row - (within > 0 ? (sums[within - 1] ?? 0) : 0),
      };
    }
    let line = before;
    let left = row;
    for (const child of node.children) {
      const rows = this.total(child);
      if (left < rows) {
        return this.holding(child, left, line);
      }
      left -= rows;
      line += child.lines;
    }
    return { line, row: 0 };
  }
}

export class WidestLine {
  private readonly widest = new WeakMap<Text, number>();

  constructor(private readonly widths: TextWidths | undefined) {}

  columns(node: Text): number {
    const known = this.widest.get(node);
    if (known !== undefined) {
      return known;
    }
    let most = 0;
    if (node.children === null) {
      for (const line of node.iterLines()) {
        most = Math.max(most, columnsOf(line, this.widths));
      }
    } else {
      for (const child of node.children) {
        most = Math.max(most, this.columns(child));
      }
    }
    this.widest.set(node, most);
    return most;
  }
}
