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

async function loadRunOfPush() {
  const {
    runOfPush,
  }: { runOfPush: (gh: Gh, commit: string) => Promise<Run | undefined> } =
    await import(
      pathToFileURL(path.join(__dirname, '..', '..', 'scripts', 'ciRun.mts'))
        .href
    );
  return runOfPush;
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
    const runOfPush = await loadRunOfPush();
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
