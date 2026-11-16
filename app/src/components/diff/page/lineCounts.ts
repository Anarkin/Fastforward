import { type FileChange } from '../../../lib/shared/changes';
import { type DiffFile } from './diff';
import { strings } from '../../../lib/shared/strings';

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
