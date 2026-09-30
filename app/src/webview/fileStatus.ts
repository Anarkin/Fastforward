import type { FileChange } from '../shared/protocol';

const statusNames: Record<FileChange['status'], string> = {
  A: 'Added',
  M: 'Modified',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  T: 'Type changed',
  U: 'Untracked',
  '?': 'Changed',
};

export function statusClass(change: FileChange): string {
  return `path status-${change.status}`;
}

export function changeTitle(change: FileChange): string {
  const path = change.oldPath
    ? `${change.oldPath} → ${change.path}`
    : change.path;
  return `${statusNames[change.status]}: ${path}`;
}
