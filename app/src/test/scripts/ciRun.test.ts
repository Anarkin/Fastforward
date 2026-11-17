import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'vitest';

interface Run {
  readonly databaseId: number;
  readonly status: string;
  readonly conclusion: string;
  readonly url: string;
}

type Gh = (...args: string[]) => Promise<string>;

interface Clock {
  readonly now: () => number;
  readonly pause: (milliseconds: number) => Promise<unknown>;
}

interface CiRun {
  readonly runOfPush: (gh: Gh, commit: string) => Promise<Run | undefined>;
  readonly runOfRelease: (
    gh: Gh,
    commit: string,
    tag: string,
  ) => Promise<Run | undefined>;
  readonly watchRun: (
    gh: Gh,
    find: () => Promise<Run | undefined>,
    clock: Clock,
  ) => Promise<unknown>;
  readonly watchRunToFirstFailure: (
    gh: Gh,
    find: () => Promise<Run | undefined>,
    clock: Clock,
  ) => Promise<unknown>;
  readonly failureOfPush: (
    commit: string,
    run: Run,
    failedJobs: readonly FailedJob[],
  ) => string;
}

interface FailedJob {
  readonly name: string;
  readonly databaseId: number;
  readonly started: boolean;
}

async function loadCiRun(): Promise<CiRun> {
  const loaded: CiRun = await import(
    pathToFileURL(
      path.join(__dirname, '..', '..', '..', 'scripts', 'ciRun.mts'),
    ).href
  );
  return loaded;
}

interface ListedRun extends Run {
  readonly headSha: string;
  readonly workflowName: string;
  readonly event: string;
  readonly headBranch: string;
}

const commit = 'c'.repeat(40);

function listing(runs: readonly ListedRun[]): Gh {
  return (...args) => {
    assert.deepStrictEqual(args.slice(0, 2), ['run', 'list']);
    const option = (name: string) => {
      const at = args.indexOf(name);
      return at === -1 ? undefined : args[at + 1];
    };
    const listed = runs.filter((run) =>
      (
        [
          ['--commit', run.headSha],
          ['--workflow', run.workflowName],
          ['--event', run.event],
          ['--branch', run.headBranch],
        ] as const
      ).every(([name, value]) => [undefined, value].includes(option(name))),
    );
    const fields = (option('--json') ?? '').split(',');
    return Promise.resolve(
      JSON.stringify(
        listed
          .slice(0, Number(option('--limit') ?? '20'))
          .map((run) =>
            Object.fromEntries(
              fields.map((field) => [field, Reflect.get(run, field)]),
            ),
          ),
      ),
    );
  };
}

const ofPullRequest: ListedRun = {
  databaseId: 1,
  status: 'completed',
  conclusion: 'success',
  url: 'https://github.com/runs/1',
  headSha: commit,
  workflowName: 'ci.yml',
  event: 'pull_request',
  headBranch: 'feature',
};

const ofPush: ListedRun = {
  databaseId: 2,
  status: 'in_progress',
  conclusion: '',
  url: 'https://github.com/runs/2',
  headSha: commit,
  workflowName: 'ci.yml',
  event: 'push',
  headBranch: 'main',
};

suite('CI run of a push', () => {
  test('waits for the run of the push to main, rather than taking one a pull request had of the same commit before, which may have ended already', async () => {
    const { runOfPush } = await loadCiRun();
    assert.strictEqual(
      await runOfPush(listing([ofPullRequest]), commit),
      undefined,
    );
    assert.deepStrictEqual(
      await runOfPush(listing([ofPush, ofPullRequest]), commit),
      {
        databaseId: 2,
        status: 'in_progress',
        conclusion: '',
        url: 'https://github.com/runs/2',
      },
    );
  });
});

suite('Release run of a tag', () => {
  const ciOfReleaseCommit: ListedRun = { ...ofPush, databaseId: 3 };

  const ofTag: ListedRun = {
    ...ofPush,
    databaseId: 4,
    url: 'https://github.com/runs/4',
    workflowName: 'release.yml',
    headBranch: 'v7.0.0',
  };

  test('waits for the release run of the tag pushed, rather than taking the CI run main had of the same commit', async () => {
    const { runOfRelease } = await loadCiRun();
    assert.strictEqual(
      await runOfRelease(listing([ciOfReleaseCommit]), commit, 'v7.0.0'),
      undefined,
    );
    assert.deepStrictEqual(
      await runOfRelease(listing([ciOfReleaseCommit, ofTag]), commit, 'v7.0.0'),
      {
        databaseId: 4,
        status: 'in_progress',
        conclusion: '',
        url: 'https://github.com/runs/4',
      },
    );
  });
});

const running: Run = {
  databaseId: 5,
  status: 'in_progress',
  conclusion: '',
  url: 'https://github.com/runs/5',
};

