import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { isHashPrefix } from '../shared/hashes';
import type {
  CommitField,
  CommitInfo,
  CommitResults,
  CommitSearch,
  HashLookup,
} from '../shared/protocol';
import { rawStatus } from './diff';
import { gitConfigArgs, gitEnv, runGit, splitNul } from './run';

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

async function commitsWithPrefix(
  gitPath: string,
  cwd: string,
  prefix: string,
): Promise<string[]> {
  if (!isHashPrefix(prefix)) {
    return [];
  }
  const hex = prefix.toLowerCase();
  const output = await runGit(gitPath, cwd, ['cat-file', '--batch-check'], {
    input: `${hex}\n`,
  });
  const [hash, type] = output.trim().split(' ');
  if (type === 'missing') {
    return [];
  }
  const unique = type !== 'ambiguous' && hash.startsWith(hex);
  if (unique) {
    return type === 'commit' ? [hash] : [];
  }
  return commitsStartingWith(gitPath, cwd, hex);
}

const commitResultLimit = 20;

export async function findCommits(
  gitPath: string,
  cwd: string,
  prefix: string,
  limit = commitResultLimit,
): Promise<CommitResults> {
  const hashes = await commitsWithPrefix(gitPath, cwd, prefix);
  return {
    commits: await logCommits(gitPath, cwd, hashes.slice(0, limit)),
    more: Math.max(0, hashes.length - limit),
  };
}

export async function findCommit(
  gitPath: string,
  cwd: string,
  prefix: string,
): Promise<HashLookup> {
  const hashes = await commitsWithPrefix(gitPath, cwd, prefix);
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

export async function listHistory(
  gitPath: string,
  cwd: string,
  solo = false,
): Promise<HistoryEntry[]> {
  const output = await runGit(gitPath, cwd, [
    'rev-list',
    '--date-order',
    '--parents',
    ...historyRefs(solo),
    '--',
  ]);
  return parseHistory(output);
}

function historyRefs(solo: boolean): string[] {
  return [
    '--ignore-missing',
    'HEAD',
    ...(solo ? [] : ['--branches', '--remotes', '--tags']),
  ];
}

const searchLimit = 50;

const recordStart = '\x1e';

interface SearchedCommit {
  readonly hash: string;
  readonly author: string;
  readonly committer: string;
  readonly message: string;
}

export function parseSearchedCommit(record: string): SearchedCommit {
  const [
    hash,
    authorName,
    authorEmail,
    committerName,
    committerEmail,
    message,
  ] = record.split('\0');
  return {
    hash,
    author: `${authorName} <${authorEmail}>`,
    committer: `${committerName} <${committerEmail}>`,
    message: message ?? '',
  };
}

export function matchedFields(
  commit: SearchedCommit,
  query: string,
): CommitField[] {
  const needle = query.toLowerCase();
  const fields: CommitField[] = [];
  if (commit.author.toLowerCase().includes(needle)) {
    fields.push('author');
  }
  if (commit.committer.toLowerCase().includes(needle)) {
    fields.push('committer');
  }
  if (commit.message.toLowerCase().includes(needle)) {
    fields.push('message');
  }
  return fields;
}

interface FoundHashes {
  readonly found: { readonly hash: string; readonly fields: CommitField[] }[];
  readonly capped: boolean;
}

function streamMatches(
  gitPath: string,
  cwd: string,
  query: string,
  solo: boolean,
  limit: number,
  signal: AbortSignal | undefined,
): Promise<FoundHashes> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      gitPath,
      [
        ...gitConfigArgs,
        'log',
        ...historyRefs(solo),
        `--format=${recordStart}%H%x00%aN%x00%aE%x00%cN%x00%cE%x00%B`,
        '--',
      ],
      { cwd, env: gitEnv(), windowsHide: true, signal },
    );
    const decoder = new StringDecoder('utf8');
    const found: FoundHashes['found'] = [];
    let pending = '';
    let stderr = '';
    let settled = false;
    const settle = (capped: boolean) => {
      settled = true;
      resolve({ found, capped });
    };
    const take = (record: string): boolean => {
      const commit = parseSearchedCommit(record);
      const fields = matchedFields(commit, query);
      if (fields.length === 0) {
        return false;
      }
      if (found.length === limit) {
        return true;
      }
      found.push({ hash: commit.hash, fields });
      return false;
    };
    child.stdout.on('data', (chunk: Buffer) => {
      if (settled) {
        return;
      }
      pending += decoder.write(chunk);
      let end = pending.indexOf(recordStart, 1);
      while (end !== -1) {
        if (take(pending.slice(1, end))) {
          settle(true);
          child.kill();
          return;
        }
        pending = pending.slice(end);
        end = pending.indexOf(recordStart, 1);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      if (code !== 0) {
        settled = true;
        reject(new Error(`git log failed: ${stderr}`));
        return;
      }
      pending += decoder.end();
      settle(pending.length > 1 && take(pending.slice(1)));
    });
  });
}

export async function searchCommits(
  gitPath: string,
  cwd: string,
  query: string,
  solo: boolean,
  signal?: AbortSignal,
  limit = searchLimit,
): Promise<CommitSearch> {
  const { found, capped } = await streamMatches(
    gitPath,
    cwd,
    query,
    solo,
    limit,
    signal,
  );
  const commits = await logCommits(
    gitPath,
    cwd,
    found.map(({ hash }) => hash),
  );
  const fieldsOf = new Map(found.map(({ hash, fields }) => [hash, fields]));
  return {
    commits: commits.map((commit) => ({
      commit,
      fields: fieldsOf.get(commit.hash) ?? [],
    })),
    capped,
  };
}

export function parseHistory(output: string): HistoryEntry[] {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, ...parents] = line.split(' ');
      return { hash, parents };
    });
}

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
      '-M',
      '--diff-merges=first-parent',
      '--format=%x1e%H%x00%P%x00%aN%x00%aE%x00%at%x00%cN%x00%cE%x00%ct%x00%B',
      '--',
    ],
    { input: `${hashes.join('\n')}\n` },
  );
  return parseLog(output);
}

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
      const code = rawStatus(tokens[i]);
      files++;
      i += code === 'R' || code === 'C' ? 3 : 2;
    }
    const message = body.replaceAll('\r\n', '\n').trimEnd();
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
