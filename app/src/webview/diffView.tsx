import { useVirtualizer } from '@tanstack/react-virtual';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
} from 'react';
import { collapseThreshold, type TextRequest } from '../shared/protocol';
import {
  changeBlocks,
  type DiffFile,
  type DiffLine,
  type NumberedLine,
} from './diff';
import {
  jumpStep,
  lineKey,
  wholeLines,
  type FindMatch,
  type FindRange,
} from './find';
import {
  matchMarks,
  Minimap,
  minimapMarks,
  type MinimapMark,
  type MinimapRow,
} from './minimap';
import { columnFocusAttribute } from './activeColumn';
import { alignLines } from './pairing';
import { textsToLoad, useSyntax, type SyntaxRange } from './syntax';
import { wordRanges, type WordRanges } from './wordDiff';
import { keymap, wheeled, type Modifiers } from '../shared/keymap';
import { glideAt, glideBy, glideEnded, type Glide } from './glide';
import { strings } from '../shared/strings';
import { listMoveOf, type ListMove } from './listMoves';
import { keyPressed } from './shortcuts';
import {
  elementMetrics,
  ownScrollbarAttribute,
  setSidewaysScroller,
  sidewaysMetrics,
  sidewaysScroll,
  sidewaysScrollEvent,
} from './overlayScrollbars';
import { ImageDiff, imagePanes, WholeImage } from './imagePreview';
import {
  previewsImage,
  previewsWholeImage,
  wholeImageUrl,
  type ImageOrigin,
} from './images';
import { SkeletonRows, useSkeleton } from './skeleton';
import { Twisty } from './tree';
import { tabSize, wrapColumns, wrappedLines } from './wordWrap';
import {
  areaColumns,
  codePadding,
  hiddenChanges,
  inlineArea,
  lineWidth,
  markerInset,
  markerWidth,
  numberWidth,
  revealChange,
  revealFound,
  shownSideways,
  sideArea,
  textColumn,
  type Sideways,
  type TextArea,
} from './overflow';

export interface WholeFile {
  readonly path: string;
  readonly content: string;
  readonly binary: boolean;
  readonly id?: string;
}

export function showsSideBySide(
  sideBySide: boolean,
  whole: WholeFile | undefined,
): boolean {
  return sideBySide && !whole;
}

export type DiffRow =
  | { readonly kind: 'error' }
  | {
      readonly kind: 'file';
      readonly file: number;
      readonly path: string;
      readonly open: boolean;
    }
  | {
      readonly kind: 'large';
      readonly file: number;
      readonly path: string;
      readonly lines: number | undefined;
    }
  | { readonly kind: 'binary'; readonly file: number }
  | { readonly kind: 'image'; readonly file: number }
  | { readonly kind: 'skeleton' }
  | { readonly kind: 'skeletonLines'; readonly file: number }
  | { readonly kind: 'hunk'; readonly file: number }
  | { readonly kind: 'line'; readonly file: number; readonly line: DiffLine }
  | {
      readonly kind: 'split';
      readonly file: number;
      readonly left: NumberedLine | undefined;
      readonly right: NumberedLine | undefined;
    }
  | {
      readonly kind: 'wholeLine';
      readonly file: number;
      readonly number: number;
      readonly text: string;
    };

type FileHeaderRow = Extract<DiffRow, { kind: 'file' }>;

type MeasuredKind = 'error' | 'skeleton' | 'skeletonLines';

export const uniformHeight = 22;

const rowHeights: Record<Exclude<DiffRow['kind'], MeasuredKind>, number> = {
  file: uniformHeight,
  large: 36,
  binary: uniformHeight,
  image: 320,
  hunk: uniformHeight,
  line: uniformHeight,
  split: uniformHeight,
  wholeLine: uniformHeight,
};

const measuredEstimates: Record<MeasuredKind, number> = {
  error: 200,
  skeleton: 240,
  skeletonLines: 100,
};

function isMeasured(kind: DiffRow['kind']): kind is MeasuredKind {
  return kind in measuredEstimates;
}

type CodeRow = Extract<DiffRow, { kind: 'line' | 'split' | 'wholeLine' }>;

function isCode(row: DiffRow): row is CodeRow {
  return (
    row.kind === 'line' || row.kind === 'split' || row.kind === 'wholeLine'
  );
}

export interface WrapColumns {
  readonly left: number;
  readonly right: number;
}

function wrappedHeight(row: CodeRow, columns: WrapColumns): number {
  const lines =
    row.kind === 'split'
      ? Math.max(
          row.left ? wrappedLines(row.left.line.text, columns.left) : 1,
          row.right ? wrappedLines(row.right.line.text, columns.right) : 1,
        )
      : wrappedLines(
          row.kind === 'line' ? row.line.text : row.text,
          columns.left,
        );
  return lines * rowHeights.line;
}

export function diffRowKey(row: DiffRow, index: number): string {
  return `${index}:${row.kind}`;
}

interface RowMeasures {
  readonly estimateSize: (index: number) => number;
  readonly getItemKey: (index: number) => string;
  readonly columns: WrapColumns | undefined;
}

const measuresOfRows = new WeakMap<readonly DiffRow[], RowMeasures>();
let wrapGeneration = 0;

export function rowMeasures(
  rows: readonly DiffRow[],
  columns?: WrapColumns,
): RowMeasures {
  let measures = measuresOfRows.get(rows);
  if (
    !measures ||
    measures.columns?.left !== columns?.left ||
    measures.columns?.right !== columns?.right
  ) {
    measures = measuresOf(rows, columns);
    measuresOfRows.set(rows, measures);
  }
  return measures;
}

