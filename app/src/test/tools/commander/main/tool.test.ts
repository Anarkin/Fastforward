import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { Notice, Page, Tab } from '../../../../shell/main/shell';
import type { ToWebview } from '../../../../shell/shared/protocol';
import type { FileSystem } from '../../../../tools/commander/main/fileSystem';
import {
  childToward,
  CommanderTool,
  rootFolder,
} from '../../../../tools/commander/main/tool';
import type {
  CommanderToHost,
  CommanderToWebview,
  Entry,
} from '../../../../tools/commander/shared/protocol';
import type {
  ColumnWidths,
  Sorts,
} from '../../../../tools/commander/shared/settings';
import { iconUrl } from '../../../../tools/commander/shared/icons';
import type { ElevatedFileSystem } from '../../../../tools/commander/main/elevated';
import { strings } from '../../../../shared/strings';
import { removeFolder, tempFolder } from '../../../repositories';
import { waitFor } from '../../../fixtures';

class CommanderPage implements Page {
  readonly messages: CommanderToWebview[] = [];
  disposed = false;

  post(message: ToWebview): void {
    if (message.type === 'tool' && message.tool === 'commander') {
      this.messages.push(message.message);
    }
  }

  of<T extends CommanderToWebview['type']>(
    type: T,
  ): Extract<CommanderToWebview, { readonly type: T }>[] {
    return this.messages.filter(
      (message): message is Extract<CommanderToWebview, { readonly type: T }> =>
        message.type === type,
    );
  }

  listings(): string[] {
    return this.of('listing').map(
      (listing) =>
        `${listing.side} ${listing.folder}${listing.parent ? ' ↑' : ''}: ${listing.entries.map((entry) => entry.name).join(' ')}${listing.selected === undefined ? '' : ` [${listing.selected}]`}`,
    );
  }
}

const root = path.resolve('/');
const at = (...names: string[]) => path.join(root, ...names);

const folder = (name: string): Entry => ({
  name,
  folder: true,
  link: false,
  hidden: false,
  size: undefined,
  modified: 0,
});

const file = (name: string): Entry => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 1,
  modified: 0,
});

type Listed = readonly Entry[] | Error | Promise<readonly Entry[]>;

