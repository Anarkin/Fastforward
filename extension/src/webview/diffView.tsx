import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';
import { collapseThreshold, type FileChange } from '../shared/protocol';
import type { DiffFile, DiffLine } from './diff';
import { LineCounts } from './lineCounts';
import { SkeletonRows, useSkeleton } from './skeleton';

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
    } else if (whole.content !== '') {
      whole.content
        .replace(/\n$/, '')
        .split('\n')
        .forEach((text, index) =>
          rows.push({ kind: 'wholeLine', file: 0, number: index + 1, text }),
        );
    }
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

export function fileHeaderIndex(
  rows: readonly DiffRow[],
  file: number,
): number {
  return rows.findIndex((row) => row.kind === 'file' && row.file === file);
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
  changes,
  whole,
  loading,
  diff,
  onLoad,
}: {
  error: React.ReactNode;
  files: readonly DiffFile[];
  changes: ReadonlyMap<string, FileChange>;
  whole: WholeFile | undefined;
  loading: boolean;
  diff: number;
  onLoad: (path: string) => void;
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
    const change = changes.get(row.path);
    return (
      <div
        className="file-header"
        onClick={() => {
          if (whole) {
            return;
          }
          toggle(row.path, row.open);
          if (stuck) {
            virtualizer.scrollToIndex(fileHeaderIndex(rows, row.file), {
              align: 'start',
            });
          }
        }}
      >
        {!whole && <span className="twisty">{row.open ? '▾' : '▸'}</span>}
        <span className="path">{row.path}</span>
        {whole ? (
          <span className="unchanged">Unchanged in this commit</span>
        ) : (
          change && (
            <LineCounts
              deletions={change.deletions}
              insertions={change.insertions}
            />
          )
        )}
      </div>
    );
  };

  const renderRow = (row: DiffRow) => {
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
            <span className="code">{row.line.text}</span>
          </div>
        );
      case 'wholeLine':
        return (
          <div className="diff-line">
            <span className="number">{row.number}</span>
            <span className="code">{row.text}</span>
          </div>
        );
    }
    return null;
  };

  const items = virtualizer.getVirtualItems();
  const stuck = stuckHeader(rows, items, virtualizer.scrollOffset ?? 0);

  return (
    <div className="diff-view" style={heightVariables}>
      {stuck && <div className="diff-stuck-header">{header(stuck, true)}</div>}
      <div className="virtual-rows" ref={list}>
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
                {renderRow(row)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
