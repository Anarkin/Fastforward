import { type ChangeArea, type FileChange } from '../shared/protocol';
import { areaKey } from './changesRows';
import { matchesFilter } from '../../../lib/shared/filter';

export function listsNothing({
  files,
  staged,
  allPaths,
  loading,
}: {
  files: readonly FileChange[];
  staged: readonly FileChange[] | undefined;
  allPaths: readonly string[] | undefined;
  loading: boolean;
}): boolean {
  return (
    !loading &&
    files.length === 0 &&
    staged === undefined &&
    (allPaths ?? []).length === 0
  );
}

interface Side {
  readonly area: ChangeArea | undefined;
  readonly files: readonly FileChange[];
  readonly allPaths: readonly string[] | undefined;
}

export function sidesOf(
  files: readonly FileChange[],
  staged: readonly FileChange[] | undefined,
  allPaths: readonly string[] | undefined,
): Side[] {
  return staged === undefined
    ? [{ area: undefined, files, allPaths }]
    : [
        { area: undefined, files: [], allPaths: undefined },
        { area: 'staged', files: staged, allPaths: undefined },
        { area: 'unstaged', files, allPaths },
      ];
}

export function filteredSide(side: Side, words: readonly string[]): Side {
  return words.length === 0
    ? side
    : {
        area: side.area,
        files: side.files.filter((file) =>
          matchesFilter(words, file.path, file.oldPath),
        ),
        allPaths: side.allPaths?.filter((path) => matchesFilter(words, path)),
      };
}

export function toggled(
  folders: ReadonlySet<string>,
  folder: string,
): Set<string> {
  const next = new Set(folders);
  if (!next.delete(folder)) {
    next.add(folder);
  }
  return next;
}

export function foldersOn(
  folders: ReadonlySet<string>,
  area: ChangeArea | undefined,
): ReadonlySet<string> {
  if (area === undefined) {
    return folders;
  }
  const prefix = areaKey(area, '');
  return new Set(
    [...folders]
      .filter((folder) => folder.startsWith(prefix))
      .map((folder) => folder.slice(prefix.length)),
  );
}
