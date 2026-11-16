import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { CommanderToHost } from '../../../../../tools/commander/shared/protocol';
import { createCommanderStore } from '../../../../../tools/commander/page/store';
import { noop } from '../../../../helpers/fixtures';
import { listing, withFiles } from './storeFixtures';

const folder = 'C:/code';

const form = {
  format: '7z',
  archive: 'C:/code/a.7z',
  level: 'ultra',
  password: 'secret',
  shown: true,
  encryptNames: true,
  zipCipher: 'aes256',
  splitting: false,
  testing: false,
  volume: '100M',
} as const;

function sidesOf(tab: string, post: (message: CommanderToHost) => void = noop) {
  const store = createCommanderStore(post);
  store.getState().receive({ type: 'show', tab });
  store.getState().receive(withFiles(folder, 'a.txt', 'b.txt'));
  store.getState().receive({ ...listing('C:/other', tab), side: 'right' });
  return store;
}

suite('Commander store keeping the dialogs of its tabs', () => {
  test('keeps the dialog of a tab with what was typed while another tab is shown, gives it back once the tab is shown again, and drops it once its side shows another folder', () => {
    const store = sidesOf('1');
    store.getState().askNewFolder('left');
    const typed = { value: 'new', selection: [1, 2, 'forward'] } as const;
    store.getState().keepTyped('makingFolder', typed);

    store.getState().receive({ type: 'show', tab: '2' });
    assert.strictEqual(store.getState().makingFolder, undefined);
    store.getState().receive({ type: 'show', tab: '1' });
    assert.deepStrictEqual(store.getState().makingFolder, {
      tab: '1',
      side: 'left',
      folder,
      typed,
    });

    store.getState().receive(withFiles('C:/elsewhere', 'c.txt'));
    assert.strictEqual(store.getState().makingFolder, undefined);
    store.getState().receive({ type: 'show', tab: '2' });
    store.getState().receive({ type: 'show', tab: '1' });
    assert.strictEqual(store.getState().makingFolder, undefined);
  });

  test('keeps a dialog of each kind of a tab, and forgets those of a tab closed', () => {
    const store = sidesOf('1');
    store.getState().askRename('left', 'a.txt');
    store.getState().askDelete('left', ['b.txt'], false);
    store.getState().askPack('left', ['a.txt']);
    store.getState().keepPackForm(form);
    store.getState().receive({ type: 'show', tab: '2' });

    store.getState().receive({ type: 'show', tab: '1' });
    assert.strictEqual(store.getState().renaming?.name, 'a.txt');
    assert.deepStrictEqual(store.getState().deleting?.names, ['b.txt']);
    assert.deepStrictEqual(store.getState().packing?.form, form);
    store.getState().receive({ type: 'show', tab: '2' });
    store.getState().receive({ type: 'closed', tab: '1' });
    store.getState().receive({ type: 'show', tab: '1' });
    assert.strictEqual(store.getState().renaming, undefined);
    assert.strictEqual(store.getState().packing, undefined);
  });

  test('brings the dialog of a tab back in a page that never showed it, as a window reloaded, without a password typed', () => {
    const posted: CommanderToHost[] = [];
    const store = sidesOf('1', (message) => posted.push(message));
    store.getState().askPack('left', ['a.txt']);
    store.getState().keepPackForm(form);
    store.getState().askGoTo('right');
    store.getState().keepTyped('goingTo', { value: 'C:/there' });
    store.getState().receive({ type: 'show', tab: '2' });
    const kept = posted.findLast(
      (message): message is Extract<CommanderToHost, { type: 'keepTab' }> =>
        message.type === 'keepTab' && message.tab === '1',
    )?.kept;
    assert.ok(!JSON.stringify(kept).includes('secret'));

    const other = createCommanderStore(noop);
    other.getState().receive({ type: 'show', tab: '1', kept });
    other.getState().receive(withFiles(folder, 'a.txt', 'b.txt'));
    other.getState().receive({ ...listing('C:/other', '1'), side: 'right' });

    assert.deepStrictEqual(other.getState().packing, {
      tab: '1',
      side: 'left',
      folder,
      names: ['a.txt'],
      target: 'C:/other',
      form: { ...form, password: '' },
    });
    assert.deepStrictEqual(other.getState().goingTo, {
      tab: '1',
      side: 'right',
      folder: 'C:/other',
      typed: { value: 'C:/there' },
    });
  });

  test('keeps what was typed in the password asked for an archive, which no tab holds', () => {
    const store = sidesOf('1');
    store.getState().receive({
      type: 'askPassword',
      ask: 3,
      name: 'a.zip',
      wrong: false,
    });
    store.getState().keepPasswordTyped({ value: 'pass' });
    assert.deepStrictEqual(store.getState().askingPassword?.typed, {
      value: 'pass',
    });
  });

  test('sends what was typed in a dialog of the tab shown as the page goes, with no other tab shown meanwhile, as a reload while it is open', () => {
    const posted: CommanderToHost[] = [];
    const store = sidesOf('1', (message) => posted.push(message));
    store.getState().keepTabs();
    posted.length = 0;

    store.getState().askRename('left', 'a.txt');
    store.getState().keepTyped('renaming', { value: 'b.txt' });
    store.getState().keepTabs();

    const other = createCommanderStore(noop);
    other.getState().receive({
      type: 'show',
      tab: '1',
      kept: posted.findLast(
        (message): message is Extract<CommanderToHost, { type: 'keepTab' }> =>
          message.type === 'keepTab',
      )?.kept,
    });
    other.getState().receive(withFiles(folder, 'a.txt', 'b.txt'));
    assert.deepStrictEqual(other.getState().renaming?.typed, {
      value: 'b.txt',
    });
  });
});
