import * as assert from 'node:assert';
import { execFile, type SpawnOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { replaceBuiltin } from './builtins';
import { removeFolder, tempFolder } from './tempFolders';
import { findGit, minimumGitVersion } from '../../tools/git/main/locate';
import { type GitCommand, realGit } from '../../lib/main/gitCommand';

const withoutTheUsersGitConfig = { GIT_CONFIG_GLOBAL: '/dev/null' };

Object.assign(process.env, withoutTheUsersGitConfig);

interface ImportedCommit {
  readonly message: string;
  readonly files?: Readonly<Record<string, string>>;
}

export interface TempRepository {
  readonly root: string;
  readonly gitPath: string;
  git(...args: string[]): Promise<string>;
  commit(message: string, files?: Record<string, string>): Promise<void>;
  resolve(...revisions: string[]): Promise<string[]>;
  copy(root: string): Promise<TempRepository>;
  importCommits(
    ref: string,
    from: string,
    commits: readonly ImportedCommit[],
  ): Promise<string[]>;
}

const withoutConfigThatMayTrustEveryFolder = {
  GIT_CONFIG_NOSYSTEM: '1',
  ...withoutTheUsersGitConfig,
};

const ownedByAnother = {
  GIT_TEST_ASSUME_DIFFERENT_OWNER: '1',
  ...withoutConfigThatMayTrustEveryFolder,
};

function isInside(folder: string, cwd: unknown): boolean {
  if (typeof cwd !== 'string') {
    return false;
  }
  const relative = path.relative(folder, cwd);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

export async function asIfOwnedByAnother(
  folder: string,
  run: () => Promise<void>,
): Promise<void> {
  const childProcess = process.getBuiltinModule('node:child_process');
  const { spawn } = childProcess;
  replaceBuiltin(
    childProcess,
    'spawn',
    (command: string, args: readonly string[], options: SpawnOptions) =>
      spawn(
        command,
        args,
        isInside(folder, options.cwd)
          ? {
              ...options,
              env: { ...(options.env ?? process.env), ...ownedByAnother },
            }
          : options,
      ),
  );
  try {
    await run();
  } finally {
    replaceBuiltin(childProcess, 'spawn', spawn);
  }
}

export async function gitsStarted<T>(
  run: () => Promise<T>,
): Promise<{ readonly result: T; readonly gits: number }> {
  const childProcess = process.getBuiltinModule('node:child_process');
  const { spawn } = childProcess;
  let gits = 0;
  replaceBuiltin(childProcess, 'spawn', (...args: Parameters<typeof spawn>) => {
    gits++;
    return spawn(...args);
  });
  try {
    return { result: await run(), gits };
  } finally {
    replaceBuiltin(childProcess, 'spawn', spawn);
  }
}

function runGit(
  cwd: string,
  date: Date,
  args: string[],
  input?: string,
): Promise<string> {
  const iso = date.toISOString();
  return fixtureGit().then(
    ({ command, env: realEnv }) =>
      new Promise((resolve, reject) => {
        const child = execFile(
          command,
          [
            '-c',
            'user.name=Test',
            '-c',
            'user.email=test@example.com',
            '-c',
            'maintenance.auto=false',
            ...args,
          ],
          {
            cwd,
            env: {
              ...process.env,
              ...realEnv,
              ...withoutTheUsersGitConfig,
              GIT_AUTHOR_DATE: iso,
              GIT_COMMITTER_DATE: iso,
            },
          },
          (error, stdout, stderr) => {
            if (error) {
              reject(
                new Error(
                  `git ${args.join(' ')} failed: ${stderr} (exit code ${String(error.code ?? 'none')}, signal ${error.signal ?? 'none'})`,
                ),
              );
            } else {
              resolve(stdout);
            }
          },
        );
        child.stdin?.end(input);
      }),
  );
}

let templateFolder: string | undefined;
const templates = new Map<string, Promise<string>>();

export function removeTemplates(): void {
  if (templateFolder !== undefined) {
    removeFolder(templateFolder);
    templateFolder = undefined;
    templates.clear();
  }
}

function template(branch: string, bare: boolean): Promise<string> {
  const key = JSON.stringify([branch, bare]);
  let made = templates.get(key);
  if (made === undefined) {
    templateFolder ??= tempFolder('templates');
    const folder = path.join(templateFolder, String(templates.size));
    fs.mkdirSync(folder);
    made = runGit(folder, new Date(0), [
      'init',
      '-b',
      branch,
      ...(bare ? ['--bare'] : []),
    ]).then(() => {
      fs.rmSync(path.join(folder, bare ? '' : '.git', 'hooks'), {
        recursive: true,
      });
      return folder;
    });
    templates.set(key, made);
  }
  return made;
}

export async function tempRepository(
  root: string,
  { branch = 'main', bare = false } = {},
): Promise<TempRepository> {
  const gitPath = await installedGit();
  fs.mkdirSync(root, { recursive: true });
  fs.cpSync(await template(branch, bare), root, { recursive: true });
  return repositoryAt(root, gitPath, bare, 1);
}

function data(text: string): string {
  return `data ${Buffer.byteLength(text)}\n${text}\n`;
}

function fastImportStream(
  ref: string,
  from: string,
  commits: readonly ImportedCommit[],
  nextDate: () => Date,
): string {
  const made = commits.map(({ message, files = {} }, index) => {
    const seconds = Math.floor(nextDate().getTime() / 1000);
    const person = `Test <test@example.com> ${seconds} +0000`;
    return [
      `commit ${ref}\n`,
      `mark :${index + 1}\n`,
      `author ${person}\n`,
      `committer ${person}\n`,
      data(message),
      index === 0 ? `from ${from}^0\n` : '',
      ...Object.entries(files).map(
        ([file, content]) => `M 100644 inline ${file}\n${data(content)}`,
      ),
      '\n',
    ].join('');
  });
  const marks = commits.map((_, index) => `get-mark :${index + 1}\n`);
  return ['feature get-mark\n', ...made, ...marks].join('');
}

function repositoryAt(
  root: string,
  gitPath: string,
  bare: boolean,
  firstMinute: number,
): TempRepository {
  let minute = firstMinute;
  const nextDate = () => new Date(Date.UTC(2026, 0, 1, 0, minute++));
  const git = (...args: string[]): Promise<string> =>
    runGit(root, nextDate(), args);
  return {
    root,
    gitPath,
    git,
    copy: async (to) => {
      fs.cpSync(root, to, { recursive: true });
      const copied = repositoryAt(to, gitPath, bare, minute);
      if (!bare) {
        await copied.git('update-index', '-q', '--refresh');
      }
      return copied;
    },
    importCommits: async (ref, from, commits) =>
      (
        await runGit(
          root,
          nextDate(),
          ['fast-import', '--quiet'],
          fastImportStream(ref, from, commits, nextDate),
        )
      )
        .trim()
        .split('\n'),
    commit: async (message, files = {}) => {
      for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
        fs.writeFileSync(path.join(root, file), content);
      }
      if (Object.keys(files).length === 0) {
        await git('commit', '--allow-empty', '-m', message);
      } else {
        await git('add', '--', ...Object.keys(files));
        await git('commit', '-m', message);
      }
    },
    resolve: async (...revisions) =>
      (await git('rev-parse', ...revisions)).trim().split('\n'),
  };
}

export function objectId(type: string, content: string): string {
  return createHash('sha1')
    .update(`${type} ${Buffer.byteLength(content)}\0${content}`)
    .digest('hex');
}

export function commitText(tree: string, message: string): string {
  const person = 'Test <test@example.com> 0 +0000';
  return `tree ${tree}\nauthor ${person}\ncommitter ${person}\n\n${message}\n`;
}

export async function commitAtTime(
  repository: TempRepository,
  parent: string,
  time: number,
  message: string,
): Promise<string> {
  return (
    await runGit(repository.root, new Date(time * 1000), [
      'commit-tree',
      `${parent}^{tree}`,
      '-p',
      parent,
      '-m',
      message,
    ])
  ).trim();
}

let gitPath: Promise<string> | undefined;

export function installedGit(): Promise<string> {
  gitPath ??= findGit().then((git) => {
    assert.ok(
      git.kind === 'found',
      `git ${minimumGitVersion.join('.')} or later is not installed`,
    );
    return git.path;
  });
  return gitPath;
}

let fixtureGitCommand: Promise<GitCommand> | undefined;

function fixtureGit(): Promise<GitCommand> {
  fixtureGitCommand ??= installedGit().then(
    (launcher) => realGit(launcher) ?? { command: launcher, env: {} },
  );
  return fixtureGitCommand;
}
