import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeEach, suite, test } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import { GitLocator } from '../../../../../tools/git/main/gitLocator';
import type { GitSearch } from '../../../../../tools/git/main/locate';
import { recordingLog, failOnErrorsLogged } from '../../../../helpers/stub';
import {
  closeViews,
  openView,
  stubMethod,
  withView,
} from '../../../../helpers/harness';
import { FakeHost } from '../../../../helpers/fakeHost';
import { noticesOf } from '../../../shell/main/shellFixtures';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

const missing = strings.app.needsGit(strings.app.installGit('2.52'));
const fakeGit = path.join(os.tmpdir(), 'fastforward-no-git');

function lookingFor() {
  const looked = { times: 0 };
  let installed: GitSearch = { kind: 'missing' };
  const locator = new GitLocator(installed, () => {
    looked.times += 1;
    return Promise.resolve(installed);
  });
  const install = (git: GitSearch) => {
    installed = git;
  };
  return { locator, looked, install };
}

suite('Git tool without git', () => {
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  let folder: string;
  let repository: string;
  let plain: string;

  beforeEach(() => {
    folder = tempFolder('without-git');
    repository = path.join(folder, 'repository');
    plain = path.join(folder, 'plain');
    fs.mkdirSync(path.join(repository, '.git'), { recursive: true });
    fs.mkdirSync(path.join(repository, 'src'));
    fs.mkdirSync(plain);
  });

  afterEach(() => removeFolder(folder));

  afterAll(closeViews);

  test('opens a folder of a repository asked for with the commander rather than git, saying git is needed and why, and nothing of a folder in no repository', async () => {
    const { locator } = lookingFor();
    await withView(
      log,
      [],
      async (view) => {
        await view.shell.openFolders([path.join(repository, 'src')]);
        const asked = view.page.last('chooseTool');
        assert.strictEqual(asked?.picked, 'commander');
        assert.deepStrictEqual(
          asked.choices.find((choice) => choice.tool === 'git'),
          { tool: 'git', fits: false },
        );
        assert.deepStrictEqual(noticesOf(view.page), [['error', missing]]);

        await view.connection.receive({ type: 'openWith', tool: undefined });
        await view.shell.openFolders([plain]);
        assert.strictEqual(view.page.last('chooseTool')?.picked, 'commander');
        assert.deepStrictEqual(noticesOf(view.page), [['error', missing]]);
      },
      true,
      undefined,
      locator,
    );
  });

  test('looks for git again at each git action while it is missing, doing none of them but saying why, and goes on with them once git is found, looking no more', async () => {
    const { locator, looked, install } = lookingFor();
    const host = new FakeHost();
    await withView(
      log,
      [],
      async (view) => {
        const actions = [
          () => view.shell.openFolders([repository]),
          () => view.connection.receive({ type: 'newTab', tool: 'git' }),
          () => view.connection.receive({ type: 'browseRepositories' }),
          () =>
            view.connection.receive({ type: 'openRepository', root: plain }),
          () => view.connection.receive({ type: 'initRepository' }),
          () => view.connection.receive({ type: 'openClone' }),
          () => view.view.initRepositoryIn(plain),
          () => view.view.cloneInto(plain),
        ];
        for (const act of actions) {
          await act();
        }
        await view.view.idle();

        assert.strictEqual(looked.times, actions.length);
        assert.deepStrictEqual(
          noticesOf(view.page),
          actions.map(() => ['error', missing]),
        );
        assert.deepStrictEqual(host.foldersAsked, []);
        assert.strictEqual(view.page.last('clone'), undefined);

        install({ kind: 'found', path: fakeGit, version: '2.52.0' });
        looked.times = 0;
        await view.connection.receive({ type: 'initRepository' });
        await view.connection.receive({ type: 'openClone' });
        await view.view.idle();

        assert.strictEqual(looked.times, 1);
        assert.deepStrictEqual(host.foldersAsked, [['init', undefined]]);
        assert.notStrictEqual(view.page.last('clone')?.view, undefined);
      },
      true,
      host,
      locator,
    );
  });

  test('shows a git tab kept from before as why git is needed, saying so, and looks for git again once it is selected again', async () => {
    const { locator, looked } = lookingFor();
    const view = await openView(
      log,
      [repository],
      true,
      undefined,
      undefined,
      locator,
    );
    try {
      assert.deepStrictEqual(view.page.last('error')?.message, missing);
      assert.deepStrictEqual(noticesOf(view.page), [['error', missing]]);
      const tab = view.page.tabs?.active;
      assert.ok(tab !== undefined);

      await view.connection.receive({ type: 'selectTab', tab });

      assert.strictEqual(looked.times, 2);
      assert.deepStrictEqual(noticesOf(view.page), [
        ['error', missing],
        ['error', missing],
      ]);
    } finally {
      view.connection.dispose();
      await view.view.idle();
    }
  });

  test('leaves what needs no git to work without it, looking for none: the recent repositories forgotten and the layout', async () => {
    const { locator, looked } = lookingFor();
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'forgetRecent', root: plain });
        await view.connection.receive({
          type: 'setColumnWidths',
          widths: [400, 250],
        });
        await view.connection.receive({ type: 'setShowAllFiles', show: true });

        assert.strictEqual(looked.times, 0);
        assert.deepStrictEqual(noticesOf(view.page), []);
        assert.deepStrictEqual(
          view.settings.settings.tools.git.columnWidths,
          [400, 250],
        );
      },
      true,
      undefined,
      locator,
    );
  });

  test('fetches nothing by itself while git is missing', async () => {
    const { locator, looked } = lookingFor();
    const view = await openView(
      log,
      [repository],
      false,
      undefined,
      undefined,
      locator,
    );
    try {
      const fetched: unknown[] = [];
      stubMethod(view.view, 'fetchInBackground', (_original, root) => {
        fetched.push(root);
        return Promise.resolve();
      });
      await view.connection.receive({ type: 'setAutoFetch', on: true });
      await view.view.idle();

      assert.deepStrictEqual(fetched, []);
      assert.strictEqual(looked.times, 0);
    } finally {
      view.connection.dispose();
      await view.view.idle();
    }
  });
});