function measuresOf(
  rows: readonly DiffRow[],
  columns: WrapColumns | undefined,
): RowMeasures {
  const generation = wrapGeneration++;
  const wrapped: number[] = [];
  return {
    estimateSize: (index) => {
      const row = rows[index];
      if (columns && isCode(row)) {
        return (wrapped[index] ??= wrappedHeight(row, columns));
      }
      const kind = row.kind;
      return isMeasured(kind) ? measuredEstimates[kind] : rowHeights[kind];
    },
    getItemKey: (index) => {
      const key = diffRowKey(rows[index], index);
      return columns && isCode(rows[index]) ? `${key}:${generation}` : key;
    },
    columns,
  };
}

export function HunkDivider() {
  return (
    <div className="hunk-divider">
      <span className="hunk-dots">{strings.symbols.hunk}</span>
    </div>
  );
}

export function FileHeader({
  path,
  open,
  whole,
  onClick,
}: {
  path: string;
  open: boolean;
  whole: boolean;
  onClick: () => void;
}) {
  return (
    <div className="file-header" onClick={onClick}>
      {!whole && <Twisty open={open} />}
      <span className="path">{path}</span>
      {whole && <span className="unchanged">{strings.diff.unchanged}</span>}
    </div>
  );
}

export function diffRowClass(kind: DiffRow['kind']): string {
  const extra =
    kind === 'split' ? 'split-row' : kind === 'image' ? 'image-row' : '';
  return `virtual-row diff-row ${extra}`;
}

export function rowHeight(row: DiffRow, wrap = false): number | undefined {
  const kind = row.kind;
  return isMeasured(kind) || (wrap && isCode(row))
    ? undefined
    : rowHeights[kind];
}

function changeOf(row: DiffRow): 'added' | 'removed' | undefined {
  if (row.kind === 'line') {
    return row.line.kind === 'context' ? undefined : row.line.kind;
  }
  if (row.kind === 'split') {
    if (row.right?.line.kind === 'added') {
      return 'added';
    }
    if (row.left?.line.kind === 'removed') {
      return 'removed';
    }
  }
  return undefined;
}

export function splitSideClass(
  cell: NumberedLine | undefined,
  change: 'added' | 'removed',
): string {
  if (cell === undefined) {
    return 'filler';
  }
  return cell.line.kind === change ? change : '';
}

export function sideScroll(scroll: number, widest: number): number {
  return Math.max(0, Math.min(widest, scroll));
}

export const wheelGlide = 120;

export function wheelSideways(
  event: Modifiers & Pick<WheelEvent, 'deltaX' | 'deltaY'>,
): { delta: number; duration: number } {
  if (wheeled(keymap.wheelSideways, event)) {
    return { delta: event.deltaX || event.deltaY, duration: wheelGlide };
  }
  return {
    delta: Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : 0,
    duration: 0,
  };
}

type SplitRow = Extract<DiffRow, { kind: 'split' | 'hunk' }>;

const splitRowsOfFile = new WeakMap<DiffFile, readonly SplitRow[]>();

export function splitRows(file: DiffFile, index: number): readonly SplitRow[] {
  let rows = splitRowsOfFile.get(file);
  if (!rows) {
    rows = alignedRows(file, index);
    splitRowsOfFile.set(file, rows);
  }
  return rows[0]?.file === index
    ? rows
    : rows.map((row) => ({ ...row, file: index }));
}

function alignedRows(file: DiffFile, index: number): SplitRow[] {
  const rows: SplitRow[] = [];
  for (const [number, blocks] of changeBlocks(file).entries()) {
    if (number > 0) {
      rows.push({ kind: 'hunk', file: index });
    }
    for (const block of blocks) {
      if (block.kind === 'context') {
        rows.push({
          kind: 'split',
          file: index,
          left: block.line,
          right: block.line,
        });
        continue;
      }
      const { removed, added } = block;
      const aligned = alignLines(
        removed.map((cell) => cell.line.text),
        added.map((cell) => cell.line.text),
      );
      for (const [left, right] of aligned) {
        rows.push({
          kind: 'split',
          file: index,
          left: left === undefined ? undefined : removed[left],
          right: right === undefined ? undefined : added[right],
        });
      }
    }
  }
  return rows;
}

export function minimapRows(
  rows: readonly DiffRow[],
  measured: (index: number) => number | undefined = () => undefined,
): MinimapRow[] {
  return rows.map((row, index) => ({
    height: measured(index) ?? rowHeight(row) ?? 0,
    change: changeOf(row),
  }));
}

declare module 'react' {
  interface CSSProperties {
    readonly '--diff-file-height'?: string;
    readonly '--diff-line-height'?: string;
    readonly '--diff-tab-size'?: string;
    readonly '--diff-number-width'?: string;
    readonly '--diff-code-padding'?: string;
    readonly '--diff-marker-width'?: string;
    readonly '--diff-content-width'?: string;
    readonly '--split-scroll'?: string;
    readonly '--visible-left'?: string;
    readonly '--visible-right'?: string;
  }
}

export const layoutVariables: React.CSSProperties = {
  '--diff-file-height': `${rowHeights.file}px`,
  '--diff-line-height': `${rowHeights.line}px`,
  '--diff-tab-size': String(tabSize),
  '--diff-number-width': `${numberWidth}px`,
  '--diff-code-padding': `${codePadding}px`,
  '--diff-marker-width': `${markerWidth}px`,
};

export function widestColumns(rows: readonly DiffRow[]): number {
  let widest = 0;
  for (const row of rows) {
    if (row.kind === 'line' || row.kind === 'wholeLine') {
      const text = row.kind === 'line' ? row.line.text : row.text;
      widest = Math.max(widest, textColumn(text, text.length));
    }
  }
  return widest;
}

