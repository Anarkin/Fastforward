import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import type { ElevatedFileSystem } from '../../../../../tools/commander/main/elevated';
import { strings } from '../../../../../lib/shared/strings';
import {
  root,
  at,
  folder,
  file,
  type Listed,
  commander,
  tab,
} from './commanderFixtures';

suite('Commander tool', () => {
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
});