function commander(
  listed: Record<string, Listed>,
  drives: readonly string[] = [],
  elevate?: () => Promise<ElevatedFileSystem | undefined>,
) {
  const notices: Notice[] = [];
  const saved: unknown[] = [];
  const watching: { folder: string; changed: () => void }[] = [];
  const iconsLoaded: string[] = [];
  const settings = {
    showHidden: true,
    sort: defaultSorts,
    columns: defaultColumns,
  };
  const fileSystem: FileSystem = {
    list: (each) => {
      const found = listed[each];
      if (found === undefined) {
        return Promise.reject(
          Object.assign(new Error(each), { code: 'ENOENT' }),
        );
      }
      return found instanceof Error
        ? Promise.reject(found)
        : Promise.resolve(found);
    },
    drives: () => Promise.resolve(drives),
  };
  const tool = new CommanderTool({
    fileSystem: () => Promise.resolve(fileSystem),
    settings: () => settings,
    defaultColumns: () => defaultColumns,
    saveShowHidden: (shown) => {
      saved.push(shown);
      settings.showHidden = shown;
      return Promise.resolve();
    },
    fileIcon: (iconOf) => {
      iconsLoaded.push(iconOf);
      return Promise.resolve(new TextEncoder().encode(`icon of ${iconOf}`));
    },
    platform: 'linux',
    elevate,
    watch: (watched, changed) => {
      const watch = { folder: watched, changed };
      watching.push(watch);
      return () => watching.splice(watching.indexOf(watch), 1);
    },
    saveSorts: (sorts) => {
      saved.push(sorts);
      settings.sort = sorts;
      return Promise.resolve();
    },
    saveColumns: (columns) => {
      saved.push(columns);
      settings.columns = columns;
      return Promise.resolve();
    },
    root,
  });
  const page = new CommanderPage();
  tool.attach({
    page: () => page,
    tabs: () => [],
    active: () => undefined,
    open: () => Promise.resolve(),
    setRoot: () => {},
    visited: () => {},
    recentItems: () => 10,
    postTabs: () => {},
    notice: (_page, notice) => notices.push(notice),
    track: (tracked) => tracked,
    idle: () => Promise.resolve(),
  });
  const send = (message: CommanderToHost, from: Page = page) =>
    tool.receive(from, message);
  const watched = () => watching.map((watch) => watch.folder).toSorted();
  const change = async (changed: string) => {
    for (const watch of watching.filter((each) => each.folder === changed)) {
      watch.changed();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { tool, page, send, notices, saved, watched, change, iconsLoaded };
}

const tab: Tab = { id: '1', tool: 'commander' };

const defaultColumns: ColumnWidths = { extension: 10, size: 15, date: 16 };

const defaultSorts: Sorts = {
  left: { column: 'extension', descending: false },
  right: { column: 'extension', descending: false },
};

const forged = (json: string): CommanderToHost => JSON.parse(json);

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

  test('opens on a side the folder selected on the other, its parent for .., or the folder the other is in for a file', async () => {
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
      `left ${root}: Users notes.txt [Users]`,
      `right ${root}: Users notes.txt [Users]`,
      `left ${root}: Users notes.txt`,
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
      },
      { type: 'noAccess', side: 'right', folder: at('Config.Msi') },
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

    stopped.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    assert.deepStrictEqual(page.of('noAccess').length, 2);
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

  test('serves the icon of a file a side lists, and nothing else, as folders keep the icon of the app', async () => {
    const { tool, page, iconsLoaded } = commander({
      [root]: [folder('Users'), file('notes.txt')],
    });
    await tool.show(page, tab);
    const icon = async (query: Record<string, string>) => {
      const response = await tool.icon(
        new URL(
          `fastforward://app${iconUrl({ tab: '1', side: 'left', folder: root, name: 'notes.txt', ...query })}`,
        ),
      );
      return response.ok
        ? [response.headers.get('content-type'), await response.text()]
        : response.status;
    };

    assert.deepStrictEqual(await icon({}), [
      'image/png',
      `icon of ${at('notes.txt')}`,
    ]);
    assert.strictEqual(await icon({ name: 'Users' }), 404);
    assert.strictEqual(await icon({ name: '..' }), 404);
    assert.strictEqual(await icon({ name: 'secret.txt' }), 404);
    assert.strictEqual(await icon({ folder: at('Users') }), 404);
    assert.strictEqual(await icon({ tab: '2' }), 404);
    assert.strictEqual(await icon({ side: 'middle' }), 404);
    assert.deepStrictEqual(iconsLoaded, [at('notes.txt')]);
  });

  test('saves the order of the side whose header was clicked, keeping the other, and tells the page', async () => {
    const { tool, page, send, saved } = commander({});
    tool.ready(page);

    await send({
      type: 'sort',
      side: 'right',
      sort: { column: 'size', descending: true },
    });
    await send(
      forged(
        '{ "type": "sort", "side": "right", "sort": { "column": "owner", "descending": true } }',
      ),
    );
    await send(
      forged(
        '{ "type": "sort", "side": "right", "sort": { "column": "size", "descending": "yes" } }',
      ),
    );
    await send(
      forged(
        '{ "type": "sort", "side": "middle", "sort": { "column": "size", "descending": true } }',
      ),
    );

    const sorted: Sorts = {
      left: defaultSorts.left,
      right: { column: 'size', descending: true },
    };
    assert.deepStrictEqual(saved, [sorted]);
    assert.deepStrictEqual(page.of('settings').at(-1)?.sort, sorted);
  });

  test('lists the drives again when asked, as drives come and go', async () => {
    const { page, send } = commander({}, ['C:\\']);

    await send({ type: 'listDrives' });

    assert.deepStrictEqual(page.of('drives'), [
      { type: 'drives', drives: ['C:\\'] },
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
