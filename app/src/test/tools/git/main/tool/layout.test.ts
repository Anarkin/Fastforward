import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { recordingLog } from '../../../../stub';
import { closeViews, failOnErrorsLogged, withView } from '../../../../harness';

suite('Git tool layout with no tab open', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  afterAll(closeViews);

  test('saves the layout and sends it when the page loads', async () => {
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({
          type: 'setColumnWidths',
          widths: [400, 250],
        });
        await view.connection.receive({ type: 'setShowAllFiles', show: true });
        await view.connection.receive({ type: 'ready' });
        const layout = view.page.last('layout');
        assert.deepStrictEqual(layout?.columnWidths, [400, 250]);
        assert.strictEqual(layout.showAllFiles, true);
      },
      true,
      undefined,
      noGit,
    );
  });

  test('saves the merge setting with no tab open', async () => {
    await withView(
      log,
      [],
      async (own) => {
        await own.connection.receive({
          type: 'setCollapseMerges',
          collapse: false,
        });
        assert.strictEqual(
          own.settings.settings.tools.git.collapseMerges,
          false,
        );
      },
      false,
      undefined,
      noGit,
    );
  });
});
