import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import type { ElevatedFileSystem } from '../../../../../tools/commander/main/elevated';
import { strings } from '../../../../../lib/shared/strings';
import { waitFor } from '../../../../helpers/fixtures';
import { type Listed, commander, tab, forged } from './commanderFixtures';
import { root, at, folder, file } from './entryFixtures';

suite('Commander tool', () => {
  test('moves the items asked for to the Recycle Bin, or deletes them for good, only when every one is listed in the folder and never its parent, saying which could not be deleted and why', async () => {
    const { tool, page, send, notices, trashed, removed } = commander({
      [root]: [
        file('a.txt'),
        folder('dir'),
        file('b.txt'),
        file('locked.txt'),
        file('c.txt'),
      ],
    });
    await tool.show(page, tab);
    const remove = (names: string[], permanently: boolean) =>
      send({ type: 'delete', tab: '1', side: 'right', names, permanently });
    await remove(['a.txt', 'dir'], false);
    await remove(['b.txt'], true);
    await remove(['c.txt', '..'], false);
    await remove(['c.txt', 'gone.txt'], true);
    await remove([], false);
    await send(
      forged(
        '{ "type": "delete", "tab": "1", "side": "right", "names": ["c.txt"], "permanently": "yes" }',
      ),
    );
    assert.deepStrictEqual(trashed, [at('a.txt'), at('dir')]);
    assert.deepStrictEqual(removed, [at('b.txt')]);
    assert.deepStrictEqual(notices, []);
    await remove(['locked.txt', 'c.txt'], false);
    assert.deepStrictEqual(trashed.slice(2), [at('locked.txt'), at('c.txt')]);
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.deleteFailed(
          at('locked.txt'),
          'It is in use',
        ),
      },
    ]);
  });
  test('deletes the items asked for from the folder they were listed in, also once the side has gone to another folder while they were being deleted, leaving the side where it went', async () => {
    const { tool, page, send, trashed, deletesHeld } = commander({
      [root]: [folder('big'), folder('dist'), folder('next')],
      [at('next')]: [folder('dist')],
    });
    await tool.show(page, tab);
    const slow = Promise.withResolvers<void>();
    deletesHeld.until = slow.promise;
    const deleting = send({
      type: 'delete',
      tab: '1',
      side: 'right',
      names: ['big', 'dist'],
      permanently: false,
    });
    await send({ type: 'open', tab: '1', side: 'right', name: 'next' });
    slow.resolve();
    await deleting;
    assert.deepStrictEqual(trashed, [at('big'), at('dist')]);
    assert.strictEqual(tool.folderOf(tab), at('next'));
  });
  test('makes a folder of the name asked for in the folder named, selecting it once listed, and none of a name reaching another folder or one Windows would refuse there, saying when the name is taken', async () => {
    const { tool, page, send, madeFolders, notices } = commander({
      [root]: [file('a.txt')],
    });
    await tool.show(page, tab);
    const make = (name: string) =>
      send({ type: 'newFolder', tab: '1', side: 'right', name });

    await make('photos');
    assert.strictEqual(page.of('listing').at(-1)?.selected, 'photos');
    await make('..');
    await make(`sub${path.sep}x`);
    await make('a/b');
    await make('');
    await send(
      forged(
        JSON.stringify({
          type: 'newFolder',
          tab: '1',
          side: 'right',
          folder: root,
          name: 7,
        }),
      ),
    );
    await make('taken');

    assert.deepStrictEqual(madeFolders, [at('photos'), at('taken')]);
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.nameTaken(at('taken')) },
    ]);
  });
  test('renames a file or folder the side lists to the name asked for, selecting it once listed, and nothing the side does not list nor to a name reaching another folder or one Windows would refuse there, saying when the name is taken or the system refuses', async () => {
    const { tool, page, send, renamed, notices } = commander({
      [root]: [
        file('a.txt'),
        folder('docs'),
        file('locked.txt'),
        file('taken.txt'),
      ],
    });
    await tool.show(page, tab);
    const rename = (name: string, to: string) =>
      send({ type: 'rename', tab: '1', side: 'right', folder: root, name, to });

    await rename('a.txt', 'b.txt');
    assert.strictEqual(page.of('listing').at(-1)?.selected, 'b.txt');
    await rename('docs', 'notes');
    await rename('missing.txt', 'x.txt');
    await rename('a.txt', '..');
    await rename('a.txt', `sub${path.sep}x`);
    await rename('a.txt', 'a/b');
    await rename('a.txt', '');
    await send(
      forged(
        JSON.stringify({
          type: 'rename',
          tab: '1',
          side: 'right',
          folder: root,
          name: 'a.txt',
          to: 7,
        }),
      ),
    );
    await rename('locked.txt', 'free.txt');
    await rename('a.txt', 'taken.txt');

    assert.deepStrictEqual(renamed, [
      [at('a.txt'), at('b.txt')],
      [at('docs'), at('notes')],
      [at('locked.txt'), at('free.txt')],
      [at('a.txt'), at('taken.txt')],
    ]);
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.renameFailed(
          at('locked.txt'),
          'EBUSY: refused',
        ),
      },
      { level: 'error', message: strings.commander.nameTaken(at('taken.txt')) },
    ]);
  });
  test('renames a file listed flat in its own folder, reading that folder again', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('docs')],
      [at('docs')]: [file('a.txt')],
    };
    const { tool, page, send, renamed } = commander(listed);
    await tool.show(page, tab);
    await send({ type: 'flat', tab: '1', side: 'right', flat: true });
    const inDocs = path.join('docs', 'a.txt');
    await waitFor(
      () =>
        page
          .of('flatFiles')
          .some((message) =>
            message.folders.some((each) =>
              each.entries.some((entry) => entry.name === 'a.txt'),
            ),
          ),
      'the file in docs to be listed flat',
    );
    const told = page.of('flatFiles').length;
    listed[at('docs')] = [file('b.txt')];
    await send({
      type: 'rename',
      tab: '1',
      side: 'right',
      folder: root,
      name: inDocs,
      to: 'b.txt',
    });
    assert.deepStrictEqual(renamed, [[at(inDocs), at('docs', 'b.txt')]]);
    await waitFor(
      () => page.of('flatFiles').length > told,
      'docs to be read again',
    );
  });
  test('says no folder is made and nothing renamed yet in a folder read as administrator', async () => {
    const helper: ElevatedFileSystem = {
      list: () => Promise.resolve([file('secret.txt')]),
      drives: () => Promise.resolve([]),
      watch: () => () => {},
      closed: new Promise(() => {}),
      close: () => {},
    };
    const { tool, page, send, madeFolders, renamed, notices } = commander(
      {
        [root]: [folder('Config.Msi')],
        [at('Config.Msi')]: Object.assign(new Error('denied'), {
          code: 'EPERM',
        }),
      },
      [],
      () => Promise.resolve(helper),
    );
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    await send({ type: 'elevate', tab: '1', side: 'left' });

    await send({ type: 'newFolder', tab: '1', side: 'left', name: 'new' });
    await send({
      type: 'rename',
      tab: '1',
      side: 'left',
      folder: at('Config.Msi'),
      name: 'secret.txt',
      to: 'public.txt',
    });

    assert.deepStrictEqual([madeFolders, renamed], [[], []]);
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.makeFolderAsAdministrator,
      },
      { level: 'error', message: strings.commander.renameAsAdministrator },
    ]);
  });
});
