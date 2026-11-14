import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  root,
  at,
  folder,
  file,
  commander,
  tab,
  forged,
} from './commanderFixtures';

suite('Commander tool', () => {
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
});
