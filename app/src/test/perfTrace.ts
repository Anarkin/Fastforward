export interface TraceEvent {
  readonly name: string;
  readonly ph: string;
  readonly ts: number;
  readonly pid: number;
  readonly tid: number;
  readonly dur?: number;
  readonly cat?: string;
  readonly id?: string;
  readonly id2?: { readonly local?: string; readonly global?: string };
  readonly args?: Readonly<Record<string, unknown>>;
}

export interface Span {
  readonly start: number;
  readonly end: number;
}

type FrameState = 'presented' | 'partial' | 'dropped' | 'idle';

export interface Frame {
  readonly start: number;
  readonly end: number;
  readonly state: FrameState;
  readonly janky: boolean;
}

export interface FrameSummary {
  readonly updates: number;
  readonly presented: number;
  readonly partial: number;
  readonly dropped: number;
  readonly idle: number;
  readonly janky: number;
  readonly jankPercent: number;
  readonly worstRun: number;
}

export interface Quantiles {
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
}

export interface MainThreadSummary {
  readonly busyPercent: number;
  readonly longTasks: number;
  readonly longestTask: number;
  readonly frameWork: Quantiles;
}

export interface Script {
  readonly name: string;
  readonly ms: number;
}

export interface ScenarioResult {
  readonly name: string;
  readonly hz: number | 'uncapped';
  readonly seconds: number;
  readonly frames: FrameSummary;
  readonly mainThread: MainThreadSummary;
  readonly input: Quantiles | undefined;
  readonly scripts: readonly Script[];
  readonly longAnimationFrames: number;
}

export interface SavedResult {
  readonly startedAt: number;
  readonly result: ScenarioResult;
  readonly longAnimationFrames: readonly unknown[];
}

export const resultSuffix = '.result.json';

const frameStates: Readonly<Record<string, FrameState>> = {
  STATE_PRESENTED_ALL: 'presented',
  STATE_PRESENTED_PARTIAL: 'partial',
  STATE_DROPPED: 'dropped',
  STATE_NO_UPDATE_DESIRED: 'idle',
};

const microseconds = 1000;

const tenths = (value: number) => Math.round(value * 10) / 10;

const field = (value: unknown, name: string): unknown =>
  typeof value === 'object' && value !== null
    ? Reflect.get(value, name)
    : undefined;

const within = (ts: number, span: Span) => ts >= span.start && ts <= span.end;

export function percentile(sorted: readonly number[], share: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const rank = Math.max(1, Math.ceil(share * sorted.length));
  return sorted[Math.min(sorted.length, rank) - 1] ?? 0;
}

function quantiles(values: readonly number[]): Quantiles {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    p50: tenths(percentile(sorted, 0.5)),
    p95: tenths(percentile(sorted, 0.95)),
    max: tenths(sorted.at(-1) ?? 0),
  };
}

interface Paired {
  readonly begin: TraceEvent;
  readonly end: TraceEvent;
}

function pairedAsync(
  events: readonly TraceEvent[],
  name: string,
  pid: number,
  span: Span,
): Paired[] {
  const open = new Map<string, TraceEvent>();
  const paired: Paired[] = [];
  for (const event of events) {
    if (event.name !== name || event.pid !== pid) {
      continue;
    }
    const id = event.id2?.local ?? event.id2?.global ?? event.id ?? '';
    if (event.ph === 'b') {
      open.set(id, event);
    } else if (event.ph === 'e') {
      const begin = open.get(id);
      open.delete(id);
      if (begin !== undefined && within(begin.ts, span)) {
        paired.push({ begin, end: event });
      }
    }
  }
  return paired.toSorted((a, b) => a.begin.ts - b.begin.ts);
}

export function framesIn(
  events: readonly TraceEvent[],
  pid: number,
  span: Span,
): Frame[] {
  return pairedAsync(events, 'PipelineReporter', pid, span).flatMap(
    ({ begin, end }) => {
      const reporter = field(begin.args, 'frame_reporter');
      const state = frameStates[String(field(reporter, 'state'))];
      if (state === undefined) {
        return [];
      }
      return [
        {
          start: begin.ts,
          end: end.ts,
          state,
          janky:
            field(reporter, 'affects_smoothness') === true &&
            (state === 'partial' || state === 'dropped'),
        },
      ];
    },
  );
}

export function frameSummary(frames: readonly Frame[]): FrameSummary {
  const count = (state: FrameState) =>
    frames.filter((frame) => frame.state === state).length;
  const idle = count('idle');
  const updates = frames.length - idle;
  const janky = frames.filter((frame) => frame.janky).length;
  let run = 0;
  let worstRun = 0;
  for (const frame of frames) {
    run = frame.janky ? run + 1 : 0;
    worstRun = Math.max(worstRun, run);
  }
  return {
    updates,
    presented: count('presented'),
    partial: count('partial'),
    dropped: count('dropped'),
    idle,
    janky,
    jankPercent: updates === 0 ? 0 : tenths((janky / updates) * 100),
    worstRun,
  };
}

export function spanBetween(
  events: readonly TraceEvent[],
  pid: number,
  startMark: string,
  endMark: string,
): Span {
  const at = (name: string) => {
    const found = events.find(
      (event) => event.name === name && event.pid === pid,
    );
    if (found === undefined) {
      throw new Error(`The trace has no mark ${name} of the page`);
    }
    return found.ts;
  };
  return { start: at(startMark), end: at(endMark) };
}

