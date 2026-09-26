import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import type { CommitInfo, FileChange } from '../protocol';

// Commit files and patches come from git show, because the Git extension API
// only diffs ranges (a...b), which fails for root commits

const showArgs = ['show', '--diff-merges=first-parent', '--format=', '-M'];

interface RunOptions {
  // git diff --no-index exits with 1 when the files differ
  readonly okExitCodes?: readonly number[];
  // Written to the command's stdin
  readonly input?: string;
}

export function runGit(
  gitPath: string,
  cwd: string,
  args: readonly string[],
  { okExitCodes = [0], input }: RunOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      gitPath,
      args,
      { cwd, maxBuffer: 256 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error && !okExitCodes.includes(Number(error.code))) {
          reject(
            new Error(
              `git ${args.join(' ')} failed: ${stderr || error.message}`,
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
  const [nameStatus, numstat] = await Promise.all([
    runGit(gitPath, cwd, [...showArgs, '--name-status', '-z', hash]),
    runGit(gitPath, cwd, [...showArgs, '--numstat', '-z', hash]),
  ]);
  return withStats(parseNameStatus(nameStatus), parseNumstat(numstat));
}

export function showPatch(
  gitPath: string,
  cwd: string,
  hash: string,
  path: string | undefined,
): Promise<string> {
  return runGit(gitPath, cwd, [
    ...showArgs,
    '--patch',
    hash,
    ...(path ? ['--', path] : []),
  ]);
}

export interface HistoryEntry {
  readonly hash: string;
  readonly parents: readonly string[];
}

// Every commit reachable from HEAD, the branches, the remotes and the tags,
// newest first; took 474 ms for 190k commits
export async function listHistory(
  gitPath: string,
  cwd: string,
): Promise<HistoryEntry[]> {
  const output = await runGit(gitPath, cwd, [
    'rev-list',
    '--date-order',
    '--parents',
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
      '--format=%x1e%H%x00%P%x00%aN%x00%aE%x00%at%x00%B',
      '--',
    ],
    { input: `${hashes.join('\n')}\n` },
  );
  return parseLog(output);
}

// Each commit starts with \x1e, then hash, parents, author, email, time and
// message separated by NULs, then a ":<modes> <status>" and a path per file
export function parseLog(output: string): CommitInfo[] {
  return output
    .split('\x1e')
    .slice(1)
    .map((record) => {
      const [hash, parents, authorName, authorEmail, time, body, ...files] =
        splitNul(record);
      const message = body.trimEnd();
      return {
        hash,
        subject: message.split('\n', 1)[0],
        message,
        parents: parents ? parents.split(' ') : [],
        authorName,
        authorEmail,
        authorDate: Number(time) * 1000,
        files: files.filter((token) => token.trimStart().startsWith(':'))
          .length,
      };
    });
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

function toContent(buffer: Buffer): FileContent {
  if (
    buffer.length > maxFileSize ||
    buffer.subarray(0, binaryProbe).includes(0)
  ) {
    return { content: '', binary: true };
  }
  return { content: buffer.toString('utf8'), binary: false };
}

// A file's content at a commit, or in the working tree
export async function readFile(
  gitPath: string,
  cwd: string,
  hash: string | undefined,
  path: string,
): Promise<FileContent> {
  if (hash === undefined) {
    return toContent(await fs.readFile(join(cwd, path)));
  }
  const output = await new Promise<Buffer>((resolve, reject) => {
    execFile(
      gitPath,
      ['show', `${hash}:${path}`],
      { cwd, maxBuffer: 256 * 1024 * 1024, encoding: 'buffer' },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
  return toContent(output);
}

// Uncommitted changes are the working tree and index against HEAD, plus
// untracked files
const workingTreeArgs = ['diff', 'HEAD', '-M'];

async function listUntracked(gitPath: string, cwd: string): Promise<string[]> {
  const output = await runGit(gitPath, cwd, [
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
  ]);
  return splitNul(output).filter(Boolean);
}

export async function workingTreeFiles(
  gitPath: string,
  cwd: string,
): Promise<FileChange[]> {
  const [nameStatus, numstat, untracked] = await Promise.all([
    runGit(gitPath, cwd, [...workingTreeArgs, '--name-status', '-z']),
    runGit(gitPath, cwd, [...workingTreeArgs, '--numstat', '-z']),
    listUntracked(gitPath, cwd),
  ]);
  return [
    ...withStats(parseNameStatus(nameStatus), parseNumstat(numstat)),
    ...untracked.map((path) => ({
      path,
      oldPath: undefined,
      status: 'U' as const,
      insertions: 0,
      deletions: 0,
    })),
  ];
}

// Untracked files get their patch from diffing them against /dev/null, which
// git supports on Windows too; at most this many are included in the full
// patch, to keep huge untracked folders from flooding the view
const maxUntrackedPatches = 50;

export async function workingTreePatch(
  gitPath: string,
  cwd: string,
  path: string | undefined,
): Promise<string> {
  const untracked = await listUntracked(gitPath, cwd);
  const untrackedPatch = (file: string) =>
    runGit(gitPath, cwd, ['diff', '--no-index', '--', '/dev/null', file], {
      okExitCodes: [0, 1],
    });
  if (path && untracked.includes(path)) {
    return untrackedPatch(path);
  }
  const tracked = await runGit(gitPath, cwd, [
    ...workingTreeArgs,
    ...(path ? ['--', path] : []),
  ]);
  if (path) {
    return tracked;
  }
  const patches = await Promise.all(
    untracked.slice(0, maxUntrackedPatches).map(untrackedPatch),
  );
  return [tracked, ...patches].join('');
}

type NameStatus = Omit<FileChange, 'insertions' | 'deletions'>;
type Stats = Map<string, { insertions: number; deletions: number }>;

function withStats(files: NameStatus[], stats: Stats): FileChange[] {
  return files.map((file) => ({
    ...file,
    ...(stats.get(file.path) ?? { insertions: 0, deletions: 0 }),
  }));
}

const simpleStatuses = ['A', 'M', 'D', 'T'] as const;

// "M\0path\0R100\0old\0new\0"
export function parseNameStatus(output: string): NameStatus[] {
  const tokens = splitNul(output);
  const files: NameStatus[] = [];
  for (let i = 0; i + 1 < tokens.length;) {
    const code = tokens[i][0];
    if (code === 'R' || code === 'C') {
      files.push({ status: code, oldPath: tokens[i + 1], path: tokens[i + 2] });
      i += 3;
    } else {
      const status = simpleStatuses.find((known) => known === code) ?? '?';
      files.push({ status, oldPath: undefined, path: tokens[i + 1] });
      i += 2;
    }
  }
  return files;
}

// "ins\tdel\tpath\0", or "ins\tdel\t\0old\0new\0" for renames, with "-" for
// binary files
export function parseNumstat(output: string): Stats {
  const tokens = splitNul(output);
  const stats: Stats = new Map();
  for (let i = 0; i < tokens.length; i++) {
    const match = /^(-|\d+)\t(-|\d+)\t(.*)$/.exec(tokens[i]);
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
  return stats;
}
