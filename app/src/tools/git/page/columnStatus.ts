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

export function linesCounted(file: DiffFile | undefined): string | undefined {
  if (file === undefined || file.binary || file.placeholder !== undefined) {
    return undefined;
  }
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
  return added + removed === 0
    ? undefined
    : strings.diff.linesCounted(added, removed);
}
