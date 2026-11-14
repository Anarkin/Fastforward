import type { Commits } from './commits';
import {
  joinCommits,
  readCommits,
  type ReadCommits,
  type ReadOptions,
} from './commitReads';
import { keepsHistory, topOfExtension, topOfRegion, type Top } from './extend';
import { runGit, runGitBytes } from './run';

export interface HistoryEntry {
  readonly hash: string;
  readonly parents: readonly string[];
}

export async function listHistory(
  gitPath: string,
  cwd: string,
  solo = false,
  stashes: readonly string[] = [],
  signal?: AbortSignal,
  tips: Iterable<string> = [],
): Promise<Commits> {
  const shownStashes = solo ? [] : stashes;
  const { commits } = await readHistory(
    { stashes: shownStashes, tips },
    (onOutput) =>
      runGitBytes(
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
        { input: hashLines(shownStashes), signal, onOutput, unbounded: true },
      ),
  );
  return commits;
}

async function readHistory(
  options: ReadOptions,
  run: (onOutput: (chunk: Buffer) => void) => Promise<unknown>,
): Promise<ReadCommits> {
  const reading = readCommits(options);
  try {
    await run((chunk) => reading.add(chunk));
  } catch (error) {
    reading.drop();
    throw error;
  }
  return reading.finish();
}

export async function extendedHistory(
  gitPath: string,
  cwd: string,
  older: Commits,
  oldHeads: ReadonlySet<string>,
  tips: ReadonlySet<string>,
  stashes: readonly string[],
  dates: ReadonlyMap<string, number>,
  {
    signal,
    maxRegion = maxRegionCommits,
  }: { signal?: AbortSignal; maxRegion?: number } = {},
): Promise<Commits | undefined> {
  const fresh = [...tips].filter((tip) => !older.has(tip));
  if (fresh.length === 0) {
    return undefined;
  }
  const heads = [...oldHeads];
  const [newer, oldTimes] = await Promise.all([
    listNewHistory(gitPath, cwd, fresh, stashes, heads, signal),
    commitTimes(gitPath, cwd, heads, signal),
  ]);
  const extension = { older, oldHeads, oldTimes, newer, tips };
  const extended = topOfExtension(extension);
  if (extended) {
    return onTopOf(older, extended);
  }
  const { times } = newer;
  if (!times || !keepsHistory(extension)) {
    return undefined;
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
    maxRegion,
    signal,
  );
  if (region === undefined) {
    return undefined;
  }
  const below: string[] = [];
  for (let at = region.length; at < region.size; at++) {
    below.push(region.hashAt(at));
  }
  const top = topOfRegion({
    ...extension,
    region,
    since,
    belowTimes: await commitTimes(gitPath, cwd, below, signal),
  });
  return top && onTopOf(older, top);
}

function onTopOf(older: Commits, { commits, dropped }: Top): Promise<Commits> {
  return joinCommits(commits, older, dropped);
}

const maxRegionCommits = 100_000;

async function listSince(
  gitPath: string,
  cwd: string,
  tips: readonly string[],
  stashes: readonly string[],
  since: number,
  maxRegion: number,
  signal: AbortSignal | undefined,
): Promise<Commits | undefined> {
  const { commits: region } = await readHistory(
    { stashes, timestamped: true, tips },
    (onOutput) =>
      runGitBytes(
        gitPath,
        cwd,
        [
          'rev-list',
          '--date-order',
          '--parents',
          '--timestamp',
          `--max-age=${since}`,
          `--max-count=${maxRegion + 1}`,
          '--stdin',
          '--',
        ],
        { input: hashLines(tips), signal, onOutput, unbounded: true },
      ),
  );
  return region.length > maxRegion ? undefined : region;
}

const stopAtOldHeadsArgs = ['-c', 'core.commitGraph=false'];

async function listNewHistory(
  gitPath: string,
  cwd: string,
  tips: readonly string[],
  stashes: readonly string[],
  oldHeads: readonly string[],
  signal: AbortSignal | undefined,
): Promise<Commits> {
  const { commits } = await readHistory(
    { stashes, timestamped: true, tips },
    (onOutput) =>
      runGitBytes(
        gitPath,
        cwd,
        [
          ...stopAtOldHeadsArgs,
          'rev-list',
          '--date-order',
          '--parents',
          '--timestamp',
          '--ignore-missing',
          '--stdin',
          '--',
        ],
        {
          input:
            hashLines(tips) + oldHeads.map((head) => `^${head}\n`).join(''),
          signal,
          onOutput,
          unbounded: true,
        },
      ),
  );
  return commits;
}

async function commitTimes(
  gitPath: string,
  cwd: string,
  hashes: readonly string[],
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  if (hashes.length === 0) {
    return new Map();
  }
  const output = await runGit(
    gitPath,
    cwd,
    [
      'rev-list',
      '--no-walk=unsorted',
      '--timestamp',
      '--ignore-missing',
      '--stdin',
      '--',
    ],
    { input: hashLines(hashes), signal },
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
  const { commits, read } = await readHistory({ stashes, tips }, (onOutput) =>
    runGitBytes(
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
        onOutput,
        unbounded: true,
      },
    ),
  );
  return { history: commits, whole: read < count };
}

const recentSeconds = 60 * 24 * 60 * 60;

export function recentTips(dates: ReadonlyMap<string, number>): string[] {
  let newest = -Infinity;
  for (const date of dates.values()) {
    newest = Math.max(newest, date);
  }
  return [...dates]
    .filter(([, date]) => newest - date <= recentSeconds)
    .map(([commit]) => commit);
}

export function hashLines(hashes: readonly string[]): string {
  return hashes.map((hash) => `${hash}\n`).join('');
}

export function historyRefs(solo: boolean): string[] {
  return [
    '--ignore-missing',
    'HEAD',
    ...(solo ? [] : ['--branches', '--remotes', '--tags']),
  ];
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
