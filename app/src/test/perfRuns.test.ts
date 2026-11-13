import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'vitest';
import type { ScenarioResult } from './perfTrace';

const appFolder = path.join(__dirname, '..', '..');

interface RunArgs {
  readonly runs: number;
  readonly against: string | undefined;
  readonly vitest: readonly string[];
}

interface Ran {
  readonly variant: string;
  readonly result: ScenarioResult;
}

interface PerfRuns {
  readonly parseRunArgs: (args: readonly string[]) => RunArgs;
  readonly variantName: (ref: string) => string;
  readonly runOrder: (
    variants: readonly string[],
    rounds: number,
  ) => { readonly variant: string; readonly round: number }[];
  readonly summaryTable: (
    ran: readonly Ran[],
    variants: readonly string[],
  ) => string;
}

async function perfRuns(): Promise<PerfRuns> {
  const loaded: PerfRuns = await import(
    pathToFileURL(path.join(appFolder, 'scripts', 'perfRuns.mts')).href
  );
  return loaded;
}

function scenario(
  name: string,
  {
    p95 = 10,
    janky = 0,
    hz = 60,
  }: { p95?: number; janky?: number; hz?: number | 'uncapped' } = {},
): ScenarioResult {
  return {
    name,
    hz,
    seconds: 2,
    frames: {
      updates: 100,
      presented: 100,
      partial: 0,
      dropped: 0,
      idle: 0,
      janky,
      jankPercent: janky,
      worstRun: 0,
    },
    mainThread: {
      busyPercent: 40,
      longTasks: 0,
      longestTask: 5,
      frameWork: { p50: 5, p95, max: p95 },
    },
    input: { p50: 30, p95: 40, max: 50 },
    scripts: [],
    longAnimationFrames: 0,
  };
}

const ran = (variant: string, p95s: readonly number[], name: string) =>
  p95s.map((p95) => ({ variant, result: scenario(name, { p95 }) }));

const p95Column = (table: string, row: string) => {
  const line = table.split('\n').find((each) => each.startsWith(`| ${row} `));
  return line?.split(' | ')[4];
};

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

  test('sums up a scenario by the median of its runs and their range', async () => {
    const { summaryTable } = await perfRuns();
    const table = summaryTable(
      [12, 8, 10].map((p95) => ({
        variant: 'current',
        result: scenario('git: diff, wheel', { p95 }),
      })),
      ['current'],
    );
    assert.strictEqual(p95Column(table, 'git: diff, wheel'), '10 (8–12)');
    assert.match(table, /\| git: diff, wheel \| 3 \|/);
  });

  test('compares the median of each build with that of the build compared with, calling the change clear only once five runs or more of each do not overlap, as three runs of a build miss three of the very same build one time in ten', async () => {
    const { summaryTable } = await perfRuns();
    const table = summaryTable(
      [
        ...ran('base', [12, 13, 14, 13, 14], 'apart'),
        ...ran('current', [9, 10, 11, 10, 9], 'apart'),
        ...ran('base', [12, 13, 14], 'few'),
        ...ran('current', [9, 10, 11], 'few'),
        ...ran('base', [10, 12, 14], 'overlapping'),
        ...ran('current', [9, 11, 13], 'overlapping'),
      ],
      ['base', 'current'],
    );
    assert.strictEqual(p95Column(table, 'apart'), '13 → 10 (−23%, clear)');
    assert.strictEqual(p95Column(table, 'few'), '13 → 10 (−23%)');
    assert.strictEqual(p95Column(table, 'overlapping'), '12 → 11 (−8%)');
    assert.strictEqual(
      p95Column(
        summaryTable(
          [
            ...ran('base', [10, 11], 'same'),
            ...ran('current', [10, 12], 'same'),
          ],
          ['base', 'current'],
        ),
        'same',
      ),
      '10.5 → 11 (+5%)',
    );
    assert.strictEqual(
      p95Column(
        summaryTable(
          [...ran('base', [10], 'flat'), ...ran('current', [10], 'flat')],
          ['base', 'current'],
        ),
        'flat',
      ),
      '10 → 10',
    );
    assert.match(table, /\| apart \| 5\/5 \|/);
  });

  test('leaves out the frames late of runs uncapped by vsync, which say nothing', async () => {
    const { summaryTable } = await perfRuns();
    const table = summaryTable(
      [
        {
          variant: 'current',
          result: scenario('uncapped', { janky: 50, hz: 'uncapped' }),
        },
      ],
      ['current'],
    );
    const line = table
      .split('\n')
      .find((each) => each.startsWith('| uncapped'));
    assert.strictEqual(line?.split(' | ')[2], '—');
  });
});
