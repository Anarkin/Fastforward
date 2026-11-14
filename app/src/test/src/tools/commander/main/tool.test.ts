import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { Tab } from '../../../../../shell/main/shell';
import {
  childToward,
  rootFolder,
} from '../../../../../tools/commander/main/tool';
import type { Entry } from '../../../../../tools/commander/shared/protocol';
import type { Sorts } from '../../../../../tools/commander/shared/settings';
import type { ElevatedFileSystem } from '../../../../../tools/commander/main/elevated';
import { strings } from '../../../../../lib/shared/strings';
import { removeFolder, tempFolder } from '../../../../support/repositories';
import { waitFor } from '../../../../support/fixtures';
import {
  CommanderPage,
  root,
  at,
  folder,
  file,
  type Listed,
  commander,
  tab,
  lastFolder,
  hiddenIn,
  defaultColumns,
  defaultSorts,
  forged,
} from './commanderFixtures';

suite('Commander tool', () => {
  test('lists the root on both sides of a tab opened without a folder, and the drives', async () => {
    const { tool, page } = commander(
      { [root]: [folder('Users'), file('notes.txt')] },
      ['C:\\', 'D:\\'],
    );

    await tool.show(page, tab);

    assert.deepStrictEqual(page.listings(), [
      `left ${root}: Users notes.txt`,
      `right ${root}: Users notes.txt`,
    ]);
    assert.deepStrictEqual(page.of('drives'), [
      { type: 'drives', drives: ['C:\\', 'D:\\'] },
    ]);
  });

  suite('with a folder', () => {
    let opened: string;

    beforeEach(() => {
      opened = tempFolder('commander');
    });

    afterEach(() => removeFolder(opened));

    test('moves a side whose folder is gone up to the nearest folder still there, without a word', async () => {
      const gone = path.join(opened, 'gone', 'deeper');
      fs.mkdirSync(gone, { recursive: true });
      const listed: Record<string, Listed> = {
        [root]: [],
        [opened]: [file('kept.txt')],
        [path.join(opened, 'gone')]: [folder('deeper')],
        [gone]: [file('a.txt')],
      };
      const { tool, page, send, notices, watched, change } = commander(listed);
      await tool.show(page, { ...tab, root: path.join(opened, 'gone') });
      await send({ type: 'open', tab: '1', side: 'right', name: 'deeper' });

      fs.rmSync(path.join(opened, 'gone'), { recursive: true });
      delete listed[gone];
      delete listed[path.join(opened, 'gone')];
      await change(gone);
      await waitFor(
        () => page.listings().at(-1)?.startsWith(`right ${opened} `) === true,
        'the side to move up',
      );

      assert.deepStrictEqual(
        page.listings().at(-1),
        `right ${opened} ↑: kept.txt [gone]`,
      );
      assert.deepStrictEqual(notices, []);
      assert.deepStrictEqual(watched(), [opened, root].toSorted());
    });

    test('moves a side whose folder went while its tab was hidden up to the nearest folder still there once shown again, without a word, as it said it could not open the folder and kept listing its files', async () => {
      const gone = path.join(opened, 'gone');
      fs.mkdirSync(gone, { recursive: true });
      const listed: Record<string, Listed> = {
        [root]: [],
        [opened]: [file('kept.txt')],
        [gone]: [file('a.txt')],
      };
      const { tool, page, notices, watched } = commander(listed);
      const shown = { ...tab, root: gone };
      await tool.show(page, shown);
      tool.hide(page);

      fs.rmSync(gone, { recursive: true });
      delete listed[gone];
      await tool.show(page, shown);

      assert.deepStrictEqual(
        page.listings().at(-1),
        `right ${opened} ↑: kept.txt [gone]`,
      );
      assert.deepStrictEqual(notices, []);
      assert.deepStrictEqual(watched(), [opened, root].toSorted());
    });

    test('tells which folders of the path a side lists are hidden, each as its own row would be', async () => {
      const cache = path.join(opened, '.cache');
      const deep = path.join(cache, 'deep');
      fs.mkdirSync(deep, { recursive: true });
      const { tool, page, send } = commander({
        [root]: [],
        [opened]: [folder('.cache')],
        [cache]: [folder('deep')],
        [deep]: [file('notes.txt')],
      });
      await tool.show(page, { ...tab, root: deep });
      await send({ type: 'open', tab: '1', side: 'right', name: '..' });
      await send({ type: 'open', tab: '1', side: 'right', name: '..' });
      assert.deepStrictEqual(
        page
          .of('listing')
          .map((listing) => [listing.side, listing.folder, listing.hidden]),
        [
          ['left', root, hiddenIn(root)],
          ['right', deep, hiddenIn(deep, cache)],
          ['right', cache, hiddenIn(cache, cache)],
          ['right', opened, hiddenIn(opened)],
        ],
      );
      assert.ok(hiddenIn(deep, cache).at(-2));
    });

    test('says it could not open the root once even the root is gone, rather than moving up from it again and again', async () => {
      const { tool, page, notices } = commander({});

      await tool.show(page, { ...tab, root: path.join(opened, 'missing') });

      assert.ok(notices.length > 0);
    });

    test('lists the folder the tab was opened with on the right, and the root on the left', async () => {
      const { tool, page } = commander({
        [root]: [folder('Users')],
        [opened]: [file('opened.txt')],
      });

      await tool.show(page, { ...tab, root: opened });

      assert.deepStrictEqual(page.listings(), [
        `left ${root}: Users`,
        `right ${opened} ↑: opened.txt`,
      ]);
      assert.strictEqual(tool.folderOf({ ...tab, root: opened }), opened);
    });
  });

  test('tells the page which folders are on a drive whose Recycle Bin is turned off, asking again as each is listed, so Delete can say it deletes permanently there', async () => {
    const { tool, page, send, binsOff } = commander({
      [root]: [folder('dir')],
      [at('dir')]: [],
    });
    binsOff.add(at('dir'));
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'right', name: 'dir' });
    binsOff.delete(at('dir'));
    await send({ type: 'reread', tab: '1', side: 'right' });
    binsOff.add(root);
    await send({ type: 'open', tab: '1', side: 'right', name: '..' });
    assert.deepStrictEqual(
      page
        .of('listing')
        .filter((listing) => listing.side === 'right')
        .map((listing) => [listing.folder, listing.binOff]),
      [
        [root, undefined],
        [at('dir'), true],
        [at('dir'), undefined],
        [root, true],
      ],
    );
  });

  test('holds the widths of the columns and the size of the tiles the settings give in the range they may take, as a width too wide failed every drag after it and a size below the least drew no tiles', async () => {
    const { tool, page, settings } = commander({ [root]: [] });
    settings.columns = { extension: 10.4, size: 0, date: 120 };
    settings.thumbnailSize = -16;
    tool.ready(page);
    const told = page.of('settings').at(-1);
    assert.deepStrictEqual(told?.columns, {
      extension: 10,
      size: 1,
      date: 100,
    });
    assert.strictEqual(told.thumbnailSize, 16);
    settings.thumbnailSize = 5000;
    tool.ready(page);
    assert.strictEqual(page.of('settings').at(-1)?.thumbnailSize, 1024);
  });

  test('gives the folder of the active side as the folder of the tab, the right one until the page makes the left one active', async () => {
    const { tool, page, send } = commander({
      [root]: [folder('Users')],
      [at('Users')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'Users' });
    assert.strictEqual(tool.folderOf(tab), root);

    await send({ type: 'activate', tab: '1', side: 'left' });
    assert.strictEqual(tool.folderOf(tab), at('Users'));

    await send(forged('{ "type": "activate", "tab": "1", "side": "middle" }'));
    await send({ type: 'activate', tab: '2', side: 'right' });
    assert.strictEqual(tool.folderOf(tab), at('Users'));

    await send({ type: 'activate', tab: '1', side: 'right' });
    assert.strictEqual(tool.folderOf(tab), root);
  });

  test('watches the folders of the tab shown, listing a side again when its folder changes', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('Users')],
      [at('Users')]: [],
    };
    const { tool, page, send, watched, change } = commander(listed);
    await tool.show(page, tab);
    assert.deepStrictEqual(watched(), [root, root]);

    await send({ type: 'open', tab: '1', side: 'right', name: 'Users' });
    assert.deepStrictEqual(watched(), [root, at('Users')].toSorted());

    listed[at('Users')] = [file('new.txt')];
    await change(at('Users'));
    assert.deepStrictEqual(
      page.listings().at(-1),
      `right ${at('Users')} ↑: new.txt`,
    );

    tool.hide(page);
    assert.deepStrictEqual(watched(), []);
    await tool.show(page, tab);
    assert.deepStrictEqual(watched(), [root, at('Users')].toSorted());
    tool.closed(page, tab);
    assert.deepStrictEqual(watched(), []);
  });

  test('watches the folder of a side from how it was before it was listed, not once the listing is done, so a file made while it was listed is listed too', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('Users')],
      [at('Users')]: [],
    };
    const { tool, page, send, watchedAsListed } = commander(listed);
    await tool.show(page, tab);

    await send({ type: 'open', tab: '1', side: 'right', name: 'Users' });

    assert.strictEqual(watchedAsListed(at('Users')), 'listed 0 times');
  });

  test('lists a changed folder again once at a time, once more after a listing that was slow, so an older listing never lands after a newer one', async () => {
    const slow = Promise.withResolvers<readonly Entry[]>();
    const listed: Record<string, Listed> = { [root]: [] };
    const { tool, page, change } = commander(listed);
    await tool.show(page, tab);

    listed[root] = slow.promise;
    await change(root);
    listed[root] = [file('new.txt')];
    await change(root);
    slow.resolve([file('old.txt')]);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const last = (side: string) =>
      page
        .listings()
        .filter((listing) => listing.startsWith(`${side} `))
        .at(-1);
    assert.deepStrictEqual(
      [last('left'), last('right')],
      [`left ${root}: new.txt`, `right ${root}: new.txt`],
    );
  });

  test('sends the page nothing when a changed folder lists as it did, as reading a file for its icon changes only when it was read last, and taking in a listing of 20,000 files stalled the page for 25 ms each time', async () => {
    const listed: Record<string, Listed> = {
      [root]: [file('a.exe'), file('b.txt')],
    };
    const { tool, page, change } = commander(listed);
    await tool.show(page, tab);
    const before = page.listings().length;

    listed[root] = [file('a.exe'), file('b.txt')];
    await change(root);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.strictEqual(page.listings().length, before);

    listed[root] = [file('a.exe'), file('c.txt')];
    await change(root);
    await waitFor(
      () => page.listings().length === before + 2,
      'the changed folder to be listed again',
    );
    assert.deepStrictEqual(page.listings().slice(before).toSorted(), [
      `left ${root}: a.exe c.txt`,
      `right ${root}: a.exe c.txt`,
    ]);
  });

  test('tells the page a tab was closed, so it forgets what it kept of the tab, as a tab opened later can take its id', async () => {
    const { tool, page } = commander({ [root]: [] });
    await tool.show(page, tab);
    tool.closed(page, tab);
    assert.deepStrictEqual(page.of('closed'), [{ type: 'closed', tab: '1' }]);
  });

  test('keeps no sides of a tab closed while it was starting, so a tab taking its id starts afresh', async () => {
    const opened = tempFolder('commander-starting');
    try {
      const { tool, page } = commander({ [root]: [], [opened]: [] });
      const starting: Tab = { id: '5', tool: 'commander', root: opened };
      const showing = tool.show(page, starting);
      tool.closed(page, starting);
      await showing;
      assert.deepStrictEqual(page.listings(), []);

      await tool.show(page, { id: '5', tool: 'commander' });
      assert.deepStrictEqual(page.listings(), [
        `left ${root}: `,
        `right ${root}: `,
      ]);
    } finally {
      removeFolder(opened);
    }
  });

  test('goes on opening a folder when the folder it leaves changes meanwhile, and drops a listing of that folder begun before the opening', async () => {
    const opening = Promise.withResolvers<readonly Entry[]>();
    const listed: Record<string, Listed> = {
      [root]: [folder('slow')],
      [at('slow')]: opening.promise,
    };
    const { tool, page, send, change } = commander(listed);
    await tool.show(page, tab);

    const opened = send({ type: 'open', tab: '1', side: 'left', name: 'slow' });
    listed[root] = [folder('slow'), file('new.txt')];
    await change(root);
    opening.resolve([file('inside.txt')]);
    await opened;

    assert.deepStrictEqual(
      page
        .listings()
        .filter((listing) => listing.startsWith('left '))
        .at(-1),
      `left ${at('slow')} ↑: inside.txt`,
    );

    const refreshing = Promise.withResolvers<readonly Entry[]>();
    listed[at('slow')] = refreshing.promise;
    await change(at('slow'));
    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    refreshing.resolve([file('stale.txt')]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepStrictEqual(
      page
        .listings()
        .filter((listing) => listing.startsWith('left '))
        .at(-1),
      `left ${root}: slow new.txt [slow]`,
    );
  });

  test('keeps a side as it was, saying nothing, when its folder changes but can no longer be read', async () => {
    const listed: Record<string, Listed> = { [root]: [file('a.txt')] };
    const { tool, page, notices, change } = commander(listed);
    await tool.show(page, tab);

    listed[root] = Object.assign(new Error('denied'), { code: 'EPERM' });
    await change(root);

    assert.deepStrictEqual(page.listings(), [
      `left ${root}: a.txt`,
      `right ${root}: a.txt`,
    ]);
    assert.deepStrictEqual(notices, []);
  });

  test('lists the root on the right when the folder the tab was opened with is gone', async () => {
    const { tool, page } = commander({ [root]: [] });

    await tool.show(page, { ...tab, root: at('gone-folder-of-a-tab') });

    assert.deepStrictEqual(page.listings(), [
      `left ${root}: `,
      `right ${root}: `,
    ]);
  });

  suite('started again', () => {
    test('opens each side of a tab at the folder it last listed', async () => {
      const listed: Record<string, Listed> = {
        [root]: [folder('Users'), folder('Windows')],
        [at('Users')]: [folder('me')],
        [at('Users', 'me')]: [],
        [at('Windows')]: [],
      };
      const before = commander(listed);
      await before.tool.show(before.page, tab);
      await before.send({
        type: 'open',
        tab: '1',
        side: 'left',
        name: 'Users',
      });
      await before.send({ type: 'open', tab: '1', side: 'left', name: 'me' });
      await before.send({
        type: 'open',
        tab: '1',
        side: 'right',
        name: 'Windows',
      });
      await before.settled();

      const { tool, page } = commander(listed, [], undefined, before.state);
      await tool.show(page, tab);

      assert.deepStrictEqual(page.listings(), [
        `left ${at('Users', 'me')} ↑: `,
        `right ${at('Windows')} ↑: `,
      ]);
    });

    test('opens the right side of a tab at the folder it was opened with while that side has not moved', async () => {
      const opened = tempFolder('commander');
      try {
        const listed: Record<string, Listed> = {
          [root]: [folder('Users')],
          [at('Users')]: [],
          [opened]: [],
        };
        const shown = { ...tab, root: opened };
        const before = commander(listed);
        await before.tool.show(before.page, shown);
        await before.send({
          type: 'open',
          tab: '1',
          side: 'left',
          name: 'Users',
        });
        await before.settled();

        const { tool, page } = commander(listed, [], undefined, before.state);
        await tool.show(page, shown);

        assert.deepStrictEqual(page.listings(), [
          `left ${at('Users')} ↑: `,
          `right ${opened} ↑: `,
        ]);
      } finally {
        removeFolder(opened);
      }
    });

    test('opens a side at the nearest folder still there when the one it last listed is gone', async () => {
      const listed: Record<string, Listed> = {
        [root]: [folder('fastforward-made-up')],
        [at('fastforward-made-up')]: [],
      };
      const before = commander(listed);
      await before.tool.show(before.page, tab);
      await before.send({
        type: 'open',
        tab: '1',
        side: 'left',
        name: 'fastforward-made-up',
      });
      await before.settled();
      delete listed[at('fastforward-made-up')];

      const { tool, page, notices } = commander(
        listed,
        [],
        undefined,
        before.state,
      );
      await tool.show(page, tab);

      assert.strictEqual(lastFolder(page, '1', 'left'), root);
      assert.deepStrictEqual(notices, []);
    });

    test('opens a side at the folder it last listed without administrator, rather than asking to read one as administrator again', async () => {
      const helper: ElevatedFileSystem = {
        list: () => Promise.resolve([file('secret.txt')]),
        drives: () => Promise.resolve([]),
        watch: () => () => {},
        closed: new Promise(() => {}),
        close: () => {},
      };
      const listed: Record<string, Listed> = {
        [root]: [folder('Users')],
        [at('Users')]: [folder('Locked')],
        [at('Users', 'Locked')]: Object.assign(new Error('denied'), {
          code: 'EPERM',
        }),
      };
      const before = commander(listed, [], () => Promise.resolve(helper));
      await before.tool.show(before.page, tab);
      await before.send({
        type: 'open',
        tab: '1',
        side: 'left',
        name: 'Users',
      });
      await before.send({
        type: 'open',
        tab: '1',
        side: 'left',
        name: 'Locked',
      });
      await before.send({ type: 'elevate', tab: '1', side: 'left' });
      await before.settled();
      assert.strictEqual(
        lastFolder(before.page, '1', 'left'),
        at('Users', 'Locked'),
      );

      const { tool, page } = commander(listed, [], undefined, before.state);
      await tool.show(page, tab);

      assert.strictEqual(lastFolder(page, '1', 'left'), at('Users'));
      assert.deepStrictEqual(page.of('noAccess'), []);
    });

    test('forgets the folders of a tab once it is closed, and of tabs gone once the page is ready, as a new tab may take the number of one', async () => {
      const listed: Record<string, Listed> = {
        [root]: [folder('Users')],
        [at('Users')]: [],
      };
      const tabs: Tab[] = ['1', '2', '3'].map((id) => ({
        id,
        tool: 'commander',
      }));
      const before = commander(listed);
      for (const each of tabs) {
        await before.tool.show(before.page, each);
        await before.send({
          type: 'open',
          tab: each.id,
          side: 'left',
          name: 'Users',
        });
      }
      await before.settled();
      before.tool.closed(before.page, tabs[0]);

      const after = commander(listed, [], undefined, before.state);
      after.tabs.push(tabs[0], tabs[1]);
      after.tool.ready(after.page);
      await after.settled();
      after.tabs.push(tabs[2]);
      for (const each of tabs) {
        await after.tool.show(after.page, each);
      }

      assert.deepStrictEqual(
        tabs.map((each) => lastFolder(after.page, each.id, 'left')),
        [root, at('Users'), root],
      );
    });
  });

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

  test('tells the page the folder a side shows is in a repository once it is listed, and again when it is read again', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('app')],
      [at('app')]: [folder('src')],
    };
    const { tool, page, send, change, insideRepositories, settled } =
      commander(listed);
    insideRepositories.add(at('app'));
    await tool.show(page, tab);
    await settled();
    await send({ type: 'open', tab: '1', side: 'left', name: 'app' });
    await settled();
    insideRepositories.delete(at('app'));
    await change(at('app'));
    await settled();

    assert.deepStrictEqual(
      page
        .of('repositories')
        .filter((found) => found.side === 'left')
        .map((found) => [found.folder, found.inRepository]),
      [
        [root, undefined],
        [at('app'), true],
        [at('app'), undefined],
      ],
    );
  });

  test('names the folders a side lists that are repositories once it is listed, never asking about files, and again when the folder is read again', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('app'), folder('docs'), file('notes.txt')],
    };
    const { tool, page, change, repositories, repositoriesAsked, settled } =
      commander(listed);
    repositories.add(at('app'));
    await tool.show(page, tab);
    await settled();

    assert.deepStrictEqual(page.of('repositories'), [
      {
        type: 'repositories',
        tab: '1',
        side: 'left',
        folder: root,
        names: ['app'],
      },
      {
        type: 'repositories',
        tab: '1',
        side: 'right',
        folder: root,
        names: ['app'],
      },
    ]);
    assert.ok(!repositoriesAsked.includes(at('notes.txt')));

    repositories.add(at('docs'));
    listed[root] = [
      folder('app'),
      { ...folder('docs'), modified: 1 },
      file('notes.txt'),
    ];
    await change(root);
    await settled();
    assert.deepStrictEqual(page.of('repositories').at(-1)?.names, [
      'app',
      'docs',
    ]);
  });

  test('looks again only at the folders that came or changed once a side is listed again as its folder changes, keeping what it found of the others, as each change looked at every folder again', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('app'), folder('docs'), folder('lib')],
    };
    const {
      tool,
      page,
      send,
      change,
      repositories,
      repositoriesAsked,
      settled,
    } = commander(listed);
    repositories.add(at('app'));
    repositories.add(at('new'));
    await tool.show(page, tab);
    await settled();
    repositoriesAsked.length = 0;

    listed[root] = [
      folder('app'),
      { ...folder('docs'), modified: 1 },
      folder('new'),
    ];
    await change(root);
    await settled();

    assert.deepStrictEqual(repositoriesAsked.toSorted(), [
      at('docs'),
      at('docs'),
      at('new'),
      at('new'),
    ]);
    assert.deepStrictEqual(page.of('repositories').at(-1)?.names, [
      'app',
      'new',
    ]);
    repositoriesAsked.length = 0;
    await send({ type: 'reread', tab: '1', side: 'left' });
    await settled();
    assert.deepStrictEqual(repositoriesAsked.toSorted(), [
      at('app'),
      at('docs'),
      at('new'),
    ]);
  });

  test('drops the repositories found in a folder a side has left meanwhile', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('app'), folder('Users')],
      [at('Users')]: [folder('me')],
    };
    const { tool, page, send, repositories, settled, repositoriesHeld } =
      commander(listed);
    repositories.add(at('app'));
    const held = Promise.withResolvers<void>();
    repositoriesHeld.until = held.promise;
    await tool.show(page, tab);
    repositoriesHeld.until = undefined;
    await send({ type: 'open', tab: '1', side: 'right', name: 'Users' });
    held.resolve();
    await settled();

    assert.deepStrictEqual(
      page
        .of('repositories')
        .map((found) => `${found.side} ${found.folder} ${found.names.join()}`)
        .toSorted(),
      [`left ${root} app`, `right ${at('Users')} `],
    );
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

  test('names a viewing tab after its file and gives its folder as the folder of the tab, showing it without sides', async () => {
    const { tool, page } = commander({ [root]: [file('notes.txt')] });
    const viewing: Tab = {
      id: '3',
      tool: 'commander',
      root: at('notes.txt'),
      view: true,
    };

    assert.strictEqual(tool.names([viewing]).get('3')?.name, 'notes.txt');
    assert.strictEqual(tool.folderOf(viewing), root);
    await tool.show(page, viewing);
    assert.deepStrictEqual(page.of('show'), [
      { type: 'show', tab: '3', file: at('notes.txt') },
    ]);
    assert.deepStrictEqual(page.listings(), []);
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

  test('keeps the folder of a side and asks the page to say there is no access, in a window rather than a notice, when another can’t be read', async () => {
    const { tool, page, send, notices } = commander({
      [root]: [folder('System Volume Information'), folder('Config.Msi')],
      [at('System Volume Information')]: Object.assign(new Error('denied'), {
        code: 'EPERM',
      }),
      [at('Config.Msi')]: Object.assign(new Error('denied'), {
        code: 'EACCES',
      }),
    });
    await tool.show(page, tab);

    await send({
      type: 'open',
      tab: '1',
      side: 'left',
      name: 'System Volume Information',
    });
    await send({ type: 'open', tab: '1', side: 'right', name: 'Config.Msi' });

    assert.deepStrictEqual(page.of('noAccess'), [
      {
        type: 'noAccess',
        side: 'left',
        folder: at('System Volume Information'),
        asAdministrator: false,
      },
      {
        type: 'noAccess',
        side: 'right',
        folder: at('Config.Msi'),
        asAdministrator: false,
      },
    ]);
    assert.deepStrictEqual(notices, []);
    assert.deepStrictEqual(page.listings().slice(2), [
      `left ${root}: System Volume Information Config.Msi`,
      `right ${root}: System Volume Information Config.Msi`,
    ]);
  });

  test('lists a folder it has no access to as administrator once the page asks, the helper started once, and further folders through it at once', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('Config.Msi'), folder('System Volume Information')],
    };
    const stopped = Promise.withResolvers<void>();
    const helper: ElevatedFileSystem = {
      list: (each) =>
        Promise.resolve([file(`${path.basename(each)} as admin.txt`)]),
      drives: () => Promise.resolve([]),
      watch: () => () => {},
      closed: stopped.promise,
      close: () => stopped.resolve(),
    };
    let asked = 0;
    const { tool, page, send } = commander(listed, [], () => {
      asked++;
      return Promise.resolve(helper);
    });
    for (const each of ['Config.Msi', 'System Volume Information']) {
      listed[at(each)] = Object.assign(new Error('denied'), { code: 'EPERM' });
    }
    await tool.show(page, tab);
    assert.strictEqual(page.of('settings').length, 0);
    tool.ready(page);
    assert.strictEqual(page.of('settings').at(-1)?.canElevate, true);

    await send({ type: 'elevate', tab: '1', side: 'left' });
    assert.strictEqual(asked, 0);

    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    await send({ type: 'elevate', tab: '1', side: 'left' });
    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    await send({
      type: 'open',
      tab: '1',
      side: 'left',
      name: 'System Volume Information',
    });

    assert.strictEqual(asked, 1);
    assert.deepStrictEqual(page.of('noAccess').length, 1);
    assert.deepStrictEqual(page.listings().slice(3), [
      `left ${at('Config.Msi')} ↑: Config.Msi as admin.txt`,
      `left ${root}: Config.Msi System Volume Information [Config.Msi]`,
      `left ${at('System Volume Information')} ↑: System Volume Information as admin.txt`,
    ]);
    assert.deepStrictEqual(
      page
        .of('listing')
        .slice(3)
        .map((listing) => listing.elevated),
      [true, false, true],
    );

    stopped.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepStrictEqual(page.of('noAccess').length, 2);
    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    assert.deepStrictEqual(page.of('noAccess').length, 3);
  });

  test('lists the other side through the helper already running, and lists a folder denied before no more once a side has moved on, as a second helper was started and the first left running', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('Config.Msi'), folder('System Volume Information')],
    };
    const closed: string[] = [];
    const helperNamed = (name: string): ElevatedFileSystem => ({
      list: (each) =>
        Promise.resolve([file(`${path.basename(each)} by ${name}.txt`)]),
      drives: () => Promise.resolve([]),
      watch: () => () => {},
      closed: new Promise(() => {}),
      close: () => closed.push(name),
    });
    let asked = 0;
    const { tool, page, send } = commander(listed, [], () =>
      Promise.resolve(helperNamed(`helper ${++asked}`)),
    );
    for (const each of ['Config.Msi', 'System Volume Information']) {
      listed[at(each)] = Object.assign(new Error('denied'), { code: 'EPERM' });
    }
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    await send({
      type: 'open',
      tab: '1',
      side: 'right',
      name: 'System Volume Information',
    });

    await send({ type: 'elevate', tab: '1', side: 'left' });
    await tool.show(page, tab);
    await send({ type: 'elevate', tab: '1', side: 'right' });
    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    await send({ type: 'elevate', tab: '1', side: 'left' });

    assert.strictEqual(asked, 1);
    assert.deepStrictEqual(closed, []);
    assert.deepStrictEqual(page.listings().slice(4), [
      `left ${at('Config.Msi')} ↑: Config.Msi by helper 1.txt`,
      `right ${root}: Config.Msi System Volume Information`,
      `left ${at('Config.Msi')} ↑: Config.Msi by helper 1.txt`,
      `right ${at('System Volume Information')} ↑: System Volume Information by helper 1.txt`,
      `left ${root}: Config.Msi System Volume Information [Config.Msi]`,
    ]);
  });

  test('opens where a link points when the link itself can’t be listed, as Documents and Settings, which no one may list', async () => {
    const { tool, page, send } = commander({
      [root]: [{ ...folder('Documents and Settings'), link: true }],
      [at('Documents and Settings')]: Object.assign(new Error('denied'), {
        code: 'EPERM',
      }),
      [at('Users')]: [folder('me')],
    });
    await tool.show(page, tab);

    await send({
      type: 'open',
      tab: '1',
      side: 'left',
      name: 'Documents and Settings',
    });

    assert.deepStrictEqual(page.of('noAccess'), []);
    assert.deepStrictEqual(page.listings().slice(2), [
      `left ${at('Users')} ↑: me`,
    ]);
  });

  test('says there is no access even as administrator, offering nothing more, when the helper is refused too', async () => {
    const denied = Object.assign(new Error('denied'), { code: 'EPERM' });
    const helper: ElevatedFileSystem = {
      list: () => Promise.reject(denied),
      drives: () => Promise.resolve([]),
      watch: () => () => {},
      closed: new Promise(() => {}),
      close: () => {},
    };
    const { tool, page, send } = commander(
      {
        [root]: [folder('Locked'), folder('Config.Msi')],
        [at('Locked')]: denied,
        [at('Config.Msi')]: denied,
      },
      [],
      () => Promise.resolve(helper),
    );
    await tool.show(page, tab);

    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    await send({ type: 'elevate', tab: '1', side: 'left' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'Locked' });

    assert.deepStrictEqual(page.of('noAccess'), [
      {
        type: 'noAccess',
        side: 'left',
        folder: at('Config.Msi'),
        asAdministrator: true,
      },
      {
        type: 'noAccess',
        side: 'left',
        folder: at('Config.Msi'),
        asAdministrator: false,
      },
      {
        type: 'noAccess',
        side: 'left',
        folder: at('Locked'),
        asAdministrator: false,
      },
    ]);
  });

  test('watches a folder read as administrator through the helper, listing it again as it changes', async () => {
    const helperWatching: { folder: string; changed: () => void }[] = [];
    const listed: Record<string, Listed> = {
      [root]: [folder('Config.Msi')],
      [at('Config.Msi')]: Object.assign(new Error('denied'), { code: 'EPERM' }),
    };
    let inside = [file('a.txt')];
    const helper: ElevatedFileSystem = {
      list: () => Promise.resolve(inside),
      drives: () => Promise.resolve([]),
      watch: (watched, changed) => {
        const watch = { folder: watched, changed };
        helperWatching.push(watch);
        return () => helperWatching.splice(helperWatching.indexOf(watch), 1);
      },
      closed: new Promise(() => {}),
      close: () => {},
    };
    const { tool, page, send, watched } = commander(listed, [], () =>
      Promise.resolve(helper),
    );
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    await send({ type: 'elevate', tab: '1', side: 'left' });

    assert.deepStrictEqual(
      helperWatching.map((watch) => watch.folder),
      [at('Config.Msi')],
    );
    assert.deepStrictEqual(watched(), [root]);

    inside = [file('a.txt'), file('b.txt')];
    helperWatching[0]?.changed();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepStrictEqual(
      page.listings().at(-1),
      `left ${at('Config.Msi')} ↑: a.txt b.txt`,
    );

    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    assert.deepStrictEqual(helperWatching, []);
    assert.deepStrictEqual(watched(), [root, root]);
  });

  test('says when the helper couldn’t be started, staying where it was', async () => {
    const { tool, page, send, notices } = commander(
      {
        [root]: [folder('Config.Msi')],
        [at('Config.Msi')]: Object.assign(new Error('denied'), {
          code: 'EPERM',
        }),
      },
      [],
      () => Promise.reject(new Error('The helper didn’t connect')),
    );
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    await send({ type: 'elevate', tab: '1', side: 'left' });

    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.helperFailed },
    ]);
    assert.deepStrictEqual(page.listings().slice(2), [
      `left ${root}: Config.Msi`,
    ]);
  });

  test('drops what a side read as administrator once the helper stops, saying so and asking again rather than showing it as current', async () => {
    const stopped = Promise.withResolvers<void>();
    const helper: ElevatedFileSystem = {
      list: () => Promise.resolve([file('secret.txt')]),
      drives: () => Promise.resolve([]),
      watch: () => () => {},
      closed: stopped.promise,
      close: () => stopped.resolve(),
    };
    const { tool, page, send, notices } = commander(
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

    stopped.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const last = page.of('listing').at(-1);
    assert.deepStrictEqual(
      last && [last.side, last.folder, last.entries, last.elevated],
      ['left', at('Config.Msi'), [], false],
    );
    assert.deepStrictEqual(page.of('noAccess').at(-1), {
      type: 'noAccess',
      side: 'left',
      folder: at('Config.Msi'),
      asAdministrator: true,
    });
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.helperStopped },
    ]);
  });

  test('stays where it was when the user says no to running as administrator, and offers it only where it can', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('Config.Msi')],
      [at('Config.Msi')]: Object.assign(new Error('denied'), { code: 'EPERM' }),
    };
    const refused = commander(listed, [], () => Promise.resolve(undefined));
    await refused.tool.show(refused.page, tab);
    await refused.send({
      type: 'open',
      tab: '1',
      side: 'left',
      name: 'Config.Msi',
    });
    await refused.send({ type: 'elevate', tab: '1', side: 'left' });
    assert.deepStrictEqual(refused.page.listings().slice(2), [
      `left ${root}: Config.Msi`,
    ]);

    const unable = commander(listed);
    unable.tool.ready(unable.page);
    assert.strictEqual(unable.page.of('settings').at(-1)?.canElevate, false);
  });

  test('says why in a notice when a folder can’t be opened for another reason', async () => {
    const { tool, page, send, notices } = commander({
      [root]: [folder('busy')],
      [at('busy')]: Object.assign(new Error('the device is busy'), {
        code: 'EBUSY',
      }),
    });
    await tool.show(page, tab);

    await send({ type: 'open', tab: '1', side: 'left', name: 'busy' });

    assert.deepStrictEqual(notices, [
      {
        level: 'error',
        message: strings.commander.couldNotOpen(
          at('busy'),
          'the device is busy',
        ),
      },
    ]);
    assert.deepStrictEqual(page.of('noAccess'), []);
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

  test('saves the order of the side whose header was clicked, or whose files are grouped by color, keeping the other, and tells the page', async () => {
    const { tool, page, send, saved } = commander({});
    tool.ready(page);

    await send({
      type: 'sort',
      side: 'right',
      sort: { column: 'size', descending: true, groupByColor: true },
    });
    await send(
      forged(
        '{ "type": "sort", "side": "right", "sort": { "column": "owner", "descending": true, "groupByColor": false } }',
      ),
    );
    await send(
      forged(
        '{ "type": "sort", "side": "right", "sort": { "column": "size", "descending": "yes", "groupByColor": false } }',
      ),
    );
    await send(
      forged(
        '{ "type": "sort", "side": "right", "sort": { "column": "size", "descending": true, "groupByColor": "yes" } }',
      ),
    );
    await send(
      forged(
        '{ "type": "sort", "side": "middle", "sort": { "column": "size", "descending": true, "groupByColor": false } }',
      ),
    );

    const sorted: Sorts = {
      left: defaultSorts.left,
      right: { column: 'size', descending: true, groupByColor: true },
    };
    assert.deepStrictEqual(saved, [sorted]);
    assert.deepStrictEqual(page.of('settings').at(-1)?.sort, sorted);
  });

  test('tells the page the size of the thumbnails, and saves no layout, which each tab keeps for itself', async () => {
    const { tool, page, send, saved } = commander({});
    tool.ready(page);
    assert.strictEqual(page.of('settings').at(-1)?.thumbnailSize, 144);
    const told = page.of('settings').length;

    await send(
      forged('{ "type": "layout", "side": "right", "layout": "thumbnails" }'),
    );

    assert.deepStrictEqual(saved, []);
    assert.strictEqual(page.of('settings').length, told);
  });

  test('lists the drives again when asked, as drives come and go', async () => {
    const { page, send } = commander({}, ['C:\\']);

    await send({ type: 'listDrives' });

    assert.deepStrictEqual(page.of('drives'), [
      { type: 'drives', drives: ['C:\\'] },
    ]);
  });

  test('bookmarks the folder a side shows, saving it after the bookmarks written before, and tells the page the bookmarks it can open, sorted, but none for a folder the side doesn’t show or one bookmarked already', async () => {
    const work = at('work');
    const { tool, page, send, saved, settings } = commander({
      [root]: [folder('work')],
      [work]: [],
    });
    settings.bookmarks = [at('zeta'), 'Downloads'];
    tool.ready(page);
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'right', name: 'work' });

    await send({ type: 'addBookmark', tab: '1', side: 'right', folder: work });
    await send({ type: 'addBookmark', tab: '1', side: 'right', folder: work });
    await send({ type: 'addBookmark', tab: '1', side: 'left', folder: work });
    await send({ type: 'addBookmark', tab: '2', side: 'right', folder: work });
    await send(
      forged(
        `{ "type": "addBookmark", "tab": "1", "side": "middle", "folder": ${JSON.stringify(work)} }`,
      ),
    );

    assert.deepStrictEqual(saved, [[at('zeta'), 'Downloads', work]]);
    assert.deepStrictEqual(
      page.of('settings').map((each) => each.bookmarks),
      [[at('zeta')], [work, at('zeta')]],
    );
  });

  test('removes a bookmark however it was written, keeping the others as written, and tells the page, saving nothing for a folder not bookmarked', async () => {
    const { tool, page, send, saved, settings } = commander({});
    settings.bookmarks = [at('work'), at('zeta'), 'Downloads'];
    tool.ready(page);

    await send({ type: 'removeBookmark', folder: at('work') });
    await send({ type: 'removeBookmark', folder: at('gone') });
    await send(forged('{ "type": "removeBookmark", "folder": 2 }'));

    assert.deepStrictEqual(saved, [[at('zeta'), 'Downloads']]);
    assert.deepStrictEqual(
      page.of('settings').map((each) => each.bookmarks),
      [[at('work'), at('zeta')], [at('zeta')]],
    );
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

  test('saves whether the hidden files are shown, and tells the page', async () => {
    const { tool, page, send, saved } = commander({});
    tool.ready(page);

    await send({ type: 'showHidden', shown: false });
    await send(forged('{ "type": "showHidden", "shown": "no" }'));

    assert.deepStrictEqual(saved, [false]);
    assert.deepStrictEqual(
      page.of('settings').map((each) => each.showHidden),
      [true, false],
    );
  });

  test('saves the widths of the columns the page resized, whole and within bounds, and tells the page with the defaults', async () => {
    const { tool, page, send, saved } = commander({});
    tool.ready(page);

    await send({
      type: 'columns',
      columns: { extension: 6, size: 12, date: 16 },
    });
    await send(
      forged(
        '{ "type": "columns", "columns": { "extension": 0, "size": 12, "date": 16 } }',
      ),
    );
    await send(
      forged(
        '{ "type": "columns", "columns": { "extension": 6.5, "size": 12, "date": 16 } }',
      ),
    );
    await send(
      forged(
        '{ "type": "columns", "columns": { "extension": 6, "size": 12 } }',
      ),
    );
    await send(
      forged(
        '{ "type": "columns", "columns": { "extension": 6, "size": 12, "date": 16, "name": 40 } }',
      ),
    );

    assert.deepStrictEqual(saved, [
      { extension: 6, size: 12, date: 16 },
      { extension: 6, size: 12, date: 16 },
    ]);
    assert.deepStrictEqual(page.of('settings').at(-1), {
      type: 'settings',
      showHidden: true,
      sort: defaultSorts,
      columns: { extension: 6, size: 12, date: 16 },
      defaultColumns,
      canElevate: false,
      platform: 'linux',
      thumbnailSize: 144,
      fileColors: [],
      bookmarks: [],
    });
  });

  test('forgets the folders of a closed tab, starting it at the root again', async () => {
    const { tool, page, send } = commander({
      [root]: [folder('Users')],
      [at('Users')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'Users' });

    tool.closed(page, tab);
    await tool.show(page, tab);

    assert.deepStrictEqual(page.listings().slice(3), [
      `left ${root}: Users`,
      `right ${root}: Users`,
    ]);
  });
});

suite('The folder to select', () => {
  test('is the child of a folder on the way to the one left, and none for a folder elsewhere', () => {
    assert.strictEqual(childToward(root, at('Users', 'me')), 'Users');
    assert.strictEqual(childToward(at('Users'), at('Users', 'me')), 'me');
    assert.strictEqual(childToward(at('Users'), at('Users')), undefined);
    assert.strictEqual(childToward(at('Users', 'me'), at('Users')), undefined);
    assert.strictEqual(childToward(at('Users'), at('Windows')), undefined);
  });
});

suite('The root', () => {
  test('is the system drive on Windows, and / elsewhere', () => {
    assert.strictEqual(rootFolder('win32', { SystemDrive: 'D:' }), 'D:\\');
    assert.strictEqual(rootFolder('win32', {}), 'C:\\');
    assert.strictEqual(rootFolder('darwin', { SystemDrive: 'D:' }), '/');
    assert.strictEqual(rootFolder('linux', {}), '/');
  });
});

const rightOf = (shown: CommanderPage, shownTab: string) =>
  shown
    .of('listing')
    .findLast((listing) => listing.tab === shownTab && listing.side === 'right')
    ?.entries.map((entry) => entry.name);

suite('Commander tool in several windows', () => {
  const second: Tab = { id: '2', tool: 'commander' };

  test('lists and watches the tab each window shows at once, listing a side again in its own window once its folder changes', async () => {
    const listed: Record<string, Listed> = {
      [root]: [folder('Users')],
      [at('Users')]: [],
    };
    const { tool, page, send, watched, change } = commander(listed);
    const other = new CommanderPage();
    await tool.show(page, tab);
    await tool.show(other, second);
    await send(
      { type: 'open', tab: '2', side: 'right', name: 'Users', folder: root },
      other,
    );
    assert.deepStrictEqual(
      watched(),
      [root, root, root, at('Users')].toSorted(),
    );

    listed[at('Users')] = [file('new.txt')];
    await change(at('Users'));
    assert.deepStrictEqual(rightOf(other, '2'), ['new.txt']);
    assert.ok(page.of('listing').every((listing) => listing.tab === '1'));
  });

  test('stops watching only the folders of the window that stops showing a commander tab', async () => {
    const { tool, page, watched } = commander({ [root]: [] });
    const other = new CommanderPage();
    await tool.show(page, tab);
    await tool.show(other, second);
    tool.hide(other);
    assert.deepStrictEqual(watched(), [root, root]);
    assert.strictEqual(other.of('hide').length, 1);
    assert.strictEqual(page.of('hide').length, 0);
  });

  test('shows a tab moved to another window there, watching it there alone, and tells the window it left to stop showing it', async () => {
    const { tool, page, watched } = commander({ [root]: [] });
    const other = new CommanderPage();
    await tool.show(page, tab);
    await tool.show(other, tab);
    assert.deepStrictEqual(watched(), [root, root]);
    assert.strictEqual(page.of('hide').length, 1);
    assert.strictEqual(tool.shows(page, tab), false);
    assert.strictEqual(tool.shows(other, tab), true);
  });

  test('shows the progress of a copy in the window that was in front when it started, though another comes to the front meanwhile', async () => {
    const { tool, page, send, transfers, focus } = commander({
      [root]: [file('a.txt'), folder('target')],
      [at('target')]: [],
    });
    const other = new CommanderPage();
    await tool.show(page, tab);
    await tool.show(other, second);
    await send({ type: 'open', tab: '1', side: 'left', name: 'target' });
    await send({
      type: 'transfer',
      tab: '1',
      side: 'right',
      names: ['a.txt'],
      target: at('target'),
      move: false,
    });
    focus(other);
    transfers[0]?.listener.event({
      type: 'clash',
      clash: {
        name: 'a.txt',
        source: { size: 1, modified: 2 },
        target: { size: 3, modified: 4 },
      },
    });
    assert.ok(page.of('transfer').at(-1)?.view?.clash !== undefined);
    assert.deepStrictEqual(other.of('transfer'), []);
  });

  test('tells the page to close brackets as they are typed in the editor once the settings say so', () => {
    const { tool, page, closing } = commander({ [root]: [] });
    tool.reloadSettings();
    assert.strictEqual(page.of('settings').at(-1)?.closeBrackets, undefined);
    closing.now = true;
    tool.reloadSettings();
    assert.strictEqual(page.of('settings').at(-1)?.closeBrackets, true);
  });

  test('tells every window the settings once they change', () => {
    const { tool, page, pages } = commander({ [root]: [] });
    const other = new CommanderPage();
    pages.push(other);
    tool.reloadSettings();
    assert.strictEqual(page.of('settings').length, 1);
    assert.strictEqual(other.of('settings').length, 1);
  });

  suite('viewing a file', () => {
    let opened: string;

    beforeEach(() => {
      opened = tempFolder('commander');
    });

    afterEach(() => removeFolder(opened));

    test('reads the rows of a file viewed in one window while another lists a folder, answering only the page that views it, as the page is not trusted', async () => {
      const notes = path.join(opened, 'notes.txt');
      fs.writeFileSync(notes, 'one\ntwo\n');
      const { tool, page, send } = commander({ [root]: [] });
      const other = new CommanderPage();
      await tool.show(page, {
        id: '3',
        tool: 'commander',
        root: notes,
        view: true,
      });
      await tool.show(other, tab);
      const rows = {
        type: 'readRows',
        tab: '3',
        encoding: 'utf-8',
        anchor: 0,
        exact: true,
        before: 0,
        after: 2,
        least: 0,
      } as const;
      await send({ ...rows, request: 1 }, other);
      await send({ ...rows, request: 2 });
      assert.deepStrictEqual(other.of('rows'), []);
      assert.deepStrictEqual(
        page.of('rows').map((answer) => answer.rows.map((row) => row.text)),
        [['one', 'two']],
      );
    });
  });
});