function changedLines(file: DiffFile): number | undefined {
  if (file.placeholder) {
    return file.placeholder.lines;
  }
  return file.hunks.reduce(
    (sum, hunk) =>
      sum + hunk.lines.filter((line) => line.kind !== 'context').length,
    0,
  );
}

export function largeDiffText(lines: number | undefined): string {
  if (lines === undefined) {
    return strings.diff.largeFile;
  }
  if (lines === 0) {
    return strings.diff.notLoaded;
  }
  return lines > collapseThreshold
    ? strings.diff.largeDiff(lines)
    : strings.diff.notLoadedLines(lines);
}

export function diffRows(
  files: readonly DiffFile[],
  toggled: ReadonlyMap<string, boolean>,
  whole: WholeFile | undefined,
  loading = false,
  sideBySide = false,
): DiffRow[] {
  const rows: DiffRow[] = [{ kind: 'error' }];
  if (loading && files.every((file) => file.placeholder) && !whole) {
    rows.push({ kind: 'skeleton' });
    return rows;
  }
  if (whole) {
    rows.push({ kind: 'file', file: 0, path: whole.path, open: true });
    if (whole.binary) {
      rows.push({
        kind: previewsWholeImage(whole) ? 'image' : 'binary',
        file: 0,
      });
    }
    wholeLines(whole).forEach((text, index) =>
      rows.push({ kind: 'wholeLine', file: 0, number: index + 1, text }),
    );
    return rows;
  }
  files.forEach((file, index) => {
    const lines = changedLines(file);
    const large =
      file.placeholder !== undefined || (lines ?? 0) > collapseThreshold;
    const open = toggled.get(file.path) ?? !large;
    rows.push({ kind: 'file', file: index, path: file.path, open });
    if (!open) {
      if (large && !toggled.has(file.path)) {
        rows.push({ kind: 'large', file: index, path: file.path, lines });
      }
      return;
    }
    if (file.placeholder) {
      rows.push({ kind: 'skeletonLines', file: index });
      return;
    }
    if (file.binary) {
      rows.push({
        kind: previewsImage(file) ? 'image' : 'binary',
        file: index,
      });
    }
    if (sideBySide) {
      for (const row of splitRows(file, index)) {
        rows.push(row);
      }
      return;
    }
    for (const [number, hunk] of file.hunks.entries()) {
      if (number > 0) {
        rows.push({ kind: 'hunk', file: index });
      }
      for (const line of hunk.lines) {
        rows.push({ kind: 'line', file: index, line });
      }
    }
  });
  return rows;
}

const sidewaysStep = 40;

export function diffScrollLeft(
  step: 1 | -1,
  scrolled: number,
  room?: number,
): number | undefined {
  if (step === -1 && scrolled > 0) {
    return Math.max(0, scrolled - sidewaysStep);
  }
  if (step === 1 && room !== undefined && scrolled < room) {
    return Math.min(room, scrolled + sidewaysStep);
  }
  return undefined;
}

export function diffScrollTop(
  move: ListMove,
  scrollTop: number,
  viewport: number,
  total: number,
): number | undefined {
  const line = rowHeights.line;
  const bottom = Math.max(0, total - viewport);
  let target: number;
  switch (move) {
    case 'down':
      target = scrollTop + 3 * line;
      break;
    case 'up':
      target = scrollTop - 3 * line;
      break;
    case 'pageDown':
      target = scrollTop + Math.max(line, viewport - line);
      break;
    case 'pageUp':
      target = scrollTop - Math.max(line, viewport - line);
      break;
    case 'first':
      target = 0;
      break;
    case 'last':
      target = bottom;
      break;
  }
  return Math.max(0, Math.min(bottom, target));
}

const isChange = (row: DiffRow | undefined) =>
  row !== undefined && changeOf(row) !== undefined;

export function changeStarts(rows: readonly DiffRow[]): number[] {
  return rows.flatMap((row, index) =>
    isChange(row) && !isChange(rows[index - 1]) ? [index] : [],
  );
}

const changeMargin = rowHeights.file + 2 * rowHeights.line;

export function changeScrollTop(
  starts: readonly number[],
  scrollTop: number,
  step: 1 | -1,
  margin = changeMargin,
): number | undefined {
  const targets = starts.map((start) => Math.max(0, start - margin));
  const target =
    step > 0
      ? targets.find((top) => top > scrollTop + 1)
      : targets.findLast((top) => top < scrollTop - 1);
  return target;
}

export function lineKeys(rows: readonly DiffRow[]): string[][] {
  const next = new Map<number, number>();
  return rows.map((row) => {
    if (row.kind === 'split') {
      return [
        ...new Set(
          [row.left, row.right].flatMap((cell) =>
            cell ? [lineKey(row.file, cell.index)] : [],
          ),
        ),
      ];
    }
    if (row.kind !== 'line' && row.kind !== 'wholeLine') {
      return [];
    }
    const line = next.get(row.file) ?? 0;
    next.set(row.file, line + 1);
    return [lineKey(row.file, line)];
  });
}

function covering<T extends FindRange>(
  ranges: readonly T[],
): (start: number, end: number) => T | undefined {
  let next = 0;
  return (start, end) => {
    while (next < ranges.length && ranges[next].end <= start) {
      next++;
    }
    const range = ranges.at(next);
    return range && range.start <= start && end <= range.end
      ? range
      : undefined;
  };
}

