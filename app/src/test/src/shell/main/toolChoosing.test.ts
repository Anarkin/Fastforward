import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { strings } from '../../../../lib/shared/strings';
import { recordingLog } from '../../../helpers/stub';
import {
  closeViews,
  failOnErrorsLogged,
  gate,
  stubMethod,
  withView,
} from '../../../helpers/harness';
import { removeFolder, tempFolder } from '../../../helpers/repositories';
import { noticesOf } from './shellFixtures';

suite('Choosing the tool that opens a folder', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  afterAll(closeViews);

  test('asks about the folders asked for at about the same time in one question, as Explorer starts the app once for each folder picked, each handing its folder over', async () => {
    const first = tempFolder('first');
    const second = tempFolder('second');
    try {
      await withView(
        log,
        [],
        async (view) => {
          const held = gate();
          stubMethod(view.view, 'fits', async (_fits, folder) => {
            if (folder === first) {
              await held.opened;
            }
            return false;
          });
          const asked = [
            view.shell.openFolders([first]),
            view.shell.openFolders([second]),
          ];
          await new Promise((resolve) => setTimeout(resolve, 50));
          held.open();
          await Promise.all(asked);
          assert.deepStrictEqual(view.page.last('chooseTool')?.folders, [
            first,
            second,
          ]);
          await view.connection.receive({
            type: 'openWith',
            tool: 'commander',
          });
          assert.deepStrictEqual(
            view.page.tabs?.tabs.map((tab) => tab.root),
            [first, second],
          );
        },
        true,
        undefined,
        noGit,
      );
    } finally {
      removeFolder(first);
      removeFolder(second);
    }
  });

  test('offers the folder of the active tab to the other tools it fits, its own tool shown but not offered, and opens it in the one picked', async () => {
    const work = tempFolder('work');
    try {
      await withView(
        log,
        [],
        async (view) => {
          await view.shell.openFolders([work]);
          await view.connection.receive({
            type: 'openWith',
            tool: 'commander',
          });
          await view.connection.receive({ type: 'openIn' });
          assert.deepStrictEqual(view.page.last('chooseTool'), {
            type: 'chooseTool',
            folders: [work],
            choices: [
              { tool: 'terminal', fits: true },
              { tool: 'commander', fits: false },
              { tool: 'git', fits: false },
            ],
            picked: 'terminal',
          });
          await view.connection.receive({
            type: 'openWith',
            tool: 'commander',
          });
          assert.strictEqual(view.page.tabs?.tabs.length, 1);
          await view.connection.receive({ type: 'openIn' });
          await view.connection.receive({
            type: 'openWith',
            tool: 'terminal',
          });
          assert.deepStrictEqual(
            view.page.tabs?.tabs.map((tab) => [tab.tool, tab.root]),
            [
              ['commander', work],
              ['terminal', work],
            ],
          );
        },
        true,
        undefined,
        noGit,
      );
    } finally {
      removeFolder(work);
    }
  });

  test('says the folder of the active tab cannot be opened when no other tool fits it, offering nothing, as the folder a terminal tells comes from what runs in it, which may name one gone or made up', async () => {
    const work = tempFolder('work');
    try {
      await withView(
        log,
        [],
        async (view) => {
          await view.shell.openFolders([work]);
          await view.connection.receive({
            type: 'openWith',
            tool: 'commander',
          });
          removeFolder(work);
          view.page.clear();
          await view.connection.receive({ type: 'openIn' });
          assert.deepStrictEqual(noticesOf(view.page), [
            ['error', strings.messages.noToolOpens(work)],
          ]);
          assert.strictEqual(view.page.last('chooseTool'), undefined);
        },
        true,
        undefined,
        noGit,
      );
    } finally {
      removeFolder(work);
    }
  });

  test('says when the active tab does not know its folder, as a terminal whose shell has not told it', async () => {
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'openIn' });
        assert.deepStrictEqual(noticesOf(view.page), []);
        await view.connection.receive({ type: 'newTab', tool: 'terminal' });
        await view.connection.receive({ type: 'openIn' });
        assert.deepStrictEqual(noticesOf(view.page), [
          ['info', strings.messages.noFolder(strings.tools.terminal)],
        ]);
        assert.strictEqual(view.page.last('chooseTool'), undefined);
      },
      true,
      undefined,
      noGit,
    );
  });
});
