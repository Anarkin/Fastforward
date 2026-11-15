import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'vitest';

const appFolder = path.join(__dirname, '..', '..', '..');

interface RunArgs {
  readonly runs: number;
  readonly against: string | undefined;
  readonly vitest: readonly string[];
}

interface PerfRuns {
  readonly parseRunArgs: (args: readonly string[]) => RunArgs;
  readonly variantName: (ref: string) => string;
  readonly runOrder: (
    variants: readonly string[],
    rounds: number,
  ) => { readonly variant: string; readonly round: number }[];
}

async function perfRuns(): Promise<PerfRuns> {
  const loaded: PerfRuns = await import(
    pathToFileURL(path.join(appFolder, 'scripts', 'perfRuns.mts')).href
  );
  return loaded;
}

suite('Running the perf scenarios several times', () => {
  test('takes the number of runs and the commit to compare with, passing the rest on to vitest', async () => {
    const { parseRunArgs } = await perfRuns();
    assert.deepStrictEqual(
      parseRunArgs([
        '--runs=5',
        '--against=HEAD~1',
        'src/test/git.perf.test.ts',
        '-t',
        'diff',
      ]),
      {
        runs: 5,
        against: 'HEAD~1',
        vitest: ['src/test/git.perf.test.ts', '-t', 'diff'],
      },
    );
    assert.deepStrictEqual(parseRunArgs([]), {
      runs: 5,
      against: undefined,
      vitest: [],
    });
    assert.throws(() => parseRunArgs(['--runs=0']), /--runs/);
  });

  test('names the build of a commit so it can be a folder', async () => {
    const { variantName } = await perfRuns();
    assert.strictEqual(variantName('origin/main'), 'origin-main');
    assert.strictEqual(variantName('HEAD~1'), 'HEAD-1');
  });

  test('takes turns at going first, so a machine that slows down over time weighs on both alike', async () => {
    const { runOrder } = await perfRuns();
    assert.deepStrictEqual(
      runOrder(['base', 'current'], 3).map(
        ({ variant, round }) => `${variant} ${round}`,
      ),
      ['base 1', 'current 1', 'current 2', 'base 2', 'base 3', 'current 3'],
    );
  });
});
