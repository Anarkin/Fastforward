import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { reloadWhenGone } from '../../../boot/pageGone';
import { strings } from '../../../lib/shared/strings';
import { recordingLog } from '../../support/stub';

suite('Page gone', () => {
  test('loads the page again once its process is gone, but not when it goes again within a minute of that, as a page that goes as it loads would go again and again', () => {
    let gone:
      | ((
          event: unknown,
          details: { reason: string; exitCode: number },
        ) => void)
      | undefined;
    let reloads = 0;
    let time = 1_000_000;
    const { log, error } = recordingLog();
    reloadWhenGone(
      {
        webContents: {
          on: (_event, listener) => {
            gone = listener;
          },
          reload: () => {
            reloads += 1;
          },
        },
      },
      log,
      () => undefined,
      () => time,
    );
    gone?.({}, { reason: 'oom', exitCode: -536870904 });
    assert.strictEqual(reloads, 1);
    time += 60_000;
    gone?.({}, { reason: 'killed', exitCode: 1 });
    assert.strictEqual(reloads, 2);
    time += 59_999;
    gone?.({}, { reason: 'crashed', exitCode: 2 });
    assert.strictEqual(reloads, 2);
    assert.deepStrictEqual(error, [
      strings.log.pageGone('oom', -536870904),
      strings.log.pageGone('killed', 1),
      strings.log.pageGoneAgain('crashed', 2),
    ]);
  });

  test('lets go of the page once it stays gone, so that closing the window does not wait for it to confirm', () => {
    let gone:
      | ((
          event: unknown,
          details: { reason: string; exitCode: number },
        ) => void)
      | undefined;
    let left = 0;
    reloadWhenGone(
      {
        webContents: {
          on: (_event, listener) => {
            gone = listener;
          },
          reload: () => undefined,
        },
      },
      recordingLog().log,
      () => {
        left += 1;
      },
      () => 1_000_000,
    );
    gone?.({}, { reason: 'oom', exitCode: 1 });
    assert.strictEqual(left, 0);
    gone?.({}, { reason: 'oom', exitCode: 1 });
    assert.strictEqual(left, 1);
  });
});