const passed: Run = {
  ...running,
  status: 'completed',
  conclusion: 'success',
};

const failed: Run = {
  ...running,
  status: 'completed',
  conclusion: 'failure',
};

function clock() {
  let now = 0;
  return {
    now: () => now,
    pause: (milliseconds: number) => {
      now += milliseconds;
      return Promise.resolve();
    },
  };
}

function finding(...results: readonly (Run | undefined | Error)[]) {
  let at = 0;
  return () => {
    const result = results[Math.min(at, results.length - 1)];
    at += 1;
    return result instanceof Error
      ? Promise.reject(result)
      : Promise.resolve(result);
  };
}

const unused: Gh = () => Promise.reject(new Error('gh was not to be run'));

const flaky = () =>
  Object.assign(new Error('Command failed: gh run list'), {
    stderr: 'HTTP 502: Bad Gateway\n',
  });

const building = {
  name: 'test (ubuntu-latest, 1/6)',
  conclusion: '',
  databaseId: 11,
  steps: [{}],
};

const broken = {
  name: 'test (windows-latest, 3/8)',
  conclusion: 'failure',
  databaseId: 12,
  steps: [{}],
};

const unpicked = {
  name: 'test (macos-latest, 2/4)',
  conclusion: 'cancelled',
  databaseId: 13,
  steps: [],
};

function jobsAtEachPoll(...polls: readonly (readonly object[])[]): Gh {
  let at = 0;
  return () => {
    const jobs = polls[Math.min(at, polls.length - 1)];
    at += 1;
    return Promise.resolve(JSON.stringify({ jobs }));
  };
}

suite('Telling how the CI of a push failed', () => {
  const windows = { name: broken.name, databaseId: 12, started: true };
  const macos = { name: unpicked.name, databaseId: 13, started: false };

  test('names the failed jobs of a run that has ended and how to read their log, and only that when its jobs could not be read', async () => {
    const { failureOfPush } = await loadCiRun();
    assert.strictEqual(
      failureOfPush(commit, failed, [windows]),
      [
        `CI ended as failure for ${commit} in test (windows-latest, 3/8): https://github.com/runs/5`,
        'Read the log of the failed jobs with gh run view 5 --log-failed.',
      ].join('\n'),
    );
    assert.strictEqual(
      failureOfPush(commit, failed, []),
      [
        `CI ended as failure for ${commit}: https://github.com/runs/5`,
        'Read the log of the failed jobs with gh run view 5 --log-failed.',
      ].join('\n'),
    );
  });

  test('gives the log of each failed job by its id while the run is still in progress, which is there before the run ends', async () => {
    const { failureOfPush } = await loadCiRun();
    assert.strictEqual(
      failureOfPush(commit, running, [windows]),
      [
        `CI failed for ${commit} in test (windows-latest, 3/8), with other jobs still running: https://github.com/runs/5`,
        'Read the log of test (windows-latest, 3/8) with gh api --allow-escape-sequences repos/{owner}/{repo}/actions/jobs/12/logs',
      ].join('\n'),
    );
  });

  test('says of a job that never got a machine that no commit causes it, and how to run it again once the run has ended, with no log to read', async () => {
    const { failureOfPush } = await loadCiRun();
    assert.strictEqual(
      failureOfPush(commit, failed, [macos]),
      [
        `CI ended as failure for ${commit} in test (macos-latest, 2/4): https://github.com/runs/5`,
        'test (macos-latest, 2/4) never got a machine from GitHub, which no commit causes; run it again with gh run rerun 5 --failed.',
      ].join('\n'),
    );
    assert.strictEqual(
      failureOfPush(commit, running, [
        windows,
        macos,
        { ...macos, name: 'playground (macos-latest)' },
      ]),
      [
        `CI failed for ${commit} in test (windows-latest, 3/8), test (macos-latest, 2/4), playground (macos-latest), with other jobs still running: https://github.com/runs/5`,
        'Read the log of test (windows-latest, 3/8) with gh api --allow-escape-sequences repos/{owner}/{repo}/actions/jobs/12/logs',
        'test (macos-latest, 2/4), playground (macos-latest) never got a machine from GitHub, which no commit causes; run them again with gh run rerun 5 --failed once the run has ended.',
      ].join('\n'),
    );
  });
});

