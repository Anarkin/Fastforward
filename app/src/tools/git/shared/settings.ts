import type { DiffLayout } from './protocol';

export interface GitSettings {
  readonly collapseMerges: boolean;
  readonly showAllFiles: boolean;
  readonly showEntireFile: boolean;
  readonly ignoreWhitespace: boolean;
  readonly diffLayout: DiffLayout;
  readonly solo: boolean;
  readonly autoFetch: boolean;
  readonly autoFetchMinutes: number;
  readonly hideDimmedButtons: boolean;
  readonly keepGitRunning: boolean;
  readonly columnWidths: readonly number[];
}

const sizedColumns = 2;

const widestColumn = 100_000;

export function isColumnWidths(value: unknown): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.length === sizedColumns &&
    value.every(
      (width) =>
        typeof width === 'number' &&
        Number.isFinite(width) &&
        width >= 0 &&
        width <= widestColumn,
    )
  );
}
