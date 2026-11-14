import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import type { Side } from '../../../../../tools/commander/shared/protocol';
import type { ElevatedFileSystem } from '../../../../../tools/commander/main/elevated';
import { strings } from '../../../../../lib/shared/strings';
import { waitFor } from '../../../../helpers/fixtures';
import {
  root,
  at,
  folder,
  file,
  type Listed,
  commander,
  tab,
  forged,
} from './commanderFixtures';

suite('Commander tool', () => {
  test('opens a file in the app the system opens it with, a program by running it, staying in its folder, and says why one could not be opened', async () => {
    const { tool, page, send, notices, opened } = commander({
      [root]: [file('notes.txt'), file('setup.exe'), file('unknown.xyz')],
    });
    await tool.show(page, tab);
    for (const name of ['notes.txt', 'setup.exe', 'unknown.xyz', 'gone.txt']) {
      await send({ type: 'open', tab: '1', side: 'right', name });
    }
    assert.deepStrictEqual(opened, [
      at('notes.txt'),
      at('setup.exe'),
      at('unknown.xyz'),
    ]);
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.openFailed(
          'unknown.xyz',
          'No app is associated with it',
        ),
      },
    ]);
    assert.strictEqual(tool.folderOf(tab), root);
  });
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
        message: strings.commander.deleteFailed('locked.txt', 'It is in use'),
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
  test('puts the files asked for on the clipboard, only when every one is listed in the folder named, never its parent', async () => {
    const { tool, page, send, clipboard } = commander({
      [root]: [file('a.txt'), folder('dir')],
    });
    await tool.show(page, tab);
    const copy = (names: string[]) =>
      send({ type: 'copyToClipboard', tab: '1', side: 'right', names });

    await copy(['a.txt', 'gone.txt']);
    await copy(['a.txt', '..']);
    await copy([]);
    assert.deepStrictEqual(clipboard.files, []);
    await copy(['a.txt', 'dir']);
    assert.deepStrictEqual(clipboard.files, [at('a.txt'), at('dir')]);
  });
  test('starts dragging the files asked for out of the app, only when every one is listed in the folder named, never its parent', async () => {
    const { tool, page, send, dragged } = commander({
      [root]: [file('a.txt'), folder('dir')],
    });
    await tool.show(page, tab);
    const drag = (names: string[]) =>
      send({ type: 'drag', tab: '1', side: 'right', names });

    await drag(['a.txt', 'gone.txt']);
    await drag(['..']);
    await drag([]);
    await drag(['dir', 'a.txt']);

    assert.deepStrictEqual(dragged, [[at('dir'), at('a.txt')]]);
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
      { level: 'error', message: strings.commander.nameTaken('taken') },
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
        message: strings.commander.renameFailed('locked.txt', 'EBUSY: refused'),
      },
      { level: 'error', message: strings.commander.nameTaken('taken.txt') },
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
  test('acts on the files a page names only in the folder it names, which the side must still show, as Delete right after Backspace trashed a file of the same name in the folder the side went to', async () => {
    const {
      tool,
      page,
      send,
      trashed,
      removed,
      opened,
      viewed,
      menus,
      compared,
      openedIn,
      repositories,
      settled,
      transfers,
      madeFolders,
      clipboard,
      dragged,
    } = commander({
      [root]: [folder('sub'), folder('same'), file('same.txt')],
      [at('sub')]: [folder('same'), file('same.txt')],
      [at('same')]: [],
    });
    repositories.add(at('same'));
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'right', name: 'sub' });
    await send({ type: 'open', tab: '1', side: 'right', name: '..' });
    await settled();
    const left = at('sub');
    const named = { tab: '1', side: 'right', folder: left } as const;
    const listings = page.listings().length;

    await send({
      type: 'delete',
      ...named,
      names: ['same.txt'],
      permanently: false,
    });
    await send({
      type: 'delete',
      ...named,
      names: ['same.txt'],
      permanently: true,
    });
    await send({ type: 'open', ...named, name: 'same.txt' });
    await send({ type: 'open', ...named, name: 'same' });
    await send({ type: 'open', ...named, name: '..' });
    await send({ type: 'view', ...named, name: 'same.txt' });
    await send({
      type: 'shellMenu',
      ...named,
      names: ['same.txt'],
      x: 1,
      y: 2,
      extended: false,
    });
    await send({
      type: 'openOnSide',
      tab: '1',
      from: 'right',
      side: 'left',
      folder: left,
      name: 'same',
    });
    await send({
      type: 'compare',
      tab: '1',
      files: [
        { side: 'right', folder: left, name: 'same.txt' },
        { side: 'right', folder: root, name: 'same.txt' },
      ],
    });
    await send({ type: 'openRepository', ...named, name: 'same' });
    await send({
      type: 'transfer',
      ...named,
      names: ['same.txt'],
      target: root,
      move: false,
    });
    await send({ type: 'newFolder', ...named, name: 'new' });
    await send({ type: 'copyToClipboard', ...named, names: ['same.txt'] });
    clipboard.files = [at('same.txt')];
    await send({ type: 'paste', ...named });
    await send({ type: 'drag', ...named, names: ['same.txt'] });

    assert.deepStrictEqual(
      {
        madeFolders,
        trashed,
        removed,
        opened,
        viewed,
        menus,
        compared,
        openedIn,
        transfers,
      },
      {
        madeFolders: [],
        trashed: [],
        removed: [],
        opened: [],
        viewed: [],
        menus: [],
        compared: [],
        openedIn: [],
        transfers: [],
      },
    );
    assert.strictEqual(page.listings().length, listings);
    assert.strictEqual(tool.folderOf(tab), root);
    assert.deepStrictEqual(clipboard.files, [at('same.txt')]);
    assert.deepStrictEqual(dragged, []);
  });
  test('opens a tab viewing a file the side lists, and nothing for a folder, ..  or a name it doesn’t list', async () => {
    const { tool, page, send, viewed } = commander({
      [root]: [folder('Users'), file('notes.txt')],
    });
    await tool.show(page, tab);

    for (const name of ['notes.txt', 'Users', '..', 'secret.txt']) {
      await send({ type: 'view', tab: '1', side: 'left', name });
    }
    await send({ type: 'view', tab: '2', side: 'left', name: 'notes.txt' });

    assert.deepStrictEqual(viewed, [at('notes.txt')]);
  });
  test('shows the menu of the system for the files and folders a side lists, or for the folder it shows when the page names none, where the page says, the extended one with Shift, and none for ..  or a name it doesn’t list', async () => {
    const { tool, page, send, menus } = commander({
      [root]: [folder('Users'), file('notes.txt'), file('other.txt')],
    });
    await tool.show(page, tab);
    const menu = (names: unknown, extended: unknown = false) =>
      send(
        forged(
          JSON.stringify({
            type: 'shellMenu',
            tab: '1',
            side: 'left',
            names,
            x: 10,
            y: 20,
            extended,
          }),
        ),
      );

    await menu(['notes.txt', 'Users']);
    await menu(['other.txt'], true);
    await menu([]);
    for (const names of [
      ['..'],
      ['secret.txt'],
      ['notes.txt', 'secret.txt'],
      'notes.txt',
      [1],
    ]) {
      await menu(names);
    }
    await menu(['notes.txt'], 'yes');
    await send({
      type: 'shellMenu',
      tab: '2',
      side: 'left',
      names: ['notes.txt'],
      x: 10,
      y: 20,
      extended: false,
    });
    await send({
      type: 'shellMenu',
      tab: '1',
      side: 'left',
      names: ['notes.txt'],
      x: Number.NaN,
      y: 20,
      extended: false,
    });

    assert.deepStrictEqual(menus, [
      {
        files: [at('notes.txt'), at('Users')],
        at: { x: 10, y: 20 },
        extended: false,
      },
      { files: [at('other.txt')], at: { x: 10, y: 20 }, extended: true },
      { files: [root], at: { x: 10, y: 20 }, extended: false },
    ]);
  });
  test('opens a new terminal or a git tab in the folder a side shows or a folder it lists, and asks git to clone into it or init one in it, and does nothing for a file, .. , a name it doesn’t list, another tab or a command it doesn’t know', async () => {
    const { tool, page, send, openedIn, clonedInto, initedIn } = commander({
      [root]: [folder('app'), file('notes.txt')],
    });
    await tool.show(page, tab);
    const command = (asked: unknown, name?: unknown, on = '1') =>
      send(
        forged(
          JSON.stringify({
            type: 'folderCommand',
            tab: on,
            side: 'left',
            ...(name !== undefined && { name }),
            command: asked,
          }),
        ),
      );

    await command('newTerminal');
    await command('openInGit', 'app');
    await command('cloneHere', 'app');
    await command('initHere');
    await command('newTerminal', 'notes.txt');
    await command('newTerminal', '..');
    await command('newTerminal', 'elsewhere');
    await command('newTerminal', 5);
    await command('newTerminal', undefined, '2');
    await command('format');

    assert.deepStrictEqual(openedIn, [
      { tool: 'terminal', folders: [root] },
      { tool: 'git', folders: [at('app')] },
    ]);
    assert.deepStrictEqual(clonedInto, [at('app')]);
    assert.deepStrictEqual(initedIn, [root]);
  });
  test('opens a git tab comparing two files the sides list, the first the old side, and nothing for a folder, ..  or a name it doesn’t list', async () => {
    const { tool, page, send, compared } = commander({
      [root]: [folder('Users'), file('notes.txt'), file('other.txt')],
    });
    await tool.show(page, tab);
    const compare = (
      one: readonly [Side, string],
      other: readonly [Side, string],
      on = '1',
    ) =>
      send({
        type: 'compare',
        tab: on,
        files: [
          { side: one[0], folder: root, name: one[1] },
          { side: other[0], folder: root, name: other[1] },
        ],
      });

    await compare(['left', 'notes.txt'], ['right', 'other.txt']);
    await compare(['right', 'other.txt'], ['right', 'notes.txt']);
    await compare(['left', 'Users'], ['right', 'other.txt']);
    await compare(['left', '..'], ['right', 'other.txt']);
    await compare(['left', 'secret.txt'], ['right', 'other.txt']);
    await compare(['left', 'notes.txt'], ['right', 'other.txt'], '2');
    await send(
      forged('{ "type": "compare", "tab": "1", "files": "notes.txt" }'),
    );

    assert.deepStrictEqual(compared, [
      { tool: 'git', old: at('notes.txt'), new: at('other.txt') },
      { tool: 'git', old: at('other.txt'), new: at('notes.txt') },
    ]);
  });
  test('says how to pick the files to compare when the page has none to compare, opening nothing, and says nothing for a list the page forged', async () => {
    const { tool, page, send, compared, notices } = commander({
      [root]: [file('notes.txt')],
    });
    await tool.show(page, tab);

    await send({ type: 'compare', tab: '1', files: [] });
    await send(forged('{ "type": "compare", "tab": "1", "files": [1] }'));

    assert.deepStrictEqual(compared, []);
    assert.deepStrictEqual(notices, [
      { level: 'info', message: strings.commander.nothingToCompare },
    ]);
  });
});
