import { execFile, execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';
import { runOfPush, type Run } from './ciRun.mts';

interface Job {
  readonly name: string;
  readonly conclusion: string;
}

const poll = 15_000;
const callWithin = 60_000;
const failingWithin = 300_000;
const appearWithin = 120_000;
const finishWithin = 3_600_000;

const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8' }).trim();

const gh = async (...args: string[]): Promise<string> =>
  (
    await promisify(execFile)('gh', args, {
      encoding: 'utf8',
      timeout: callWithin,
    })
  ).stdout;

const cannotWork = (error: unknown) =>
  error instanceof Error &&
  (('code' in error && (error.code === 'ENOENT' || error.code === 4)) ||
    ('stderr' in error &&
      /failed to determine base repo|gh auth login/.test(
        String(error.stderr),
      )));

if (git('branch', '--show-current') !== 'main') {
  console.error('Switch to the main branch before pushing.');
  process.exit(1);
}

const commit = git('rev-parse', 'HEAD');

try {
  execFileSync('git', ['push', 'origin', `${commit}:refs/heads/main`], {
    stdio: 'inherit',
  });
} catch {
  console.error(
    `Pushing ${commit} failed, as git says above. If the remote has commits this branch lacks, pull them and push again; never force a push.`,
  );
  process.exit(1);
}

const failedJobsOf = async (run: Run): Promise<string> => {
  try {
    const { jobs }: { readonly jobs: readonly Job[] } = JSON.parse(
      await gh('run', 'view', String(run.databaseId), '--json', 'jobs'),
    );
    const failed = jobs
      .filter((job) => !['success', 'skipped'].includes(job.conclusion))
      .map((job) => job.name);
    return failed.length > 0 ? ` in ${failed.join(', ')}` : '';
  } catch {
    return '';
  }
};

const unwatched = (error: unknown, why: string) => {
  const said =
    error instanceof Error && 'stderr' in error
      ? String(error.stderr).trim()
      : String(error);
  console.error(
    `Pushed ${commit}, but could not watch its CI run, as ${why}: ${said}\nCheck the run with gh run list --commit ${commit} --workflow ci.yml.`,
  );
  process.exit(2);
};

const started = Date.now();
let failingSince: number | undefined;
for (;;) {
  let run: Run | undefined;
  try {
    run = await runOfPush(gh, commit);
    failingSince = undefined;
  } catch (error) {
    if (cannotWork(error)) {
      unwatched(error, 'gh does not work here');
    }
    failingSince ??= Date.now();
    if (Date.now() - failingSince >= failingWithin) {
      unwatched(error, 'gh kept failing for 5 minutes');
    }
    await setTimeout(poll);
    continue;
  }
  const waited = Date.now() - started;
  if (run === undefined && waited >= appearWithin) {
    console.error(
      `Pushed ${commit}, but no CI run started for it within 2 minutes. Look for it with gh run list --workflow ci.yml.`,
    );
    process.exit(2);
  }
  if (run?.status === 'completed') {
    if (run.conclusion === 'success') {
      console.log(`CI passed for ${commit}: ${run.url}`);
      process.exit(0);
    }
    console.error(
      `CI ended as ${run.conclusion} for ${commit}${await failedJobsOf(run)}: ${run.url}\nRead the log of the failed jobs with gh run view ${run.databaseId} --log-failed.`,
    );
    process.exit(1);
  }
  if (run !== undefined && waited >= finishWithin) {
    console.error(
      `CI for ${commit} has not finished within an hour: ${run.url}\nCheck it later with gh run view ${run.databaseId} --exit-status.`,
    );
    process.exit(2);
  }
  await setTimeout(poll);
}
