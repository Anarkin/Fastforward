import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { Tab } from '../../../../../shell/main/shell';
import type { Entry } from '../../../../../tools/commander/shared/protocol';
import type { ElevatedFileSystem } from '../../../../../tools/commander/main/elevated';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
import { waitFor } from '../../../../helpers/fixtures';
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
  forged,
} from './commanderFixtures';
import {
  childToward,
  rootFolder,
} from '../../../../../tools/commander/main/listings';

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
