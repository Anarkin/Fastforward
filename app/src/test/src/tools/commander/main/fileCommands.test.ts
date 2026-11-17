import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { Side } from '../../../../../tools/commander/shared/sides';
import { strings } from '../../../../../lib/shared/strings';
import { commander, tab, forged } from './commanderFixtures';
import { root, at, folder, file } from './entryFixtures';

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
          at('unknown.xyz'),
          'No app is associated with it',
        ),
      },
    ]);
    assert.strictEqual(tool.folderOf(tab), root);
  });
  test('acts on the files a page names only in the folder it names, which the side must still show, as Delete right after Backspace trashed a file of the same name in the folder the side went to, and F4 would edit one', async () => {
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
      edited,
      renamed,
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
    await send({ type: 'editFile', ...named, name: 'same.txt' });
    await send({ type: 'newFile', ...named, name: 'same.txt' });
    await send({ type: 'newFile', ...named, name: 'new.txt' });
    await send({ type: 'rename', ...named, name: 'same.txt', to: 'other.txt' });
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
    assert.deepStrictEqual(edited, []);
    assert.deepStrictEqual(renamed, []);
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
    await command('openInCommander', 'app');
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
      { tool: 'commander', folders: [at('app')] },
    ]);
    assert.deepStrictEqual(clonedInto, [at('app')]);
    assert.deepStrictEqual(initedIn, [root]);
  });

  test('opens a repository a side lists in a git tab, and nothing for a folder that isn’t one, a file, .. , a name it doesn’t list or another tab', async () => {
    const { tool, page, send, repositories, settled, openedIn } = commander({
      [root]: [folder('app'), folder('docs'), file('notes.txt')],
    });
    repositories.add(at('app'));
    await tool.show(page, tab);
    await settled();
    const open = (name: string, on = '1') =>
      send({ type: 'openRepository', tab: on, side: 'left', name });

    await open('app');
    await open('docs');
    await open('notes.txt');
    await open('..');
    await open('elsewhere');
    await open('app', '2');
    await send(
      forged(
        '{ "type": "openRepository", "tab": "1", "side": "up", "name": "app" }',
      ),
    );

    assert.deepStrictEqual(openedIn, [{ tool: 'git', folders: [at('app')] }]);
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
      { old: at('notes.txt'), new: at('other.txt') },
      { old: at('other.txt'), new: at('notes.txt') },
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
