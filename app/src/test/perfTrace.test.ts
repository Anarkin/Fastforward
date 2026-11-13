import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  frameSummary,
  framesIn,
  inputLatency,
  mainThreadSummary,
  moduleAt,
  percentile,
  resultsTable,
  spanBetween,
  topScripts,
  type ScenarioResult,
  type TraceEvent,
} from './perfTrace';

const page = 7;
const other = 8;
const main = 1;
const compositor = 2;

const threadNames: TraceEvent[] = [
  {
    name: 'thread_name',
    ph: 'M',
    ts: 0,
    pid: page,
    tid: main,
    args: { name: 'CrRendererMain' },
  },
  {
    name: 'thread_name',
    ph: 'M',
    ts: 0,
    pid: page,
    tid: compositor,
    args: { name: 'Compositor' },
  },
  {
    name: 'thread_name',
    ph: 'M',
    ts: 0,
    pid: other,
    tid: main,
    args: { name: 'CrRendererMain' },
  },
];

function reporter(
  id: string,
  start: number,
  end: number,
  state: string,
  affectsSmoothness = false,
  pid = page,
): TraceEvent[] {
  return [
    {
      name: 'PipelineReporter',
      ph: 'b',
      ts: start,
      pid,
      tid: compositor,
      id2: { local: id },
      args: {
        frame_reporter: { state, affects_smoothness: affectsSmoothness },
      },
    },
    {
      name: 'PipelineReporter',
      ph: 'e',
      ts: end,
      pid,
      tid: compositor,
      id2: { local: id },
      args: {},
    },
  ];
}

function mark(name: string, ts: number, pid = page): TraceEvent {
  return { name, cat: 'blink.user_timing', ph: 'R', ts, pid, tid: main };
}

function complete(
  name: string,
  ts: number,
  dur: number,
  { pid = page, tid = main, args = {} } = {},
): TraceEvent {
  return { name, ph: 'X', ts, dur, pid, tid, args };
}

function latency(
  id: string,
  start: number,
  end: number,
  pid = page,
  type = 'MOUSE_WHEEL',
): TraceEvent[] {
  return [
    {
      name: 'EventLatency',
      ph: 'b',
      ts: start,
      pid,
      tid: compositor,
      id2: { local: id },
      args: { event_latency: { event_type: type } },
    },
    {
      name: 'EventLatency',
      ph: 'e',
      ts: end,
      pid,
      tid: compositor,
      id2: { local: id },
    },
  ];
}

function call(
  functionName: string,
  ts: number,
  dur: number,
  url = 'fastforward://app/webview.js',
  lineNumber = 10,
): TraceEvent {
  return complete('FunctionCall', ts, dur, {
    args: { data: { functionName, url, lineNumber } },
  });
}

const span = { start: 1000, end: 100_000 };

suite('Reading the frames of a trace', () => {
  test('pairs the begin and end of each frame of the page, as presented, partly presented, dropped or idle, in the order they started', () => {
    const frames = framesIn(
      [
        ...reporter('0x2', 20_000, 40_000, 'STATE_PRESENTED_PARTIAL', true),
        ...reporter('0x1', 2000, 18_000, 'STATE_PRESENTED_ALL'),
        ...reporter('0x3', 36_000, 52_000, 'STATE_DROPPED', true),
        ...reporter('0x4', 53_000, 54_000, 'STATE_NO_UPDATE_DESIRED'),
      ],
      page,
      span,
    );

    assert.deepStrictEqual(frames, [
      { start: 2000, end: 18_000, state: 'presented', janky: false },
      { start: 20_000, end: 40_000, state: 'partial', janky: true },
      { start: 36_000, end: 52_000, state: 'dropped', janky: true },
      { start: 53_000, end: 54_000, state: 'idle', janky: false },
    ]);
  });

  test('leaves out the frames of other processes, those that started outside the span and those that never ended', () => {
    const frames = framesIn(
      [
        ...reporter('0x1', 2000, 18_000, 'STATE_PRESENTED_ALL', false, other),
        ...reporter('0x2', 500, 18_000, 'STATE_PRESENTED_ALL'),
        ...reporter('0x3', 100_500, 118_000, 'STATE_PRESENTED_ALL'),
        reporter('0x4', 30_000, 40_000, 'STATE_PRESENTED_ALL')[0],
        ...reporter('0x5', 50_000, 66_000, 'STATE_PRESENTED_ALL'),
      ].filter((event) => event !== undefined),
      page,
      span,
    );

    assert.deepStrictEqual(
      frames.map((frame) => frame.start),
      [50_000],
    );
  });

  test('counts a partly presented or dropped frame as janky only when it hurt smoothness', () => {
    const frames = framesIn(
      [
        ...reporter('0x1', 2000, 18_000, 'STATE_PRESENTED_PARTIAL'),
        ...reporter('0x2', 20_000, 40_000, 'STATE_DROPPED'),
        ...reporter('0x3', 40_000, 56_000, 'STATE_PRESENTED_ALL', true),
      ],
      page,
      span,
    );

    assert.deepStrictEqual(
      frames.map((frame) => frame.janky),
      [false, false, false],
    );
  });
});

