import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { errorsIn, lastLines } from './appLogs';

const log = [
  '2026-11-21T00:00:01.000Z [info] Using git 2.52.0',
  '2026-11-21T00:00:02.000Z [error] Webview: an error from before the test',
  '2026-11-21T00:00:05.000Z [info] Saved the settings',
  '2026-11-21T00:00:06.000Z [error] Webview: Maximum update depth exceeded.',
  '    at Dropdown',
  '    at MenuButton',
  '2026-11-21T00:00:07.000Z [warn] Slow page',
  '2026-11-21T00:00:08.000Z [error] The page did not finish loading',
  '',
].join('\n');

suite('Errors an app logged', () => {
  test('takes the errors logged from a time on, each with the lines of its stack, and leaves out other levels and errors logged before', () => {
    assert.deepStrictEqual(
      errorsIn(log, Date.parse('2026-11-21T00:00:05.000Z')),
      [
        '2026-11-21T00:00:06.000Z [error] Webview: Maximum update depth exceeded.\n    at Dropdown\n    at MenuButton',
        '2026-11-21T00:00:08.000Z [error] The page did not finish loading',
      ],
    );
  });

  test('takes none from a log without errors since, or an empty one', () => {
    assert.deepStrictEqual(
      errorsIn(log, Date.parse('2026-11-21T00:00:09.000Z')),
      [],
    );
    assert.deepStrictEqual(errorsIn('', 0), []);
  });

  test('takes the last lines an app logged, to tell why it ended before its test closed it, as an app that quit on its own in the middle of a test told only its exit code', () => {
    assert.deepStrictEqual(lastLines(log, 3), [
      '    at MenuButton',
      '2026-11-21T00:00:07.000Z [warn] Slow page',
      '2026-11-21T00:00:08.000Z [error] The page did not finish loading',
    ]);
    assert.deepStrictEqual(lastLines('', 3), []);
  });
});
