import * as path from 'node:path';
import { isFolder, repositoryRoot, spellingOf } from './repository';
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
  const [listed, mainPath] = await Promise.all([
    listWorktrees(gitPath, root ?? folder, root === undefined ? [] : [root]),
    root === undefined ? undefined : mainWorktreePath(gitPath, root),
  ]);
  const [listedMain, ...rest] = listed;
  if (!listedMain) {
    return undefined;
  }
  const worktrees =
    mainPath !== undefined && !listedMain.bare
      ? [
          {
            ...listedMain,
            path: await spellingOf(mainPath, [root ?? mainPath]),
          },
          ...rest,
        ]
      : listed;
  return { repository: worktrees[0].path, worktree: root, worktrees };
}

async function mainWorktreePath(
  gitPath: string,
  root: string,
): Promise<string | undefined> {
  const [gitDir = '', commonDir = ''] = (
    await runGit(gitPath, root, [
      'rev-parse',
      '--path-format=absolute',
      '--git-dir',
      '--git-common-dir',
    ])
  ).split('\n');
  if (path.relative(gitDir, commonDir) === '') {
    return root;
  }
  const configured = (
    await runGit(
      gitPath,
      root,
      ['config', '--file', path.join(commonDir, 'config'), 'core.worktree'],
      { okExitCodes: [0, 1] },
    )
  ).trim();
  return configured ? path.resolve(commonDir, configured) : undefined;
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
