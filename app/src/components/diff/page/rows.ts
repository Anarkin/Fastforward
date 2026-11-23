import { collapseThreshold } from '../shared/patchBudget';
import type { DiffFile, DiffLine, LinkTargets } from './diff';
import { type NumberedLine } from './changeBlocks';
import { lineKey, wholeBrokenLines } from './lines';
import { pairingBudget } from './pairing';
import { strings } from '../../../lib/shared/strings';
import type { Sentence } from '../../../lib/shared/sentences';
import { previewsImage, previewsWholeImage } from './images';
import { splitRows } from './sideBySideRows';

export interface WholeFile {
  readonly path: string;
  readonly content: string;
  readonly binary: boolean;
  readonly id?: string;
  readonly link?: true;
}

export type DiffRow =
  | { readonly kind: 'error' }
  | {
      readonly kind: 'file';
      readonly file: number;
      readonly path: string;
      readonly oldPath?: string;
      readonly open: boolean;
      readonly collapsible: boolean;
    }
  | {
      readonly kind: 'large';
      readonly file: number;
      readonly path: string;
      readonly lines: number | undefined;
    }
  | { readonly kind: 'binary'; readonly file: number; readonly change: Change }
  | { readonly kind: 'empty'; readonly file: number; readonly change: Change }
  | {
      readonly kind: 'link';
      readonly file: number;
      readonly side: keyof LinkTargets;
    }
  | { readonly kind: 'noNewline'; readonly file: number }
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
      readonly noLineFeed?: true;
    };

export type FileHeaderRow = Extract<DiffRow, { kind: 'file' }>;

export type CodeRow = Extract<
  DiffRow,
  { kind: 'line' | 'split' | 'wholeLine' }
>;

export function isCode(row: DiffRow): row is CodeRow {
  return (
    row.kind === 'line' || row.kind === 'split' || row.kind === 'wholeLine'
  );
}

export type Change = 'added' | 'removed';

export function sideChange(file: DiffFile): Change | undefined {
  if (!file.blobs) {
    return undefined;
  }
  if (file.blobs.old === undefined) {
    return 'added';
  }
  return file.blobs.new === undefined ? 'removed' : undefined;
}

