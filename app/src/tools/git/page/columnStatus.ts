import type { FileChange } from '../../../lib/shared/changes';
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
