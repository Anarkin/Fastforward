import {
  RangeSet,
  RangeValue,
  type ChangeSet,
  type Text,
} from '@codemirror/state';

export type LineEnding = 'lf' | 'crlf' | 'cr';

export interface StrayEnding {
  readonly at: number;
  readonly ending: LineEnding;
}

export interface KeptBytes {
  readonly at: number;
  readonly bytes: readonly number[];
}

export const keptPlaceholder = '�';

const lineEndings: readonly unknown[] = ['lf', 'crlf', 'cr'];

export const isLineEnding = (value: unknown): value is LineEnding =>
  lineEndings.includes(value);

export class EndingMark extends RangeValue {
  override startSide = 1;
  override endSide = -1;

  constructor(readonly ending: LineEnding) {
    super();
  }

  override eq(other: RangeValue): boolean {
    return other instanceof EndingMark && other.ending === this.ending;
  }
}

export class KeptMark extends RangeValue {
  override startSide = 1;
  override endSide = -1;

  constructor(readonly bytes: readonly number[]) {
    super();
  }

  override eq(other: RangeValue): boolean {
    return (
      other instanceof KeptMark &&
      other.bytes.length === this.bytes.length &&
      other.bytes.every((byte, index) => byte === this.bytes[index])
    );
  }
}

const onCharacter = (doc: Text, at: number, character: string) =>
  Number.isSafeInteger(at) &&
  at >= 0 &&
  at < doc.length &&
  doc.sliceString(at, at + 1) === character;

export function strayMarks(
  doc: Text,
  strays: readonly StrayEnding[],
): RangeSet<EndingMark> {
  return RangeSet.of(
    strays
      .filter(({ at }) => onCharacter(doc, at, '\n'))
      .map(({ at, ending }) => new EndingMark(ending).range(at, at + 1)),
    true,
  );
}

export function keptMarks(
  doc: Text,
  kept: readonly KeptBytes[],
): RangeSet<KeptMark> {
  return RangeSet.of(
    kept
      .filter(({ at }) => onCharacter(doc, at, keptPlaceholder))
      .map(({ at, bytes }) => new KeptMark(bytes).range(at, at + 1)),
    true,
  );
}

export function movedMarks<Mark extends RangeValue>(
  marks: RangeSet<Mark>,
  changes: ChangeSet,
): RangeSet<Mark> {
  let moved = marks.map(changes);
  changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    if (toB > fromB) {
      moved = moved.update({
        filter: (from, to) => !(from >= fromB && to <= toB),
        filterFrom: fromB,
        filterTo: toB,
      });
    }
  });
  return moved;
}

export function marksListed<Mark extends RangeValue, Listed>(
  marks: RangeSet<Mark>,
  listed: (at: number, mark: Mark) => Listed,
): Listed[] {
  const all: Listed[] = [];
  for (const cursor = marks.iter(); cursor.value !== null; cursor.next()) {
    all.push(listed(cursor.from, cursor.value));
  }
  return all;
}
