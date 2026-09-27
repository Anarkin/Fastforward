import type { FileChange } from '../protocol';

// Changed files show their status by the color of their name, the way VS
// Code's Explorer does, and in words in their tooltip
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
