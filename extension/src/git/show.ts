import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import type { CommitInfo, FileChange, HashLookup } from '../protocol';

// Commit files and patches come from git show, because the Git extension API
// only diffs ranges (a...b), which fails for root commits

// Diffs in the format the parsers expect, whatever the user's config says:
// no colors, external diff tools or text conversion, and a/ and b/ prefixes
const diffArgs = [
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--src-prefix=a/',
  '--dst-prefix=b/',
];

const showArgs = [
  'show',
  '--diff-merges=first-parent',
  '--format=',
  '-M',
  ...diffArgs,
];

// Settings of the user's config that would change the output: quoted
// non-ASCII paths, colors, signatures in the log, and empty context lines
const configArgs = [
  '-c',
  'core.quotePath=false',
  '-c',
  'color.ui=false',
  '-c',
  'log.showSignature=false',
  '-c',
  'diff.suppressBlankEmpty=false',
];

// Reading commands skip git's optional locks, so a refresh running while the
// user commits elsewhere doesn't hold index.lock and make that commit fail;
// paths are taken literally, so a file named "*.md" isn't a pattern
function env(pathspecMagic = false): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_LITERAL_PATHSPECS: pathspecMagic ? '0' : '1',
  };
}

interface RunOptions {
  // git diff --no-index exits with 1 when the files differ
  readonly okExitCodes?: readonly number[];
  // Written to the command's stdin
  readonly input?: string;
  // Allows pathspec magic like :(exclude), with paths marked literal
  readonly pathspecMagic?: boolean;
}

// The most output a command may have, like the history of a huge repository
const maxOutput = 256 * 1024 * 1024;

export async function runGit(
  gitPath: string,
  cwd: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<string> {
  return (await runGitBytes(gitPath, cwd, args, options)).toString('utf8');
}

// The output as it is, for file contents, which may not be text
function runGitBytes(
  gitPath: string,
  cwd: string,
  args: readonly string[],
  { okExitCodes = [0], input, pathspecMagic }: RunOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      gitPath,
      [...configArgs, ...args],
      {
        cwd,
        env: env(pathspecMagic),
        maxBuffer: maxOutput,
        encoding: 'buffer',
      },
      (error, stdout, stderr) => {
        if (error && !okExitCodes.includes(Number(error.code))) {
          reject(
            new Error(
              `git ${args.join(' ')} failed: ${stderr.toString('utf8') || error.message}`,
            ),
          );
        } else {
          resolve(stdout);
        }
      },
    );
    child.stdin?.end(input);
  });
}

// Output of git commands run with -z
function splitNul(output: string): string[] {
  return output.split('\0');
}

export async function showFiles(
  gitPath: string,
  cwd: string,
  hash: string,
): Promise<FileChange[]> {
  return parseChanges(
    await runGit(gitPath, cwd, [...showArgs, ...changesArgs, hash]),
  );
}

// What part of a diff to fetch: one file, limited to both its paths when it
// was renamed, as git only detects the rename when it sees both, or every
// file except some
export interface PatchScope {
  readonly path?: string;
  readonly oldPath?: string;
  readonly exclude?: readonly string[];
}

function pathspecs({ path, oldPath, exclude = [] }: PatchScope): string[] {
  if (path !== undefined) {
    return oldPath ? ['--', oldPath, path] : ['--', path];
  }
  return exclude.length > 0
    ? ['--', '.', ...exclude.map((file) => `:(exclude,literal)${file}`)]
    : [];
}

export function showPatch(
  gitPath: string,
  cwd: string,
  hash: string,
  scope: PatchScope = {},
): Promise<string> {
  return runGit(
    gitPath,
    cwd,
    [...showArgs, '--patch', hash, ...pathspecs(scope)],
    { pathspecMagic: (scope.exclude?.length ?? 0) > 0 },
  );
}

// The commit HEAD is at, or nothing in a repository without commits yet, or
// on a new branch without any
export async function headCommit(
  gitPath: string,
  cwd: string,
): Promise<string | undefined> {
  const output = await runGit(
    gitPath,
    cwd,
    ['rev-parse', '--verify', '--quiet', 'HEAD'],
    { okExitCodes: [0, 1] },
  );
  return output.trim() || undefined;
}

