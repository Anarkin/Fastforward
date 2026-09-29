import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';
import { collapseThreshold, type FileChange } from '../shared/protocol';
import type { DiffFile, DiffLine } from './diff';
import { LineCounts } from './lineCounts';
import { SkeletonRows, useSkeleton } from './skeleton';

// A file shown whole, as the commit didn't change it
export interface WholeFile {
  readonly path: string;
  readonly content: string;
  readonly binary: boolean;
}

// The diff as one list of rows, which is drawn only where it is on screen;
// every row belongs to a file, whose header stays on top while it scrolls
export type DiffRow =
  // The error, if any, on top
  | { readonly kind: 'error' }
  | {
      readonly kind: 'file';
      readonly file: number;
      readonly path: string;
      readonly open: boolean;
      readonly lines: number;
    }
  | { readonly kind: 'large'; readonly file: number; readonly lines: number }
  | { readonly kind: 'binary'; readonly file: number }
  // Placeholders while the diff, or a large file's, is on the way
  | { readonly kind: 'skeleton' }
  | { readonly kind: 'skeletonLines'; readonly file: number }
  // Between two changed parts of a file; git's hunk header isn't shown, as
  // the function name it guesses is often an unrelated line, like in Markdown
  | { readonly kind: 'hunk'; readonly file: number }
  | { readonly kind: 'line'; readonly file: number; readonly line: DiffLine }
  | {
      readonly kind: 'wholeLine';
      readonly number: number;
      readonly text: string;
    };

type MeasuredKind = 'error' | 'skeleton' | 'skeletonLines';

// The heights of the rows, set on them, so the list knows where everything
// is without measuring it; the style sheet takes the file header's and the
// line's from here too
const rowHeights: Record<Exclude<DiffRow['kind'], MeasuredKind>, number> = {
  file: 28,
  large: 36,
  binary: 28,
  hunk: 12,
  line: 20,
  wholeLine: 20,
};

// What the rows of other heights are guessed at until they are measured: an
// error, or placeholders that look like the files they stand in for
const measuredEstimates: Record<MeasuredKind, number> = {
  error: 200,
  skeleton: 240,
  skeletonLines: 100,
};

function isMeasured(kind: DiffRow['kind']): kind is MeasuredKind {
  return kind in measuredEstimates;
}

// A row's fixed height, or undefined when it is measured
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

// Set on the list, for the style sheet
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

// The rows of a diff, or of a whole file; a file is open as the user toggled
// it, or else when it isn't too large
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
    rows.push({
      kind: 'file',
      file: 0,
      path: whole.path,
      open: true,
      lines: 0,
    });
    if (whole.binary) {
      rows.push({ kind: 'binary', file: 0 });
    } else {
      whole.content
        .replace(/\n$/, '')
        .split('\n')
        .forEach((text, index) =>
          rows.push({ kind: 'wholeLine', number: index + 1, text }),
        );
    }
    return rows;
  }
  files.forEach((file, index) => {
    const lines = changedLines(file);
    const open = toggled.get(file.path) ?? lines <= collapseThreshold;
    rows.push({ kind: 'file', file: index, path: file.path, open, lines });
    if (!open) {
      if (lines > collapseThreshold && !toggled.has(file.path)) {
        rows.push({ kind: 'large', file: index, lines });
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

// The large files to fetch: those opened while still placeholders, each once
// per diff until it loads or is closed; requested says which diff each was
// asked for with, as a new diff, like after a save, drops the large files and
// fetches them again, even one whose answer to the diff before is on its way
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

// The Diff column's contents: the error, if any, then the files' diffs, or a
// whole file; only the rows on screen are drawn, so a diff of any size opens
// fast; keyed by the selection, so another commit or file starts at the top
// with its files as they come, while a changed diff of the same one, like
// after a save, keeps its place
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
  // Insertion and deletion counts by path
  changes: ReadonlyMap<string, FileChange>;
  whole: WholeFile | undefined;
  // The diff is on the way
  loading: boolean;
  // Which diff of the selection this is, which the large files are fetched
  // for again when it changes
  diff: number;
  // Fetches the diff of a large file left out of the commit's diff
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
    // By kind too, so a row of fixed height doesn't take the measured height
    // of a placeholder that was in its place
    getItemKey: (index) => `${index}:${rows[index].kind}`,
    overscan: 30,
  });

  const toggle = (path: string, open: boolean) =>
    setToggled((all) => new Map(all).set(path, !open));

  // Large files left out of the diff are fetched once opened, not again as
  // each of them comes
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

  const header = (row: Extract<DiffRow, { kind: 'file' }>) => {
    const change = changes.get(row.path);
    return (
      <div
        className="file-header"
        onClick={() => !whole && toggle(row.path, row.open)}
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
      case 'large': {
        const path = files[row.file]?.path ?? '';
        return (
          <div className="large-diff">
            Large diff: {row.lines.toLocaleString()} changed lines
            <button onClick={() => toggle(path, false)}>Show</button>
          </div>
        );
      }
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

  // The header of the file being scrolled through stays on top
  const items = virtualizer.getVirtualItems();
  const scrollTop = virtualizer.scrollOffset ?? 0;
  const top = items.find((item) => item.end > scrollTop);
  const topRow = top && rows[top.index];
  const topFile = topRow && 'file' in topRow ? topRow.file : undefined;
  const stuck =
    topFile === undefined
      ? undefined
      : rows.find(
          (row): row is Extract<DiffRow, { kind: 'file' }> =>
            row.kind === 'file' && row.file === topFile,
        );
  const showStuck =
    stuck &&
    !(topRow?.kind === 'file' && top !== undefined && top.start >= scrollTop);

  return (
    <div className="diff-view" style={heightVariables}>
      {showStuck && <div className="diff-stuck-header">{header(stuck)}</div>}
      <div className="diff-list" ref={list}>
        <div
          className="diff-spacer"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {items.map((item) => {
            const row = rows[item.index];
            const height = rowHeight(row);
            return (
              <div
                key={item.key}
                className="diff-row"
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
