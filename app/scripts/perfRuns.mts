import type { ScenarioResult } from '../src/test/perfTrace.ts';

export interface RunArgs {
  readonly runs: number;
  readonly against: string | undefined;
  readonly vitest: readonly string[];
}

const defaultRuns = 5;

const fewestRunsForClear = 5;

export function parseRunArgs(args: readonly string[]): RunArgs {
  let runs = defaultRuns;
  let against: string | undefined;
  const vitest: string[] = [];
  for (const arg of args) {
    if (arg.startsWith('--runs=')) {
      runs = Number(arg.slice('--runs='.length));
      if (!Number.isInteger(runs) || runs < 1) {
        throw new Error(`--runs takes a whole number from 1, not ${arg}`);
      }
    } else if (arg.startsWith('--against=')) {
      against = arg.slice('--against='.length);
    } else {
      vitest.push(arg);
    }
  }
  return { runs, against, vitest };
}

export function variantName(ref: string): string {
  return ref.replace(/[^A-Za-z0-9._-]+/g, '-');
}

export function runOrder(
  variants: readonly string[],
  rounds: number,
): { readonly variant: string; readonly round: number }[] {
  return Array.from({ length: rounds }, (_, index) => {
    const round = index + 1;
    const order = round % 2 === 1 ? variants : variants.toReversed();
    return order.map((variant) => ({ variant, round }));
  }).flat();
}

export interface Ran {
  readonly variant: string;
  readonly result: ScenarioResult;
}

type Metric = (result: ScenarioResult) => number | undefined;

const metrics: readonly (readonly [string, Metric])[] = [
  [
    'Janky %',
    (result) =>
      result.hz === 'uncapped' ? undefined : result.frames.jankPercent,
  ],
  ['Frame work p50 ms', (result) => result.mainThread.frameWork.p50],
  ['Frame work p95 ms', (result) => result.mainThread.frameWork.p95],
  ['Long tasks', (result) => result.mainThread.longTasks],
  ['Longest task ms', (result) => result.mainThread.longestTask],
  ['Main busy %', (result) => result.mainThread.busyPercent],
  ['Input p50 ms', (result) => result.input?.p50],
];

const tenths = (value: number) => Math.round(value * 10) / 10;

function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function spread(values: readonly number[]): string {
  const middle = tenths(median(values));
  if (values.length < 2) {
    return String(middle);
  }
  return `${middle} (${tenths(Math.min(...values))}–${tenths(Math.max(...values))})`;
}

function change(base: readonly number[], current: readonly number[]): string {
  const before = tenths(median(base));
  const after = tenths(median(current));
  const apart =
    base.length >= fewestRunsForClear &&
    current.length >= fewestRunsForClear &&
    (Math.max(...current) < Math.min(...base) ||
      Math.min(...current) > Math.max(...base));
  const notes = [
    ...(before === 0 || after === before
      ? []
      : [
          `${after < before ? '−' : '+'}${Math.abs(Math.round(((after - before) / before) * 100))}%`,
        ]),
    ...(apart ? ['clear'] : []),
  ];
  return `${before} → ${after}${notes.length === 0 ? '' : ` (${notes.join(', ')})`}`;
}

const row = (cells: readonly (string | number)[]) => `| ${cells.join(' | ')} |`;

export function summaryTable(
  ran: readonly Ran[],
  variants: readonly string[],
): string {
  const names = [...new Set(ran.map(({ result }) => result.name))];
  const header = ['Scenario', 'Runs', ...metrics.map(([label]) => label)];
  const valuesOf = (name: string, variant: string, metric: Metric) =>
    ran
      .filter((each) => each.variant === variant && each.result.name === name)
      .flatMap(({ result }) => {
        const value = metric(result);
        return value === undefined ? [] : [value];
      });
  const runsOf = (name: string, variant: string) =>
    ran.filter((each) => each.variant === variant && each.result.name === name)
      .length;
  return [
    row(header),
    row(header.map(() => '---')),
    ...names.map((name) =>
      row([
        name,
        variants.map((variant) => runsOf(name, variant)).join('/'),
        ...metrics.map(([, metric]) => {
          const [base = '', current = base] = variants;
          const before = valuesOf(name, base, metric);
          const after = valuesOf(name, current, metric);
          if (after.length === 0) {
            return '—';
          }
          return variants.length > 1 && before.length > 0
            ? change(before, after)
            : spread(after);
        }),
      ]),
    ),
    '',
  ].join('\n');
}