suite('Watching a run', () => {
  test('waits while the run is in progress, and passes once it ends in success', async () => {
    const { watchRun } = await loadCiRun();
    assert.deepStrictEqual(
      await watchRun(unused, finding(running, running, passed), clock()),
      { ended: 'passed', run: passed },
    );
  });

  test('fails naming the jobs that neither passed nor were skipped', async () => {
    const { watchRun } = await loadCiRun();
    const calls: string[][] = [];
    const jobs: Gh = (...args) => {
      calls.push(args);
      return Promise.resolve(
        JSON.stringify({
          jobs: [
            {
              name: 'check',
              conclusion: 'success',
              databaseId: 1,
              steps: [{}],
            },
            {
              name: 'build (windows-latest)',
              conclusion: 'failure',
              databaseId: 2,
              steps: [{}],
            },
            {
              name: 'build (macos-latest)',
              conclusion: 'cancelled',
              databaseId: 3,
              steps: [{}],
            },
            {
              name: 'release',
              conclusion: 'skipped',
              databaseId: 4,
              steps: [],
            },
          ],
        }),
      );
    };
    assert.deepStrictEqual(
      await watchRun(jobs, finding(running, failed), clock()),
      {
        ended: 'failed',
        run: failed,
        failedJobs: [
          { name: 'build (windows-latest)', databaseId: 2, started: true },
          { name: 'build (macos-latest)', databaseId: 3, started: true },
        ],
      },
    );
    assert.deepStrictEqual(calls, [['run', 'view', '5', '--json', 'jobs']]);
  });

  test('stops as soon as a job of a run still in progress has failed, naming it, rather than waiting for the other jobs to end', async () => {
    const { watchRunToFirstFailure } = await loadCiRun();
    const time = clock();
    assert.deepStrictEqual(
      await watchRunToFirstFailure(
        jobsAtEachPoll([building], [building, broken]),
        finding(running),
        time,
      ),
      {
        ended: 'failed',
        run: running,
        failedJobs: [{ name: broken.name, databaseId: 12, started: true }],
      },
    );
    assert.strictEqual(time.now(), 15_000);
  });

  test('goes on watching to the first failure while no job has failed, and while the jobs cannot be read, and passes once the run ends in success', async () => {
    const { watchRunToFirstFailure } = await loadCiRun();
    for (const gh of [jobsAtEachPoll([building]), unused]) {
      assert.deepStrictEqual(
        await watchRunToFirstFailure(
          gh,
          finding(running, running, passed),
          clock(),
        ),
        { ended: 'passed', run: passed },
      );
    }
  });

  test('takes a job cancelled before any step of it ran as one that never got a machine', async () => {
    const { watchRunToFirstFailure } = await loadCiRun();
    assert.deepStrictEqual(
      await watchRunToFirstFailure(
        jobsAtEachPoll([building, unpicked]),
        finding(running),
        clock(),
      ),
      {
        ended: 'failed',
        run: running,
        failedJobs: [{ name: unpicked.name, databaseId: 13, started: false }],
      },
    );
  });

  test('waits for the run to end unless asked for its first failure, though a job of it has failed meanwhile, as a release is run again only once its run has ended', async () => {
    const { watchRun } = await loadCiRun();
    const time = clock();
    assert.deepStrictEqual(
      await watchRun(
        jobsAtEachPoll([building, broken]),
        finding(running, running, failed),
        time,
      ),
      {
        ended: 'failed',
        run: failed,
        failedJobs: [{ name: broken.name, databaseId: 12, started: true }],
      },
    );
    assert.strictEqual(time.now(), 30_000);
  });

  test('stops at once when gh does not work here, as waiting would not make it work', async () => {
    const { watchRun } = await loadCiRun();
    const time = clock();
    const missing = Object.assign(new Error('spawn gh ENOENT'), {
      code: 'ENOENT',
    });
    assert.deepStrictEqual(await watchRun(unused, finding(missing), time), {
      ended: 'unwatched',
      why: 'gh does not work here',
      said: 'Error: spawn gh ENOENT',
    });
    assert.strictEqual(time.now(), 0);
  });

  test('goes on watching while gh fails for a while, and stops once it kept failing for 5 minutes', async () => {
    const { watchRun } = await loadCiRun();
    assert.deepStrictEqual(
      await watchRun(unused, finding(flaky(), flaky(), passed), clock()),
      { ended: 'passed', run: passed },
    );
    const time = clock();
    assert.deepStrictEqual(await watchRun(unused, finding(flaky()), time), {
      ended: 'unwatched',
      why: 'gh kept failing for 5 minutes',
      said: 'HTTP 502: Bad Gateway',
    });
    assert.strictEqual(time.now(), 300_000);
  });

  test('stops once no run started within 2 minutes', async () => {
    const { watchRun } = await loadCiRun();
    const time = clock();
    assert.deepStrictEqual(await watchRun(unused, finding(undefined), time), {
      ended: 'missing',
    });
    assert.strictEqual(time.now(), 120_000);
  });

  test('stops watching a run not finished within an hour', async () => {
    const { watchRun } = await loadCiRun();
    const time = clock();
    assert.deepStrictEqual(await watchRun(unused, finding(running), time), {
      ended: 'unfinished',
      run: running,
    });
    assert.strictEqual(time.now(), 3_600_000);
  });
});
