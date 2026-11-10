import { execFile } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';

export interface Run {
  readonly databaseId: number;
  readonly status: string;
  readonly conclusion: string;
  readonly url: string;
}

export type Gh = (...args: string[]) => Promise<string>;

export interface Clock {
  readonly now: () => number;
  readonly pause: (milliseconds: number) => Promise<unknown>;
}

export type Watched =
  | { readonly ended: 'passed'; readonly run: Run }
  | {
      readonly ended: 'failed';
      readonly run: Run;
      readonly failedJobs: readonly string[];
    }
  | { readonly ended: 'unwatched'; readonly why: string; readonly said: string }
  | { readonly ended: 'missing' }
  | { readonly ended: 'unfinished'; readonly run: Run };

interface Job {
  readonly name: string;
  readonly conclusion: string;
}

const poll = 15_000;
const callWithin = 60_000;
const failingWithin = 300_000;
const appearWithin = 120_000;
const finishWithin = 3_600_000;

export const ghCli: Gh = async (...args) =>
  (
    await promisify(execFile)('gh', args, {
      encoding: 'utf8',
      timeout: callWithin,
    })
  ).stdout;

const realClock: Clock = {
  now: Date.now,
  pause: (milliseconds) => setTimeout(milliseconds),
};

async function latestRun(
  gh: Gh,
  filters: readonly string[],
): Promise<Run | undefined> {
  const runs: readonly Run[] = JSON.parse(
    await gh(
      'run',
      'list',
      ...filters,
      '--limit',
      '1',
      '--json',
      'databaseId,status,conclusion,url',
    ),
  );
  return runs[0];
}

export const runOfPush = (gh: Gh, commit: string) =>
  latestRun(gh, [
    '--commit',
    commit,
    '--workflow',
    'ci.yml',
    '--event',
    'push',
    '--branch',
    'main',
  ]);

export const runOfRelease = (gh: Gh, commit: string, tag: string) =>
  latestRun(gh, [
    '--commit',
    commit,
    '--workflow',
    'release.yml',
    '--event',
    'push',
    '--branch',
    tag,
  ]);

export const inFailedJobs = (failedJobs: readonly string[]) =>
  failedJobs.length > 0 ? ` in ${failedJobs.join(', ')}` : '';

const cannotWork = (error: unknown) =>
  error instanceof Error &&
  (('code' in error && (error.code === 'ENOENT' || error.code === 4)) ||
    ('stderr' in error &&
      /failed to determine base repo|gh auth login/.test(
        String(error.stderr),
      )));

const saidBy = (error: unknown) =>
  error instanceof Error && 'stderr' in error
    ? String(error.stderr).trim()
    : String(error);

async function failedJobsOf(gh: Gh, run: Run): Promise<readonly string[]> {
  try {
    const { jobs }: { readonly jobs: readonly Job[] } = JSON.parse(
      await gh('run', 'view', String(run.databaseId), '--json', 'jobs'),
    );
    return jobs
      .filter((job) => !['success', 'skipped'].includes(job.conclusion))
      .map((job) => job.name);
  } catch {
    return [];
  }
}

export async function watchRun(
  gh: Gh,
  find: () => Promise<Run | undefined>,
  clock: Clock = realClock,
): Promise<Watched> {
  const started = clock.now();
  let failingSince: number | undefined;
  for (;;) {
    let run: Run | undefined;
    try {
      run = await find();
      failingSince = undefined;
    } catch (error) {
      if (cannotWork(error)) {
        return {
          ended: 'unwatched',
          why: 'gh does not work here',
          said: saidBy(error),
        };
      }
      failingSince ??= clock.now();
      if (clock.now() - failingSince >= failingWithin) {
        return {
          ended: 'unwatched',
          why: 'gh kept failing for 5 minutes',
          said: saidBy(error),
        };
      }
      await clock.pause(poll);
      continue;
    }
    const waited = clock.now() - started;
    if (run === undefined && waited >= appearWithin) {
      return { ended: 'missing' };
    }
    if (run?.status === 'completed') {
      return run.conclusion === 'success'
        ? { ended: 'passed', run }
        : { ended: 'failed', run, failedJobs: await failedJobsOf(gh, run) };
    }
    if (run !== undefined && waited >= finishWithin) {
      return { ended: 'unfinished', run };
    }
    await clock.pause(poll);
  }
}
