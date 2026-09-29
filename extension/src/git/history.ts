import { isHashPrefix } from '../shared/hashes';
import type { CommitInfo, HashLookup } from '../shared/protocol';
import { runGit, splitNul } from './run';

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

// The full hash of a commit given by a short one, if there is one
export async function commitOf(
  gitPath: string,
  cwd: string,
  prefix: string,
): Promise<string | undefined> {
  if (!isHashPrefix(prefix)) {
    return undefined;
  }
  const output = await runGit(
    gitPath,
    cwd,
    ['rev-parse', '--verify', '--quiet', `${prefix}^{commit}`],
    { okExitCodes: [0, 1, 128] },
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
  if (!isHashPrefix(prefix)) {
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

// Which commit a typed hash is, with its subject; the type of the object it
// names answers at once when it is the only one starting so, as it usually
// is, and only a commit is read, not a blob that may be huge; the candidates
// are listed only when there are several, or when git read the hash as the
// name of a ref
export async function findCommit(
  gitPath: string,
  cwd: string,
  prefix: string,
): Promise<HashLookup> {
  if (!isHashPrefix(prefix)) {
    return { kind: 'none' };
  }
  const hex = prefix.toLowerCase();
  const output = await runGit(gitPath, cwd, ['cat-file', '--batch-check'], {
    input: `${hex}\n`,
  });
  // "<hash> <type> <size>", or "<name> missing" or "ambiguous"
  const [hash, type] = output.trim().split(' ');
  if (type === 'missing') {
    return { kind: 'none' };
  }
  if (type !== 'ambiguous' && hash.startsWith(hex)) {
    if (type !== 'commit') {
      return { kind: 'none' };
    }
    // The message follows the headers after an empty line
    const object = await runGit(gitPath, cwd, ['cat-file', 'commit', hash]);
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
// ":<modes> <status>" and a path per file; read field by field, as a message
// may have a \x1e in it, and a path may start with ":" or \x1e
export function parseLog(output: string): CommitInfo[] {
  const tokens = splitNul(output);
  const commits: CommitInfo[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!tokens[i].startsWith('\x1e')) {
      i++;
      continue;
    }
    const [
      hash,
      parents,
      authorName,
      authorEmail,
      time,
      committerName,
      committerEmail,
      commitTime,
      body = '',
    ] = tokens.slice(i, i + 9);
    i += 9;
    let files = 0;
    while (i < tokens.length && tokens[i].trimStart().startsWith(':')) {
      files++;
      i += 2;
    }
    const message = body.trimEnd();
    commits.push({
      hash: hash.slice(1),
      subject: message.split('\n', 1)[0],
      message,
      parents: parents ? parents.split(' ') : [],
      authorName,
      authorEmail,
      authorDate: Number(time) * 1000,
      committerName,
      committerEmail,
      commitDate: Number(commitTime) * 1000,
      files,
    });
  }
  return commits;
}
