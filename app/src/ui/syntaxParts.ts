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

const columnBits = 12;
const widestColumn = (1 << columnBits) - 1;

export function packedPart(
  lines: LineRanges,
  from: number,
  done: boolean,
): CodePart {
  const ends = new Uint32Array(lines.length);
  const ranges = new Uint32Array(
    lines.reduce((count, line) => count + line.length, 0),
  );
  let at = 0;
  lines.forEach((line, index) => {
    for (const { start, end, kind } of line) {
      if (end <= widestColumn) {
        ranges[at] =
          start |
          (end << columnBits) |
          (syntaxKinds.indexOf(kind) << (columnBits * 2));
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
    const kind = syntaxKinds[packed >>> (columnBits * 2)];
    if (kind !== undefined) {
      ranges.push({
        start: packed & widestColumn,
        end: (packed >>> columnBits) & widestColumn,
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
