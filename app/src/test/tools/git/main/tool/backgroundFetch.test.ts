import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { waitFor } from '../../../../fixtures';
import { recordingLog } from '../../../../stub';
import {
  closeViews,
  failOnErrorsLogged,
  openView,
  saveTabs,
  stubMethod,
} from '../../../../harness';

suite('Git tool fetching by itself', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  afterAll(closeViews);

  test('fetches the active repository first, then the rest in tab order', async () => {
    const [first, second, third] = ['first', 'second', 'third'].map((name) =>
      path.join(os.tmpdir(), `fastforward-${name}`),
    );
    const own = await openView(
      log,
      [first, second, third],
      false,
      undefined,
      () => () => undefined,
      noGit,
    );
    await saveTabs(own.store, [first, second, third], second);
    const fetched: unknown[] = [];
    stubMethod(own.view, 'fetchInBackground', (_original, root) => {
      fetched.push(root);
      return Promise.resolve();
    });
    await own.connection.receive({ type: 'setAutoFetch', on: true });
    await waitFor(() => fetched.length === 3, 'a round of fetches');
    assert.deepStrictEqual(fetched, [second, first, third]);
  });
});
