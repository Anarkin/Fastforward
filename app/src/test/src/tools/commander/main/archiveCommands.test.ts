import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import { waitFor } from '../../../../helpers/fixtures';
import { commander, tab } from './commanderFixtures';
import { root, at, file } from './entryFixtures';
import { archiveItem, zipped } from './fakeArchives';

suite('Commander tool in archives', () => {
  test('does nothing inside an archive it cannot do there, nor drags out of it', async () => {
    const { tool, page, send, notices, archived, ...done } = commander({
      [root]: [file('a.zip'), file('notes.txt')],
    });
    archived.set(at('a.zip'), zipped);
    await tool.show(page, tab);
    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    const inside = { tab: '1', side: 'right' } as const;

    await send({
      ...inside,
      type: 'delete',
      names: ['top.txt'],
      permanently: false,
    });
    await send({
      type: 'transfer',
      tab: '1',
      side: 'left',
      names: ['notes.txt'],
      target: at('a.zip'),
      move: true,
    });
    await send({ ...inside, type: 'newFolder', name: 'made' });
    await send({ ...inside, type: 'paste' });
    await send({ ...inside, type: 'drag', names: ['top.txt'] });
    await send({
      ...inside,
      type: 'shellMenu',
      names: ['top.txt'],
      x: 1,
      y: 1,
      extended: false,
    });
    await send({
      ...inside,
      type: 'folderCommand',
      name: 'docs',
      command: 'newTerminal',
    });
    await send({ ...inside, type: 'addBookmark', folder: at('a.zip') });
    await tool.dropped(page, [at('notes.txt')], {
      type: 'drop',
      tab: '1',
      side: 'right',
      folder: at('a.zip'),
      move: false,
    });

    assert.deepStrictEqual(notices, []);
    assert.deepStrictEqual(
      {
        trashed: done.trashed,
        transfers: done.transfers.length,
        madeFolders: done.madeFolders,
        clipboard: done.clipboard.files,
        dragged: done.dragged,
        menus: done.menus,
        openedIn: done.openedIn,
        bookmarks: done.settings.bookmarks,
        viewed: done.viewed,
        opened: done.opened,
        compared: done.compared,
        watchedTrees: done.watchedTrees(),
      },
      {
        trashed: [],
        transfers: 0,
        madeFolders: [],
        clipboard: [],
        dragged: [],
        menus: [],
        openedIn: [],
        bookmarks: [],
        viewed: [],
        opened: [],
        compared: [],
        watchedTrees: [],
      },
    );
  });
  test('deletes the items of an archive asked for from it in the dialog of copies, reading it again once done, and says an archive inside another cannot be changed yet', async () => {
    const { tool, page, send, archived, removedFromArchives, notices } =
      commander({ [root]: [file('a.zip')] });
    archived.set(at('a.zip'), [...zipped, archiveItem('inner.zip')]);
    archived.set(path.join(at('a.zip'), 'inner.zip'), zipped);
    await tool.show(page, tab);
    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    const listed = page.of('listing').length;
    const deleting = (inFolder: string, names: readonly string[]) =>
      send({
        type: 'delete',
        tab: '1',
        side: 'right',
        folder: inFolder,
        names,
        permanently: true,
      });

    await deleting(at('a.zip'), ['docs', 'top.txt', 'missing.txt']);
    await deleting(at('a.zip'), ['docs', 'top.txt']);
    await waitFor(
      () => page.of('listing').length > listed,
      'the archive to be read again',
    );
    assert.deepStrictEqual(
      page
        .of('transfer')
        .find((message) => message.view?.archiveJob === 'delete')?.view,
      {
        id: 1,
        move: false,
        archiveJob: 'delete',
        items: 2,
        target: at('a.zip'),
        stopping: false,
      },
    );
    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'inner.zip',
    });
    await deleting(path.join(at('a.zip'), 'inner.zip'), ['top.txt']);

    assert.deepStrictEqual(removedFromArchives, [
      [at('a.zip'), ['docs', 'top.txt']],
    ]);
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.archiveUnchangeable('inner.zip'),
      },
    ]);
  });
  test('renames an item of an archive and makes a folder in it in the dialog of copies, selecting it once read again, and refuses a name the folder of the archive has', async () => {
    const { tool, page, send, archived, changedInArchives, notices } =
      commander({ [root]: [file('a.zip')] });
    archived.set(at('a.zip'), zipped);
    await tool.show(page, tab);
    await send({
      type: 'enterArchive',
      tab: '1',
      side: 'right',
      name: 'a.zip',
    });
    const archive = at('a.zip');
    const selectedOnceListed = (name: string) =>
      waitFor(
        () => page.of('listing').at(-1)?.selected === name,
        `${name} to be selected`,
      );

    await send({
      type: 'rename',
      tab: '1',
      side: 'right',
      folder: archive,
      name: 'top.txt',
      to: 'docs',
    });
    await send({
      type: 'newFolder',
      tab: '1',
      side: 'right',
      folder: archive,
      name: 'top.txt',
    });
    await send({
      type: 'rename',
      tab: '1',
      side: 'right',
      folder: archive,
      name: 'top.txt',
      to: 'bottom.txt',
    });
    await selectedOnceListed('bottom.txt');
    await send({
      type: 'newFolder',
      tab: '1',
      side: 'right',
      folder: archive,
      name: 'fresh',
    });
    await selectedOnceListed('fresh');

    assert.deepStrictEqual(changedInArchives, [
      ['rename', at('a.zip'), 'top.txt', 'bottom.txt'],
      ['folder', at('a.zip'), [], 'fresh'],
    ]);
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.nameTaken(path.join(at('a.zip'), 'docs')),
      },
      {
        level: 'error',
        message: strings.commander.nameTaken(path.join(at('a.zip'), 'top.txt')),
      },
    ]);
  });
});
