import type { FileChange } from '../shared/protocol';
import { changesTree, type ChangesFolder } from './changesRows';

export function inTreeOrder(files: readonly FileChange[]): FileChange[] {
  const rank = new Map<string, number>();
  const visit = (folder: ChangesFolder) => {
    folder.folders.forEach(visit);
    for (const { path } of folder.files) {
      rank.set(path, rank.size);
    }
  };
  visit(changesTree(files));
  return files.toSorted(
    (a, b) => (rank.get(a.path) ?? 0) - (rank.get(b.path) ?? 0),
  );
}
