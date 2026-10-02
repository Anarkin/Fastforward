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
import { gitConfigArgs, gitEnv, runGit, splitNul, stopGit } from './run';

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

const searchedFields = 6;

export function takeRecords(text: string): {
  readonly records: string[];
  readonly rest: string;
} {
  const records: string[] = [];
  let start = 0;
  let fields = 0;
  for (
    let end = text.indexOf('\0');
    end !== -1;
    end = text.indexOf('\0', end + 1)
  ) {
    fields++;
    if (fields === searchedFields) {
      records.push(text.slice(start, end));
      start = end + 1;
      fields = 0;
    }
  }
  return { records, rest: text.slice(start) };
}

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

export class SearchMatches {
  private readonly found: FoundHashes['found'] = [];

  constructor(
    private readonly query: string,
    private readonly limit: number,
  ) {}

  add(record: string): FoundHashes | undefined {
    const commit = parseSearchedCommit(record);
    const fields = matchedFields(commit, this.query);
    if (fields.length === 0) {
      return undefined;
    }
    if (this.found.length === this.limit) {
      return { found: this.found, capped: true };
    }
    this.found.push({ hash: commit.hash, fields });
    return undefined;
  }

  end(): FoundHashes {
    return { found: this.found, capped: false };
  }
}

function streamMatches(
  gitPath: string,
  cwd: string,
  query: string,
  solo: boolean,
  limit: number,
  signal: AbortSignal | undefined,
): Promise<FoundHashes> {
  const matches = new SearchMatches(query, limit);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    let settled = false;
    const finish = (settle: () => void) => {
      if (!settled) {
        settled = true;
        signal?.removeEventListener('abort', abort);
        stopGit(child);
        settle();
      }
    };
    const abort = () => finish(() => reject(signal?.reason));
    const child = spawn(
      gitPath,
      [
        ...gitConfigArgs,
        'log',
        ...historyRefs(solo),
        '-z',
        '--format=%H%x00%aN%x00%aE%x00%cN%x00%cE%x00%B',
        '--',
      ],
      { cwd, env: gitEnv(), windowsHide: true },
    );
    signal?.addEventListener('abort', abort, { once: true });
    const onRecord = (record: string) => {
      const result = settled ? undefined : matches.add(record);
      if (result !== undefined) {
        finish(() => resolve(result));
      }
    };
    const decoder = new StringDecoder('utf8');
    let pending = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      if (settled) {
        return;
      }
      const { records, rest } = takeRecords(pending + decoder.write(chunk));
      records.forEach(onRecord);
      pending = rest;
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (code) => {
      if (code !== 0) {
        finish(() => reject(new Error(`git log failed: ${stderr}`)));
        return;
      }
      pending += decoder.end();
      if (pending.length > 0) {
        onRecord(pending);
      }
      finish(() => resolve(matches.end()));
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
      '-z',
      '--format=%x1e%H%x00%aN%x00%ct%x00%B',
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
    const [hash, authorName, commitTime, body = ''] = tokens.slice(i, i + 4);
    i += 4;
    const message = body.replaceAll('\r\n', '\n').trimEnd();
    commits.push({
      hash: hash.slice(1),
      subject: message.split('\n', 1)[0],
      authorName,
      commitDate: Number(commitTime) * 1000,
    });
  }
  return commits;
}