export function marked(
  text: string,
  syntax: readonly SyntaxRange[],
  words: readonly FindRange[],
  wordClass: string,
  finds: readonly FindRange[],
  current: FindRange | undefined,
): React.ReactNode {
  if (words.length === 0 && syntax.length === 0 && finds.length === 0) {
    return text;
  }
  const edges = [
    ...new Set([
      0,
      text.length,
      ...[...syntax, ...words, ...finds].flatMap((range) => [
        range.start,
        range.end,
      ]),
    ]),
  ].toSorted((a, b) => a - b);
  const findAt = covering(finds);
  const tokenAt = covering(syntax);
  const wordAt = covering(words);
  return edges.slice(0, -1).map((start, index) => {
    const end = edges[index + 1];
    const piece = text.slice(start, end);
    const find = findAt(start, end);
    const isCurrent =
      find !== undefined &&
      current?.start === find.start &&
      current.end === find.end;
    let content: React.ReactNode = find ? (
      <mark className={`find-match ${isCurrent ? 'current' : ''}`}>
        {piece}
      </mark>
    ) : (
      piece
    );
    const token = tokenAt(start, end);
    if (token) {
      content = <span className={`syntax-${token.kind}`}>{content}</span>;
    }
    return wordAt(start, end) ? (
      <span key={start} className={wordClass}>
        {content}
      </span>
    ) : (
      <Fragment key={start}>{content}</Fragment>
    );
  });
}

export interface LineMarks {
  readonly syntax: ReadonlyMap<string, readonly SyntaxRange[]>;
  readonly words: WordRanges;
  readonly finds: ReadonlyMap<string, readonly FindRange[]>;
  readonly foundKey: string | undefined;
  readonly found: FindRange | undefined;
}

interface CodeProps {
  readonly text: string;
  readonly syntax: readonly SyntaxRange[];
  readonly words: readonly FindRange[];
  readonly wordClass: string;
  readonly finds: readonly FindRange[];
  readonly current: FindRange | undefined;
}

const unmarked: readonly never[] = [];

export function codeProps(
  marks: LineMarks,
  key: string | undefined,
  text: string,
  kind: DiffLine['kind'] | undefined,
): CodeProps {
  const of = <T,>(ranges: Pick<ReadonlyMap<string, readonly T[]>, 'get'>) =>
    (key !== undefined && ranges.get(key)) || unmarked;
  return {
    text,
    syntax: of(marks.syntax),
    words: of(marks.words),
    wordClass: kind === 'removed' ? 'word-removed' : 'word-added',
    finds: of(marks.finds),
    current:
      key !== undefined && key === marks.foundKey ? marks.found : undefined,
  };
}

const Code = memo(function Code({
  text,
  syntax,
  words,
  wordClass,
  finds,
  current,
}: CodeProps) {
  return (
    <span className="code">
      {marked(text, syntax, words, wordClass, finds, current)}
    </span>
  );
});

export function findRangesByLine(
  matches: readonly FindMatch[],
): Map<string, FindRange[]> {
  const byLine = new Map<string, FindRange[]>();
  for (const match of matches) {
    const key = lineKey(match.file, match.line);
    const ranges = byLine.get(key);
    if (ranges) {
      ranges.push(match);
    } else {
      byLine.set(key, [match]);
    }
  }
  return byLine;
}

export function diffMinimapMarks(
  rows: readonly DiffRow[],
  keys: readonly (readonly string[])[],
  matchedLines: ReadonlyMap<string, unknown>,
  changeMarks: boolean,
  measured?: (index: number) => number | undefined,
): MinimapMark[] {
  const heights = minimapRows(rows, measured);
  const matched = new Set(
    keys.flatMap((row, index) =>
      row.some((key) => matchedLines.has(key)) ? [index] : [],
    ),
  );
  return [
    ...(changeMarks ? minimapMarks(heights) : []),
    ...matchMarks(heights, matched),
  ];
}

function fileHeaderIndex(rows: readonly DiffRow[], file: number): number {
  return rows.findIndex((row) => row.kind === 'file' && row.file === file);
}

export function scrollOnToggle(
  rows: readonly DiffRow[],
  row: FileHeaderRow,
  stuck: boolean,
): number | undefined {
  return stuck ? fileHeaderIndex(rows, row.file) : undefined;
}

export function rowAnchors(
  rows: readonly DiffRow[],
  lines: readonly (readonly string[])[],
): (readonly string[])[] {
  const hunks = new Map<number, number>();
  return rows.map((row, index) => {
    if (lines[index].length > 0) {
      return lines[index];
    }
    if (row.kind === 'hunk') {
      const hunk = (hunks.get(row.file) ?? 0) + 1;
      hunks.set(row.file, hunk);
      return [`${row.file}:hunk:${hunk}`];
    }
    return ['file' in row ? `${row.file}:${row.kind}` : row.kind];
  });
}

export interface ScrollAnchor {
  readonly shows: readonly string[];
  readonly fraction: number;
}

type Laid = readonly { readonly start: number; readonly size: number }[];

export function scrollAnchor(
  rows: Laid,
  shown: readonly (readonly string[])[],
  scrollTop: number,
): ScrollAnchor | undefined {
  let low = 0;
  let high = rows.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (rows[middle].start <= scrollTop) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  const row = rows.at(low);
  const shows = shown.at(low);
  if (!row || !shows) {
    return undefined;
  }
  return {
    shows,
    fraction: row.size > 0 ? (scrollTop - row.start) / row.size : 0,
  };
}

export function anchoredScrollTop(
  anchor: ScrollAnchor,
  rows: Laid,
  shown: readonly (readonly string[])[],
): number | undefined {
  const index = shown.findIndex((shows) =>
    shows.some((id) => anchor.shows.includes(id)),
  );
  const row = index === -1 ? undefined : rows.at(index);
  return (
    row &&
    row.start + Math.min(anchor.fraction * row.size, Math.max(0, row.size - 1))
  );
}