suite('Summing up the frames', () => {
  test('counts each kind and the share of janky frames among those that had an update, idle ones left out', () => {
    const summary = frameSummary([
      { start: 0, end: 1, state: 'presented', janky: false },
      { start: 1, end: 2, state: 'partial', janky: true },
      { start: 2, end: 3, state: 'dropped', janky: true },
      { start: 3, end: 4, state: 'idle', janky: false },
      { start: 4, end: 5, state: 'presented', janky: false },
      { start: 5, end: 6, state: 'partial', janky: false },
    ]);

    assert.deepStrictEqual(summary, {
      updates: 5,
      presented: 2,
      partial: 2,
      dropped: 1,
      idle: 1,
      janky: 2,
      jankPercent: 40,
      worstRun: 2,
    });
  });

  test('finds the longest run of janky frames, a presented or idle frame ending a run', () => {
    const states = ['J', 'J', 'P', 'J', 'J', 'J', 'I', 'J'];
    const summary = frameSummary(
      states.map((state, index) => ({
        start: index,
        end: index + 1,
        state: state === 'P' ? 'presented' : state === 'I' ? 'idle' : 'dropped',
        janky: state === 'J',
      })),
    );

    assert.strictEqual(summary.worstRun, 3);
  });

  test('says no frame was janky when none had an update', () => {
    assert.strictEqual(frameSummary([]).jankPercent, 0);
  });
});

suite('Finding the span of a scenario', () => {
  test('takes the marks the page made at the start and at the end', () => {
    assert.deepStrictEqual(
      spanBetween(
        [
          mark('perf-start', 5, other),
          mark('perf-start', 10),
          mark('perf-end', 90),
        ],
        page,
        'perf-start',
        'perf-end',
      ),
      { start: 10, end: 90 },
    );
  });

  test('stops, naming the mark, when the page made none', () => {
    assert.throws(
      () =>
        spanBetween([mark('perf-start', 10)], page, 'perf-start', 'perf-end'),
      /perf-end/,
    );
  });
});

suite('Summing up the main thread of the page', () => {
  test('measures how busy it was within the span, the tasks longer than a frame and the work of each frame, leaving out other threads and processes', () => {
    const summary = mainThreadSummary(
      [
        ...threadNames,
        complete('RunTask', 500, 1500),
        complete('RunTask', 10_000, 4000),
        complete('RunTask', 20_000, 20_000),
        complete('RunTask', 99_000, 2000),
        complete('RunTask', 30_000, 50_000, { tid: compositor }),
        complete('RunTask', 30_000, 50_000, { pid: other }),
        complete('ProxyMain::BeginMainFrame', 10_000, 3000),
        complete('ProxyMain::BeginMainFrame', 20_000, 18_000),
        complete('ProxyMain::BeginMainFrame', 50_000, 1000),
      ],
      page,
      span,
      16.7,
    );

    assert.deepStrictEqual(summary, {
      busyPercent: 26.3,
      longTasks: 1,
      longestTask: 20,
      frameWork: { p50: 3, p95: 18, max: 18 },
    });
  });
});

suite('Measuring how long input took to show', () => {
  test('pairs the begin and end of each input of the page within the span, in milliseconds', () => {
    assert.deepStrictEqual(
      inputLatency(
        [
          ...latency('0x1', 2000, 20_000),
          ...latency('0x2', 30_000, 38_000),
          ...latency('0x3', 40_000, 90_000, other),
          ...latency('0x4', 500, 9000),
        ],
        page,
        span,
      ),
      { p50: 8, p95: 18, max: 18 },
    );
  });

  test('takes only the input whose effect is waited for, leaving out keys and buttons let go and the pointer moving', () => {
    assert.deepStrictEqual(
      inputLatency(
        [
          ...latency('0x1', 2000, 27_000, page, 'KEY_PRESSED'),
          ...latency('0x2', 3000, 3500, page, 'KEY_RELEASED'),
          ...latency('0x3', 4000, 4500, page, 'MOUSE_RELEASED'),
          ...latency('0x4', 5000, 5500, page, 'MOUSE_MOVED_EVENT'),
          ...latency('0x5', 6000, 6500, page, 'GESTURE_SCROLL_END'),
        ],
        page,
        span,
      ),
      { p50: 25, p95: 25, max: 25 },
    );
  });

  test('says nothing when no input was shown', () => {
    assert.strictEqual(inputLatency([], page, span), undefined);
  });
});

