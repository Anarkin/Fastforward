import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FileChange } from '../protocol';
import type { DiffFile, DiffLine } from './diff';

// Files with more changed lines than this start collapsed, as drawing them is
// slow and reading them rarely useful, like a generated graph.json
export const collapseThreshold = 1500;

// A file shown whole, as the commit didn't change it
export interface WholeFile {
  readonly path: string;
  readonly content: string;
  readonly binary: boolean;
}

// The diff as one list of rows, which is drawn only where it is on screen;
// every row belongs to a file, whose header stays on top while it scrolls
export type DiffRow =
  | { readonly kind: 'summary' }
  | {
      readonly kind: 'file';
      readonly file: number;
      readonly path: string;
      readonly open: boolean;
      readonly lines: number;
    }
  | { readonly kind: 'large'; readonly file: number; readonly lines: number }
  | { readonly kind: 'binary'; readonly file: number }
  | { readonly kind: 'hunk'; readonly file: number; readonly header: string }
  | { readonly kind: 'line'; readonly file: number; readonly line: DiffLine }
  | {
      readonly kind: 'wholeLine';
      readonly number: number;
      readonly text: string;
    };

// The heights of the rows, fixed so the list knows where everything is
// without measuring it; the summary is measured, as it has the message
const rowHeights: Record<Exclude<DiffRow['kind'], 'summary'>, number> = {
  file: 28,
  large: 36,
  binary: 28,
  hunk: 24,
  line: 20,
  wholeLine: 20,
};

function changedLines(file: DiffFile): number {
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
): DiffRow[] {
  const rows: DiffRow[] = [{ kind: 'summary' }];
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
    if (file.binary) {
      rows.push({ kind: 'binary', file: index });
    }
    for (const hunk of file.hunks) {
      rows.push({ kind: 'hunk', file: index, header: hunk.header });
      for (const line of hunk.lines) {
        rows.push({ kind: 'line', file: index, line });
      }
    }
  });
  return rows;
}

// The Diff column's contents: the summary, then the files' diffs, or a whole
// file; only the rows on screen are drawn, so a diff of any size opens fast
export function DiffView({
  summary,
  files,
  changes,
  whole,
}: {
  summary: React.ReactNode;
  files: readonly DiffFile[];
  // Insertion and deletion counts by path
  changes: ReadonlyMap<string, FileChange>;
  whole: WholeFile | undefined;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(
    new Map(),
  );
  const rows = useMemo(
    () => diffRows(files, toggled, whole),
    [files, toggled, whole],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => list.current,
    estimateSize: (index) => {
      const row = rows[index];
      return row.kind === 'summary' ? 200 : rowHeights[row.kind];
    },
    overscan: 30,
  });

  // A new diff starts at the top, with its files as they come
  useEffect(() => {
    setToggled(new Map());
    virtualizer.scrollToOffset(0);
  }, [files, whole, virtualizer]);

  const toggle = (path: string, open: boolean) =>
    setToggled((all) => new Map(all).set(path, !open));

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
            <>
              <span className="deletions">-{change.deletions}</span>
              <span className="insertions">+{change.insertions}</span>
            </>
          )
        )}
      </div>
    );
  };

  const renderRow = (row: DiffRow) => {
    switch (row.kind) {
      case 'summary':
        return summary;
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
          <div className="binary">
            {whole ? 'Binary or very large file' : 'Binary file'}
          </div>
        );
      case 'hunk':
        return <div className="hunk-header">{row.header}</div>;
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
    <div className="diff-view">
      {showStuck && <div className="diff-stuck-header">{header(stuck)}</div>}
      <div className="diff-list" ref={list}>
        <div
          className="diff-spacer"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {items.map((item) => (
            <div
              key={item.key}
              className={`diff-row ${rows[item.index].kind}`}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${item.start}px)` }}
            >
              {renderRow(rows[item.index])}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
