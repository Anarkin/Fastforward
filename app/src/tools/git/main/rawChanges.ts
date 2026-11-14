import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { linkMode, type FileChange } from '../shared/protocol';
import { blobSizes } from './files';
import { splitNul } from './run';

export interface RawChange {
  readonly oldMode: string;
  readonly newMode: string;
  readonly oldId: string;
  readonly newId: string;
  readonly linesCounted: boolean;
  readonly file: FileChange;
}

export async function withBytes(
  gitPath: string,
  cwd: string,
  changes: readonly RawChange[],
  { fromDisk = false, reverse = false } = {},
): Promise<RawChange[]> {
  const sizes = await blobSizes(
    gitPath,
    cwd,
    blobsToSize(changes, { fromDisk, reverse }),
  );
  const sizeOnDisk = async (path: string) => {
    const stats = await lstat(join(cwd, path)).catch(() => undefined);
    return stats?.isFile() ? stats.size : 0;
  };
  return Promise.all(
    changes.map(async (change) => {
      if (!linesChanged(change)) {
        return change;
      }
      const { oldId, newId, file } = change;
      const [oldSide, newSide, path] = reverse
        ? [newId, oldId, file.oldPath ?? file.path]
        : [oldId, newId, file.path];
      const bytes =
        (sizes.get(oldSide) ?? 0) +
        (fromDisk ? await sizeOnDisk(path) : (sizes.get(newSide) ?? 0));
      return { ...change, file: { ...file, bytes } };
    }),
  );
}

const linesChanged = ({ file }: RawChange) =>
  file.insertions + file.deletions > 0;

const gitlinkMode = '160000';

export function blobsToSize(
  changes: readonly RawChange[],
  { fromDisk = false, reverse = false } = {},
): string[] {
  return [
    ...new Set(
      changes
        .filter(linesChanged)
        .flatMap(({ oldMode, newMode, oldId, newId }) => [
          ...(oldMode === gitlinkMode || (fromDisk && reverse) ? [] : [oldId]),
          ...(newMode === gitlinkMode || (fromDisk && !reverse) ? [] : [newId]),
        ])
        .filter((id) => !isNullId(id)),
    ),
  ];
}

export function isNullId(id: string): boolean {
  return /^0+$/.test(id);
}

const simpleStatuses = ['A', 'M', 'D', 'T'] as const;

const noMode = '000000';

function linkOf({ oldMode, newMode }: Pick<RawChange, 'oldMode' | 'newMode'>) {
  return (newMode === noMode ? oldMode : newMode) === linkMode
    ? { link: true as const }
    : {};
}

export function parseChanges(output: string): FileChange[] {
  return parseRawChanges(output).map(({ file }) => file);
}

export function parseRawChanges(output: string): RawChange[] {
  const tokens = splitNul(output);
  const files: Omit<RawChange, 'linesCounted'>[] = [];
  const stats = new Map<string, { insertions: number; deletions: number }>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith(':')) {
      const [oldMode = '', newMode = '', oldId = '', newId = '', status = ''] =
        token.slice(1).split(' ');
      const sides = { oldMode, newMode, oldId, newId };
      const code = status[0] ?? '';
      if (code === 'R' || code === 'C') {
        files.push({
          ...sides,
          file: {
            status: code,
            oldPath: tokens[i + 1],
            path: tokens[i + 2],
            insertions: 0,
            deletions: 0,
            ...(oldId === newId && !isNullId(newId) ? { id: newId } : {}),
            ...linkOf(sides),
          },
        });
        i += 2;
      } else {
        files.push({
          ...sides,
          file: {
            status: simpleStatuses.find((known) => known === code) ?? '?',
            oldPath: undefined,
            path: tokens[i + 1],
            insertions: 0,
            deletions: 0,
            ...linkOf(sides),
          },
        });
        i += 1;
      }
      continue;
    }
    const match = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(token);
    if (!match) {
      continue;
    }
    let path = match[3];
    if (path === '') {
      path = tokens[i + 2];
      i += 2;
    }
    stats.set(path, {
      insertions: Number(match[1]) || 0,
      deletions: Number(match[2]) || 0,
    });
  }
  return files.map((change) => {
    const counted = stats.get(change.file.path);
    return {
      ...change,
      linesCounted: counted !== undefined,
      file: { ...change.file, ...counted },
    };
  });
}
