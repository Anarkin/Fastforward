import * as assert from 'node:assert';
import * as fs from 'node:fs';
import { createServer, type Server } from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { sameRoot } from '../../../../../shell/main/storage';
import { cloneFolderKey } from '../../../../../tools/git/main/storage';
import type { CloneView } from '../../../../../tools/git/shared/clone';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../repositories';
import { waitFor } from '../../../../fixtures';
import { recordingLog } from '../../../../stub';
import {
  closeViews,
  failOnErrorsLogged,
  FakeHost,
  gitState,
  shownTabs,
  takeErrorsLogged,
  withNotices,
  withView,
  type OpenView,
} from '../../../../harness';

function views(view: OpenView): (CloneView | undefined)[] {
  return view.page.messages.flatMap((message) =>
    message.type === 'clone' ? [message.view] : [],
  );
}

function lastView(view: OpenView): CloneView | undefined {
  return view.page.last('clone')?.view;
}

suite('Git tool cloning repositories', () => {
  let folder: string;
  let source: TempRepository;
  let url: string;
  let hanging: Server;
  let hangingUrl: string;

  const { log, error: logged, info } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    folder = tempFolder('clone');
    source = await tempRepository(path.join(folder, 'source'));
    await source.commit('first', { 'readme.md': '# source\n' });
    await source.commit('second');
    url = pathToFileURL(source.root).href;
    hanging = createServer(() => undefined);
    await new Promise<void>((listening) =>
      hanging.listen(0, '127.0.0.1', listening),
    );
    const address = hanging.address();
    assert.ok(address !== null && typeof address === 'object');
    hangingUrl = `http://127.0.0.1:${address.port}/app.git`;
  });

  afterAll(async () => {
    hanging.closeAllConnections();
    hanging.close();
    await closeViews();
    removeFolder(folder);
  });

  function into(name: string): string {
    const made = path.join(folder, name);
    fs.mkdirSync(made, { recursive: true });
    return made;
  }

  test('offers the folder last cloned into, or the home folder, with the URL on the clipboard only when it is one that clones', async () => {
    const host = new FakeHost();
    host.clipboard = 'git@github.com:Anarkin/Fastforward.git\n';
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'openClone' });
        assert.deepStrictEqual(lastView(view), {
          kind: 'form',
          url: 'git@github.com:Anarkin/Fastforward.git',
          folder: os.homedir(),
          name: '',
        });
        await view.connection.receive({ type: 'closeClone' });
        assert.strictEqual(lastView(view), undefined);
        host.clipboard = 'not a URL';
        await gitState(view.store).update(cloneFolderKey, folder);
        await view.connection.receive({ type: 'openClone' });
        assert.deepStrictEqual(lastView(view), {
          kind: 'form',
          url: '',
          folder,
          name: '',
        });
      },
      true,
      host,
    );
  });

  test('clones into the folder and name asked for, showing its progress, then closes the dialog and opens the repository in a tab, remembering the folder', async () => {
    const parent = into('cloned');
    const target = path.join(parent, 'app');
    await withView(log, [], async (view) => {
      await view.connection.receive({ type: 'openClone' });
      await view.connection.receive({
        type: 'clone',
        url: ` ${url} `,
        folder: parent,
        name: 'app',
      });
      await view.view.idle();
      const shown = views(view);
      assert.deepStrictEqual(shown[1], { kind: 'running', url, target });
      assert.ok(
        shown.some(
          (each) =>
            each?.kind === 'running' &&
            each.progress?.phase === 'Receiving objects',
        ),
        JSON.stringify(shown),
      );
      assert.strictEqual(shown.at(-1), undefined);
      assert.ok(fs.existsSync(path.join(target, 'readme.md')));
      const tabs = shownTabs(view.page);
      assert.ok(tabs?.active && sameRoot(tabs.active, target));
      assert.ok(view.page.last('repository')?.headCommit);
      assert.strictEqual(gitState(view.store).get(cloneFolderKey), parent);
      assert.strictEqual(view.page.last('notice'), undefined);
      assert.ok(info.includes(`Cloned ${url} into ${target}`));
    });
  });

  test("refuses to clone into a folder that isn't empty, or with a URL or name that can't clone, saying why in the dialog and running no git", async () => {
    const parent = into('refused');
    fs.mkdirSync(path.join(parent, 'taken'));
    fs.writeFileSync(path.join(parent, 'taken', 'kept.txt'), 'kept\n');
    await withView(log, [], async (view) => {
      await view.connection.receive({ type: 'openClone' });
      for (const [asked, message] of [
        [
          { url, folder: parent, name: 'taken' },
          `${path.join(parent, 'taken')} already exists and isn't an empty folder`,
        ],
        [
          { url: '--upload-pack=x', folder: parent, name: 'app' },
          "The URL can't start with -",
        ],
        [
          { url: 'ext::sh -c x', folder: parent, name: 'app' },
          "ext:: URLs run commands, so they aren't cloned",
        ],
        [
          { url, folder: parent, name: '..' },
          ".. can't be the name of a folder",
        ],
        [
          { url, folder: 'relative', name: 'app' },
          'relative is not a full path',
        ],
        [
          { url, folder: path.join(parent, 'missing'), name: 'app' },
          `${path.join(parent, 'missing')} is not a folder`,
        ],
      ] as const) {
        await view.connection.receive({ type: 'clone', ...asked });
        assert.deepStrictEqual(lastView(view), {
          kind: 'form',
          ...asked,
          message,
        });
      }
      await view.view.idle();
      assert.deepStrictEqual(fs.readdirSync(parent).toSorted(), ['taken']);
      assert.strictEqual(shownTabs(view.page)?.tabs.length ?? 0, 0);
    });
  });

  test('says in the dialog why git could not clone, removing what it left and keeping what was asked for', async () => {
    const parent = into('failing');
    const missing = pathToFileURL(path.join(folder, 'missing')).href;
    await withView(log, [], async (view) => {
      await view.connection.receive({ type: 'openClone' });
      await view.connection.receive({
        type: 'clone',
        url: missing,
        folder: parent,
        name: 'app',
      });
      await view.view.idle();
      const shown = lastView(view);
      assert.ok(shown?.kind === 'form', JSON.stringify(shown));
      assert.deepStrictEqual(
        { ...shown, message: undefined },
        {
          kind: 'form',
          url: missing,
          folder: parent,
          name: 'app',
          message: undefined,
        },
      );
      assert.ok(
        shown.message?.includes('does not appear to be a git repository'),
        shown.message,
      );
      assert.deepStrictEqual(fs.readdirSync(parent), []);
      assert.strictEqual(shownTabs(view.page)?.tabs.length ?? 0, 0);
      takeErrorsLogged(
        logged,
        /^Cloning file:.+ failed$/,
        /does not appear to be a git repository/,
      );
    });
  });

  test('keeps cloning once the dialog is closed, saying in a notice when it is done and opening the repository', async () => {
    const parent = into('background');
    const target = path.join(parent, 'app');
    await withView(log, [], async (view) => {
      await withNotices(view.page, 'info', async (notices) => {
        await view.connection.receive({ type: 'openClone' });
        await view.connection.receive({
          type: 'clone',
          url,
          folder: parent,
          name: 'app',
        });
        await view.connection.receive({ type: 'closeClone' });
        await view.view.idle();
        assert.deepStrictEqual(notices, [`Cloned ${url} into ${target}`]);
      });
      assert.strictEqual(lastView(view), undefined);
      const tabs = shownTabs(view.page);
      assert.ok(tabs?.active && sameRoot(tabs.active, target));
    });
  });

  test('says in a notice why a clone in the background failed, showing what was asked for in the dialog again', async () => {
    const parent = into('background-failing');
    const missing = pathToFileURL(path.join(folder, 'missing')).href;
    await withView(log, [], async (view) => {
      await withNotices(view.page, 'error', async (notices) => {
        await view.connection.receive({ type: 'openClone' });
        await view.connection.receive({
          type: 'clone',
          url: missing,
          folder: parent,
          name: 'app',
        });
        await view.connection.receive({ type: 'closeClone' });
        await view.view.idle();
        assert.strictEqual(notices.length, 1);
        assert.ok(
          notices[0].startsWith(`Couldn't clone ${missing}. `),
          notices[0],
        );
      });
      assert.strictEqual(lastView(view), undefined);
      await view.connection.receive({ type: 'openClone' });
      const shown = lastView(view);
      assert.ok(shown?.kind === 'form' && shown.message !== undefined);
      assert.strictEqual(shown.url, missing);
      assert.strictEqual(shown.name, 'app');
      takeErrorsLogged(logged, /^Cloning file:.+ failed$/, /does not appear/);
    });
  });

  test('stops a clone on asking, removing the folder it made and giving back the form as it was', async () => {
    const parent = into('stopped');
    await withView(log, [], async (view) => {
      await view.connection.receive({ type: 'openClone' });
      await view.connection.receive({
        type: 'clone',
        url: hangingUrl,
        folder: parent,
        name: 'app',
      });
      assert.strictEqual(lastView(view)?.kind, 'running');
      await waitFor(
        () => hanging.listening && fs.existsSync(path.join(parent, 'app')),
        'git to make the folder it clones into',
      );
      await view.connection.receive({ type: 'stopClone' });
      await view.view.idle();
      assert.deepStrictEqual(lastView(view), {
        kind: 'form',
        url: hangingUrl,
        folder: parent,
        name: 'app',
      });
      assert.deepStrictEqual(fs.readdirSync(parent), []);
      assert.ok(info.includes(`Stopped cloning ${hangingUrl}`));
    });
  });

  test('keeps an empty folder cloned into once a clone into it is stopped, emptying it', async () => {
    const parent = into('stopped-into-empty');
    fs.mkdirSync(path.join(parent, 'app'));
    await withView(log, [], async (view) => {
      await view.connection.receive({ type: 'openClone' });
      await view.connection.receive({
        type: 'clone',
        url: hangingUrl,
        folder: parent,
        name: 'app',
      });
      await view.connection.receive({ type: 'stopClone' });
      await view.view.idle();
      assert.deepStrictEqual(fs.readdirSync(parent), ['app']);
      assert.deepStrictEqual(fs.readdirSync(path.join(parent, 'app')), []);
    });
  });

  test('tells the page whether a folder and name can be cloned into', async () => {
    const parent = into('checked');
    fs.writeFileSync(path.join(parent, 'file'), '');
    await withView(log, [], async (view) => {
      for (const [name, problem] of [
        ['free', undefined],
        [
          'file',
          `${path.join(parent, 'file')} already exists and isn't an empty folder`,
        ],
        ['a/b', "a/b can't be the name of a folder"],
      ] as const) {
        await view.connection.receive({
          type: 'checkCloneTarget',
          folder: parent,
          name,
        });
        assert.deepStrictEqual(view.page.last('cloneTarget'), {
          type: 'cloneTarget',
          folder: parent,
          name,
          ...(problem !== undefined && { problem }),
        });
      }
    });
  });

  test('asks the system for the folder to clone into, starting from the one in the dialog, and tells the page the one picked', async () => {
    const picked = into('picked');
    const host = new FakeHost();
    host.folder = picked;
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({
          type: 'chooseCloneFolder',
          folder: folder,
        });
        assert.deepStrictEqual(host.foldersAsked, [['clone', folder]]);
        assert.deepStrictEqual(view.page.last('cloneFolder'), {
          type: 'cloneFolder',
          folder: picked,
        });
        host.folder = undefined;
        view.page.clear();
        await view.connection.receive({
          type: 'chooseCloneFolder',
          folder: folder,
        });
        assert.strictEqual(view.page.last('cloneFolder'), undefined);
      },
      true,
      host,
    );
  });
});
