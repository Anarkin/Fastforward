import { collapseThreshold } from '../shared/protocol';
import {
  changeBlocks,
  type DiffFile,
  type DiffLine,
  type LinkTargets,
  type NumberedLine,
} from './diff';
import { lineKey, wholeLines } from './find';
import { changePairs, pairingBudget, type PairingBudget } from './pairing';
import type { Pair } from './wordDiff';
import { strings } from '../../../lib/shared/strings';
import { previewsImage, previewsWholeImage } from './images';

export interface WholeFile {
  readonly path: string;
  readonly content: string;
  readonly binary: boolean;
  readonly id?: string;
  readonly link?: true;
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
  | { readonly kind: 'binary'; readonly file: number; readonly change?: Change }
  | { readonly kind: 'empty'; readonly file: number; readonly change?: Change }
  | { readonly kind: 'whitespace'; readonly file: number }
  | { readonly kind: 'sameContent'; readonly file: number }
  | { readonly kind: 'mode'; readonly file: number }
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

type SplitRow = Extract<DiffRow, { kind: 'split' | 'hunk' }>;

const splitRowsOfFile = new WeakMap<
  DiffFile,
  { readonly rows: readonly SplitRow[]; readonly words: number }
>();

export function splitRows(
  file: DiffFile,
  index: number,
  budget = pairingBudget(),
): readonly SplitRow[] {
  const known = splitRowsOfFile.get(file);
  let rows: readonly SplitRow[];
  if (known && !budget.spent && known.words <= budget.words) {
    budget.words -= known.words;
    rows = known.rows;
  } else {
    const before = budget.words;
    rows = alignedRows(file, index, budget);
    if (!budget.spent) {
      splitRowsOfFile.set(file, { rows, words: before - budget.words });
    }
  }
  return rows[0]?.file === index
    ? rows
    : rows.map((row) => ({ ...row, file: index }));
}

function alignedRows(
  file: DiffFile,
  index: number,
  budget: PairingBudget,
): SplitRow[] {
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
      for (const [left, right] of changePairs(block, budget)) {
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

const linkSides: readonly (keyof LinkTargets)[] = ['old', 'new'];

const sideChanges: Record<keyof LinkTargets, Change> = {
  old: 'removed',
  new: 'added',
};

export const waitingRows: DiffRow[] = [{ kind: 'error' }];

export function diffRows(
  files: readonly DiffFile[],
  toggled: ReadonlyMap<string, boolean>,
  whole: WholeFile | undefined,
  loading = false,
  sideBySide = false,
): DiffRow[] {
  const rows: DiffRow[] = [{ kind: 'error' }];
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
    if (file.link) {
      for (const side of linkSides) {
        if (file.link[side] !== undefined) {
          rows.push({ kind: 'link', file: index, side });
        } else if (
          file.blobs?.[side] !== undefined &&
          (file.binary || file.hunks.length === 0)
        ) {
          rows.push({
            kind: file.binary ? 'binary' : 'empty',
            file: index,
            change: sideChanges[side],
          });
        }
      }
    } else if (file.binary) {
      rows.push({
        kind: previewsImage(file) ? 'image' : 'binary',
        file: index,
      });
    } else if (file.hunks.length === 0 && sideChange(file)) {
      rows.push({ kind: 'empty', file: index });
    } else if (file.whitespaceOnly) {
      rows.push({ kind: 'whitespace', file: index });
    }
    if (file.modeChange) {
      rows.push({ kind: 'mode', file: index });
    } else if (
      file.oldPath !== undefined &&
      !file.binary &&
      !file.link &&
      !file.whitespaceOnly &&
      file.hunks.length === 0
    ) {
      rows.push({
        kind: file.similarity === 100 ? 'sameContent' : 'whitespace',
        file: index,
      });
    }
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

export function splitPairs(
  rows: readonly DiffRow[],
): ReadonlyMap<string, Pair> {
  const pairs = new Map<string, Pair>();
  for (const row of rows) {
    if (row.kind !== 'split' || row.left === row.right) {
      continue;
    }
    const pair = { removed: row.left, added: row.right };
    for (const side of [row.left, row.right]) {
      if (side) {
        pairs.set(lineKey(row.file, side.index), pair);
      }
    }
  }
  return pairs;
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
