import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import type { ElevatedFileSystem } from '../../../../../tools/commander/main/elevated';
import { strings } from '../../../../../lib/shared/strings';
import { waitFor } from '../../../../helpers/fixtures';
import { commander, plansOf, tab, forged } from './commanderFixtures';
import { root, at, folder, file } from './entryFixtures';

suite('Commander tool', () => {
  test('copies or moves the items asked for into the folder of the other side, only when every one is listed in the folder named, never its parent, and the other side still shows the folder named as the target', async () => {
    const { tool, page, send, transfers } = commander({
      [root]: [file('a.txt'), folder('dir'), folder('target')],
      [at('target')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'target' });
    const transfer = (names: string[], move: boolean, target = at('target')) =>
      send({ type: 'transfer', tab: '1', side: 'right', names, target, move });

    await transfer(['a.txt', 'dir'], false);
    await transfer(['a.txt'], true);
    await transfer(['a.txt', '..'], false);
    await transfer(['gone.txt'], false);
    await transfer([], false);
    await transfer(['a.txt'], false, root);
    await send(
      forged(
        JSON.stringify({
          type: 'transfer',
          tab: '1',
          side: 'right',
          folder: root,
          names: ['a.txt'],
          target: at('target'),
          move: 'yes',
        }),
      ),
    );

    assert.deepStrictEqual(plansOf(transfers), [
      { sources: [at('a.txt'), at('dir')], target: at('target'), move: false },
      { sources: [at('a.txt')], target: at('target'), move: true },
    ]);
  });
  test('says the items are in the folder already rather than copying them onto themselves, that a folder cannot go into itself or a folder in it, and that nothing is copied or moved yet in a folder read as administrator', async () => {
    const helper: ElevatedFileSystem = {
      list: () => Promise.resolve([file('secret.txt')]),
      drives: () => Promise.resolve([]),
      watch: () => () => {},
      closed: new Promise(() => {}),
      close: () => {},
    };
    const { tool, page, send, notices, transfers } = commander(
      {
        [root]: [file('a.txt'), folder('dir'), folder('Config.Msi')],
        [at('dir')]: [folder('inner')],
        [at('dir', 'inner')]: [],
        [at('Config.Msi')]: Object.assign(new Error('denied'), {
          code: 'EPERM',
        }),
      },
      [],
      () => Promise.resolve(helper),
    );
    await tool.show(page, tab);
    const transfer = (names: string[], target: string) =>
      send({
        type: 'transfer',
        tab: '1',
        side: 'right',
        names,
        target,
        move: true,
      });

    await transfer(['a.txt'], root);
    await send({ type: 'open', tab: '1', side: 'left', name: 'dir' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'inner' });
    await transfer(['a.txt', 'dir'], at('dir', 'inner'));
    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    await transfer(['dir'], at('dir'));
    await send({ type: 'open', tab: '1', side: 'left', name: '..' });
    await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
    await send({ type: 'elevate', tab: '1', side: 'left' });
    await transfer(['a.txt'], at('Config.Msi'));
    await send({
      type: 'transfer',
      tab: '1',
      side: 'left',
      names: ['secret.txt'],
      target: root,
      move: false,
    });

    assert.deepStrictEqual(plansOf(transfers), []);
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.alreadyIn(root) },
      { level: 'error', message: strings.commander.intoItself(at('dir')) },
      { level: 'error', message: strings.commander.intoItself(at('dir')) },
      { level: 'error', message: strings.commander.transferAsAdministrator },
      { level: 'error', message: strings.commander.transferAsAdministrator },
    ]);
  });
  test('has the shell ask before quitting while a copy runs, saying quitting stops it, and no longer once it is done', async () => {
    const { tool, page, send, transfers } = commander({
      [root]: [file('a.txt'), folder('target')],
      [at('target')]: [],
    });
    await tool.show(page, tab);
    assert.strictEqual(tool.quitNote(), undefined);
    await send({ type: 'open', tab: '1', side: 'left', name: 'target' });
    await send({
      type: 'transfer',
      tab: '1',
      side: 'right',
      names: ['a.txt'],
      target: at('target'),
      move: false,
    });
    await send({ type: 'hideTransfer', transfer: 1 });

    assert.strictEqual(tool.quitNote(), strings.commander.quitStopsTransfers);
    transfers[0].listener.event({ type: 'done', stopped: false });
    await waitFor(() => tool.quitNote() === undefined, 'the copy to end');
  });
  test('shows the page the transfer to show, a single item by its whole path, and what it asks, sends on what the page answers to it, and lists the side showing its target again once it is done', async () => {
    const { tool, page, send, transfers } = commander({
      [root]: [file('a.txt'), folder('target')],
      [at('target')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'target' });
    await send({
      type: 'transfer',
      tab: '1',
      side: 'right',
      names: ['a.txt'],
      target: at('target'),
      move: false,
    });
    const shown = () => page.of('transfer').at(-1)?.view;
    assert.deepStrictEqual(shown(), {
      id: 1,
      move: false,
      items: 1,
      name: at('a.txt'),
      target: at('target'),
      stopping: false,
    });

    const clash = {
      name: 'a.txt',
      source: { size: 1, modified: 2 },
      target: { size: 3, modified: 4 },
    };
    transfers[0].listener.event({ type: 'clash', clash });
    assert.deepStrictEqual(shown()?.clash, { ...clash, asked: 1 });
    await send({
      type: 'answerClash',
      transfer: 1,
      asked: 1,
      answer: 'overwrite',
      all: false,
    });
    await send({ type: 'hideTransfer', transfer: 1 });
    assert.strictEqual(shown(), undefined);
    tool.ready(page);
    assert.strictEqual(page.of('transfer').at(-1)?.view, undefined);
    await send({ type: 'stopTransfer', transfer: 1 });
    assert.deepStrictEqual(transfers[0].commands.slice(1), [
      { type: 'answer', reply: { answer: 'overwrite', all: false } },
      { type: 'stop' },
    ]);

    const listings = page.listings().length;
    transfers[0].listener.event({ type: 'done', stopped: true });
    await waitFor(
      () => page.listings().length > listings,
      'the target to be listed again',
    );
    assert.deepStrictEqual(page.listings().slice(listings), [
      `left ${at('target')} ↑: `,
    ]);
  });
  test('copies or moves the files dropped on a side into its folder, the folder they were dropped on or its parent, only while the side shows the folder named and every file is a whole path, refusing them in the folder they are in', async () => {
    const { tool, page, send, transfers, notices } = commander({
      [root]: [file('a.txt'), folder('target')],
      [at('target')]: [folder('inner'), file('b.txt')],
      [at('target', 'inner')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'right', name: 'target' });
    const elsewhere = path.join(root, 'elsewhere');
    const files = [path.join(elsewhere, 'x.txt'), path.join(elsewhere, 'y')];
    const drop = (message: object, dropped: unknown = files) =>
      tool.dropped(page, dropped, {
        type: 'drop',
        tab: '1',
        side: 'right',
        folder: at('target'),
        move: false,
        ...message,
      });

    await drop({});
    await drop({ into: 'inner', move: true });
    await drop({ into: '..' });
    await drop({ into: 'b.txt' });
    await drop({ into: 'gone' });
    await drop({ folder: root });
    await drop({}, ['relative.txt']);
    await drop({}, []);
    await drop({}, [7]);
    await drop({}, 'x.txt');
    await drop({ move: 'yes' });
    await tool.dropped(page, files, { type: 'other' });
    await drop({}, [at('target', 'b.txt')]);

    assert.deepStrictEqual(plansOf(transfers), [
      { sources: files, target: at('target'), move: false },
      { sources: files, target: at('target', 'inner'), move: true },
      { sources: files, target: root, move: false },
    ]);
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.commander.alreadyIn(at('target')) },
    ]);
  });
  test('pastes the files on the clipboard into the folder named as a copy of them, refusing them in the folder they are in or a folder into itself, and saying when the clipboard holds no files', async () => {
    const { tool, page, send, clipboard, transfers, notices } = commander({
      [root]: [file('a.txt'), folder('dir')],
      [at('dir')]: [],
    });
    await tool.show(page, tab);
    const paste = () => send({ type: 'paste', tab: '1', side: 'right' });

    await paste();
    clipboard.files = [at('a.txt')];
    await paste();
    clipboard.files = [at('dir')];
    await send({ type: 'open', tab: '1', side: 'right', name: 'dir' });
    await paste();
    clipboard.files = [at('a.txt'), path.join(root, 'elsewhere', 'b.txt')];
    await paste();

    assert.deepStrictEqual(plansOf(transfers), [
      {
        sources: [at('a.txt'), path.join(root, 'elsewhere', 'b.txt')],
        target: at('dir'),
        move: false,
      },
    ]);
    assert.deepStrictEqual(notices, [
      { level: 'info', message: strings.commander.nothingToPaste },
      { level: 'error', message: strings.commander.alreadyIn(root) },
      { level: 'error', message: strings.commander.intoItself(at('dir')) },
    ]);
  });

  test('ends every copy and move on quitting', async () => {
    const { tool, page, send, transfers } = commander({
      [root]: [file('a.txt'), folder('target')],
      [at('target')]: [],
    });
    await tool.show(page, tab);
    await send({ type: 'open', tab: '1', side: 'left', name: 'target' });
    await send({
      type: 'transfer',
      tab: '1',
      side: 'right',
      names: ['a.txt'],
      target: at('target'),
      move: false,
    });

    tool.quit();

    assert.deepStrictEqual(
      transfers.map((each) => each.disposed),
      [true],
    );
  });
});
