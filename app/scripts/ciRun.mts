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

export interface FailedJob {
  readonly name: string;
  readonly databaseId: number;
  readonly started: boolean;
}

export type Watched =
  | { readonly ended: 'passed'; readonly run: Run }
  | {
      readonly ended: 'failed';
      readonly run: Run;
      readonly failedJobs: readonly FailedJob[];
    }
  | { readonly ended: 'unwatched'; readonly why: string; readonly said: string }
  | { readonly ended: 'missing' }
  | { readonly ended: 'unfinished'; readonly run: Run };

interface Job {
  readonly name: string;
  readonly conclusion: string | null;
  readonly databaseId: number;
  readonly steps?: readonly unknown[];
}

const notFailed: readonly (string | null)[] = ['', null, 'success', 'skipped'];

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

const namesOf = (jobs: readonly FailedJob[]) =>
  jobs.map((job) => job.name).join(', ');

export const inFailedJobs = (failedJobs: readonly FailedJob[]) =>
  failedJobs.length > 0 ? ` in ${namesOf(failedJobs)}` : '';

export function failureOfPush(
  commit: string,
  run: Run,
  failedJobs: readonly FailedJob[],
): string {
  const ended = run.status === 'completed';
  const started = failedJobs.filter((job) => job.started);
  const unstarted = failedJobs.filter((job) => !job.started);
  return [
    ended
      ? `CI ended as ${run.conclusion} for ${commit}${inFailedJobs(failedJobs)}: ${run.url}`
      : `CI failed for ${commit}${inFailedJobs(failedJobs)}, with other jobs still running: ${run.url}`,
    ...(ended
      ? started.length > 0 || unstarted.length === 0
        ? [
            `Read the log of the failed jobs with gh run view ${run.databaseId} --log-failed.`,
          ]
        : []
      : started.map(
          (job) =>
            `Read the log of ${job.name} with gh api --allow-escape-sequences repos/{owner}/{repo}/actions/jobs/${job.databaseId}/logs`,
        )),
    ...(unstarted.length > 0
      ? [
          `${namesOf(unstarted)} never got a machine from GitHub, which no commit causes; run ${unstarted.length === 1 ? 'it' : 'them'} again with gh run rerun ${run.databaseId} --failed${ended ? '' : ' once the run has ended'}.`,
        ]
      : []),
  ].join('\n');
}

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

async function failedJobsOf(gh: Gh, run: Run): Promise<readonly FailedJob[]> {
  try {
    const { jobs }: { readonly jobs: readonly Job[] } = JSON.parse(
      await gh('run', 'view', String(run.databaseId), '--json', 'jobs'),
    );
    return jobs
      .filter((job) => !notFailed.includes(job.conclusion))
      .map((job) => ({
        name: job.name,
        databaseId: job.databaseId,
        started: job.conclusion !== 'cancelled' || (job.steps ?? []).length > 0,
      }));
  } catch {
    return [];
  }
}

export const watchRun = (
  gh: Gh,
  find: () => Promise<Run | undefined>,
  clock: Clock = realClock,
): Promise<Watched> => watch(gh, find, clock, false);

export const watchRunToFirstFailure = (
  gh: Gh,
  find: () => Promise<Run | undefined>,
  clock: Clock = realClock,
): Promise<Watched> => watch(gh, find, clock, true);

async function watch(
  gh: Gh,
  find: () => Promise<Run | undefined>,
  clock: Clock,
  toFirstFailure: boolean,
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
    if (run !== undefined && toFirstFailure) {
      const failedJobs = await failedJobsOf(gh, run);
      if (failedJobs.length > 0) {
        return { ended: 'failed', run, failedJobs };
      }
    }
    if (run !== undefined && waited >= finishWithin) {
      return { ended: 'unfinished', run };
    }
    await clock.pause(poll);
  }
}
