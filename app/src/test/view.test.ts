import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { tabName } from '../view';
import { recordingLog } from './stub';
import {
  closeViews,
  failOnErrorsLogged,
  FakeHost,
  withView,
} from './viewHarness';

suite('View', () => {
  const folder = os.tmpdir();

  test('names a tab after its folder, or after the whole root of a repository at the top of a drive', () => {
    assert.strictEqual(tabName(path.join(folder, 'main')), 'main');
    const top = path.parse(folder).root;
    assert.strictEqual(tabName(top), top);
  });

  test('names a bare repository after its folder without .git, or after the folder holding it', () => {
    assert.strictEqual(tabName(path.join(folder, 'app.git')), 'app');
    assert.strictEqual(tabName(path.join(folder, 'app', '.bare')), 'app');
    assert.strictEqual(tabName(path.join(folder, 'app', '.git')), 'app');
  });
});

suite('View with no tab open', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  suiteTeardown(closeViews);

  test('opens the settings files through the app', async () => {
    const host = new FakeHost();
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'openSettings' });
        await view.connection.receive({ type: 'openDefaultSettings' });
        assert.deepStrictEqual(host.opened, ['settings', 'defaults']);
      },
      false,
      host,
      noGit,
    );
  });

  test('says what is wrong with the settings when the page loads', async () => {
    const host = new FakeHost();
    host.problems = ['Unknown setting "sollo"'];
    await withView(
      log,
      [],
      async (view) => {
        assert.deepStrictEqual(view.page.last('notice'), {
          type: 'notice',
          level: 'error',
          message: 'Settings: Unknown setting "sollo"',
        });
      },
      true,
      host,
      noGit,
    );
  });

  test('leaves updating to the app, sending how far it got when the page loads', async () => {
    const host = new FakeHost();
    host.update = { kind: 'ready', version: '7.0.0' };
    await withView(
      log,
      [],
      async (view) => {
        assert.deepStrictEqual(view.page.last('update'), {
          type: 'update',
          status: { kind: 'ready', version: '7.0.0' },
        });
        await view.connection.receive({ type: 'checkForUpdates' });
        await view.connection.receive({ type: 'installUpdate' });
        assert.deepStrictEqual(host.opened, ['update check', 'update install']);
      },
      true,
      host,
      noGit,
    );
  });

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
        assert.strictEqual(own.settings.settings.collapseMerges, false);
      },
      false,
      undefined,
      noGit,
    );
  });
});
