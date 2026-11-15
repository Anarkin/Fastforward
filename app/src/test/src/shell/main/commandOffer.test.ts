import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, suite, test } from 'vitest';
import { strings } from '../../../../lib/shared/strings';
import type { Sentence } from '../../../../lib/shared/sentences';
import {
  recordingLog,
  failOnErrorsLogged,
  takeErrorsLogged,
} from '../../../helpers/stub';
import type { CommandInstall } from '../../../../shell/main/commandOffer';
import { closeViews, withView } from '../../../helpers/harness';
import { noticesOf } from './shellFixtures';
import { FakeHost } from '../../../helpers/fakeHost';

suite('Offering the ff command', () => {
  const noGit = path.join(os.tmpdir(), 'fastforward-no-git');

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  afterAll(closeViews);

  test('offers ff once, in a notice, where the app installs it and it is not installed, as an update brings it to copies of the app no installer sets up', async () => {
    const host = new FakeHost();
    host.commandPlace = true;
    await withView(
      log,
      [],
      async (view) => {
        assert.deepStrictEqual(noticesOf(view.page), [
          ['info', strings.messages.offerCommand],
        ]);
        view.page.clear();
        await view.connection.receive({ type: 'ready' });
        await view.view.idle();
        assert.deepStrictEqual(noticesOf(view.page), []);
      },
      true,
      host,
      noGit,
    );
  });

  test('offers no ff that is installed, or that another ff stands in the way of', async () => {
    for (const command of ['installed', 'outdated', 'taken'] as const) {
      const host = new FakeHost();
      host.commandPlace = true;
      host.command = command;
      await withView(
        log,
        [],
        async (view) => {
          assert.deepStrictEqual(noticesOf(view.page), [], command);
        },
        true,
        host,
        noGit,
      );
    }
  });

  test('installs ff on asking, saying where it went, or why not', async () => {
    const file = '/usr/local/bin/ff';
    const outcomes: [CommandInstall, ...(readonly [string, Sentence])[]][] = [
      [
        { kind: 'installed', path: file, onPath: true },
        ['info', strings.messages.commandInstalled(file)],
      ],
      [
        { kind: 'installed', path: file, onPath: false },
        ['info', strings.messages.commandOffPath(file, '/usr/local/bin')],
      ],
      [
        { kind: 'alreadyInstalled', path: file },
        ['info', strings.messages.commandAlreadyInstalled(file)],
      ],
      [
        { kind: 'taken', path: file },
        ['error', strings.messages.commandTaken(file)],
      ],
      [{ kind: 'notMoved' }, ['error', strings.messages.commandNotMoved]],
      [{ kind: 'cancelled' }],
    ];
    for (const [installed, ...notices] of outcomes) {
      const host = new FakeHost();
      host.commandPlace = true;
      host.command = 'installed';
      host.installs = installed;
      await withView(
        log,
        [],
        async (view) => {
          await view.connection.receive({ type: 'installTerminalCommand' });
          assert.deepStrictEqual(noticesOf(view.page), notices, installed.kind);
        },
        true,
        host,
        noGit,
      );
    }
  });

  test('says why ff could not be installed, logging the error', async () => {
    const host = new FakeHost();
    host.commandPlace = true;
    host.command = 'installed';
    host.installs = new Error('Read-only file system');
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'installTerminalCommand' });
        assert.deepStrictEqual(noticesOf(view.page), [
          [
            'error',
            strings.messages.couldNotInstallCommand('Read-only file system'),
          ],
        ]);
        takeErrorsLogged(
          logged,
          /^Installing the ff command failed$/,
          /^Read-only file system$/,
        );
      },
      true,
      host,
      noGit,
    );
  });

  test('installs no ff where the app leaves it to an installer, whatever the page asks', async () => {
    const host = new FakeHost();
    await withView(
      log,
      [],
      async (view) => {
        await view.connection.receive({ type: 'installTerminalCommand' });
        assert.deepStrictEqual(host.opened, []);
        assert.deepStrictEqual(noticesOf(view.page), []);
      },
      true,
      host,
      noGit,
    );
  });
});
