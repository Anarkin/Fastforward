import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { collapseThreshold } from '../shared/protocol';
import type { DiffFile, DiffLine } from './diff';
import { lineKey, wholeLines, type FindMatch, type FindRange } from './find';
import {
  matchMarks,
  Minimap,
  minimapMarks,
  type MinimapMark,
  type MinimapRow,
} from './minimap';
import { columnFocusAttribute } from './activeColumn';
import { alignLines } from './pairing';
import type { TextRequest } from '../shared/protocol';
import { textsToLoad, useSyntax, type SyntaxRange } from './syntax';
import { wordRanges } from './wordDiff';
import { changeStep } from './shortcuts';
import { ownScrollbarAttribute } from './overlayScrollbars';
import { SkeletonRows, useSkeleton } from './skeleton';
import { Twisty } from './tree';

export interface WholeFile {
  readonly path: string;
  readonly content: string;
  readonly binary: boolean;
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
      readonly lines: number;
    }
  | { readonly kind: 'binary'; readonly file: number }
  | { readonly kind: 'skeleton' }
  | { readonly kind: 'skeletonLines'; readonly file: number }
  | { readonly kind: 'hunk'; readonly file: number }
  | { readonly kind: 'line'; readonly file: number; readonly line: DiffLine }
  | {
      readonly kind: 'split';
      readonly file: number;
      readonly left: SplitCell | undefined;
      readonly right: SplitCell | undefined;
    }
  | {
      readonly kind: 'wholeLine';
      readonly file: number;
      readonly number: number;
      readonly text: string;
    };

export interface SplitCell {
  readonly line: DiffLine;
  readonly index: number;
}

type FileHeaderRow = Extract<DiffRow, { kind: 'file' }>;

type MeasuredKind = 'error' | 'skeleton' | 'skeletonLines';

const uniformHeight = 22;

