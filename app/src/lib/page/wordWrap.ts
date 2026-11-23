import {
  asciiBreakAt,
  clusterBoundaries,
  lineBreaks,
  type Box,
} from './lineBreaks';
import type { TextWidths } from './textWidths';
import { tabSize, tabStop } from './tabStops';

const blankKind = 1;
const breaksAfter = 2;
const breaksBefore = 4;
const kinds = new Uint8Array(128);
const kindOf = (characters: string, kind: number) => {
  for (const character of characters) {
    kinds[character.charCodeAt(0)] |= kind;
  }
};
kindOf(' \t', blankKind);
kindOf('})]?|/&.,;', breaksAfter);
kindOf('([{+', breaksBefore);
const fullWidthColumns = 2;
const tabCode = 9;

function kindAt(text: string, at: number): number {
  const code = text.charCodeAt(at);
  return code < kinds.length ? (kinds[code] ?? 0) : 0;
}

export const isBlank = (character: string | undefined) =>
  character === ' ' || character === '\t';

const isBlankAt = (text: string, at: number) =>
  (kindAt(text, at) & blankKind) !== 0;

function breaksAt(text: string, at: number): boolean {
  const before = kindAt(text, at - 1);
  const after = kindAt(text, at);
  if (((before | after) & blankKind) !== 0) {
    return false;
  }
  const endsAfter = (before & breaksAfter) !== 0;
  const startsBefore = (after & breaksBefore) !== 0;
  return (
    (endsAfter && (after & breaksAfter) === 0) ||
    (startsBefore && (before & breaksBefore) === 0)
  );
}

const longestMarkedLine = 64 * 1024;

export const breaksMarked = (text: string) => text.length <= longestMarkedLine;

export function breakOffsets(
  text: string,
  from = 1,
  to = text.length - 1,
): number[] {
  const offsets: number[] = [];
  if (!breaksMarked(text)) {
    return offsets;
  }
  for (let at = Math.max(1, from); at <= Math.min(to, text.length - 1); at++) {
    if (breaksAt(text, at)) {
      offsets.push(at);
    }
  }
  return offsets;
}

export function leadLength(text: string): number {
  let at = 0;
  while (isBlank(text[at])) {
    at++;
  }
  return at;
}

export function wrapIndent(text: string, columns: number): number {
  const lead = leadLength(text);
  if (lead === text.length) {
    return 0;
  }
  let indent = 0;
  for (let at = 0; at < lead; at++) {
    indent = text[at] === '\t' ? tabStop(indent) : indent + 1;
  }
  const offStops = indent % tabSize !== 0 && text.includes('\t');
  return offStops || indent + fullWidthColumns > columns ? 0 : indent;
}

function startRowAt(starts: number[], text: string, at: number): void {
  const code = text.charCodeAt(at);
  const start = code >= 0xdc00 && code <= 0xdfff ? at - 1 : at;
  if (start > (starts.at(-1) ?? 0)) {
    starts.push(start);
  }
}

const marksNoBreak = () => false;

const breaksDrawnAsSigns = new RegExp(
  `[${[0x0b, 0x0c, 0x85, 0x2028, 0x2029]
    .map((code) => `\\u${code.toString(16).padStart(4, '0')}`)
    .join('')}]`,
  'g',
);

const signedBreak = '\u00A4';

function breaksOf(
  text: string,
  marked: boolean,
  boxes: readonly Box[] = [],
): (at: number) => boolean {
  const markedAt = marked ? breaksAt : marksNoBreak;
  const drawn = text.replace(breaksDrawnAsSigns, signedBreak);
  if (boxes.length === 0 && !nonAscii.test(drawn)) {
    return (at) => markedAt(text, at) || asciiBreakAt(text, at);
  }
  const flags = lineBreaks(drawn, boxes);
  return (at) => flags[at] === 1 || markedAt(text, at);
}

const nonAscii = /[^\0-\x7f]/;

interface Cluster {
  readonly start: number;
  readonly text: string;
  readonly columns: number;
}

const lastAscii = 0x7f;

