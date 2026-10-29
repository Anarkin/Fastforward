import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import {
  ignoredPaths,
  watchesRecursively,
  watchRepository,
  type Watcher,
} from '../../../../../tools/git/main/cli/watch';
import { waitFor } from '../../../../fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../repositories';

export let repository: TempRepository;
export let changes: boolean[];
export let errors: unknown[];
let watcher: Watcher | undefined;

export function watchingRepositories(): void {
  let made: TempRepository;

  beforeAll(async () => {
    made = await tempRepository(tempFolder('watch'));
    fs.writeFileSync(path.join(made.root, '.gitignore'), 'ignored/\n/build\n');
    fs.mkdirSync(path.join(made.root, 'ignored'));
    await made.git('add', '.gitignore');
    await made.git('commit', '-m', 'first');
  });

  afterAll(() => removeFolder(made.root));

  beforeEach(async () => {
    repository = await made.copy(tempFolder('watch'));
    changes = [];
    errors = [];
  });

  beforeEach((context) => {
    if (
      !watchesRecursively() &&
      context.task.name.endsWith('watching recursively')
    ) {
      context.skip();
    }
  });

  afterEach(async () => {
    await stopWatching();
    removeFolder(repository.root);
  });
}

export async function startWatching(
  options: Parameters<typeof watchRepository>[2],
): Promise<void> {
  watcher = await watchRepository(repository.gitPath, repository.root, options);
}

export async function stopWatching(): Promise<void> {
  await watcher?.dispose();
  watcher = undefined;
}

export const untilQuiet = async (
  told: () => number,
  busy: () => boolean,
  what: string,
  quietFor = 300,
) => {
  let last = told();
  let since = Date.now();
  await waitFor(() => {
    if (told() !== last || busy()) {
      last = told();
      since = Date.now();
    }
    return Date.now() - since > quietFor;
  }, what);
};

export const askingGit = () => {
  const asked: string[] = [];
  const answered: string[] = [];
  let asking = 0;
  return {
    asked,
    answered,
    busy: () => asking > 0,
    ignored: async (repo: string, paths: readonly string[]) => {
      asked.push(...paths);
      asking++;
      try {
        return await ignoredPaths(repository.gitPath, repo, paths);
      } finally {
        asking--;
        answered.push(...paths);
      }
    },
  };
};

export const keepWriting = (
  file: string | readonly string[],
  what: string,
  until = () => changes.includes(false),
  apart = 0,
) => {
  const files = typeof file === 'string' ? [file] : file;
  let lines = '';
  let written = -Infinity;
  return waitFor(() => {
    if (Date.now() - written >= apart) {
      written = Date.now();
      lines += 'line\n';
      for (const each of files) {
        fs.writeFileSync(path.resolve(repository.root, each), lines);
      }
    }
    return until();
  }, what);
};

export const worktreeInBareRepository = async () => {
  const folder = tempFolder('bare');
  const bare = path.join(folder, 'project.git');
  await repository.git('clone', '-q', '--bare', repository.root, bare);
  const worktree = path.join(bare, 'main');
  await repository.git('-C', bare, 'worktree', 'add', '-q', worktree, 'main');
  return { folder, worktree };
};

export const settled = async (busy = () => false) => {
  await untilQuiet(
    () => changes.length,
    busy,
    'the folders read while starting to be told',
    500,
  );
  changes = [];
};