// The commits whose hash starts with these characters; git needs four at
// least, and lists other objects with them too
export async function commitsStartingWith(
  gitPath: string,
  cwd: string,
  prefix: string,
): Promise<string[]> {
  if (!/^[0-9a-f]{4,40}$/i.test(prefix)) {
    return [];
  }
  const objects = (
    await runGit(gitPath, cwd, [
      'rev-parse',
      `--disambiguate=${prefix.toLowerCase()}`,
    ])
  )
    .split('\n')
    .filter(Boolean);
  if (objects.length === 0) {
    return [];
  }
  const types = await runGit(
    gitPath,
    cwd,
    ['cat-file', '--batch-check=%(objectname) %(objecttype)'],
    { input: `${objects.join('\n')}\n` },
  );
  return types
    .split('\n')
    .filter((line) => line.endsWith(' commit'))
    .map((line) => line.slice(0, line.indexOf(' ')));
}

// Which commit a typed hash is, with its subject; reading the object it names
// answers at once when it is the only one starting so, as it usually is, and
// the candidates are listed only when there are several, or when git read the
// hash as the name of a ref
export async function findCommit(
  gitPath: string,
  cwd: string,
  prefix: string,
): Promise<HashLookup> {
  if (!/^[0-9a-f]{4,40}$/i.test(prefix)) {
    return { kind: 'none' };
  }
  const hex = prefix.toLowerCase();
  const output = await runGit(gitPath, cwd, ['cat-file', '--batch'], {
    input: `${hex}\n`,
  });
  // "<hash> <type> <size>\n<object>", or "<name> missing" or "ambiguous"
  const newline = output.indexOf('\n');
  const [hash, type] = output.slice(0, newline).split(' ');
  if (type === 'missing') {
    return { kind: 'none' };
  }
  if (type !== 'ambiguous' && hash.startsWith(hex)) {
    if (type !== 'commit') {
      return { kind: 'none' };
    }
    // The message follows the headers after an empty line
    const object = output.slice(newline + 1);
    const message = object.slice(object.indexOf('\n\n') + 2);
    return { kind: 'found', hash, subject: message.split('\n', 1)[0] };
  }
  const hashes = await commitsStartingWith(gitPath, cwd, hex);
  if (hashes.length === 1) {
    const [commit] = await logCommits(gitPath, cwd, hashes);
    return { kind: 'found', hash: hashes[0], subject: commit?.subject ?? '' };
  }
  return hashes.length === 0
    ? { kind: 'none' }
    : { kind: 'ambiguous', count: hashes.length };
}

export interface HistoryEntry {
  readonly hash: string;
  readonly parents: readonly string[];
}

// Every commit reachable from HEAD, the branches, the remotes and the tags,
// newest first; took 474 ms for 190k commits; HEAD is skipped before the
// first commit, when it points at a branch that doesn't exist yet
export async function listHistory(
  gitPath: string,
  cwd: string,
): Promise<HistoryEntry[]> {
  const output = await runGit(gitPath, cwd, [
    'rev-list',
    '--date-order',
    '--parents',
    '--ignore-missing',
    'HEAD',
    '--branches',
    '--remotes',
    '--tags',
    '--',
  ]);
  return parseHistory(output);
}

// One "<hash> <parent>..." line per commit
export function parseHistory(output: string): HistoryEntry[] {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, ...parents] = line.split(' ');
      return { hash, parents };
    });
}

// The commits with these hashes, in this order; the Git extension API only
// counts a commit's files with --shortstat, which diffs the contents of every
// file and took 8 s for 300 commits in a large repository, while --raw only
// compares trees and takes about 100 ms for 100 commits
export async function logCommits(
  gitPath: string,
  cwd: string,
  hashes: readonly string[],
): Promise<CommitInfo[]> {
  if (hashes.length === 0) {
    return [];
  }
  const output = await runGit(
    gitPath,
    cwd,
    [
      'log',
      '--stdin',
      '--no-walk=unsorted',
      '--raw',
      '-z',
      '--no-renames',
      '--diff-merges=first-parent',
      '--format=%x1e%H%x00%P%x00%aN%x00%aE%x00%at%x00%cN%x00%cE%x00%ct%x00%B',
      '--',
    ],
    { input: `${hashes.join('\n')}\n` },
  );
  return parseLog(output);
}