export function stuckHeader(
  rows: readonly DiffRow[],
  items: readonly { index: number; start: number; end: number }[],
  scrollTop: number,
): FileHeaderRow | undefined {
  const top = items.find((item) => item.end > scrollTop);
  if (top === undefined) {
    return undefined;
  }
  const topRow = rows[top.index];
  if (
    !('file' in topRow) ||
    (topRow.kind === 'file' && top.start >= scrollTop)
  ) {
    return undefined;
  }
  const header = rows[fileHeaderIndex(rows, topRow.file)];
  return header?.kind === 'file' ? header : undefined;
}

export function largeFilesToLoad(
  files: readonly DiffFile[],
  toggled: ReadonlyMap<string, boolean>,
  diff: number,
  requested: Map<string, number>,
): string[] {
  const load: string[] = [];
  for (const file of files) {
    if (!file.placeholder || toggled.get(file.path) !== true) {
      requested.delete(file.path);
    } else if (requested.get(file.path) !== diff) {
      requested.set(file.path, diff);
      load.push(file.path);
    }
  }
  return load;
}

export function foundScroll(
  row: DiffRow,
  found: FindMatch,
  view: Sideways,
  charWidth: number,
): number | undefined {
  switch (row.kind) {
    case 'line':
      return revealFound(
        view,
        inlineArea(view, 2),
        row.line.text,
        found,
        charWidth,
      );
    case 'wholeLine':
      return revealFound(view, inlineArea(view, 1), row.text, found, charWidth);
    case 'split': {
      const right = row.right?.index === found.line;
      const cell = right ? row.right : row.left;
      return (
        cell &&
        revealFound(
          view,
          sideArea(view, right),
          cell.line.text,
          found,
          charWidth,
        )
      );
    }
    default:
      return undefined;
  }
}

function sideRoom(element: HTMLElement): { side: number; widest: number } {
  const codes = Array.from(
    element.querySelectorAll<HTMLElement>('.split-code'),
  );
  return {
    side: codes.at(0)?.clientWidth ?? 0,
    widest: Math.max(
      0,
      ...codes.map(
        (code) =>
          (code.firstElementChild instanceof HTMLElement
            ? code.firstElementChild.offsetWidth
            : 0) - code.clientWidth,
      ),
    ),
  };
}

const wrapSample = '0'.repeat(100);

const unmeasured: WrapColumns = { left: Infinity, right: Infinity };

function measureWrapColumns(probe: HTMLElement): WrapColumns {
  const [left = Infinity, right = left] = Array.from(
    probe.querySelectorAll<HTMLElement>('.code'),
    (code) => {
      const style = getComputedStyle(code);
      const sample = code.firstElementChild;
      return wrapColumns(
        code.getBoundingClientRect().width -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight),
        sample ? sample.getBoundingClientRect().width / wrapSample.length : 0,
      );
    },
  );
  return { left, right };
}

