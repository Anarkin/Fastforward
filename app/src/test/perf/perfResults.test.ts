import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { resultsTable, type ScenarioResult } from './perfResults';

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
      steps: { count: 40, work: 6.4 },
      scripts: [
        { name: 'animate webview.js:10', ms: 120.5 },
        { name: 'onWheel webview.js:20', ms: 40 },
      ],
      longAnimationFrames: 1,
    };

    assert.strictEqual(
      resultsTable([
        result,
        { ...result, name: 'idle', input: undefined, steps: undefined },
        { ...result, name: 'uncapped', hz: 'uncapped' },
      ]),
      [
        '| Scenario | Hz | Janky | Dropped | Partial | Worst run | Frame work p50 / p95 / max ms | Long tasks | Longest task ms | Main busy | Main work a step ms | Input to screen p50 / p95 / max ms | LoAF | Top scripts ms |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        '| git: commit list, wheel | 60 | 15% of 120 | 5 | 15 | 3 | 3.1 / 9.8 / 21 | 2 | 23.4 | 41.2% | 6.4 of 40 steps | 18 / 33.4 / 50.1 | 1 | animate webview.js:10 120.5, onWheel webview.js:20 40 |',
        '| idle | 60 | 15% of 120 | 5 | 15 | 3 | 3.1 / 9.8 / 21 | 2 | 23.4 | 41.2% | — | — | 1 | animate webview.js:10 120.5, onWheel webview.js:20 40 |',
        '| uncapped | uncapped | — | — | — | — | 3.1 / 9.8 / 21 | 2 | 23.4 | 41.2% | 6.4 of 40 steps | 18 / 33.4 / 50.1 | 1 | animate webview.js:10 120.5, onWheel webview.js:20 40 |',
        '',
      ].join('\n'),
    );
  });
});
