import { execFile } from 'node:child_process';
import type { FileChange } from '../protocol';

// Commit files and patches come from git show, because the Git extension API
// only diffs ranges (a...b), which fails for root commits

const showArgs = ['show', '--diff-merges=first-parent', '--format=', '-M'];

// git diff --no-index exits with 1 when the files differ
export function runGit(
  gitPath: string,
  cwd: string,
  args: readonly string[],
  okExitCodes: readonly number[] = [0],
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
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
    runGit(
      gitPath,
      cwd,
      ['diff', '--no-index', '--', '/dev/null', file],
      [0, 1],
    );
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
