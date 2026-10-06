import type { FileChange } from '../shared/protocol';
import { strings } from '../shared/strings';

export function changeClass(change: FileChange | undefined): string {
  return change === undefined
    ? 'path unchanged'
    : change.status === 'D'
      ? 'path deleted'
      : 'path';
}

export function changeTitle(change: FileChange): string {
  const path = change.oldPath
    ? strings.common.fromTo(change.oldPath, change.path)
    : change.path;
  return strings.files.change(strings.files.statuses[change.status], path);
}
