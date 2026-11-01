import type { TextRow } from '../shared/protocol';
import type { CodeSegment } from '../../../ui/syntax';
import type { LineRanges } from '../../../ui/syntaxEngine';

export interface ColoredText {
  readonly lines: readonly string[];
  readonly lineStarts: readonly number[];
  readonly ranges: LineRanges;
}

function bytesOf(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
}

function byteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    bytes += bytesOf(char);
  }
  return bytes;
}

export function coloredText(text: string, ranges: LineRanges): ColoredText {
  const lines = text.split('\n');
  const lineStarts: number[] = [];
  let at = 0;
  for (const line of lines) {
    lineStarts.push(at);
    at += byteLength(line) + 1;
  }
  return { lines, lineStarts, ranges };
}

function lineAt(starts: readonly number[], position: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((starts[middle] ?? 0) <= position) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

function charAt(line: string, bytes: number): number | undefined {
  let counted = 0;
  let chars = 0;
  for (const char of line) {
    if (counted >= bytes) {
      break;
    }
    counted += bytesOf(char);
    chars += char.length;
  }
  return counted === bytes ? chars : undefined;
}

export function rowSegments(
  colored: ColoredText,
  row: TextRow,
): CodeSegment[] | undefined {
  const index = lineAt(colored.lineStarts, row.start);
  const line = colored.lines[index];
  const from =
    line === undefined
      ? undefined
      : charAt(line, row.start - (colored.lineStarts[index] ?? 0));
  if (
    line === undefined ||
    from === undefined ||
    line.slice(from, from + row.text.length) !== row.text
  ) {
    return undefined;
  }
  const to = from + row.text.length;
  const segments: CodeSegment[] = [];
  let at = from;
  for (const { start, end, kind } of colored.ranges[index] ?? []) {
    const clippedStart = Math.max(start, from);
    const clippedEnd = Math.min(end, to);
    if (clippedEnd <= clippedStart) {
      continue;
    }
    if (clippedStart > at) {
      segments.push({ text: line.slice(at, clippedStart) });
    }
    segments.push({ text: line.slice(clippedStart, clippedEnd), kind });
    at = clippedEnd;
  }
  if (at < to) {
    segments.push({ text: line.slice(at, to) });
  }
  return segments;
}
