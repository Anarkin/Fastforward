import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { changeStep } from './shortcuts';
import { ownScrollbarAttribute } from './overlayScrollbars';
import { SkeletonRows, useSkeleton } from './skeleton';
import { Twisty } from './tree';

export interface WholeFile {
  readonly path: string;
  readonly content: string;
  readonly binary: boolean;
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
      readonly kind: 'wholeLine';
      readonly file: number;
      readonly number: number;
      readonly text: string;
    };

type FileHeaderRow = Extract<DiffRow, { kind: 'file' }>;

type MeasuredKind = 'error' | 'skeleton' | 'skeletonLines';

const rowHeights: Record<Exclude<DiffRow['kind'], MeasuredKind>, number> = {
  file: 28,
  large: 36,
  binary: 28,
  hunk: 12,
  line: 20,
  wholeLine: 20,
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

export function rowHeight(row: DiffRow): number | undefined {
  const kind = row.kind;
  return isMeasured(kind) ? undefined : rowHeights[kind];
}

export function minimapRows(rows: readonly DiffRow[]): MinimapRow[] {
  return rows.map((row) => ({
    height: rowHeight(row) ?? 0,
    change:
      row.kind === 'line' && row.line.kind !== 'context'
        ? row.line.kind
        : undefined,
  }));
}

declare module 'react' {
  interface CSSProperties {
    readonly '--diff-file-height'?: string;
    readonly '--diff-line-height'?: string;
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
    const open = toggled.get(file.path) ?? lines <= collapseThreshold;
    rows.push({ kind: 'file', file: index, path: file.path, open });
    if (!open) {
      if (lines > collapseThreshold && !toggled.has(file.path)) {
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
  row?.kind === 'line' && row.line.kind !== 'context';

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

export function lineKeys(rows: readonly DiffRow[]): (string | undefined)[] {
  const next = new Map<number, number>();
  return rows.map((row) => {
    if (row.kind !== 'line' && row.kind !== 'wholeLine') {
      return undefined;
    }
    const line = next.get(row.file) ?? 0;
    next.set(row.file, line + 1);
    return lineKey(row.file, line);
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

export function diffMinimapMarks(
  rows: readonly DiffRow[],
  keys: readonly (string | undefined)[],
  matchedLines: ReadonlyMap<string, unknown>,
  changeMarks: boolean,
): MinimapMark[] {
  const heights = minimapRows(rows);
  const matched = new Set(
    keys.flatMap((key, index) =>
      key !== undefined && matchedLines.has(key) ? [index] : [],
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
  changeMarks = false,
  matches = [],
  current = 0,
  jump = 0,
}: {
  error: React.ReactNode;
  files: readonly DiffFile[];
  whole: WholeFile | undefined;
  loading: boolean;
  diff: number;
  onLoad: (path: string) => void;
  changeMarks?: boolean;
  matches?: readonly FindMatch[];
  current?: number;
  jump?: number;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(
    new Map(),
  );
  const skeleton = useSkeleton(loading);
  const rows = useMemo(
    () => diffRows(files, toggled, whole, skeleton),
    [files, toggled, whole, skeleton],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => list.current,
    estimateSize: (index) => {
      const kind = rows[index].kind;
      return isMeasured(kind) ? measuredEstimates[kind] : rowHeights[kind];
    },
    getItemKey: (index) => diffRowKey(rows[index], index),
    overscan: 30,
  });

  const toggle = (path: string, open: boolean) =>
    setToggled((all) => new Map(all).set(path, !open));

  const keys = useMemo(() => lineKeys(rows), [rows]);
  const rangesByLine = useMemo(() => {
    const byLine = new Map<string, FindRange[]>();
    for (const match of matches) {
      const key = lineKey(match.file, match.line);
      byLine.set(key, [...(byLine.get(key) ?? []), match]);
    }
    return byLine;
  }, [matches]);
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
    const index = keys.indexOf(foundKey);
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

  const code = (index: number, text: string) => {
    const key = keys[index];
    const ranges = key === undefined ? undefined : rangesByLine.get(key);
    return (
      <span className="code">
        {ranges
          ? highlighted(text, ranges, key === foundKey ? found : undefined)
          : text}
      </span>
    );
  };

  const renderRow = (row: DiffRow, index: number) => {
    switch (row.kind) {
      case 'error':
        return error;
      case 'file':
        return header(row);
      case 'large':
        return (
          <div className="large-diff">
            Large diff: {row.lines.toLocaleString()} changed lines
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
        return <div className="hunk-divider" />;
      case 'line':
        return (
          <div className={`diff-line ${row.line.kind}`}>
            <span className="number">{row.line.oldNumber}</span>
            <span className="number">{row.line.newNumber}</span>
            {code(index, row.line.text)}
          </div>
        );
      case 'wholeLine':
        return (
          <div className="diff-line">
            <span className="number">{row.number}</span>
            {code(index, row.text)}
          </div>
        );
    }
    return null;
  };

  const marks = useMemo(
    () => diffMinimapMarks(rows, keys, rangesByLine, changeMarks),
    [rows, keys, rangesByLine, changeMarks],
  );

  const items = virtualizer.getVirtualItems();
  const scrollTop = virtualizer.scrollOffset ?? 0;
  const stuck = stuckHeader(rows, items, scrollTop);

  return (
    <div className="diff-view" style={heightVariables}>
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
                className="virtual-row diff-row"
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