suite('Finding the scripts that took the most time', () => {
  test('sums the calls into scripts of the main thread of the page by function and place, leaving out the calls they make', () => {
    assert.deepStrictEqual(
      topScripts(
        [
          ...threadNames,
          call('onWheel', 2000, 3000, 'fastforward://app/webview.js', 100),
          call('inner', 2500, 1000),
          call('onWheel', 10_000, 2000, 'fastforward://app/webview.js', 100),
          call('animate', 20_000, 4000, 'fastforward://app/chunks/a.js', 7),
          call('animate', 20_000, 9000, 'other.js', 7),
          { ...call('onWheel', 30_000, 9000), pid: other },
          call('onWheel', 200_000, 9000),
        ],
        page,
        span,
        2,
      ),
      [
        { name: 'onWheel webview.js:100', ms: 5 },
        { name: 'animate other.js:7', ms: 9 },
      ].toSorted((a, b) => b.ms - a.ms),
    );
  });

  test('names a call without a function after its place', () => {
    assert.deepStrictEqual(
      topScripts([...threadNames, call('', 2000, 3000)], page, span, 1),
      [{ name: '(anonymous) webview.js:10', ms: 3 }],
    );
  });

  test('names the place of a call by the source it was bundled from, summing the calls of a function from one source', () => {
    assert.deepStrictEqual(
      topScripts(
        [
          ...threadNames,
          call('animate', 2000, 3000, 'fastforward://app/webview.js', 10),
          call('animate', 9000, 1000, 'fastforward://app/webview.js', 12),
        ],
        page,
        span,
        1,
        (url, line) =>
          url.endsWith('/webview.js') && line >= 10
            ? 'src/ui/rowScroll.ts'
            : undefined,
      ),
      [{ name: 'animate src/ui/rowScroll.ts', ms: 4 }],
    );
  });
});

suite('Finding the source of a line of a bundle', () => {
  const bundle = [
    'import "./chunk.js";',
    '// node_modules/react-dom/cjs/react-dom-client.production.js',
    'function render() {}',
    '// node_modules/@tanstack/virtual-core/dist/esm/index.js',
    'function measure() {}',
    '// src/ui/rowScroll.ts',
    'const animate = () => {',
    '  // not a module',
    '};',
  ];

  test('takes the module esbuild marked last before the line, counting lines from 1', () => {
    assert.strictEqual(moduleAt(bundle, 8), 'src/ui/rowScroll.ts');
    assert.strictEqual(moduleAt(bundle, 7), 'src/ui/rowScroll.ts');
  });

  test('names a package by its name rather than the file in it, scoped ones too', () => {
    assert.strictEqual(moduleAt(bundle, 3), 'react-dom');
    assert.strictEqual(moduleAt(bundle, 5), '@tanstack/virtual-core');
  });

  test('finds none before the first module', () => {
    assert.strictEqual(moduleAt(bundle, 1), undefined);
  });
});

suite('Taking percentiles', () => {
  test('takes the nearest rank of sorted values', () => {
    const values = Array.from({ length: 20 }, (_, index) => index + 1);
    assert.strictEqual(percentile(values, 0.5), 10);
    assert.strictEqual(percentile(values, 0.95), 19);
    assert.strictEqual(percentile(values, 1), 20);
    assert.strictEqual(percentile([], 0.5), 0);
  });
});

suite('Writing the results as a table', () => {
  test('writes a row for each scenario, with the frames, the main thread, the input and the scripts, leaving the frames out of a run uncapped by vsync', () => {
    const result: ScenarioResult = {
      name: 'git: commit list, wheel',
      hz: 60,
      seconds: 2.5,
      frames: {
        updates: 120,
        presented: 100,
        partial: 15,
        dropped: 5,
        idle: 30,
        janky: 18,
        jankPercent: 15,
        worstRun: 3,
      },
      mainThread: {
        busyPercent: 41.2,
        longTasks: 2,
        longestTask: 23.4,
        frameWork: { p50: 3.1, p95: 9.8, max: 21 },
      },
      input: { p50: 18, p95: 33.4, max: 50.1 },
      scripts: [
        { name: 'animate webview.js:10', ms: 120.5 },
        { name: 'onWheel webview.js:20', ms: 40 },
      ],
      longAnimationFrames: 1,
    };

    assert.strictEqual(
      resultsTable([
        result,
        { ...result, name: 'idle', input: undefined },
        { ...result, name: 'uncapped', hz: 'uncapped' },
      ]),
      [
        '| Scenario | Hz | Janky | Dropped | Partial | Worst run | Frame work p50 / p95 / max ms | Long tasks | Longest task ms | Main busy | Input to screen p50 / p95 / max ms | LoAF | Top scripts ms |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| git: commit list, wheel | 60 | 15% of 120 | 5 | 15 | 3 | 3.1 / 9.8 / 21 | 2 | 23.4 | 41.2% | 18 / 33.4 / 50.1 | 1 | animate webview.js:10 120.5, onWheel webview.js:20 40 |',
        '| idle | 60 | 15% of 120 | 5 | 15 | 3 | 3.1 / 9.8 / 21 | 2 | 23.4 | 41.2% | — | 1 | animate webview.js:10 120.5, onWheel webview.js:20 40 |',
        '| uncapped | uncapped | — | — | — | — | 3.1 / 9.8 / 21 | 2 | 23.4 | 41.2% | 18 / 33.4 / 50.1 | 1 | animate webview.js:10 120.5, onWheel webview.js:20 40 |',
        '',
      ].join('\n'),
    );
  });
});