const WrapProbe = memo(function WrapProbe({
  split,
  numbers,
  onColumns,
}: {
  split: boolean;
  numbers: number;
  onColumns: (columns: WrapColumns) => void;
}) {
  const observe = useCallback(
    (probe: HTMLDivElement) => {
      const measure = () => onColumns(measureWrapColumns(probe));
      measure();
      const observer = new ResizeObserver(measure);
      for (const element of probe.querySelectorAll('.code, .wrap-sample')) {
        observer.observe(element);
      }
      return () => observer.disconnect();
    },
    [onColumns],
  );
  const code = (
    <span className="code">
      <span className="wrap-sample">{wrapSample}</span>
    </span>
  );
  return (
    <div className="wrap-probe" aria-hidden ref={observe}>
      {split ? (
        <div className="split-line">
          {[0, 1].map((side) => (
            <div key={side} className="diff-line split-side">
              <span className="number" />
              <span className="split-code">{code}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="diff-line">
          {Array.from({ length: numbers }, (_, index) => (
            <span key={index} className="number" />
          ))}
          {code}
        </div>
      )}
    </div>
  );
});

const CharProbe = memo(function CharProbe({
  onWidth,
}: {
  onWidth: (width: number) => void;
}) {
  const observe = useCallback(
    (sample: HTMLSpanElement) => {
      const measure = () =>
        onWidth(sample.getBoundingClientRect().width / wrapSample.length);
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(sample);
      return () => observer.disconnect();
    },
    [onWidth],
  );
  return (
    <div className="wrap-probe" aria-hidden>
      <div className="diff-line">
        <span className="code">
          <span className="wrap-sample" ref={observe}>
            {wrapSample}
          </span>
        </span>
      </div>
    </div>
  );
});

function readSideways(element: HTMLElement, scrollsSides: boolean): Sideways {
  const minimap =
    parseFloat(getComputedStyle(element).getPropertyValue('--minimap-width')) ||
    0;
  if (scrollsSides) {
    const { side, widest } = sideRoom(element);
    return { scrolled: 0, width: side, room: widest, minimap };
  }
  return {
    scrolled: element.scrollLeft,
    width: element.clientWidth,
    room: element.scrollWidth - element.clientWidth,
    minimap,
  };
}

const sameSideways = (a: Sideways | undefined, b: Sideways) =>
  a?.scrolled === b.scrolled &&
  a.width === b.width &&
  a.room === b.room &&
  a.minimap === b.minimap;

function HiddenChangeMarks({
  text,
  words,
  kind,
  view,
  area,
  charWidth,
  place,
  onReveal,
}: {
  text: string;
  words: readonly FindRange[];
  kind: DiffLine['kind'];
  view: Sideways;
  area: TextArea;
  charWidth: number;
  place: (edge: 'left' | 'right') => React.CSSProperties;
  onReveal: (scrolled: number) => void;
}) {
  const columns = areaColumns(view, area, charWidth);
  if (!columns || words.length === 0 || kind === 'context') {
    return null;
  }
  const hidden = hiddenChanges(text, words, columns);
  return (['left', 'right'] as const).map((edge) => {
    const word = hidden[edge];
    return (
      word && (
        <button
          key={edge}
          className={`hidden-change ${edge} ${kind}`}
          title={strings.diff.showHiddenChange}
          tabIndex={-1}
          style={place(edge)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            onReveal(revealChange(view, area, text, word, charWidth))
          }
        >
          {edge === 'left'
            ? strings.symbols.hiddenLeft
            : strings.symbols.hiddenRight}
        </button>
      )
    );
  });
}

export function DiffView({
  error,
  files,
  whole,
  loading,
  diff,
  onLoad,
  texts,
  onLoadTexts,
  changeMarks,
  matches,
  current,
  jump,
  sideBySide,
  wordWrap,
  origin,
}: {
  error: React.ReactNode;
  files: readonly DiffFile[];
  whole: WholeFile | undefined;
  origin: ImageOrigin | undefined;
  loading: boolean;
  diff: number;
  onLoad: (path: string) => void;
  texts: ReadonlyMap<string, string>;
  onLoadTexts: (texts: TextRequest[]) => void;
  changeMarks: boolean;
  matches: readonly FindMatch[];
  current: number;
  jump: number;
  sideBySide: boolean;
  wordWrap: boolean;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [sideways, setSideways] = useState(0);
  const scrolledSideways = useRef(sideways);
  const split = showsSideBySide(sideBySide, whole);
  const scrollsSides = split && !wordWrap;
  const [columns, setColumns] = useState<WrapColumns>();
  const [charWidth, setCharWidth] = useState(0);
  const [measured, setMeasured] = useState<Sideways>();
  const view = measured && shownSideways(measured, scrollsSides, sideways);
  const changeColumns = useCallback(
    (next: WrapColumns) =>
      setColumns((last) =>
        last?.left === next.left && last.right === next.right ? last : next,
      ),
    [],
  );
  useEffect(() => {
    const element = list.current;
    if (!element || !scrollsSides) {
      return undefined;
    }
    let glide: Glide | undefined;
    let frameWidest: number | undefined;
    let frame: number | undefined;
    const scroll = () => {
      frame = undefined;
      frameWidest = undefined;
      if (!glide) {
        return;
      }
      const now = performance.now();
      setSideways(glideAt(glide, now));
      if (glideEnded(glide, now)) {
        glide = undefined;
      } else {
        frame = requestAnimationFrame(scroll);
      }
    };
    const onWheel = (event: WheelEvent) => {
      const { delta, duration } = wheelSideways(event);
      if (delta === 0) {
        return;
      }
      event.preventDefault();
      frameWidest ??= sideRoom(element).widest;
      glide = glideBy(
        glide,
        scrolledSideways.current,
        performance.now(),
        delta,
        duration,
        frameWidest,
      );
      frame ??= requestAnimationFrame(scroll);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    setSidewaysScroller(element, {
      metrics: () => {
        const { side, widest } = sideRoom(element);
        return sidewaysMetrics(
          elementMetrics(element),
          side,
          widest,
          scrolledSideways.current,
        );
      },
      scrollTo: (scrollLeft) => {
        const { side, widest } = sideRoom(element);
        const left = sidewaysScroll(scrollLeft, element.clientWidth, side);
        setSideways(Math.max(0, Math.min(widest, left)));
      },
    });
    return () => {
      element.removeEventListener('wheel', onWheel);
      setSidewaysScroller(element, undefined);
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
    };
  }, [scrollsSides]);
  useEffect(() => {
    if (scrolledSideways.current !== sideways) {
      scrolledSideways.current = sideways;
      list.current?.dispatchEvent(new Event(sidewaysScrollEvent));
    }
  }, [sideways]);
  const measureSideways = useCallback(() => {
    const element = list.current;
    if (!element || wordWrap) {
      setMeasured(undefined);
      return;
    }
    const next = readSideways(element, scrollsSides);
    setMeasured((last) => (sameSideways(last, next) ? last : next));
  }, [wordWrap, scrollsSides]);
  useEffect(() => {
    const element = list.current;
    if (!element) {
      return undefined;
    }
    const observer = new ResizeObserver(measureSideways);
    observer.observe(element);
    element.addEventListener('scroll', measureSideways, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', measureSideways);
    };
  }, [measureSideways]);
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(
    new Map(),
  );
  const skeleton = useSkeleton(loading);
  const rows = useMemo(
    () => diffRows(files, toggled, whole, skeleton, sideBySide),
    [files, toggled, whole, skeleton, sideBySide],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => list.current,
    ...rowMeasures(rows, wordWrap ? (columns ?? unmeasured) : undefined),
    overscan: 30,
  });

  const toggle = (path: string, open: boolean) =>
    setToggled((all) => new Map(all).set(path, !open));

  const keys = useMemo(() => lineKeys(rows), [rows]);
  const widest = useMemo(
    () => (split || wordWrap ? 0 : widestColumns(rows)),
    [rows, split, wordWrap],
  );
  const words = useMemo(
    () => (whole ? new Map<string, FindRange[]>() : wordRanges(files)),
    [files, whole],
  );
  const open = useMemo(
    () =>
      new Set(
        rows.flatMap((row) =>
          row.kind === 'file' && row.open ? [row.file] : [],
        ),
      ),
    [rows],
  );
  const syntax = useSyntax(files, whole, texts, open);
  const requestedTexts = useRef(new Set<string>());
  useEffect(() => {
    const load = whole
      ? []
      : textsToLoad(files, diff, requestedTexts.current, open);
    if (load.length > 0) {
      onLoadTexts(load);
    }
  }, [files, whole, diff, open, onLoadTexts]);
  const rangesByLine = useMemo(() => findRangesByLine(matches), [matches]);
  const found = matches.at(current);
  const foundKey = found && lineKey(found.file, found.line);
  const jumped = useRef(0);
  const [revealing, setRevealing] = useState<string>();
  useEffect(() => {
    if (jumped.current === jump) {
      return;
    }
    const header =
      found &&
      rows.find((row) => row.kind === 'file' && row.file === found.file);
    const closed = header?.kind === 'file' && !header.open;
    switch (jumpStep(found !== undefined, loading, !closed)) {
      case 'wait':
        return;
      case 'done':
        jumped.current = jump;
        return;
      case 'open':
        if (header?.kind === 'file') {
          setToggled((all) => new Map(all).set(header.path, true));
        }
        return;
      case 'scroll': {
        const index = keys.findIndex((row) => row.includes(foundKey ?? ''));
        if (index !== -1) {
          virtualizer.scrollToIndex(index, { align: 'center' });
          jumped.current = jump;
          setRevealing(foundKey);
        }
      }
    }
  }, [jump, found, foundKey, loading, rows, keys, virtualizer]);

  const requested = useRef(new Map<string, number>());
  useEffect(() => {
    for (const path of largeFilesToLoad(
      files,
      toggled,
      diff,
      requested.current,
    )) {
      onLoad(path);
    }
  }, [files, toggled, diff, onLoad]);

  const header = (row: FileHeaderRow, stuck = false) => (
    <FileHeader
      path={row.path}
      open={row.open}
      whole={whole !== undefined}
      onClick={() => {
        if (whole) {
          return;
        }
        toggle(row.path, row.open);
        const target = scrollOnToggle(rows, row, stuck);
        if (target !== undefined) {
          virtualizer.scrollToIndex(target, { align: 'start' });
        }
      }}
    />
  );

  const lineMarks: LineMarks = {
    syntax,
    words,
    finds: rangesByLine,
    foundKey,
    found,
  };
  const code = (
    key: string | undefined,
    text: string,
    kind: DiffLine['kind'] | undefined,
  ) => <Code {...codeProps(lineMarks, key, text, kind)} />;

  const reveal = useCallback(
    (scrolled: number) => {
      if (scrollsSides) {
        setSideways(scrolled);
      } else if (list.current) {
        list.current.scrollLeft = scrolled;
      }
    },
    [scrollsSides],
  );
  const hiddenMarks = (
    key: string | undefined,
    line: DiffLine,
    area: (shown: Sideways) => TextArea,
    place: (edge: 'left' | 'right') => React.CSSProperties,
  ) =>
    view && (
      <HiddenChangeMarks
        text={line.text}
        words={(key !== undefined && words.get(key)) || unmarked}
        kind={line.kind}
        view={view}
        area={area(view)}
        charWidth={charWidth}
        place={place}
        onReveal={reveal}
      />
    );

  const renderRow = (row: DiffRow, index: number) => {
    switch (row.kind) {
      case 'error':
        return error;
      case 'file':
        return header(row);
      case 'large':
        return (
          <div className="large-diff">
            {largeDiffText(row.lines)}
            <button onClick={() => toggle(row.path, false)}>
              {strings.diff.show}
            </button>
          </div>
        );
      case 'binary':
        return (
          <div className="binary-file">
            {whole ? strings.diff.binaryOrLarge : strings.diff.binary}
          </div>
        );
      case 'image': {
        if (!origin) {
          return null;
        }
        if (whole) {
          const url = wholeImageUrl(origin, whole);
          return url && <WholeImage url={url} />;
        }
        return <ImageDiff panes={imagePanes(origin, files[row.file], split)} />;
      }
      case 'skeleton':
        return (
          <div className="diff-skeleton">
            <div className="file-header">
              <span className="bar" style={{ width: '40%' }} />
            </div>
            <SkeletonRows count={9} className="diff-line" />
          </div>
        );
      case 'skeletonLines':
        return <SkeletonRows count={4} className="diff-line" />;
      case 'hunk':
        return <HunkDivider />;
      case 'line':
        return (
          <div className={`diff-line text-line ${row.line.kind}`}>
            <span className="number">{row.line.oldNumber}</span>
            <span className="number">{row.line.newNumber}</span>
            {code(keys[index].at(0), row.line.text, row.line.kind)}
            {hiddenMarks(
              keys[index].at(0),
              row.line,
              (shown) => inlineArea(shown, 2),
              (edge) =>
                edge === 'left'
                  ? { left: `calc(var(--visible-left) + ${markerInset}px)` }
                  : {
                      left: `calc(var(--visible-right) - ${markerInset + markerWidth}px)`,
                    },
            )}
          </div>
        );
      case 'split':
        return (
          <div className="split-line">
            {[row.left, row.right].map((cell, side) => (
              <div
                key={side}
                className={`diff-line text-line split-side ${splitSideClass(cell, side === 0 ? 'removed' : 'added')}`}
              >
                <span className="number">
                  {side === 0 ? cell?.line.oldNumber : cell?.line.newNumber}
                </span>
                <span className="split-code">
                  {cell &&
                    code(
                      lineKey(row.file, cell.index),
                      cell.line.text,
                      cell.line.kind,
                    )}
                </span>
                {cell &&
                  hiddenMarks(
                    lineKey(row.file, cell.index),
                    cell.line,
                    (shown) => sideArea(shown, side === 1),
                    (edge) =>
                      edge === 'left'
                        ? { left: numberWidth + markerInset }
                        : {
                            right:
                              side === 1
                                ? `calc(var(--minimap-width) + ${markerInset}px)`
                                : markerInset,
                          },
                  )}
              </div>
            ))}
          </div>
        );
      case 'wholeLine':
        return (
          <div className="diff-line text-line">
            <span className="number">{row.number}</span>
            {code(keys[index].at(0), row.text, undefined)}
          </div>
        );
      default:
        return row satisfies never;
    }
  };

  const items = virtualizer.getVirtualItems();
  useLayoutEffect(() => {
    const element = list.current;
    if (element && scrollsSides && sideways > 0) {
      const within = sideScroll(sideways, sideRoom(element).widest);
      if (within !== sideways) {
        setSideways(within);
      }
    }
  }, [items, rows, scrollsSides, sideways]);
  useLayoutEffect(measureSideways, [measureSideways, items, rows]);
  useLayoutEffect(() => {
    const element = list.current;
    if (!revealing || !element) {
      return;
    }
    const index =
      revealing === foundKey
        ? keys.findIndex((row) => row.includes(revealing))
        : -1;
    if (index !== -1 && !items.some((item) => item.index === index)) {
      return;
    }
    setRevealing(undefined);
    if (!found || index === -1 || wordWrap || charWidth === 0) {
      return;
    }
    const shown = shownSideways(
      readSideways(element, scrollsSides),
      scrollsSides,
      sideways,
    );
    const scrolled = foundScroll(rows[index], found, shown, charWidth);
    if (scrolled !== undefined && scrolled !== shown.scrolled) {
      reveal(scrolled);
    }
  }, [
    revealing,
    found,
    foundKey,
    keys,
    items,
    rows,
    wordWrap,
    charWidth,
    scrollsSides,
    sideways,
    reveal,
  ]);
  const measurements = virtualizer.measurementsCache;
  const marks = useMemo(
    () =>
      diffMinimapMarks(
        rows,
        keys,
        rangesByLine,
        changeMarks,
        (index) => measurements[index]?.size,
      ),
    [rows, keys, rangesByLine, changeMarks, measurements],
  );

  const scrollTop = virtualizer.scrollOffset ?? 0;
  const stuck = stuckHeader(rows, items, scrollTop);

  const layoutKey = `${split}:${wordWrap ? `${columns?.left}:${columns?.right}` : ''}`;
  const shown = useMemo(() => rowAnchors(rows, keys), [rows, keys]);
  const anchor = useRef<{ key: string; at: ScrollAnchor | undefined }>(
    undefined,
  );
  useLayoutEffect(() => {
    const last = anchor.current;
    if (last?.at && last.key !== layoutKey) {
      anchor.current = { key: layoutKey, at: last.at };
      const top = anchoredScrollTop(
        last.at,
        virtualizer.measurementsCache,
        shown,
      );
      if (top !== undefined) {
        virtualizer.scrollToOffset(top);
      }
      return;
    }
    anchor.current = {
      key: layoutKey,
      at: scrollAnchor(
        virtualizer.measurementsCache,
        shown,
        list.current?.scrollTop ?? 0,
      ),
    };
  });

  return (
    <div
      className={`diff-view ${split ? 'side-by-side' : ''} ${wordWrap ? 'wrap' : ''}`}
      style={{
        ...layoutVariables,
        '--split-scroll': `${sideways}px`,
        ...(!split &&
          !wordWrap &&
          charWidth > 0 && {
            '--diff-content-width': `${lineWidth(widest, whole ? 1 : 2, charWidth)}px`,
          }),
        ...(view &&
          !scrollsSides && {
            '--visible-left': `${view.scrolled}px`,
            '--visible-right': `${view.scrolled + view.width - view.minimap}px`,
          }),
      }}
    >
      {stuck && <div className="diff-stuck-header">{header(stuck, true)}</div>}
      <Minimap
        marks={marks}
        scrollTop={scrollTop}
        viewport={virtualizer.scrollRect?.height ?? 0}
        total={virtualizer.getTotalSize()}
        onScroll={(top) => virtualizer.scrollToOffset(top)}
      />
      <div
        className="virtual-rows"
        ref={list}
        tabIndex={0}
        {...{ [ownScrollbarAttribute]: '', [columnFocusAttribute]: '' }}
        onKeyDown={(event) => {
          const side = keyPressed(keymap.sideways, event);
          const left =
            side === undefined
              ? undefined
              : scrollsSides
                ? diffScrollLeft(
                    side,
                    sideways,
                    sideRoom(event.currentTarget).widest,
                  )
                : diffScrollLeft(side, event.currentTarget.scrollLeft);
          if (left !== undefined) {
            event.preventDefault();
            if (scrollsSides) {
              setSideways(left);
            } else {
              event.currentTarget.scrollLeft = left;
            }
            return;
          }
          const step = keyPressed(keymap.change, event);
          const move = listMoveOf(event);
          const top =
            step === undefined
              ? move &&
                diffScrollTop(
                  move,
                  event.currentTarget.scrollTop,
                  event.currentTarget.clientHeight,
                  virtualizer.getTotalSize(),
                )
              : changeScrollTop(
                  changeStarts(rows).map(
                    (index) => virtualizer.measurementsCache[index]?.start ?? 0,
                  ),
                  event.currentTarget.scrollTop,
                  step,
                );
          if (top !== undefined) {
            event.preventDefault();
            virtualizer.scrollToOffset(top);
          }
        }}
      >
        <div
          className="virtual-spacer"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {!wordWrap && <CharProbe onWidth={setCharWidth} />}
          {wordWrap && (
            <WrapProbe
              key={split ? 'split' : whole ? 'whole' : 'inline'}
              split={split}
              numbers={whole ? 1 : 2}
              onColumns={changeColumns}
            />
          )}
          {items.map((item) => {
            const row = rows[item.index];
            const height = rowHeight(row, wordWrap);
            return (
              <div
                key={item.key}
                className={diffRowClass(row.kind)}
                data-index={item.index}
                ref={height === undefined ? virtualizer.measureElement : null}
                style={{ height, transform: `translateY(${item.start}px)` }}
              >
                {renderRow(row, item.index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
