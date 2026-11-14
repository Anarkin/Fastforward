import { StringDecoder } from 'node:string_decoder';
import { logCommits } from './commitLog';
import { hashLines, historyRefs, parseHistory } from './history';
import { folded } from '../../../lib/shared/textMatches';
import type { CommitSearch } from '../shared/protocol';
import { runGit, runGitBytes } from './run';

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
  const needle = folded(query);
  return [commit.author, commit.committer, commit.message].some((field) =>
    folded(field).includes(needle),
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
  const stopping = new AbortController();
  const capped = Promise.withResolvers<FoundHashes>();
  const add = (record: string) => {
    const result = stopping.signal.aborted ? undefined : matches.add(record);
    if (result !== undefined) {
      stopping.abort();
      capped.resolve(result);
    }
  };
  const decoder = new StringDecoder('utf8');
  let pending = '';
  const searching = runGitBytes(
    gitPath,
    cwd,
    [
      'log',
      ...historyRefs(solo),
      '--stdin',
      '-z',
      '--format=%H%x00%aN%x00%aE%x00%cN%x00%cE%x00%B',
      '--',
    ],
    {
      input: hashLines(stashes),
      signal: signal
        ? AbortSignal.any([signal, stopping.signal])
        : stopping.signal,
      unbounded: true,
      onOutput: (chunk) => {
        const { records, rest } = takeRecords(pending + decoder.write(chunk));
        pending = rest;
        records.forEach(add);
      },
    },
  ).then(() => {
    const last = pending + decoder.end();
    return (last.length > 0 ? matches.add(last) : undefined) ?? matches.end();
  });
  return Promise.race([searching, capped.promise]);
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
