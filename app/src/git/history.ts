import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { Commits, CommitsBuilder } from '../history/commits';
import { extendHistory, keepsHistory, regionHistory } from '../history/extend';
import { isHashPrefix } from '../shared/hashes';
import type {
  CommitInfo,
  CommitResults,
  CommitSearch,
} from '../shared/protocol';
import { strings } from '../shared/strings';
import {
  gitCommand,
  gitConfigArgs,
  gitEnv,
  gitProcessOptions,
  keptRunning,
  runGit,
  runGitBytes,
  splitNul,
  stopGit,
} from './run';

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

type HashLookup =
  | { readonly kind: 'found'; readonly hash: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'ambiguous'; readonly count: number };

export async function findCommit(
  gitPath: string,
  cwd: string,
  prefix: string,
): Promise<HashLookup> {
  const hashes = await commitsWithPrefix(gitPath, cwd, prefix);
  if (hashes.length === 1) {
    return { kind: 'found', hash: hashes[0] };
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
  stashes: readonly string[] = [],
): Promise<Commits> {
  const tips = solo ? [] : stashes;
  const reader = new CommitsBuilder(tips);
  await runGitBytes(
    gitPath,
    cwd,
    [
      'rev-list',
      '--date-order',
      '--parents',
      ...historyRefs(solo),
      '--stdin',
      '--',
    ],
    { input: hashLines(tips), onOutput: (chunk) => reader.add(chunk) },
  );
  return reader.finish();
}

export async function extendedHistory(
  gitPath: string,
  cwd: string,
  older: Commits,
  oldHeads: ReadonlySet<string>,
  tips: ReadonlySet<string>,
  stashes: readonly string[],
  dates: ReadonlyMap<string, number>,
): Promise<Commits | undefined> {
  const fresh = [...tips].filter((tip) => !older.has(tip));
  if (fresh.length === 0) {
    return undefined;
  }
  const heads = [...oldHeads];
  const [newer, oldTimes] = await Promise.all([
    listNewHistory(gitPath, cwd, fresh, stashes, heads),
    commitTimes(gitPath, cwd, heads),
  ]);
  const extension = { older, oldHeads, oldTimes, newer, tips };
  const extended = extendHistory(extension);
  const { times } = newer;
  if (extended || !times || !keepsHistory(extension)) {
    return extended;
  }
  const since = times.reduce((oldest, time) => Math.min(oldest, time));
  const timeOf = (tip: string) => {
    const at = newer.indexOf(tip) ?? newer.length;
    return at < newer.length
      ? times[at]
      : (dates.get(tip) ?? oldTimes.get(tip) ?? since);
  };
  const region = await listSince(
    gitPath,
    cwd,
    [...tips].filter((tip) => timeOf(tip) >= since),
    stashes,
    since,
  );
  const below: string[] = [];
  for (let at = region.length; at < region.size; at++) {
    below.push(region.hashAt(at));
  }
  return regionHistory({
    ...extension,
    region,
    since,
    belowTimes: await commitTimes(gitPath, cwd, below),
  });
}

async function listSince(
  gitPath: string,
  cwd: string,
  tips: readonly string[],
  stashes: readonly string[],
  since: number,
): Promise<Commits> {
  const reader = new CommitsBuilder(stashes, true);
  await runGitBytes(
    gitPath,
    cwd,
    [
      'rev-list',
      '--date-order',
      '--parents',
      '--timestamp',
      `--max-age=${since}`,
      '--stdin',
      '--',
    ],
    { input: hashLines(tips), onOutput: (chunk) => reader.add(chunk) },
  );
  return reader.finishNow();
}

async function listNewHistory(
  gitPath: string,
  cwd: string,
  tips: readonly string[],
  stashes: readonly string[],
  oldHeads: readonly string[],
): Promise<Commits> {
  const reader = new CommitsBuilder(stashes, true);
  await runGitBytes(
    gitPath,
    cwd,
    // With the commit-graph, git walks down to the oldest head left out
    [
      '-c',
      'core.commitGraph=false',
      'rev-list',
      '--date-order',
      '--parents',
      '--timestamp',
      '--stdin',
      '--',
    ],
    {
      input: hashLines(tips) + oldHeads.map((head) => `^${head}\n`).join(''),
      onOutput: (chunk) => reader.add(chunk),
    },
  );
  return reader.finishNow();
}

async function commitTimes(
  gitPath: string,
  cwd: string,
  hashes: readonly string[],
): Promise<Map<string, number>> {
  if (hashes.length === 0) {
    return new Map();
  }
  const output = await runGit(
    gitPath,
    cwd,
    ['rev-list', '--no-walk=unsorted', '--timestamp', '--stdin', '--'],
    { input: hashLines(hashes) },
  );
  return new Map(
    output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [time, hash] = line.split(' ');
        return [hash, Number(time)];
      }),
  );
}

