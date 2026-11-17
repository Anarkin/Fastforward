import { workingTreeHash, type ChangeArea } from '../../../lib/shared/changes';
import type { FileChange } from '../../../lib/shared/changes';
import { comparedOf, workingTreeSide } from '../../../lib/shared/comparisons';
import { wholePath } from '../../../lib/page/pathLooks';
import { headRev, indexRev } from '../shared/fileRevs';

type Side = 'old' | 'new';

export interface FileAt {
  readonly path: string;
  readonly rev: string;
}

function sideRev(
  hash: string,
  area: ChangeArea | undefined,
  side: Side,
): string | undefined {
  if (area !== 'staged' && side === workingTreeSide(hash)) {
    return undefined;
  }
  if (hash === workingTreeHash) {
    return side === 'new' || area === 'unstaged' ? indexRev : headRev;
  }
  const compared = comparedOf(hash);
  if (compared !== undefined) {
    return side === 'old' ? compared.from : compared.to;
  }
  return side === 'old' ? `${hash}^` : hash;
}

function inRepository(root: string, path: string): string | undefined {
  const separator = root.includes('\\') ? '\\' : '/';
  const prefix = root.endsWith(separator) ? root : `${root}${separator}`;
  if (!path.startsWith(prefix) || path.length === prefix.length) {
    return undefined;
  }
  const inside = path.slice(prefix.length);
  return separator === '/' ? inside : inside.replaceAll(separator, '/');
}

export function fileVersions(
  root: string,
  hash: string,
  area: ChangeArea | undefined,
  changes: readonly FileChange[],
): (path: string) => FileAt | undefined {
  const atSide = (path: string, side: Side): FileAt | undefined => {
    const rev = sideRev(hash, area, side);
    return rev === undefined ? undefined : { path, rev };
  };
  const changed = new Map<string, FileAt | undefined>();
  for (const change of changes) {
    const shown = change.status === 'D' ? 'old' : 'new';
    changed.set(wholePath(root, change.path), atSide(change.path, shown));
    if (change.oldPath !== undefined && change.oldPath !== change.path) {
      changed.set(
        wholePath(root, change.oldPath),
        atSide(change.oldPath, 'old'),
      );
    }
  }
  return (path) => {
    if (changed.has(path)) {
      return changed.get(path);
    }
    const inside = inRepository(root, path);
    return inside === undefined ? undefined : atSide(inside, 'new');
  };
}
