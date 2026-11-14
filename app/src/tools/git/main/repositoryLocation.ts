import { lstat } from 'node:fs/promises';
import * as path from 'node:path';
import { gitErrorText } from './errorText';
import {
  isFolder,
  repositoryRoot,
  sameFolder,
  spelledFrom,
  spellingOf,
} from './repository';
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
  if (root === undefined && !(await isGitFolder(gitPath, folder))) {
    return undefined;
  }
  const [listed, mainPath] = await Promise.all([
    listWorktrees(gitPath, root ?? folder, root === undefined ? [] : [root]),
    root === undefined ? undefined : mainWorktreePath(gitPath, root),
  ]);
  const [listedMain, ...rest] = listed;
  if (
    !listedMain ||
    (root === undefined && !listedMain.bare && !listedMain.missing)
  ) {
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
      : [
          {
            ...listedMain,
            missing:
              listedMain.missing ||
              (!listedMain.bare && !(await hasGitEntry(listedMain.path))),
          },
          ...rest,
        ];
  return { repository: worktrees[0].path, worktree: root, worktrees };
}

function hasGitEntry(folder: string): Promise<boolean> {
  return lstat(path.join(folder, '.git')).then(
    () => true,
    () => false,
  );
}

async function configuredWorktree(
  gitPath: string,
  cwd: string,
  commonDir: string,
): Promise<string> {
  return (
    await runGit(
      gitPath,
      cwd,
      ['config', '--file', path.join(commonDir, 'config'), 'core.worktree'],
      { okExitCodes: [0, 1] },
    )
  ).trim();
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
  const configured = await configuredWorktree(gitPath, root, commonDir);
  return configured
    ? spelledFrom(root, path.resolve(commonDir, configured))
    : undefined;
}

async function isGitFolder(gitPath: string, folder: string): Promise<boolean> {
  try {
    const output = await runInGitFolder(gitPath, folder, [
      'rev-parse',
      '--is-bare-repository',
      '--is-inside-git-dir',
    ]);
    return output.split('\n').includes('true');
  } catch {
    return false;
  }
}

const refusedBare = /cannot use bare repository/;

async function runInGitFolder(
  gitPath: string,
  folder: string,
  args: readonly string[],
): Promise<string> {
  try {
    return await runGit(gitPath, folder, args);
  } catch (error) {
    if (!refusedBare.test(gitErrorText(error))) {
      throw error;
    }
    return runGit(gitPath, folder, [`--git-dir=${folder}`, ...args]);
  }
}

async function listsItselfAsMain(
  gitPath: string,
  cwd: string,
  main: Worktree,
): Promise<boolean> {
  return (
    !main.bare &&
    !(await hasGitEntry(main.path)) &&
    (await sameFolder(main.path, cwd)) &&
    !(await configuredWorktree(gitPath, cwd, main.path))
  );
}

export async function listWorktrees(
  gitPath: string,
  cwd: string,
  known: readonly string[] = [],
): Promise<Worktree[]> {
  const [first, ...rest] = parseWorktrees(
    await runInGitFolder(gitPath, cwd, [
      'worktree',
      'list',
      '--porcelain',
      '-z',
    ]),
  );
  if (!first) {
    return [];
  }
  const sorted = [
    {
      ...first,
      missing: first.missing || (await listsItselfAsMain(gitPath, cwd, first)),
    },
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
