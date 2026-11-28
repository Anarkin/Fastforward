import { StringDecoder } from 'node:string_decoder';
import { logCommits } from './commitLog';
import { hashLines, historyRefs, parseHistory } from './history';
import {
  matchesFilter,
  searchFilter,
  type Filter,
} from '../../../lib/shared/filter';
import type { SearchOptions } from '../../../lib/shared/searchOptions';
import type { CommitSearch } from '../shared/protocol';
import { runGit, runGitBytes } from './run';
import { inThread, type PatternSearch } from '../../../lib/main/patternSearch';

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

export function matchesCommit(commit: SearchedCommit, filter: Filter): boolean {
  return matchesFilter(filter, commit.author, commit.committer, commit.message);
}

interface FoundHashes {
  readonly found: string[];
  readonly capped: boolean;
  readonly slow?: true;
}

export class SearchMatches {
  private readonly found: string[] = [];
  private readonly filter: Filter;

  constructor(
    private readonly query: string,
    private readonly options: SearchOptions,
    private readonly limit = searchLimit,
    private readonly hidden: ReadonlySet<string> = new Set(),
    private readonly patterns: PatternSearch = inThread,
  ) {
    this.filter = searchFilter(query, options);
  }

  async addAll(
    records: readonly string[],
    signal?: AbortSignal,
  ): Promise<FoundHashes | 'slow' | undefined> {
    const commits = records
      .map(parseSearchedCommit)
      .filter((commit) => !this.hidden.has(commit.hash));
    const matched = await this.patterns.matching(
      commits.map((commit) => [
        commit.author,
        commit.committer,
        commit.message,
      ]),
      this.query,
      this.options,
      signal,
    );
    if (matched === 'slow') {
      return 'slow';
    }
    if (matched === 'stopped') {
      return { found: this.found, capped: false };
    }
    for (const [index, commit] of commits.entries()) {
      if (!matched[index]) {
        continue;
      }
      if (this.found.length === this.limit) {
        return { found: this.found, capped: true };
      }
      this.found.push(commit.hash);
    }
    return undefined;
  }

  add(record: string): FoundHashes | undefined {
    const commit = parseSearchedCommit(record);
    if (this.hidden.has(commit.hash) || !matchesCommit(commit, this.filter)) {
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
  options: SearchOptions,
  { solo, stashes, hidden }: Searched,
  limit: number | undefined,
  signal: AbortSignal | undefined,
  patterns: PatternSearch,
): Promise<FoundHashes> {
  const matches = new SearchMatches(query, options, limit, hidden, patterns);
  const stopping = new AbortController();
  const capped = Promise.withResolvers<FoundHashes>();
  let checked: Promise<void> = Promise.resolve();
  const settle = (result: FoundHashes | 'slow' | undefined) => {
    if (result !== undefined && !stopping.signal.aborted) {
      stopping.abort();
      capped.resolve(
        result === 'slow' ? { ...matches.end(), slow: true } : result,
      );
    }
  };
  const addAll = (records: readonly string[]) => {
    checked = checked.then(async () => {
      if (!stopping.signal.aborted && records.length > 0) {
        settle(await matches.addAll(records, signal));
      }
    });
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
        addAll(records);
      },
    },
  ).then(async () => {
    const last = pending + decoder.end();
    addAll(last.length > 0 ? [last] : []);
    await checked;
    return matches.end();
  });
  return Promise.race([searching, capped.promise]);
}

export async function searchCommits(
  gitPath: string,
  cwd: string,
  query: string,
  options: SearchOptions,
  solo: boolean,
  stashes: readonly string[] = [],
  signal?: AbortSignal,
  limit?: number,
  patterns: PatternSearch = inThread,
): Promise<CommitSearch & { readonly slow?: true }> {
  const searched = solo ? [] : stashes;
  const { found, capped, slow } = await streamMatches(
    gitPath,
    cwd,
    query,
    options,
    {
      solo,
      stashes: searched,
      hidden: await stashedParents(gitPath, cwd, searched, signal),
    },
    limit,
    signal,
    patterns,
  );
  return {
    commits: await logCommits(gitPath, cwd, found),
    capped,
    ...(slow === true && { slow }),
  };
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