export function changeOf(row: DiffRow): 'added' | 'removed' | undefined {
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

export const isChange = (row: DiffRow | undefined) =>
  row !== undefined && changeOf(row) !== undefined;

const linkSides: readonly (keyof LinkTargets)[] = ['old', 'new'];

const sideChanges: Record<keyof LinkTargets, Change> = {
  old: 'removed',
  new: 'added',
};

export const waitingRows: DiffRow[] = [{ kind: 'error' }];

export function fileNotes(file: DiffFile): Sentence[] {
  if (file.placeholder) {
    return [];
  }
  const empty = file.hunks.length === 0 && sideChange(file) !== undefined;
  const notes: Sentence[] = [];
  if (
    file.binary &&
    !file.link &&
    !previewsImage(file) &&
    sideChange(file) === undefined
  ) {
    notes.push(strings.diff.binary);
  }
  if (file.whitespaceOnly && !file.link && !file.binary && !empty) {
    notes.push(strings.diff.onlyWhitespace);
  }
  if (file.modeChange) {
    notes.push(
      strings.diff.modeChanged(file.modeChange.old, file.modeChange.new),
    );
  } else if (
    file.oldPath !== undefined &&
    !file.binary &&
    !file.link &&
    !file.whitespaceOnly &&
    file.hunks.length === 0
  ) {
    notes.push(
      file.similarity !== 100
        ? strings.diff.onlyWhitespace
        : file.copied
          ? strings.diff.copiedWithoutChanges
          : strings.diff.renamedWithoutChanges,
    );
  }
  if (file.encodings !== undefined) {
    const { short } = strings.encodings;
    notes.push(
      strings.diff.readAs(short[file.encodings.old], short[file.encodings.new]),
    );
  }
  return notes;
}

export function wholeNotes(whole: WholeFile): Sentence[] {
  return whole.binary && !whole.link && !previewsWholeImage(whole)
    ? [strings.diff.unchanged, strings.diff.binaryOrLarge]
    : [strings.diff.unchanged];
}

export function diffRows(
  files: readonly DiffFile[],
  toggled: ReadonlyMap<string, boolean>,
  whole: WholeFile | undefined,
  loading = false,
  sideBySide = false,
  noted = false,
): DiffRow[] {
  const rows: DiffRow[] = [{ kind: 'error' }];
  if (noted && files.length === 0 && !whole) {
    rows.push({
      kind: 'file',
      file: 0,
      path: '',
      open: true,
      collapsible: false,
    });
    return rows;
  }
  const budget = pairingBudget();
  if (loading && files.every((file) => file.placeholder) && !whole) {
    rows.push({ kind: 'skeleton' });
    return rows;
  }
  if (whole) {
    rows.push({
      kind: 'file',
      file: 0,
      path: whole.path,
      open: true,
      collapsible: false,
    });
    if (whole.link) {
      rows.push({ kind: 'link', file: 0, side: 'new' });
      return rows;
    }
    if (whole.binary && previewsWholeImage(whole)) {
      rows.push({ kind: 'image', file: 0 });
    }
    for (const [index, { text, fed }] of wholeBrokenLines(whole).entries()) {
      rows.push({
        kind: 'wholeLine',
        file: 0,
        number: index + 1,
        text,
        ...(!fed && { noLineFeed: true }),
      });
    }
    return rows;
  }
  const collapsible = files.length > 1;
  files.forEach((file, index) => {
    const lines = changedLines(file);
    const large =
      file.placeholder !== undefined || (lines ?? 0) > collapseThreshold;
    const chosen = collapsible
      ? toggled.get(file.path)
      : toggled.get(file.path) || undefined;
    const open = chosen ?? !large;
    rows.push({
      kind: 'file',
      file: index,
      path: file.path,
      ...(file.oldPath === undefined ? {} : { oldPath: file.oldPath }),
      open,
      collapsible,
    });
    if (!open) {
      if (large && chosen === undefined) {
        rows.push({ kind: 'large', file: index, path: file.path, lines });
      }
      return;
    }
    if (file.placeholder) {
      rows.push({ kind: 'skeletonLines', file: index });
      return;
    }
    const before: DiffRow[] = [];
    const after: DiffRow[] = [];
    const change = sideChange(file);
    if (file.link) {
      for (const side of linkSides) {
        const into = side === 'old' ? before : after;
        if (file.link[side] !== undefined) {
          into.push({ kind: 'link', file: index, side });
        } else if (
          file.blobs?.[side] !== undefined &&
          (file.binary || file.hunks.length === 0)
        ) {
          into.push({
            kind: file.binary ? 'binary' : 'empty',
            file: index,
            change: sideChanges[side],
          });
        }
      }
    } else if (file.binary) {
      if (previewsImage(file)) {
        before.push({ kind: 'image', file: index });
      } else if (change !== undefined) {
        before.push({ kind: 'binary', file: index, change });
      }
    } else if (file.hunks.length === 0 && change !== undefined) {
      before.push({ kind: 'empty', file: index, change });
    }
    rows.push(...before);
    if (sideBySide) {
      for (const row of splitRows(file, index, budget)) {
        rows.push(row);
      }
    } else {
      for (const [number, hunk] of file.hunks.entries()) {
        if (number > 0) {
          rows.push({ kind: 'hunk', file: index });
        }
        for (const line of hunk.lines) {
          rows.push({ kind: 'line', file: index, line });
        }
      }
    }
    rows.push(...after);
    if (file.noNewlineAtEnd) {
      rows.push({ kind: 'noNewline', file: index });
    }
  });
  return rows;
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

export function lineKeys(rows: readonly DiffRow[]): string[][] {
  const next = new Map<number, number>();
  return rows.map((row) => {
    if (row.kind === 'split') {
      const left = row.left ? lineKey(row.file, row.left.index) : undefined;
      const right = row.right ? lineKey(row.file, row.right.index) : undefined;
      if (left === undefined) {
        return right === undefined ? [] : [right];
      }
      return right === undefined || right === left ? [left] : [left, right];
    }
    if (row.kind !== 'line' && row.kind !== 'wholeLine') {
      return [];
    }
    const line = next.get(row.file) ?? 0;
    next.set(row.file, line + 1);
    return [lineKey(row.file, line)];
  });
}

export function diffRowKey(row: DiffRow, index: number): string {
  return `${index}:${row.kind}`;
}
