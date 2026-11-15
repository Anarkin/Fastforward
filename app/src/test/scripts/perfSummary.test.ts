import * as assert from 'node:assert';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'vitest';
import type { ScenarioResult } from '../perf/perfResults';

const appFolder = path.join(__dirname, '..', '..', '..');

interface Ran {
  readonly variant: string;
  readonly result: ScenarioResult;
}

interface PerfSummary {
  readonly summaryTable: (
    ran: readonly Ran[],
    variants: readonly string[],
  ) => string;
}

async function perfSummary(): Promise<PerfSummary> {
  const loaded: PerfSummary = await import(
    pathToFileURL(path.join(appFolder, 'scripts', 'perfSummary.mts')).href
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

suite('Summing up the runs of the perf scenarios', () => {
  test('sums up a scenario by the median of its runs and their range', async () => {
    const { summaryTable } = await perfSummary();
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
    const { summaryTable } = await perfSummary();
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
    const { summaryTable } = await perfSummary();
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
