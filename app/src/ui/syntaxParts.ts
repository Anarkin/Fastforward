import type { LineRanges, SyntaxRange } from './syntaxEngine';

const syntaxKinds = [
  'keyword',
  'type',
  'function',
  'string',
  'number',
  'comment',
] as const;

export interface CodePart {
  readonly from: number;
  readonly ends: Uint32Array;
  readonly ranges: Uint32Array;
  readonly done: boolean;
}

const columnBits = 15;
const lengthBits = 14;
const kindShift = columnBits + lengthBits;
const widestColumn = (1 << columnBits) - 1;
const longestRange = (1 << lengthBits) - 1;

function piecesOf(start: number, end: number): number {
  return Math.ceil((end - start) / longestRange);
}

export function packedPart(
  lines: LineRanges,
  from: number,
  done: boolean,
): CodePart {
  const ends = new Uint32Array(lines.length);
  const ranges = new Uint32Array(
    lines.reduce(
      (count, line) =>
        count +
        line.reduce(
          (pieces, { start, end }) => pieces + piecesOf(start, end),
          0,
        ),
      0,
    ),
  );
  let at = 0;
  lines.forEach((line, index) => {
    for (const { start, end, kind } of line) {
      const kindBits = syntaxKinds.indexOf(kind) << kindShift;
      for (
        let piece = start;
        piece < end && piece <= widestColumn;
        piece += longestRange
      ) {
        const length = Math.min(longestRange, end - piece);
        ranges[at] = piece | (length << columnBits) | kindBits;
        at += 1;
      }
    }
    ends[index] = at;
  });
  return {
    from,
    ends,
    ranges: at === ranges.length ? ranges : ranges.slice(0, at),
    done,
  };
}

export function partLine(
  part: CodePart,
  line: number,
): SyntaxRange[] | undefined {
  const index = line - part.from;
  if (index < 0 || index >= part.ends.length) {
    return undefined;
  }
  const ranges: SyntaxRange[] = [];
  const end = part.ends[index] ?? 0;
  for (let at = part.ends[index - 1] ?? 0; at < end; at++) {
    const packed = part.ranges[at] ?? 0;
    const kind = syntaxKinds[packed >>> kindShift];
    if (kind !== undefined) {
      const start = packed & widestColumn;
      ranges.push({
        start,
        end: start + ((packed >>> columnBits) & longestRange),
        kind,
      });
    }
  }
  return ranges;
}

export function partLines(part: CodePart): SyntaxRange[][] {
  return Array.from(
    { length: part.ends.length },
    (_, index) => partLine(part, part.from + index) ?? [],
  );
}