function mainThreadOf(events: readonly TraceEvent[], pid: number): number {
  const named = events.find(
    (event) =>
      event.ph === 'M' &&
      event.name === 'thread_name' &&
      event.pid === pid &&
      field(event.args, 'name') === 'CrRendererMain',
  );
  if (named === undefined) {
    throw new Error(`The trace names no main thread of the page ${pid}`);
  }
  return named.tid;
}

function completeOnMain(
  events: readonly TraceEvent[],
  pid: number,
  name: string,
): TraceEvent[] {
  const tid = mainThreadOf(events, pid);
  return events.filter(
    (event) =>
      event.ph === 'X' &&
      event.name === name &&
      event.pid === pid &&
      event.tid === tid,
  );
}

const overlap = (event: TraceEvent, span: Span) =>
  Math.max(
    0,
    Math.min(span.end, event.ts + (event.dur ?? 0)) -
      Math.max(span.start, event.ts),
  );

export function mainThreadSummary(
  events: readonly TraceEvent[],
  pid: number,
  span: Span,
  budgetMs: number,
): MainThreadSummary {
  const tasks = completeOnMain(events, pid, 'RunTask').filter(
    (task) => overlap(task, span) > 0,
  );
  const lengths = tasks.map((task) => (task.dur ?? 0) / microseconds);
  const busy = tasks.reduce((sum, task) => sum + overlap(task, span), 0);
  return {
    busyPercent: tenths((busy / Math.max(1, span.end - span.start)) * 100),
    longTasks: lengths.filter((length) => length > budgetMs).length,
    longestTask: tenths(Math.max(0, ...lengths)),
    frameWork: quantiles(
      completeOnMain(events, pid, 'ProxyMain::BeginMainFrame')
        .filter((frame) => within(frame.ts, span))
        .map((frame) => (frame.dur ?? 0) / microseconds),
    ),
  };
}

const awaitedInputs = new Set([
  'MOUSE_WHEEL',
  'KEY_PRESSED',
  'MOUSE_PRESSED',
  'MOUSE_DRAGGED_EVENT',
  'TOUCH_PRESSED',
  'TOUCH_MOVED',
  'GESTURE_TAP',
  'GESTURE_SCROLL_UPDATE',
  'INERTIAL_GESTURE_SCROLL_UPDATE',
]);

export function inputLatency(
  events: readonly TraceEvent[],
  pid: number,
  span: Span,
): Quantiles | undefined {
  const latencies = pairedAsync(events, 'EventLatency', pid, span)
    .filter(({ begin }) =>
      awaitedInputs.has(
        String(field(field(begin.args, 'event_latency'), 'event_type')),
      ),
    )
    .map(({ begin, end }) => (end.ts - begin.ts) / microseconds);
  return latencies.length === 0 ? undefined : quantiles(latencies);
}

export type SourceOf = (url: string, line: number) => string | undefined;

const bundledModule = /^\/\/ ((?:src|node_modules)\/\S+)$/;

export function moduleAt(
  bundle: readonly string[],
  line: number,
): string | undefined {
  for (let at = Math.min(line, bundle.length) - 1; at >= 0; at--) {
    const found = bundledModule.exec(bundle[at] ?? '');
    if (found?.[1] !== undefined) {
      const source = found[1];
      const parts = source.split('/');
      if (parts[0] !== 'node_modules') {
        return source;
      }
      const [, scope = '', name = ''] = parts;
      return scope.startsWith('@') ? `${scope}/${name}` : scope;
    }
  }
  return undefined;
}

function scriptName(event: TraceEvent, sourceOf: SourceOf): string {
  const data = field(event.args, 'data');
  const url = field(data, 'url');
  const line = field(data, 'lineNumber');
  const functionName = field(data, 'functionName');
  const name =
    typeof functionName === 'string' && functionName !== ''
      ? functionName
      : '(anonymous)';
  return scriptPlace(
    name,
    typeof url === 'string' ? url : '',
    typeof line === 'number' ? line : 0,
    sourceOf,
  );
}

function scriptPlace(
  name: string,
  url: string,
  line: number,
  sourceOf: SourceOf,
): string {
  return `${name} ${sourceOf(url, line) ?? `${url.slice(url.lastIndexOf('/') + 1)}:${line}`}`;
}

export function topScripts(
  events: readonly TraceEvent[],
  pid: number,
  span: Span,
  count: number,
  sourceOf: SourceOf = () => undefined,
): Script[] {
  const calls = completeOnMain(events, pid, 'FunctionCall')
    .filter((call) => within(call.ts, span))
    .toSorted((a, b) => a.ts - b.ts || (b.dur ?? 0) - (a.dur ?? 0));
  const totals = new Map<string, number>();
  let outerEnd = -Infinity;
  for (const call of calls) {
    const end = call.ts + (call.dur ?? 0);
    if (call.ts < outerEnd) {
      continue;
    }
    outerEnd = end;
    const name = scriptName(call, sourceOf);
    totals.set(name, (totals.get(name) ?? 0) + (call.dur ?? 0));
  }
  return [...totals]
    .map(([name, total]) => ({ name, ms: tenths(total / microseconds) }))
    .toSorted((a, b) => b.ms - a.ms)
    .slice(0, count);
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
      ({ name, hz, frames, mainThread, input, scripts, longAnimationFrames }) =>
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
          quantileCell(input),
          longAnimationFrames,
          scripts.map((script) => `${script.name} ${script.ms}`).join(', '),
        ]),
    ),
    '',
  ].join('\n');
}