const recentCommits = 5000;

export async function listRecentHistory(
  gitPath: string,
  cwd: string,
  tips: readonly string[],
  stashes: readonly string[] = [],
  count = recentCommits,
  signal?: AbortSignal,
): Promise<{ history: Commits; whole: boolean }> {
  const reader = new CommitsBuilder(stashes);
  await runGitBytes(
    gitPath,
    cwd,
    [
      'rev-list',
      '--date-order',
      '--parents',
      `--max-count=${count}`,
      '--ignore-missing',
      'HEAD',
      '--stdin',
      '--',
    ],
    {
      input: hashLines([...tips, ...stashes]),
      signal,
      onOutput: (chunk) => reader.add(chunk),
    },
  );
  return { history: reader.finishNow(), whole: reader.read < count };
}

const recentSeconds = 60 * 24 * 60 * 60;

export function recentTips(dates: ReadonlyMap<string, number>): string[] {
  const newest = Math.max(...dates.values());
  return [...dates]
    .filter(([, date]) => newest - date <= recentSeconds)
    .map(([commit]) => commit);
}

function hashLines(hashes: readonly string[]): string {
  return hashes.map((hash) => `${hash}\n`).join('');
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

export function matchesCommit(commit: SearchedCommit, query: string): boolean {
  const needle = query.toLowerCase();
  return [commit.author, commit.committer, commit.message].some((field) =>
    field.toLowerCase().includes(needle),
  );
}

interface FoundHashes {
  readonly found: string[];
  readonly capped: boolean;
}

export class SearchMatches {
  private readonly found: string[] = [];

  constructor(
    private readonly query: string,
    private readonly limit = searchLimit,
    private readonly hidden: ReadonlySet<string> = new Set(),
  ) {}

  add(record: string): FoundHashes | undefined {
    const commit = parseSearchedCommit(record);
    if (this.hidden.has(commit.hash) || !matchesCommit(commit, this.query)) {
      return undefined;
    }
    if (this.found.length === this.limit) {
      return { found: this.found, capped: true };
    }
    this.found.push(commit.hash);
    return undefined;
  }

  end(): FoundHashes {
    return { found: this.found, capped: false };
  }
}

interface Searched {
  readonly solo: boolean;
  readonly stashes: readonly string[];
  readonly hidden: ReadonlySet<string>;
}

function streamMatches(
  gitPath: string,
  cwd: string,
  query: string,
  { solo, stashes, hidden }: Searched,
  limit: number | undefined,
  signal: AbortSignal | undefined,
): Promise<FoundHashes> {
  const matches = new SearchMatches(query, limit, hidden);
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
        void stopGit(child);
        settle();
      }
    };
    const abort = () => finish(() => reject(signal?.reason));
    const { command, env } = gitCommand(gitPath);
    const child = keptRunning(
      spawn(
        command,
        [
          ...gitConfigArgs,
          'log',
          ...historyRefs(solo),
          '--stdin',
          '-z',
          '--format=%H%x00%aN%x00%aE%x00%cN%x00%cE%x00%B',
          '--',
        ],
        { cwd, env: { ...gitEnv(), ...env }, ...gitProcessOptions() },
      ),
    );
    signal?.addEventListener('abort', abort, { once: true });
    child.stdin.on('error', () => undefined);
    child.stdin.end(hashLines(stashes));
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
        finish(() =>
          reject(
            Object.assign(new Error(strings.errors.gitFailed('log', stderr)), {
              stderr: stderr.trim(),
            }),
          ),
        );
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
  stashes: readonly string[] = [],
  signal?: AbortSignal,
  limit?: number,
): Promise<CommitSearch> {
  const searched = solo ? [] : stashes;
  const { found, capped } = await streamMatches(
    gitPath,
    cwd,
    query,
    {
      solo,
      stashes: searched,
      hidden: await stashedParents(gitPath, cwd, searched, signal),
    },
    limit,
    signal,
  );
  return { commits: await logCommits(gitPath, cwd, found), capped };
}

async function stashedParents(
  gitPath: string,
  cwd: string,
  stashes: readonly string[],
  signal: AbortSignal | undefined,
): Promise<ReadonlySet<string>> {
  if (stashes.length === 0) {
    return new Set();
  }
  const output = await runGit(
    gitPath,
    cwd,
    ['rev-list', '--no-walk=unsorted', '--parents', '--stdin', '--'],
    { input: hashLines(stashes), signal },
  );
  return new Set(
    parseHistory(output).flatMap((entry) => entry.parents.slice(1)),
  );
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