const rowHeights: Record<Exclude<DiffRow['kind'], MeasuredKind>, number> = {
  file: uniformHeight,
  large: 36,
  binary: uniformHeight,
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

export function diffRowKey(row: DiffRow, index: number): string {
  return `${index}:${row.kind}`;
}

interface RowMeasures {
  readonly estimateSize: (index: number) => number;
  readonly getItemKey: (index: number) => string;
}

const measuresOfRows = new WeakMap<readonly DiffRow[], RowMeasures>();

export function rowMeasures(rows: readonly DiffRow[]): RowMeasures {
  let measures = measuresOfRows.get(rows);
  if (!measures) {
    measures = {
      estimateSize: (index) => {
        const kind = rows[index].kind;
        return isMeasured(kind) ? measuredEstimates[kind] : rowHeights[kind];
      },
      getItemKey: (index) => diffRowKey(rows[index], index),
    };
    measuresOfRows.set(rows, measures);
  }
  return measures;
}

export function HunkDivider() {
  return (
    <div className="hunk-divider">
      <span className="hunk-dots">⋯</span>
    </div>
  );
}

export function rowHeight(row: DiffRow): number | undefined {
  const kind = row.kind;
  return isMeasured(kind) ? undefined : rowHeights[kind];
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
  cell: SplitCell | undefined,
  change: 'added' | 'removed',
): string {
  if (cell === undefined) {
    return 'filler';
  }
  return cell.line.kind === change ? change : '';
}

export function sideScroll(
  scroll: number,
  deltas: readonly number[],
  widest: number,
): number {
  return deltas.reduce(
    (scrolled, delta) => Math.max(0, Math.min(widest, scrolled + delta)),
    scroll,
  );
}

export function wheelSideways(
  event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'shiftKey'>,
): number {
  if (event.shiftKey) {
    return event.deltaX || event.deltaY;
  }
  return Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : 0;
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
  let next = 0;
  for (const [number, hunk] of file.hunks.entries()) {
    if (number > 0) {
      rows.push({ kind: 'hunk', file: index });
    }
    const removed: SplitCell[] = [];
    const added: SplitCell[] = [];
    const pair = () => {
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
      removed.length = 0;
      added.length = 0;
    };
    for (const line of hunk.lines) {
      const cell = { line, index: next++ };
      if (line.kind === 'removed') {
        if (added.length > 0) {
          pair();
        }
        removed.push(cell);
      } else if (line.kind === 'added') {
        added.push(cell);
      } else {
        pair();
        rows.push({ kind: 'split', file: index, left: cell, right: cell });
      }
    }
    pair();
  }
  return rows;
}

export function minimapRows(
  rows: readonly DiffRow[],
  measured: (index: number) => number | undefined = () => undefined,
): MinimapRow[] {
  return rows.map((row, index) => ({
    height: rowHeight(row) ?? measured(index) ?? 0,
    change: changeOf(row),
  }));
}

declare module 'react' {
  interface CSSProperties {
    readonly '--diff-file-height'?: string;
    readonly '--diff-line-height'?: string;
    readonly '--split-scroll'?: string;
  }
}

const heightVariables: React.CSSProperties = {
  '--diff-file-height': `${rowHeights.file}px`,
  '--diff-line-height': `${rowHeights.line}px`,
};

function changedLines(file: DiffFile): number {
  if (file.placeholder) {
    return file.placeholder.lines;
  }
  return file.hunks.reduce(
    (sum, hunk) =>
      sum + hunk.lines.filter((line) => line.kind !== 'context').length,
    0,
  );
}

export function diffRows(
  files: readonly DiffFile[],
  toggled: ReadonlyMap<string, boolean>,
  whole: WholeFile | undefined,
  loading = false,
  sideBySide = false,
): DiffRow[] {
  const rows: DiffRow[] = [{ kind: 'error' }];
  if (loading && files.length === 0 && !whole) {
    rows.push({ kind: 'skeleton' });
    return rows;
  }
  if (whole) {
    rows.push({ kind: 'file', file: 0, path: whole.path, open: true });
    if (whole.binary) {
      rows.push({ kind: 'binary', file: 0 });
    }
    wholeLines(whole).forEach((text, index) =>
      rows.push({ kind: 'wholeLine', file: 0, number: index + 1, text }),
    );
    return rows;
  }
  files.forEach((file, index) => {
    const lines = changedLines(file);
    const large = file.placeholder !== undefined || lines > collapseThreshold;
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
      rows.push({ kind: 'binary', file: index });
    }
    if (sideBySide) {
      rows.push(...splitRows(file, index));
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
  key: string,
  scrolled: number,
): number | undefined {
  return key === 'ArrowLeft' && scrolled > 0
    ? Math.max(0, scrolled - sidewaysStep)
    : undefined;
}

export function diffScrollTop(
  key: string,
  scrollTop: number,
  viewport: number,
  total: number,
): number | undefined {
  const line = rowHeights.line;
  const bottom = Math.max(0, total - viewport);
  let target: number;
  switch (key) {
    case 'ArrowDown':
      target = scrollTop + 3 * line;
      break;
    case 'ArrowUp':
      target = scrollTop - 3 * line;
      break;
    case 'PageDown':
      target = scrollTop + Math.max(line, viewport - line);
      break;
    case 'PageUp':
      target = scrollTop - Math.max(line, viewport - line);
      break;
    case 'Home':
      target = 0;
      break;
    case 'End':
      target = bottom;
      break;
    default:
      return undefined;
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

export function highlighted(
  text: string,
  ranges: readonly FindRange[],
  current: FindRange | undefined,
): React.ReactNode {
  if (ranges.length === 0) {
    return text;
  }
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (const range of ranges) {
    parts.push(text.slice(from, range.start));
    const isCurrent =
      current?.start === range.start && current.end === range.end;
    parts.push(
      <mark
        key={range.start}
        className={`find-match ${isCurrent ? 'current' : ''}`}
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    from = range.end;
  }
  parts.push(text.slice(from));
  return parts;
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
  if (words.length === 0 && syntax.length === 0) {
    return finds.length === 0 ? text : highlighted(text, finds, current);
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
  readonly words: ReadonlyMap<string, readonly FindRange[]>;
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
  const of = <T,>(ranges: ReadonlyMap<string, readonly T[]>) =>
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

export function DiffView({
  error,
  files,
  whole,
  loading,
  diff,
  onLoad,
  texts = new Map(),
  onLoadTexts = () => undefined,
  changeMarks = false,
  matches = [],
  current = 0,
  jump = 0,
  sideBySide = false,
}: {
  error: React.ReactNode;
  files: readonly DiffFile[];
  whole: WholeFile | undefined;
  loading: boolean;
  diff: number;
  onLoad: (path: string) => void;
  texts?: ReadonlyMap<string, string>;
  onLoadTexts?: (texts: TextRequest[]) => void;
  changeMarks?: boolean;
  matches?: readonly FindMatch[];
  current?: number;
  jump?: number;
  sideBySide?: boolean;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [sideways, setSideways] = useState(0);
  const split = showsSideBySide(sideBySide, whole);
  useEffect(() => {
    const element = list.current;
    if (!element || !split) {
      return undefined;
    }
    let deltas: number[] = [];
    let frame: number | undefined;
    const scroll = () => {
      frame = undefined;
      const widest = Math.max(
        0,
        ...Array.from(
          element.querySelectorAll<HTMLElement>('.split-code'),
          (code) =>
            (code.firstElementChild instanceof HTMLElement
              ? code.firstElementChild.offsetWidth
              : 0) - code.clientWidth,
        ),
      );
      const ticks = deltas;
      deltas = [];
      setSideways((scrolled) => sideScroll(scrolled, ticks, widest));
    };
    const onWheel = (event: WheelEvent) => {
      const delta = wheelSideways(event);
      if (delta === 0) {
        return;
      }
      event.preventDefault();
      deltas.push(delta);
      frame ??= requestAnimationFrame(scroll);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
    };
  }, [split]);
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
    ...rowMeasures(rows),
    overscan: 30,
  });

  const toggle = (path: string, open: boolean) =>
    setToggled((all) => new Map(all).set(path, !open));

  const keys = useMemo(() => lineKeys(rows), [rows]);
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
  useEffect(() => {
    if (found === undefined || jumped.current === jump) {
      return;
    }
    const header = rows.find(
      (row) => row.kind === 'file' && row.file === found.file,
    );
    if (header?.kind === 'file' && !header.open) {
      setToggled((all) => new Map(all).set(header.path, true));
      return;
    }
    const index = keys.findIndex((row) => row.includes(foundKey ?? ''));
    if (index !== -1) {
      virtualizer.scrollToIndex(index, { align: 'center' });
      jumped.current = jump;
    }
  }, [jump, found, foundKey, rows, keys, virtualizer]);

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

  const header = (row: FileHeaderRow, stuck = false) => {
    return (
      <div
        className="file-header"
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
      >
        {!whole && <Twisty open={row.open} />}
        <span className="path">{row.path}</span>
        {whole && <span className="unchanged">Unchanged in this commit</span>}
      </div>
    );
  };

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

  const renderRow = (row: DiffRow, index: number) => {
    switch (row.kind) {
      case 'error':
        return error;
      case 'file':
        return header(row);
      case 'large':
        return (
          <div className="large-diff">
            {row.lines > collapseThreshold ? 'Large diff' : 'Not loaded'}:{' '}
            {row.lines.toLocaleString()} changed lines
            <button onClick={() => toggle(row.path, false)}>Show</button>
          </div>
        );
      case 'binary':
        return (
          <div className="binary-file">
            {whole ? 'Binary or very large file' : 'Binary file'}
          </div>
        );
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
          <div className={`diff-line ${row.line.kind}`}>
            <span className="number">{row.line.oldNumber}</span>
            <span className="number">{row.line.newNumber}</span>
            {code(keys[index].at(0), row.line.text, row.line.kind)}
          </div>
        );
      case 'split':
        return (
          <div className="split-line">
            {[row.left, row.right].map((cell, side) => (
              <div
                key={side}
                className={`diff-line split-side ${splitSideClass(cell, side === 0 ? 'removed' : 'added')}`}
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
              </div>
            ))}
          </div>
        );
      case 'wholeLine':
        return (
          <div className="diff-line">
            <span className="number">{row.number}</span>
            {code(keys[index].at(0), row.text, undefined)}
          </div>
        );
    }
    return null;
  };

  const items = virtualizer.getVirtualItems();
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

  return (
    <div
      className={`diff-view ${split ? 'side-by-side' : ''}`}
      style={{ ...heightVariables, '--split-scroll': `${sideways}px` }}
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
          if (
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            event.shiftKey
          ) {
            return;
          }
          const left = diffScrollLeft(
            event.key,
            split ? sideways : event.currentTarget.scrollLeft,
          );
          if (left !== undefined) {
            event.preventDefault();
            if (split) {
              setSideways(left);
            } else {
              event.currentTarget.scrollLeft = left;
            }
            return;
          }
          const step = changeStep(event);
          const top =
            step === undefined
              ? diffScrollTop(
                  event.key,
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
          {items.map((item) => {
            const row = rows[item.index];
            const height = rowHeight(row);
            return (
              <div
                key={item.key}
                className={`virtual-row diff-row ${row.kind === 'split' ? 'split-row' : ''}`}
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
