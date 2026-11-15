import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
import { waitFor } from '../../../../helpers/fixtures';
import {
  root,
  at,
  folder,
  file,
  commander,
  tab,
  forged,
} from './commanderFixtures';

suite('Commander tool', () => {
  test('packs the items a side lists into the archive asked for, shown in the dialog of copies as packing, and nothing of items it does not list, nor an archive of a name no folder can hold, into one of the items, nor with a password a zip cannot hold', async () => {
    const { tool, page, send, packed, notices } = commander({
      [root]: [file('a.txt'), folder('docs')],
    });
    await tool.show(page, tab);
    const archive = path.join(root, 'out', 'photos.zip');
    const pack = (extra: Record<string, unknown> = {}) =>
      send(
        forged(
          JSON.stringify({
            type: 'pack',
            tab: '1',
            side: 'right',
            folder: root,
            names: ['a.txt', 'docs'],
            archive,
            format: 'zip',
            level: 'normal',
            ...extra,
          }),
        ),
      );

    await pack({
      format: '7z',
      level: 'ultra',
      password: 'pässwörd',
      encryptNames: true,
      volumeBytes: 1_048_576,
      test: true,
    });
    await waitFor(() => packed.length === 1, 'the pack to start');
    assert.deepStrictEqual(
      page.of('transfer').find((message) => message.view?.archiveJob === 'pack')
        ?.view,
      {
        id: 1,
        move: false,
        archiveJob: 'pack',
        items: 2,
        target: archive,
        stopping: false,
      },
    );
    for (const wrong of [
      { names: ['missing.txt'] },
      { names: [] },
      { archive: 'photos.zip' },
      { archive: `${root}${path.sep}..` },
      { archive: at('docs', 'inside.zip') },
      { format: 'rar' },
      { level: 'best' },
      { password: 'pässwörd' },
      { password: '' },
      { volumeBytes: 1000 },
      { zipCipher: 'rot13' },
      { test: 'yes' },
    ]) {
      await pack(wrong);
    }

    assert.deepStrictEqual(packed, [
      {
        folder: root,
        items: ['a.txt', 'docs'],
        archive,
        format: '7z',
        level: 'ultra',
        password: 'pässwörd',
        encryptNames: true,
        volumeBytes: 1_048_576,
        test: true,
      },
    ]);
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.intoItself('docs') },
    ]);
  });
  test('packs over an archive there already, or its first volume, only when the dialog said it replaces it, saying so otherwise', async () => {
    const { tool, page, send, packed, notices } = commander({
      [root]: [file('a.txt')],
    });
    await tool.show(page, tab);
    const there = tempFolder('packed-there');
    try {
      fs.writeFileSync(path.join(there, 'photos.zip'), 'old');
      fs.writeFileSync(path.join(there, 'parts.7z.001'), 'old');
      const pack = (archive: string, extra: Record<string, unknown> = {}) =>
        send({
          type: 'pack',
          tab: '1',
          side: 'right',
          folder: root,
          names: ['a.txt'],
          archive: path.join(there, archive),
          format: archive.endsWith('.7z') ? '7z' : 'zip',
          level: 'normal',
          ...extra,
        });

      await pack('photos.zip');
      await pack('parts.7z', { volumeBytes: 1_048_576 });
      await pack('photos.zip', { replace: true });
      await waitFor(() => packed.length === 1, 'the pack to start');

      assert.deepStrictEqual(
        packed.map((plan) => path.basename(plan.archive)),
        ['photos.zip'],
      );
      assert.deepStrictEqual(notices, [
        {
          level: 'error',
          message: strings.commander.archiveThereKept(
            path.join(there, 'photos.zip'),
          ),
        },
        {
          level: 'error',
          message: strings.commander.archiveThereKept(
            path.join(there, 'parts.7z'),
          ),
        },
      ]);
    } finally {
      removeFolder(there);
    }
  });
  test('tests the archives a side lists one after another in the dialog of copies, asking the password of one encrypted, saying which failed and why or that they passed, and nothing of folders or items not listed', async () => {
    const { tool, page, send, tested, archiveTests, secrets, notices } =
      commander({
        [root]: [file('a.zip'), file('b.7z'), file('c.zip'), folder('dir')],
      });
    archiveTests.set(at('c.zip'), 'CRC Failed : x.txt');
    archiveTests.set(at('b.7z'), 'locked');
    secrets.set(at('b.7z'), 'right');
    await tool.show(page, tab);
    const testing = (names: string[]) =>
      send({
        type: 'testArchives',
        tab: '1',
        side: 'right',
        folder: root,
        names,
      });

    await testing(['missing.zip']);
    await testing(['dir']);
    await testing(['a.zip', 'b.7z', 'c.zip', 'dir']);
    await waitFor(
      () => page.of('askPassword').length === 1,
      'the password of b.7z to be asked',
    );
    await send({
      type: 'password',
      ask: page.of('askPassword')[0]?.ask ?? 0,
      password: 'right',
    });
    await waitFor(() => notices.length === 1, 'the tests to end');
    await testing(['a.zip']);
    await waitFor(() => notices.length === 2, 'the test of a.zip to end');

    assert.deepStrictEqual(tested, [
      at('a.zip'),
      at('b.7z'),
      at('b.7z'),
      at('c.zip'),
      at('a.zip'),
    ]);
    assert.deepStrictEqual(
      page.of('transfer').find((message) => message.view?.archiveJob === 'test')
        ?.view,
      {
        id: 1,
        move: false,
        archiveJob: 'test',
        items: 3,
        target: root,
        stopping: false,
      },
    );
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.testFailed('c.zip', 'CRC Failed : x.txt'),
      },
      {
        level: 'info',
        message: strings.commander.testPassed(
          strings.commander.oneItem('a.zip'),
        ),
      },
    ]);
  });
});