function clustersOf(text: string, widths: TextWidths): Cluster[] {
  const clusters: Cluster[] = [];
  let start = 0;
  for (let at = 1; at <= text.length; at++) {
    if (
      at < text.length &&
      (text.charCodeAt(at - 1) > lastAscii || text.charCodeAt(at) > lastAscii)
    ) {
      continue;
    }
    if (at - start === 1 && text.charCodeAt(start) <= lastAscii) {
      clusters.push({ start, text: text[start], columns: 1 });
    } else {
      const stretch = text.slice(start, at);
      const boundaries = clusterBoundaries(stretch);
      for (let index = 1; index < boundaries.length; index++) {
        const segment = stretch.slice(boundaries[index - 1], boundaries[index]);
        clusters.push({
          start: start + boundaries[index - 1],
          text: segment,
          columns: nonAscii.test(segment)
            ? widths.of(segment) / widths.char
            : segment.length,
        });
      }
    }
    start = at;
  }
  return clusters;
}

function measuredStarts(
  text: string,
  columns: number,
  indent: number,
  widths: TextWidths,
  marked: boolean,
): number[] {
  const clusters = clustersOf(text, widths);
  let total = 0;
  for (const cluster of clusters) {
    total += cluster.columns;
  }
  if (total <= columns && !text.includes('\t')) {
    return [0];
  }
  const blank = (at: number) =>
    clusters[at].text === ' ' || clusters[at].text === '\t';
  const boxes: Box[] = [];
  for (const { start, text: cluster } of clusters) {
    if (widths.boxed?.(cluster) !== undefined) {
      boxes.push([start, start + cluster.length]);
    }
  }
  const canBreak = breaksOf(text, marked, boxes);
  const breaksAhead = (at: number) => canBreak(clusters[at].start);
  const starts = [0];
  let column = 0;
  let rowStart = indent;
  let at = 0;
  while (at < clusters.length) {
    let end = at;
    while (
      end < clusters.length &&
      !blank(end) &&
      (end === at || !breaksAhead(end))
    ) {
      end++;
    }
    let width = 0;
    for (let each = at; each < end; each++) {
      width += clusters[each].columns;
    }
    if (width > 0 && column > rowStart && column + width > columns) {
      starts.push(clusters[at].start);
      column = indent;
      rowStart = indent;
    }
    let from = at;
    while (column + width > columns && from < end) {
      let fits = from;
      let used = 0;
      while (fits < end && column + used + clusters[fits].columns <= columns) {
        used += clusters[fits].columns;
        fits++;
      }
      if (fits === from) {
        used = clusters[from].columns;
        fits = from + 1;
      }
      if (fits === end) {
        break;
      }
      starts.push(clusters[fits].start);
      column = indent;
      rowStart = indent;
      width -= used;
      from = fits;
    }
    column += width;
    for (at = end; at < clusters.length && blank(at); at++) {
      column = clusters[at].text === '\t' ? tabStop(column) : column + 1;
    }
  }
  return starts;
}

export function wrapStarts(
  text: string,
  columns: number,
  indent = wrapIndent(text, columns),
  widths?: TextWidths,
): number[] {
  return startsOf(
    text.endsWith('\r') ? text.slice(0, -1) : text,
    columns,
    indent,
    widths,
    breaksMarked(text),
  );
}

function startsOf(
  text: string,
  columns: number,
  indent: number,
  widths: TextWidths | undefined,
  marked: boolean,
): number[] {
  if (widths !== undefined && widths.char > 0 && nonAscii.test(text)) {
    return measuredStarts(text, columns, indent, widths, marked);
  }
  if (text.length <= columns && !text.includes('\t')) {
    return [0];
  }
  const canBreak = breaksOf(text, marked);
  const starts = [0];
  let column = 0;
  let rowStart = indent;
  let at = 0;
  while (at < text.length) {
    let end = at;
    while (
      end < text.length &&
      !isBlankAt(text, end) &&
      (end === at || !canBreak(end))
    ) {
      end++;
    }
    let length = end - at;
    if (length > 0 && column > rowStart && column + length > columns) {
      starts.push(at);
      column = indent;
      rowStart = indent;
    }
    while (column + length > columns) {
      length -= columns - column;
      startRowAt(starts, text, end - length);
      column = indent;
      rowStart = indent;
    }
    column += length;
    for (at = end; isBlankAt(text, at); at++) {
      column = text.charCodeAt(at) === tabCode ? tabStop(column) : column + 1;
    }
  }
  return starts;
}

export function wrappedLines(
  text: string,
  columns: number,
  widths?: TextWidths,
): number {
  return wrapStarts(text, columns, undefined, widths).length;
}

const layoutUnit = 1 / 64;

export function wrapColumns(width: number, charWidth: number): number {
  if (!(charWidth > 0)) {
    return Infinity;
  }
  return Math.max(1, Math.floor((width + layoutUnit) / charWidth - 1e-6));
}
