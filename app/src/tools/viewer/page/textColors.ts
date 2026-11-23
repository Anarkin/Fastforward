import type { TextRow } from '../shared/protocol';
import { brokenLines } from '../../../lib/page/textLines';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import type { CodeSegment } from './codeSegments';
import { bytesOf } from './encodedBytes';
import type { SyntaxRange } from '../../../components/syntax/page/engine';
import {
  partHasRanges,
  partLine,
  type CodePart,
} from '../../../components/syntax/page/parts';

const byteOrderMark = '﻿';

export interface WholeText {
  readonly text: string;
  readonly marked: boolean;
}

export function wholeText(text: string): WholeText {
  const marked = text.startsWith(byteOrderMark);
  return {
    text: marked ? text.slice(byteOrderMark.length) : text,
    marked,
  };
}

export interface ColoredText {
  readonly code: string;
  readonly lines: readonly string[];
  readonly lineStarts: readonly number[];
  readonly unitLines: readonly boolean[];
  readonly unit: number;
  readonly parts: readonly CodePart[];
}

const wholeBytes = (text: string, encoding: TextEncoding) =>
  bytesOf(text, 0, text.length, encoding);

const loneCarriageReturn = /\r(?!\n)/;

export function coloredText(
  text: string,
  encoding: TextEncoding,
  marked: boolean,
): ColoredText {
  const unit = wholeBytes('\n', encoding);
  const broken = brokenLines(text);
  const lines = broken.map((line) => line.text);
  const lineStarts: number[] = [];
  const unitLines: boolean[] = [];
  let at = marked ? wholeBytes(byteOrderMark, encoding) : 0;
  for (const { text: line, fed } of broken) {
    const bytes = wholeBytes(line, encoding);
    lineStarts.push(at);
    unitLines.push(bytes === line.length * unit);
    at += bytes + (fed ? unit : 0);
  }
  return {
    code: loneCarriageReturn.test(text) ? lines.join('\n') : text,
    lines,
    lineStarts,
    unitLines,
    unit,
    parts: [],
  };
}

export function withPart(colored: ColoredText, part: CodePart): ColoredText {
  return {
    ...colored,
    parts: part.from === 0 ? [part] : [...colored.parts, part],
  };
}

function partOfLine(
  parts: readonly CodePart[],
  line: number,
): CodePart | undefined {
  let low = 0;
  let high = parts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((parts[middle]?.from ?? 0) <= line) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return parts[low];
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
    counted += wholeBytes(char, 'utf-8');
    chars += char.length;
  }
  return counted === bytes ? chars : undefined;
}

function hasRanges(colored: ColoredText, index: number): boolean {
  const part = partOfLine(colored.parts, index);
  return part !== undefined && partHasRanges(part, index);
}

function markedRowSegments(
  colored: ColoredText,
  row: TextRow,
): CodeSegment[] | undefined {
  const marked = row.text.startsWith(byteOrderMark);
  const segments = lineSegments(
    colored,
    0,
    0,
    marked ? row.text.slice(byteOrderMark.length) : row.text,
  );
  return marked && segments !== undefined
    ? [{ text: byteOrderMark }, ...segments]
    : segments;
}

export const segmentsFrom =
  (colored: ColoredText) =>
  (row: TextRow): CodeSegment[] | undefined =>
    rowSegments(colored, row);

export function rowSegments(
  colored: ColoredText,
  row: TextRow,
): CodeSegment[] | undefined {
  const firstStart = colored.lineStarts[0] ?? 0;
  if (row.start < firstStart) {
    return row.start === 0 && hasRanges(colored, 0)
      ? markedRowSegments(colored, row)
      : undefined;
  }
  const index = lineAt(colored.lineStarts, row.start);
  const line = colored.lines[index];
  if (line === undefined || !hasRanges(colored, index)) {
    return undefined;
  }
  const bytes = row.start - (colored.lineStarts[index] ?? 0);
  const from = colored.unitLines[index]
    ? bytes / colored.unit
    : charAt(line, bytes);
  return from === undefined || !Number.isInteger(from)
    ? undefined
    : lineSegments(colored, index, from, row.text);
}

function lineSegments(
  colored: ColoredText,
  index: number,
  from: number,
  text: string,
): CodeSegment[] | undefined {
  const line = colored.lines[index];
  const part = partOfLine(colored.parts, index);
  if (
    line === undefined ||
    part === undefined ||
    line.slice(from, from + text.length) !== text
  ) {
    return undefined;
  }
  const to = from + text.length;
  const ranges: readonly SyntaxRange[] = partLine(part, index, from, to) ?? [];
  const segments: CodeSegment[] = [];
  let at = from;
  for (const { start, end, kind } of ranges) {
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
