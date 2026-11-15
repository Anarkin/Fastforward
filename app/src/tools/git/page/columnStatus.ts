import { type FileChange } from '../shared/protocol';
import { type DiffFile } from './diff';
import {
  matchesFilter,
  narrows,
  type Filter,
} from '../../../lib/shared/filter';
import { strings } from '../../../lib/shared/strings';

export function commitsCounted(total: number | undefined): string | undefined {
  return total === undefined || total === 0
    ? undefined
    : strings.commits.counted(total);
}

export function filesCounted(
  changed: readonly FileChange[],
  filter: Filter,
): string | undefined {
  if (changed.length === 0) {
    return undefined;
  }
  return narrows(filter)
    ? strings.files.keptCount(
        changed.filter((file) => matchesFilter(filter, file.path, file.oldPath))
          .length,
        changed.length,
      )
    : strings.files.changedCount(changed.length);
}

function linesOf(file: DiffFile): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === 'added') {
        added++;
      } else if (line.kind === 'removed') {
        removed++;
      }
    }
  }
  return { added, removed };
}

const countedByGit = (change: FileChange | undefined): change is FileChange =>
  change !== undefined &&
  change.uncounted !== true &&
  change.insertions + change.deletions > 0;

export function linesCounted(
  files: readonly DiffFile[],
  changes: readonly FileChange[],
): string | undefined {
  const byPath = new Map(changes.map((change) => [change.path, change]));
  let added = 0;
  let removed = 0;
  let left = 0;
  for (const file of files) {
    if (file.binary) {
      continue;
    }
    if (file.placeholder === undefined) {
      const lines = linesOf(file);
      added += lines.added;
      removed += lines.removed;
      continue;
    }
    const change = byPath.get(file.path);
    if (countedByGit(change)) {
      added += change.insertions;
      removed += change.deletions;
    } else {
      left++;
    }
  }
  if (added + removed === 0) {
    return undefined;
  }
  return left === 0
    ? strings.diff.linesCounted(added, removed)
    : strings.diff.linesCountedLeavingOut(added, removed, left);
}