// Each commit starts with \x1e, then hash, parents, author, email, time, the
// same of the committer and message separated by NULs, then a
// ":<modes> <status>" and a path per file
export function parseLog(output: string): CommitInfo[] {
  return output
    .split('\x1e')
    .slice(1)
    .map((record) => {
      const [
        hash,
        parents,
        authorName,
        authorEmail,
        time,
        committerName,
        committerEmail,
        commitTime,
        body,
        ...files
      ] = splitNul(record);
      const message = body.trimEnd();
      return {
        hash,
        subject: message.split('\n', 1)[0],
        message,
        parents: parents ? parents.split(' ') : [],
        authorName,
        authorEmail,
        authorDate: Number(time) * 1000,
        committerName,
        committerEmail,
        commitDate: Number(commitTime) * 1000,
        files: files.filter((token) => token.trimStart().startsWith(':'))
          .length,
      };
    });
}

// Commits the checked-out branch has that its upstream doesn't, and the other
// way round, or of any two refs; asked from git, as the Git extension's counts
// can lag behind a change; nothing without an upstream or a branch
export async function aheadBehind(
  gitPath: string,
  cwd: string,
  ref = 'HEAD',
  upstream = '@{upstream}',
): Promise<{ ahead: number; behind: number }> {
  try {
    const output = await runGit(gitPath, cwd, [
      'rev-list',
      '--left-right',
      '--count',
      `${ref}...${upstream}`,
      '--',
    ]);
    const [ahead, behind] = output.trim().split(/\s+/).map(Number);
    return { ahead: ahead || 0, behind: behind || 0 };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}

// The branch each remote considers its main one, like origin/main, which git
// records as refs/remotes/<remote>/HEAD when cloning
export async function remoteDefaultBranches(
  gitPath: string,
  cwd: string,
): Promise<string[]> {
  const output = await runGit(gitPath, cwd, [
    'for-each-ref',
    '--format=%(symref)',
    'refs/remotes/*/HEAD',
  ]);
  return output
    .split('\n')
    .filter((line) => line.startsWith('refs/remotes/'))
    .map((line) => line.slice('refs/remotes/'.length));
}

// Every file of the repository at a commit, or in the working tree including
// untracked files; took 97 ms and 372 ms for 19k files
export async function listTree(
  gitPath: string,
  cwd: string,
  hash: string | undefined,
): Promise<string[]> {
  const output = await runGit(
    gitPath,
    cwd,
    hash === undefined
      ? ['ls-files', '-z', '--cached', '--others', '--exclude-standard']
      : ['ls-tree', '-r', '-z', '--name-only', hash],
  );
  return [...new Set(splitNul(output).filter(Boolean))];
}

// Files over this size, or with a NUL byte near the start, are shown as
// binary instead of their content
const maxFileSize = 2 * 1024 * 1024;
const binaryProbe = 8000;

export interface FileContent {
  readonly content: string;
  readonly binary: boolean;
}

const binaryContent: FileContent = { content: '', binary: true };

function toContent(buffer: Buffer): FileContent {
  return buffer.subarray(0, binaryProbe).includes(0)
    ? binaryContent
    : { content: buffer.toString('utf8'), binary: false };
}

// A submodule is shown as git diffs it, by the commit it is at
function submoduleContent(hash: string | undefined): FileContent {
  return {
    content: hash ? `Subproject commit ${hash}\n` : '',
    binary: false,
  };
}

// A file's content at a commit, or in the working tree; its size is looked at
// first, so a huge file isn't read only to be shown as binary
export async function readFile(
  gitPath: string,
  cwd: string,
  hash: string | undefined,
  path: string,
): Promise<FileContent> {
  if (hash === undefined) {
    const file = join(cwd, path);
    const stats = await fs.stat(file);
    if (stats.isDirectory()) {
      // A submodule, or a repository inside this one; not one that isn't
      // checked out, as git would then find the outer repository
      const checkedOut = await fs.stat(join(file, '.git')).then(
        () => true,
        () => false,
      );
      return submoduleContent(
        checkedOut ? await headCommit(gitPath, file) : undefined,
      );
    }
    return stats.size > maxFileSize
      ? binaryContent
      : toContent(await fs.readFile(file));
  }
  // "<mode> <type> <object> <size>\t<path>", with a size only for files
  const entry = await runGit(gitPath, cwd, [
    'ls-tree',
    '-z',
    '--long',
    hash,
    '--',
    path,
  ]);
  const [mode, type, object, size] = entry
    .slice(0, entry.indexOf('\t'))
    .split(/ +/);
  if (!mode) {
    throw new Error(`${path} is not in ${hash}`);
  }
  if (type === 'commit') {
    return submoduleContent(object);
  }
  return Number(size) > maxFileSize
    ? binaryContent
    : toContent(await runGitBytes(gitPath, cwd, ['cat-file', 'blob', object]));
}

// The uncommitted changes, and what they were diffed against, so their patch
// is of the same changes: HEAD, or nothing before the first commit
export interface WorkingTree {
  readonly base: string;
  readonly files: readonly FileChange[];
}

// Uncommitted changes are the working tree and index against the base, plus
// untracked files
export async function workingTreeFiles(
  gitPath: string,
  cwd: string,
): Promise<WorkingTree> {
  const base =
    (await headCommit(gitPath, cwd)) ??
    (
      await runGit(gitPath, cwd, ['hash-object', '-t', 'tree', '--stdin'], {
        input: '',
      })
    ).trim();
  const [changes, untracked] = await Promise.all([
    runGit(gitPath, cwd, [...workingTreeDiff(base), ...changesArgs]),
    runGit(gitPath, cwd, ['ls-files', '--others', '--exclude-standard', '-z']),
  ]);
  return {
    base,
    files: [
      ...parseChanges(changes),
      ...splitNul(untracked)
        .filter(Boolean)
        .map((path) => ({
          path,
          oldPath: undefined,
          status: 'U' as const,
          insertions: 0,
          deletions: 0,
        })),
    ],
  };
}

function workingTreeDiff(base: string): string[] {
  return ['diff', base, '-M', ...diffArgs];
}

// Untracked files get their patch from diffing them against /dev/null, which
// git supports on Windows too, one process per file on every refresh; at most
// this many are included in the full patch, to keep huge untracked folders
// from flooding the view and spawning git for each of their files
const maxUntrackedPatches = 50;

export async function workingTreePatch(
  gitPath: string,
  cwd: string,
  { base, files }: WorkingTree,
  scope: PatchScope = {},
): Promise<string> {
  // A repository inside this one is listed as its folder, "nested/", which
  // has no patch
  const untrackedPatch = (file: string) =>
    file.endsWith('/')
      ? Promise.resolve('')
      : runGit(
          gitPath,
          cwd,
          ['diff', '--no-index', ...diffArgs, '--', '/dev/null', file],
          { okExitCodes: [0, 1] },
        );
  const { path } = scope;
  const untracked = files
    .filter((file) => file.status === 'U')
    .map((file) => file.path);
  if (path !== undefined && untracked.includes(path)) {
    return untrackedPatch(path);
  }
  const tracked = runGit(
    gitPath,
    cwd,
    [...workingTreeDiff(base), ...pathspecs(scope)],
    { pathspecMagic: (scope.exclude?.length ?? 0) > 0 },
  );
  if (path !== undefined) {
    return tracked;
  }
  // An untracked file that can't be read, like one being written, is left
  // out instead of failing the whole diff
  const [trackedPatch, untrackedPatches] = await Promise.all([
    tracked,
    Promise.allSettled(
      untracked.slice(0, maxUntrackedPatches).map(untrackedPatch),
    ),
  ]);
  return [
    trackedPatch,
    ...untrackedPatches.map((patch) =>
      patch.status === 'fulfilled' ? patch.value : '',
    ),
  ].join('');
}

// Each changed file's status and paths, and its changed lines, in one diff
const changesArgs = ['--raw', '--numstat', '-z'];

const simpleStatuses = ['A', 'M', 'D', 'T'] as const;

// The --raw lines first, ":<modes> <objects> M\0path\0", or
// ":<modes> <objects> R100\0old\0new\0" for renames and copies, then the
// --numstat ones, "ins\tdel\tpath\0", or "ins\tdel\t\0old\0new\0" for
// renames, with "-" for binary files
export function parseChanges(output: string): FileChange[] {
  const tokens = splitNul(output);
  const files: FileChange[] = [];
  const stats = new Map<string, { insertions: number; deletions: number }>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith(':')) {
      const code = token.slice(token.lastIndexOf(' ') + 1)[0];
      if (code === 'R' || code === 'C') {
        files.push({
          status: code,
          oldPath: tokens[i + 1],
          path: tokens[i + 2],
          insertions: 0,
          deletions: 0,
        });
        i += 2;
      } else {
        files.push({
          status: simpleStatuses.find((known) => known === code) ?? '?',
          oldPath: undefined,
          path: tokens[i + 1],
          insertions: 0,
          deletions: 0,
        });
        i += 1;
      }
      continue;
    }
    const match = /^(-|\d+)\t(-|\d+)\t(.*)$/.exec(token);
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
  return files.map((file) => ({ ...file, ...stats.get(file.path) }));
}
