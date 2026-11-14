import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import type { Entry } from '../../../../../tools/commander/shared/protocol';
import { strings } from '../../../../../lib/shared/strings';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
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
  test('opens a folder of a side, and goes up from it selecting the folder it came from', async () => {
    const { tool, page, send } = commander({
      [root]: [folder('Users'), file('notes.txt')],
      [at('Users')]: [folder('me')],
    });
    await tool.show(page, tab);

    await send({ type: 'open', tab: '1', side: 'right', name: 'Users' });
    await send({ type: 'open', tab: '1', side: 'right', name: '..' });

    assert.deepStrictEqual(page.listings().slice(2), [
      `right ${at('Users')} ↑: me`,
      `right ${root}: Users notes.txt [Users]`,
    ]);
  });

  test('leaves a side going to another folder to get there when the folder it is leaving is deleted meanwhile, as listing the nearest folder still there took it elsewhere', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('fastforward-made-up')],
      [at('fastforward-made-up')]: [folder('gone')],
      [at('fastforward-made-up', 'gone')]: [],
    };
    const { tool, page, send, change } = commander(listed);
    await tool.show(page, tab);
    await send({
      type: 'open',
      tab: '1',
      side: 'left',
      name: 'fastforward-made-up',
    });
    await send({ type: 'open', tab: '1', side: 'left', name: 'gone' });
    const slow = Promise.withResolvers<readonly Entry[]>();
    listed[at('fastforward-made-up')] = slow.promise;
    const going = send({ type: 'step', tab: '1', side: 'left', step: -1 });
    delete listed[at('fastforward-made-up', 'gone')];
    await change(at('fastforward-made-up', 'gone'));
    slow.resolve([folder('gone')]);
    await going;
    await new Promise((resolve) => setTimeout(resolve, 10));
    const last = page
      .of('listing')
      .filter((each) => each.side === 'left')
      .at(-1);
    assert.strictEqual(last?.folder, at('fastforward-made-up'));
  });

  test('goes back and forward through the folders a side was in, selecting the folder it came from, and forgets those ahead once another is opened', async () => {
    const { tool, page, send } = commander({
      [root]: [folder('Users'), folder('Windows')],
      [at('Users')]: [folder('me')],
      [at('Users', 'me')]: [],
      [at('Windows')]: [],
    });
    await tool.show(page, tab);
    const step = (value: -1 | 1) =>
      send({ type: 'step', tab: '1', side: 'left', step: value });
    const last = () => {
      const listing = page.of('listing').at(-1);
      return (
        listing && [
          listing.folder,
          listing.selected,
          listing.back,
          listing.forward,
        ]
      );
    };

    await send({ type: 'open', tab: '1', side: 'left', name: 'Users' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'me' });
    assert.deepStrictEqual(last(), [at('Users', 'me'), undefined, true, false]);

    await step(-1);
    assert.deepStrictEqual(last(), [at('Users'), 'me', true, true]);
    await step(-1);
    assert.deepStrictEqual(last(), [root, 'Users', false, true]);
    const listed = page.of('listing').length;
    await step(-1);
    assert.strictEqual(page.of('listing').length, listed);

    await step(1);
    assert.deepStrictEqual(last(), [at('Users'), undefined, true, true]);
    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'Windows' });
    assert.deepStrictEqual(last(), [at('Windows'), undefined, true, false]);
    await step(-1);
    await step(-1);
    await step(-1);
    assert.deepStrictEqual(last(), [root, 'Users', false, true]);

    await send(
      forged('{ "type": "step", "tab": "1", "side": "left", "step": 2 }'),
    );
    assert.deepStrictEqual(last(), [root, 'Users', false, true]);
  });

  test('opens on a side the folder selected on the other, or the folder the other is in for .. or a file', async () => {
    const { tool, page, send } = commander({
      [root]: [folder('Users'), file('notes.txt')],
      [at('Users')]: [folder('me')],
      [at('Users', 'me')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'right', name: 'Users' });
    const onSide = (side: 'left' | 'right', name: string) =>
      send({ type: 'openOnSide', tab: '1', from: 'right', side, name });

    await onSide('left', 'me');
    await onSide('left', '..');
    await onSide('left', 'notes.txt');
    await send({ type: 'open', tab: '1', side: 'right', name: '..' });
    await onSide('left', 'notes.txt');
    await onSide('right', 'Users');

    assert.deepStrictEqual(page.listings().slice(3), [
      `left ${at('Users', 'me')} ↑: `,
      `left ${at('Users')} ↑: me [me]`,
      `right ${root}: Users notes.txt [Users]`,
      `left ${root}: Users notes.txt [Users]`,
      `right ${at('Users')} ↑: me`,
    ]);
  });

  test('opens on a side only what the other side lists, for the shown tab', async () => {
    const { tool, page, send } = commander({
      [root]: [folder('Users')],
      [at('Users')]: [],
      [at('Windows')]: [],
    });
    await tool.show(page, tab);

    await send({
      type: 'openOnSide',
      tab: '1',
      from: 'right',
      side: 'left',
      name: 'Windows',
    });
    await send({
      type: 'openOnSide',
      tab: '2',
      from: 'right',
      side: 'left',
      name: 'Users',
    });
    await send(
      forged(
        '{ "type": "openOnSide", "tab": "1", "from": "right", "side": "middle", "name": "Users" }',
      ),
    );
    await send(
      forged(
        '{ "type": "openOnSide", "tab": "1", "from": "middle", "side": "left", "name": "Users" }',
      ),
    );

    assert.deepStrictEqual(page.listings().slice(2), []);
  });

  test('reads a side again when asked, without going anywhere in its history, saying why when it can’t', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('Users')],
      [at('Users')]: [file('a.txt')],
    };
    const { tool, page, send, notices } = commander(listed);
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'Users' });

    listed[at('Users')] = [file('a.txt'), file('b.txt')];
    await send({ type: 'reread', tab: '1', side: 'left' });
    const last = page.of('listing').at(-1);
    assert.deepStrictEqual(
      last && [last.folder, last.entries.map((entry) => entry.name), last.back],
      [at('Users'), ['a.txt', 'b.txt'], true],
    );

    listed[at('Users')] = Object.assign(new Error('the disk is gone'), {
      code: 'EIO',
    });
    await send({ type: 'reread', tab: '1', side: 'left' });
    await send({ type: 'reread', tab: '2', side: 'left' });
    await send(forged('{ "type": "reread", "tab": "1", "side": "middle" }'));
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.couldNotOpen(
          at('Users'),
          'the disk is gone',
        ),
      },
    ]);
  });

  test('opens only folders the side listed, and nothing above the root, for the shown tab', async () => {
    const { tool, page, send } = commander({
      [root]: [folder('Users'), file('notes.txt')],
      [at('Users')]: [],
      [at('Windows')]: [],
    });
    await tool.show(page, tab);

    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'notes.txt' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'Windows' });
    await send({ type: 'open', tab: '1', side: 'left', name: '../Windows' });
    await send({ type: 'open', tab: '2', side: 'left', name: 'Users' });
    await send(
      forged(
        '{ "type": "open", "tab": "1", "side": "middle", "name": "Users" }',
      ),
    );
    await send(
      forged('{ "type": "open", "tab": "1", "side": "left", "name": 7 }'),
    );
    await send(
      { type: 'open', tab: '1', side: 'left', name: 'Users' },
      {
        post: () => {},
        disposed: false,
      },
    );

    assert.deepStrictEqual(page.listings().slice(2), []);
  });

  test('shows the folder opened last on a side, when an earlier one is listed after it', async () => {
    const slow = Promise.withResolvers<readonly Entry[]>();
    const { tool, page, send } = commander({
      [root]: [folder('slow'), folder('fast')],
      [at('slow')]: slow.promise,
      [at('fast')]: [file('fast.txt')],
    });
    await tool.show(page, tab);

    const first = send({ type: 'open', tab: '1', side: 'left', name: 'slow' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'fast' });
    slow.resolve([file('slow.txt')]);
    await first;

    assert.deepStrictEqual(page.listings().slice(2), [
      `left ${at('fast')} ↑: fast.txt`,
    ]);
  });

  test('changes the drive of a side only to a drive there is', async () => {
    const backup = at('backup');
    const { tool, page, send } = commander(
      { [root]: [], [backup]: [file('backup.zip')] },
      [root, backup],
    );
    await tool.show(page, tab);

    await send({ type: 'drive', tab: '1', side: 'right', drive: at('gone') });
    await send({ type: 'drive', tab: '1', side: 'right', drive: backup });

    assert.deepStrictEqual(page.listings().slice(2), [
      `right ${backup} ↑: backup.zip`,
    ]);
  });

  test('lists the drives again when asked, as drives come and go', async () => {
    const { page, send } = commander({}, ['C:\\']);

    await send({ type: 'listDrives' });

    assert.deepStrictEqual(page.of('drives'), [
      { type: 'drives', drives: ['C:\\'] },
    ]);
  });

  test('goes to a bookmark on the side asked as to any other folder, back again through its history, only to a folder bookmarked, saying why one can’t be opened', async () => {
    const work = at('work');
    const { tool, page, send, settings, notices } = commander({
      [root]: [folder('work')],
      [work]: [file('a.txt')],
    });
    settings.bookmarks = [work, at('gone')];
    await tool.show(page, tab);

    await send({ type: 'goToBookmark', tab: '1', side: 'left', folder: root });
    await send({ type: 'goToBookmark', tab: '2', side: 'left', folder: work });
    await send({ type: 'goToBookmark', tab: '1', side: 'left', folder: work });
    await send({ type: 'step', tab: '1', side: 'left', step: -1 });
    await send({
      type: 'goToBookmark',
      tab: '1',
      side: 'right',
      folder: at('gone'),
    });

    assert.deepStrictEqual(page.listings().slice(2), [
      `left ${work} ↑: a.txt`,
      `left ${root}: work [work]`,
      `right ${root}: work`,
    ]);
    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.couldNotOpen(
          at('gone'),
          strings.commander.gone,
        ),
      },
    ]);
  });

  test('goes to the path typed for a side as to any other folder, back again through its history, a relative one from the folder of the side, a file to its folder with the file selected, saying why one can’t be opened, and nowhere for a side showing another folder or a forged path', async () => {
    const work = at('work');
    const opened = tempFolder('commander-go');
    try {
      fs.writeFileSync(path.join(opened, 'notes.txt'), '');
      const { tool, page, send, notices } = commander({
        [root]: [folder('work')],
        [work]: [file('a.txt')],
        [opened]: [file('notes.txt')],
      });
      await tool.show(page, tab);

      await send({
        type: 'goTo',
        tab: '1',
        side: 'left',
        folder: root,
        to: `"${work}"`,
      });
      await send({ type: 'step', tab: '1', side: 'left', step: -1 });
      await send({
        type: 'goTo',
        tab: '1',
        side: 'left',
        folder: root,
        to: 'work',
      });
      await send({
        type: 'goTo',
        tab: '2',
        side: 'left',
        folder: work,
        to: root,
      });
      await send({
        type: 'goTo',
        tab: '1',
        side: 'left',
        folder: root,
        to: root,
      });
      await send(
        forged(
          `{ "type": "goTo", "tab": "1", "side": "left", "folder": ${JSON.stringify(work)}, "to": 2 }`,
        ),
      );
      await send({
        type: 'goTo',
        tab: '1',
        side: 'right',
        folder: root,
        to: path.join(opened, 'notes.txt'),
      });
      await send({
        type: 'goTo',
        tab: '1',
        side: 'right',
        folder: opened,
        to: at('gone'),
      });

      assert.deepStrictEqual(page.listings().slice(2), [
        `left ${work} ↑: a.txt`,
        `left ${root}: work [work]`,
        `left ${work} ↑: a.txt`,
        `right ${opened} ↑: notes.txt [notes.txt]`,
        `right ${opened} ↑: notes.txt`,
      ]);
      assert.deepStrictEqual(notices, [
        {
          level: 'error',
          message: strings.commander.couldNotOpen(
            at('gone'),
            strings.commander.gone,
          ),
        },
      ]);
    } finally {
      removeFolder(opened);
    }
  });

  test('goes to the home folder of the system for a tilde typed, and to the value of an environment variable for its name', async () => {
    const work = at('work');
    const { tool, page, send } = commander({
      [root]: [folder('work')],
      [work]: [file('a.txt')],
    });
    await tool.show(page, tab);

    await send({ type: 'goTo', tab: '1', side: 'left', folder: root, to: '~' });
    await send({
      type: 'goTo',
      tab: '1',
      side: 'right',
      folder: root,
      to: '$WORK',
    });

    assert.deepStrictEqual(page.listings().slice(2), [
      `left ${work} ↑: a.txt`,
      `right ${work} ↑: a.txt`,
    ]);
  });
});
