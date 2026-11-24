import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { strings } from '../../../../lib/shared/strings';
import {
  recordingLog,
  failOnErrorsLogged,
  takeErrorsLogged,
} from '../../../helpers/stub';
import { closeViews, withView } from '../../../helpers/harness';
import { noticesOf } from './shellFixtures';
import { FakeHost } from '../../../helpers/fakeHost';
import { defaultSettings } from '../../../helpers/fixtures';

suite('Shell with no tab open', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  afterAll(closeViews);

  test('opens the settings files in editor tabs of the app, a file already open in its tab', async () => {
    const host = new FakeHost();
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'openSettings' });
        await view.connection.receive({ type: 'openDefaultSettings' });
        await view.connection.receive({ type: 'openSettings' });
        assert.deepStrictEqual(host.opened, [
          'settings',
          'defaults',
          'settings',
        ]);
        assert.deepStrictEqual(
          view.page.tabs?.tabs.map(({ tool, root }) => ({ tool, root })),
          [
            { tool: 'editor', root: path.resolve('settings.user.json') },
            { tool: 'editor', root: path.resolve('settings.defaults.json') },
          ],
        );
        assert.strictEqual(view.page.tabs?.active, view.page.tabs?.tabs[0]?.id);
      },
      false,
      host,
      noGit,
    );
  });

  test('says on the page why the app could not do what the page asked, as well as in the log', async () => {
    const host = new FakeHost();
    host.userSettingsFile = () =>
      Promise.reject(new Error('no editor opens settings.user.json'));
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'openSettings' });
        assert.deepStrictEqual(noticesOf(view.page), [
          ['error', 'no editor opens settings.user.json'],
        ]);
        takeErrorsLogged(
          logged,
          /^Handling openSettings from the page failed$/,
          /^no editor opens settings\.user\.json$/,
        );
      },
      false,
      host,
      noGit,
    );
  });

  test('leaves the tools not shown alone when it switches between tabs of another tool, telling the page only the tabs', async () => {
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'newTab', tool: 'commander' });
        await view.connection.receive({ type: 'newTab', tool: 'commander' });
        const [first] = view.page.tabs?.tabs ?? [];
        assert.ok(first);
        view.page.clear();
        await view.connection.receive({ type: 'selectTab', tab: first.id });
        assert.deepStrictEqual(
          view.page.messages.map((message) => message.type),
          ['tabs'],
        );
      },
      true,
      undefined,
      noGit,
    );
  });

  test('gives a tab opened after others closed an id no tab had since the app started, as the tools and pages keep what they know of a tab by its id', async () => {
    await withView(
      log,
      [],
      async (view) => {
        const ids = () => view.page.tabs?.tabs.map((tab) => tab.id) ?? [];
        await view.connection.receive({ type: 'newTab', tool: 'commander' });
        await view.connection.receive({ type: 'newTab', tool: 'commander' });
        const [first, second] = ids();
        assert.ok(first !== undefined && second !== undefined);
        await view.connection.receive({ type: 'closeTab', tab: second });
        await view.connection.receive({ type: 'newTab', tool: 'commander' });
        const third = ids().at(-1);
        assert.ok(third !== undefined);
        await view.connection.receive({ type: 'closeTab', tab: third });
        await view.connection.receive({ type: 'closeTab', tab: first });
        await view.connection.receive({ type: 'newTab', tool: 'commander' });
        const fourth = ids().at(-1);
        assert.strictEqual(
          new Set([first, second, third, fourth]).size,
          4,
          JSON.stringify([first, second, third, fourth]),
        );
      },
      true,
      undefined,
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

  test('says what was wrong with the saved state when the page loads, as the tabs and recent items it held were gone without a word', async () => {
    const host = new FakeHost();
    host.unsavedState = [strings.state.putAside('state.json.corrupt')];
    await withView(
      log,
      [],
      async (view) => {
        assert.deepStrictEqual(view.page.last('notice'), {
          type: 'notice',
          level: 'error',
          message: strings.state.putAside('state.json.corrupt'),
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

  test('tells the page whether it can install ff, which only the app on macOS and an AppImage do, leaving it to the installer on Windows and the package on Linux', async () => {
    for (const installable of [false, true]) {
      const host = new FakeHost();
      host.commandPlace = installable;
      host.command = 'installed';
      await withView(
        log,
        [],
        async (view) => {
          assert.deepStrictEqual(view.page.last('terminalCommand'), {
            type: 'terminalCommand',
            installable,
          });
        },
        true,
        host,
        noGit,
      );
    }
  });

  test('tells the page the color groups of the files, which every path is drawn in, as the commander lists it', async () => {
    await withView(
      log,
      [],
      async (view) => {
        assert.deepStrictEqual(view.page.last('fileColors'), {
          type: 'fileColors',
          groups: defaultSettings().tools.commander.fileColors,
        });
      },
      true,
      new FakeHost(),
      noGit,
    );
  });

  test('tells the page the date format of the settings, which every tool writes its dates in', async () => {
    await withView(
      log,
      [],
      async (view) => {
        assert.deepStrictEqual(view.page.last('dateFormat'), {
          type: 'dateFormat',
          format: 'YYYY-MM-DD HH:mm',
        });
      },
      true,
      new FakeHost(),
      noGit,
    );
  });

  test('tells the page how many rows a notch of the mouse wheel scrolls and whether scrolling glides and settles on whole rows, which every list that scrolls by rows and the terminal follow', async () => {
    await withView(
      log,
      [],
      async (view) => {
        assert.deepStrictEqual(view.page.last('scrolling'), {
          type: 'scrolling',
          wheelRows: 10,
          smooth: true,
          smoothSnap: true,
        });
      },
      true,
      new FakeHost(),
      noGit,
    );
  });

  test('tells the page how long to wait before a tooltip and how long a notice stays, as the settings say', async () => {
    await withView(
      log,
      [],
      async (view) => {
        assert.deepStrictEqual(view.page.last('hints'), {
          type: 'hints',
          tipDelay: 500,
          characterTipDelay: 0,
          noticeTimes: {
            least: 6000,
            most: 15_000,
            errorLeast: 20_000,
            errorMost: 45_000,
          },
        });
      },
      true,
      new FakeHost(),
      noGit,
    );
  });
});
