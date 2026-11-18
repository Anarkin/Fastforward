import type {
  FrameSummary,
  MainThreadSummary,
  Quantiles,
  Script,
  Steps,
} from './perfTrace';

export interface ScenarioResult {
  readonly name: string;
  readonly hz: number | 'uncapped';
  readonly seconds: number;
  readonly frames: FrameSummary;
  readonly mainThread: MainThreadSummary;
  readonly input: Quantiles | undefined;
  readonly steps: Steps | undefined;
  readonly scripts: readonly Script[];
  readonly longAnimationFrames: number;
}

export interface SavedResult {
  readonly startedAt: number;
  readonly result: ScenarioResult;
  readonly longAnimationFrames: readonly unknown[];
}

export const resultSuffix = '.result.json';

export function isSaved(value: unknown): value is SavedResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'startedAt') === 'number' &&
    typeof Reflect.get(value, 'result') === 'object'
  );
}

const columns = [
  'Scenario',
  'Hz',
  'Janky',
  'Dropped',
  'Partial',
  'Worst run',
  'Frame work p50 / p95 / max ms',
  'Long tasks',
  'Longest task ms',
  'Main busy',
  'Main work a step ms',
  'Input to screen p50 / p95 / max ms',
  'LoAF',
  'Top scripts ms',
];

const row = (cells: readonly (string | number)[]) => `| ${cells.join(' | ')} |`;

const quantileCell = (value: Quantiles | undefined) =>
  value === undefined ? '—' : `${value.p50} / ${value.p95} / ${value.max}`;

export function resultsTable(results: readonly ScenarioResult[]): string {
  return [
    row(columns),
    row(columns.map(() => '---')),
    ...results.map(
      ({
        name,
        hz,
        frames,
        mainThread,
        input,
        steps,
        scripts,
        longAnimationFrames,
      }) =>
        row([
          name,
          hz,
          ...(hz === 'uncapped'
            ? ['—', '—', '—', '—']
            : [
                `${frames.jankPercent}% of ${frames.updates}`,
                frames.dropped,
                frames.partial,
                frames.worstRun,
              ]),
          quantileCell(mainThread.frameWork),
          mainThread.longTasks,
          mainThread.longestTask,
          `${mainThread.busyPercent}%`,
          steps === undefined ? '—' : `${steps.work} of ${steps.count} steps`,
          quantileCell(input),
          longAnimationFrames,
          scripts.map((script) => `${script.name} ${script.ms}`).join(', '),
        ]),
    ),
    '',
  ].join('\n');
}
