import * as path from 'node:path';
import type { RepositoryInfo } from '../shared/protocol';
import { strings } from '../../../lib/shared/strings';

export function tabInfos(
  roots: readonly string[],
  paths: path.PlatformPath = path,
): RepositoryInfo[] {
  const same = (name: string) =>
    paths.sep === '\\' ? name.toLowerCase() : name;
  const tabs = roots.map((root) => ({
    root,
    name: tabName(root, paths),
    above: foldersAbove(namedFolder(root, paths), paths),
  }));
  return tabs.map(({ root, name, above }) => {
    const levels = new Set<number>();
    for (const other of tabs) {
      if (other.root === root || same(other.name) !== same(name)) {
        continue;
      }
      const level = above.findIndex(
        (folder, index) =>
          other.above[index] === undefined ||
          same(other.above[index]) !== same(folder),
      );
      if (level !== -1) {
        levels.add(level);
      }
    }
    if (levels.size === 0) {
      return { root, name };
    }
    const shown = [...levels].toSorted((a, b) => b - a);
    const folders = shown.flatMap((level, index) =>
      index > 0 && shown[index - 1] - level > 1
        ? [strings.symbols.foldersLeftOut, above[level]]
        : [above[level]],
    );
    return { root, name, folder: paths.join(...folders) };
  });
}

function namedFolder(root: string, paths: path.PlatformPath): string {
  const name = paths.basename(root);
  return name === '.bare' || name === '.git'
    ? namedFolder(paths.dirname(root), paths)
    : root;
}

function foldersAbove(folder: string, paths: path.PlatformPath): string[] {
  const parent = paths.dirname(folder);
  return parent === folder
    ? []
    : [paths.basename(parent) || parent, ...foldersAbove(parent, paths)];
}

export function tabName(root: string, paths: path.PlatformPath = path): string {
  const folder = namedFolder(root, paths);
  return paths.basename(folder).replace(/(.)\.git$/, '$1') || folder;
}
