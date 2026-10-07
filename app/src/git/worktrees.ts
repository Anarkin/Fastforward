import * as path from 'node:path';
import { isFolder, repositoryRoot, sameFolder } from './repository';
import { runGit, splitNul } from './run';

export interface Worktree {
  readonly path: string;
  readonly head: string | undefined;
  readonly branch: string | undefined;
  readonly bare: boolean;
  readonly missing: boolean;
}

export interface Location {
  readonly repository: string;
  readonly worktree: string | undefined;
  readonly worktrees: readonly Worktree[];
}

export async function locateRepository(
  gitPath: string,
  folder: string,
): Promise<Location | undefined> {
  const root = await repositoryRoot(gitPath, folder);
  if (root === undefined && !(await isBareRepository(gitPath, folder))) {
    return undefined;
  }
  const worktrees = await listWorktrees(
    gitPath,
    root ?? folder,
    root === undefined ? [] : [root],
  );
  const [first] = worktrees;
  return first && { repository: first.path, worktree: root, worktrees };
}

async function isBareRepository(
  gitPath: string,
  folder: string,
): Promise<boolean> {
  try {
    const output = await runGit(gitPath, folder, [
      'rev-parse',
      '--is-bare-repository',
    ]);
    return output.trim() === 'true';
  } catch {
    return false;
  }
}

export async function listWorktrees(
  gitPath: string,
  cwd: string,
  known: readonly string[] = [],
): Promise<Worktree[]> {
  const [first, ...rest] = parseWorktrees(
    await runGit(gitPath, cwd, ['worktree', 'list', '--porcelain', '-z']),
  );
  if (!first) {
    return [];
  }
  const sorted = [
    first,
    ...rest.toSorted((a, b) =>
      a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }),
    ),
  ];
  return Promise.all(
    sorted.map(async (worktree) => ({
      ...worktree,
      path: await spellingOf(worktree.path, known),
      missing:
        worktree.missing ||
        (!worktree.bare && !(await isFolder(worktree.path))),
    })),
  );
}

async function spellingOf(
  folder: string,
  known: readonly string[],
): Promise<string> {
  const same = known.find((spelling) => path.relative(spelling, folder) === '');
  if (same !== undefined) {
    return same;
  }
  const real = await Promise.all(
    known.map((spelling) => sameFolder(spelling, folder)),
  );
  return known[real.indexOf(true)] ?? folder;
}

export function parseWorktrees(output: string): Worktree[] {
  return output.split('\0\0').flatMap((record): Worktree[] => {
    const fields = new Map(
      splitNul(record)
        .filter(Boolean)
        .map((line) => {
          const space = line.indexOf(' ');
          return space === -1
            ? [line, '']
            : [line.slice(0, space), line.slice(space + 1)];
        }),
    );
    const folder = fields.get('worktree');
    if (folder === undefined) {
      return [];
    }
    const head = fields.get('HEAD');
    return [
      {
        path: path.resolve(folder),
        head: head === undefined || /^0+$/.test(head) ? undefined : head,
        branch: fields.get('branch')?.replace(/^refs\/heads\//, ''),
        bare: fields.has('bare'),
        missing: fields.has('prunable'),
      },
    ];
  });
}
